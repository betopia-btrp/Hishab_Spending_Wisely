# LightGBM Spending Forecast — Architecture & Usage

## 1. Overview

`lightbgm.py` provides an ML-based forecast for **remaining monthly spend** per (context × category) budget. XGBoost is the default engine, with LightGBM and Random Forest as alternatives.

- **Speed** — sub-second training on ≤90 rows
- **Sparse-data tolerance** — works with ≥14 history days at ≥18% density
- **Feature flexibility** — easy to add calendar, lag, and rolling features

### Routing Logic

LightGBM is always tried. The model itself returns `None` when it has insufficient data (`< 7` history days), triggering the linear fallback.

| Attempt | Model | On Failure |
|---|---|---|
| 1 | LightGBM | Returns `None` → fallback |
| 2 | Linear projection | Last 3 months daily avg |

---

## 2. Feature Engineering

### 2.1 Calendar Features (date-derived, always available)

| Feature | Type | Range | Rationale |
|---|---|---|---|
| `dow` | int | 0–6 | Weekly spending patterns (Mon=0) |
| `is_friday` | binary | 0/1 | BD weekend start — distinct spending |
| `is_weekend` | binary | 0/1 | Sat–Sun — leisure/eating out |
| `is_month_start` | binary | 0/1 | Day ≤ 3 — salary proximity |
| `is_month_end` | binary | 0/1 | ≤2 days from end — urgency |
| `is_pay_cycle_window` | binary | 0/1 | Day ≥ 25 OR Day ≤ 5 — pay cluster |
| `week_of_month` | int | 1–5 | Positional trend within month |
| `day_of_month` | int | 1–31 | Granular position |
| `day_of_month_norm` | float | 0–1 | Normalized to month length |
| `days_to_month_end` | int | 0–30 | Remaining days |
| `days_to_nearest_salary` | int | 0–7 | Distance to nearest salary day {1,5,10,25} |
| `is_winter` | binary | 0/1 | Nov–Feb (heating, clothing) |
| `is_monsoon` | binary | 0/1 | Jun–Sep (transport, indoor) |
| `is_ramadan` | binary | 0/1 | Ramadan period (iftar spike, daytime dip) |
| `is_festival_season` | binary | 0/1 | Within ±window of Eid, Puja, Christmas, Pohela Boishakh |

### 2.2 History-Dependent Features (derived from past `y` values)

These are computed during training from the last 90 days of daily totals. During forecasting, the **last known values** are forward-filled (with `days_since_last_expense` progressing daily through the forecast horizon).

| Feature | Derivation | Rolling Window |
|---|---|---|
| `rolling_7d_sum` | Sum of last 7 days' spend | 7 days |
| `rolling_30d_sum` | Sum of last 30 days' spend | 30 days |
| `lag_1d` | Yesterday's spend | 1 day lag |
| `lag_7d` | Same day last week | 7 day lag |
| `days_since_last_expense` | Days since last nonzero spend | ∞ (increments each forecast day) |

### 2.3 Features NOT Included (and why)

| Seeding Pattern | Source | Reason Excluded |
|---|---|---|
| `user_velocity_profile` | `temporal.py:79–100` | Not stored in DB for real users |
| `income_tier.amount_mult` | `angles.py` | Not stored in DB for real users |
| `religion` | `angles.py` | Not stored in DB — no user-specific festival targeting |
| `lifestyle.category_mult` | `angles.py` | Not stored in DB |
| `spending_personality` | `angles.py` | Not stored in DB |
| `hourly_weights` | `config.yaml` | Daily granularity — hourly not applicable |

> **Conclusion**: The patterns from seeding that are universally derivable from dates alone (salary proximity, seasons, Ramadan, festivals, velocity) **are** added as features. User-specific persona dimensions that exist only during synthetic generation **cannot** be used for real predictions.

---

## 3. Model Training (`_fit_model`)

```python
LGBMRegressor(
    objective="regression",
    n_estimators=200,
    learning_rate=0.05,
    num_leaves=31,
    min_child_samples=5,
    subsample=0.9,
    colsample_bytree=0.9,
    random_state=42,
)
```

- **Training data**: Last 90 days of daily-aggregated spend per (context_id, category_id)
- **Densification**: `_to_dense_daily()` fills zero-spend days so LightGBM sees a continuous timeline
- **Features**: ~20 columns (10 calendar + 5 history + cyclic/time)
- **Prediction**: Daily spend for each remaining day of the month, clipped to `≥ 0`

### Sanity Cap

```python
if predicted_daily_rate > historical_daily_avg * MAX_MULTIPLIER:
    predicted_total = min(predicted_total, cap)
```

Where `MAX_MULTIPLIER = 3.0` and `cap = historical_daily_avg × 3 × days_remaining`. This prevents a single outlier prediction from skewing the month-end projection.

---

## 4. Forecast Pipeline

```
daily_df (ds, y)                        # 90 days of per-category history
    │
    ▼
_to_dense_daily()                       # Fill gaps → continuous timeline
    │
    ├──► _build_features(dates)         # Calendar features (15 cols)
    │       +
    │    rolling/lag features           # History features (5 cols) from y
    │
    ▼
_fit_model()   →   LGBMRegressor        # Train on all 20 features
    │
    ▼
_get_last_history_state(dense["y"])     # Last known rolling/lag values
    │
    ▼
_forecast_nonnegative(model, fut_dates, state)
    │                                       │
    │   Calendar features for future         Forward-fill history state
    │   (computed from date)                 (dle progresses daily)
    │
    ▼
predictions clipped ≥ 0  →  sum  →  sanity cap  →  point forecast
```

---

## 5. Uncertainty Intervals

`forecast_remaining_with_interval` returns an 80% prediction interval:

```python
{
    "point": 1250.00,
    "lower": 980.00,
    "upper": 1550.00,
    "interval_level": 0.8,
}
```

### Methodology

1. **Walk-forward residual estimation** (`_estimate_daily_residual_quantiles`)
   - Starting at day 7, iteratively train on prefix `[:idx]`, predict `[idx:idx+1]`
   - Collect residuals: `actual - predicted`
   - Requires ≥12 days of history for meaningful residuals

2. **Interval scaling**
   - Daily residual quantiles scaled by `√(days_remaining)` for horizon uncertainty
   - Lower bound clamped to `≥ 0`

3. **Coverage calibration** — validated via backtest `coverage_rate` metric

---

## 6. Fallback Chain

| Priority | Method | Condition |
|---|---|---|
| 1 | **LightGBM** | `hist_n_days ≥ 14` AND `hist_density ≥ 0.18` |
| 2 | **Linear projection** | LightGBM fails or insufficient data |
| 3 | **Naive baseline** | Used only for comparison in backtest |

### Linear Fallback (`linear_fallback.py`)

```python
projected_remaining = (spent_so_far / days_passed) × days_left
```

Falls back to recency-weighted historical daily average when current month has <3 spend days.

---

## 7. Backtesting

`run.py:backtest_for_user()` simulates forecasts from a past cutoff date and compares against actuals.

### Metrics

| Metric | Definition |
|---|---|
| MAPE | `\absolute(projected - actual) / actual \times 100` |
| MAE (BDT) | `\absolute(projected - actual)` |
| Model win rate | % of budget lines where model MAE < baseline MAE |
| Coverage rate | % of intervals containing actual |
| Segment breakdown | dense (≥30d / ≥35%), mid (≥14d / ≥18%), sparse |

### Usage

```bash
python ml/forecast/run.py \
    --user-id <uuid> \
    --target-month 5 \
    --target-year 2026 \
    --cutoff-day 15
```

Returns JSON with per-category daily breakdown (actual vs projected) for the frontend chart.

---

## 8. Integration

### With `run.py`

Called once per budget row for the current month:

```python
from lightbgm import forecast_remaining

projected = forecast_remaining(
    daily_df=hist_df,           # 90 days of (ds, y) for this category
    days_remaining=days_left,    # days left in month
    historical_daily_avg=avg,    # recency-weighted daily mean
)
```

### With the API

```
User opens dashboard
    │
    ▼
POST /api/forecasts/run
    │
    ▼
PHP shell_exec("python3 ml/forecast/run.py --user-id <uuid>")
    │
    ▼
Per (context_id × category_id):
    DELETE old forecast + INSERT new → ml_forecasts table
    ▼
Frontend reads ml_forecasts + displays alert cards
```

### Database Schema

The forecast results are stored in `ml_forecasts`:

| Column | Type | Source |
|---|---|---|
| `context_id` | uuid | Budget context |
| `category_id` | uuid (nullable) | Budget category (NULL = overall) |
| `month` | int | Forecast month |
| `year` | int | Forecast year |
| `projected_amount` | numeric | Spent so far + forecast remaining |
| `budget_amount` | numeric | Original budget cap |
| `spent_so_far` | numeric | Spend up to today |
| `alert_tier` | varchar | overspend / on_track_exceed / early_warning |

---

## 9. Performance Characteristics

| Metric | Value |
|---|---|
| Training rows | ≤ 90 dense daily |
| Features | 20 |
| Trees | 200 |
| Training time | ~50–150 ms per model |
| Models per user | ~10–50 (one per budget line) |
| Total per user | ~5–15 seconds |
| Segment coverage | ~65% of budgets (dense + mid) → LightGBM |
| Remaining | ~35% → linear fallback |

---

## 10. Future Improvements

| Feature | Status | Impact |
|---|---|---|
| `rolling_7d_mean` (avg vs sum) | 🟢 Done | Smoother trend signal |
| Cyclic encoding for day_of_year (sin/cos) | 🟡 Planned | Annual seasonality |
| User-level context_id as categorical feature | 🟡 Planned | User-specific intercept |
| Category_id as categorical feature | 🟡 Planned | Category-specific patterns |
| Day-of-month one-hot (selected days) | 🔴 Consider | Salary day peaks |
| Store user persona in DB for feature lookup | 🔴 Requires DB migration | High value but large effort |
| Auto-LightGBM hyperparameter tuning | 🔴 Consider | Marginal gains vs complexity |
