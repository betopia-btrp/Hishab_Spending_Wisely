# SpendWise — Spending Forecast System

## Overview

The Spending Forecast predicts end-of-month spend for each (context, category) budget line. It triggers **3-tier alerts** before the user overspends, allowing them to adjust behavior mid-month instead of discovering overuse at month-end.

```
expense data (last 90 days)
        │
        ▼
   ┌─────────────┐
   │ hist_n_days │
   │   >= 7?     │
   ├─── YES ─────┤
   │  LightGBM   │  ← Gradient-boosted tree regressor
   │  + sanity   │
   │  cap (3x)   │
   ├─── NO ──────┤
   │  Linear     │  ← (spent/days_passed) × days_left
   │  + history  │  ← uses last 3 months when <3 days of data
   └─────────────┘
        │
        ▼
projected_total = spent_so_far + forecast_remaining
        │
        ▼
   ┌──────────────┐
   │ Alert tiers  │
   ├──────────────┤
   │ overspend    │  spent_so_far > budget
   │ on_track     │  projected > budget
   │ early_warn   │  spent >= 50% + 15 days left
   │ none         │  everything else
   └──────────────┘
```

---

## Model Choice

Three ML models are available, all sharing the same feature pipeline and public API. XGBoost is the default.

| Model | Module | Regressor | Best For |
|---|---|---|---|
| **XGBoost** (default) | `xgboost_model.py` | `XGBRegressor` | Best accuracy on this data |
| **LightGBM** | `lightbgm.py` | `LGBMRegressor` | General purpose, fast |
| **Random Forest** | `random_forest.py` | `RandomForestRegressor` | Robust to outliers |

Select via `--model` flag:
```bash
python3 ml/forecast/run.py --user-id <uuid> --model random_forest
python3 ml/forecast/run.py --user-id <uuid> --model xgboost
```

### Why Tree Models (not linear / deep learning)

1. **Zero-inflated target** — most days have 0 spend. Linear models predict negatives; trees handle this naturally with leaf binning.
2. **Non-linear calendar effects** — the U-shape across a month (salary days → mid-month trough → end-month rush) is piecewise, not linear.
3. **Feature interactions** — `Ramadan × weekend`, `festival × day_of_month` — trees find splits without explicit interaction terms.
4. **Sparse per-budget histories** — 7+ active days out of 90. Too few for neural nets (LSTM/Transformer need 1000s of points).
5. **Sub-second training** — all three fit ≤90 rows in <150ms per model.

---

## Architecture

### Files

| File | Purpose |
|---|---|
| `ml/forecast/run.py` | Entry point. Accepts `--user-id` + optional `--model` flag. Queries budgets + expenses, orchestrates model fitting. |
| `ml/forecast/_features.py` | Shared feature pipeline: calendar features, rolling/lag features, dense daily, sanity cap, generic forecast factory. |
| `ml/forecast/lightbgm.py` | LightGBM engine (~50 lines, imports from `_features.py`). |
| `ml/forecast/random_forest.py` | Random Forest engine (drop-in replacement for LightGBM). |
| `ml/forecast/xgboost_model.py` | XGBoost engine (drop-in replacement for LightGBM). |
| `ml/forecast/compare_models.py` | Runs all 3 models on the same backtest and prints a comparison table. |
| `ml/forecast/linear_fallback.py` | Linear projection: `(spent_so_far / days_passed) × days_remaining`. Uses historical daily average when current month has <3 days of logged expenses. |
| `ml/forecast/alert_tiers.py` | 3-tier alert evaluation: overspend → on_track_exceed → early_warning |
| `ml/forecast/requirements.txt` | lightgbm, psycopg2-binary, pandas, numpy, scikit-learn, xgboost |
| `database/migrations/*_create_ml_forecasts_table.php` | Laravel migration for `ml_forecasts` table |

### Data Flow

```
User opens dashboard
        │
        ▼
GET /api/forecasts/run  (Laravel)
        │
        ▼
shell_exec(python3 ml/forecast/run.py --user-id <uuid>)
        │
        ▼
  ┌─ 1. Fetch all contexts where user is an active member
  │
  ├─ 2. For each context, fetch budgets for current month
  │
  ├─ 3. For each (context, category) budget:
  │      ├─ Fetch this month's expenses → spent_so_far
  │      ├─ Fetch last 90 days of expenses → training data
  │      ├─ Compute historical daily average from 90-day window
  │      │
  │      ├─ if hist_n_days >= 7:
  │      │     LightGBM(calendar features)
  │      │     → predicted_remaining
  │      │     Apply sanity cap: if daily_rate > 3× historical avg, clamp
  │      │
  │      ├─ else:
  │      │     linear_projection(spent, days_passed, days_left,
  │      │                       historical_daily_avg)
  │      │
  │      └─ projected_total = spent_so_far + forecast_remaining
  │
  ├─ 4. Evaluate alert tier for each forecast
  │
  └─ 5. DELETE + INSERT into ml_forecasts table
        │
        ▼
Laravel reads ml_forecasts, creates Notification records
        │
        ▼
Frontend shows alerts on Dashboard + Budgets page
```

### Training Window

| Window | Duration | Used For |
|---|---|---|
| Current month to-date | 1–31 days | `spent_so_far` calculation |
| Last 90 days | 90 calendar days | LightGBM training data (≥7 days with expenses) |
| Last 3 months (monthly) | 3 calendar months | Historical daily average fallback |

The 90-day window captures recent spending behavior while being short enough to adapt to lifestyle changes (new job, moved cities, etc.).

---

## Sanity Cap

The model can produce absurd projections when there's a single large outlier. Example: a user spends 26,300 BDT on a laptop in one day. Without a cap, projections can explode for the remaining month.

The sanity clamp:

```
predicted_daily_rate = total_forecast / days_remaining
cap = historical_daily_avg × MAX_MULTIPLIER × days_remaining
if predicted_daily_rate > historical_daily_avg × MAX_MULTIPLIER:
    clamp to cap
```

Where `MAX_MULTIPLIER = 3.0` and `historical_daily_avg` is the total spend over the last 90 days divided by 90.

---

## Alert Tiers

| Tier | Condition | UI Display |
|---|---|---|
| `overspend` | `spent_so_far > budget` | Red: "Budget Exceeded" |
| `on_track_exceed` | `projected_total > budget` | Amber: "On Track to Exceed" |
| `early_warning` | `spent_so_far >= 50%` AND `days_left >= 15` | Yellow: "Early Warning" |
| `none` | Everything else | Green: "On Track" |

Evaluated in order — if `spent_so_far > budget`, it's already overspent regardless of projection.

---

## Backtest Evaluation Policy

Backtest output (`POST /api/forecasts/backtest`) includes:
- **Model metrics**: `overall_mae_bdt`, `mean_mae_bdt`, `overall_mape`
- **Baseline metrics**: `baseline_overall_mae_bdt`, `baseline_overall_mape`
- **Comparison**: `mae_improvement_bdt`, `mae_improvement_pct`, `model_win_rate`
- **Interval calibration**: `interval_level`, `coverage_rate`, `interval_rows`

Per-category rows include:
- `mae_bdt`, `baseline_mae_bdt`, `baseline_projected`
- `pred_lower`, `pred_upper`, `interval_hit`

Guidance:
- Do not use regression "accuracy" as a primary metric.
- Use MAE (BDT) + baseline improvement + interval coverage as ship criteria.
- Keep MAPE as a secondary KPI; `<25%` is generally acceptable for spend forecasting.

---

## Database Schema

```sql
CREATE TABLE ml_forecasts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_id      UUID NOT NULL REFERENCES contexts(id),
    category_id     UUID REFERENCES categories(id),
    month           INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year            INTEGER NOT NULL,
    projected_amount NUMERIC(15,2) NOT NULL,
    budget_amount   NUMERIC(15,2) NOT NULL,
    spent_so_far    NUMERIC(15,2) NOT NULL DEFAULT 0,
    alert_tier      VARCHAR(20),
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(context_id, month, year, category_id)
);
```

---

## Laravel Integration

| Component | File | Purpose |
|---|---|---|
| Controller | `app/Http/Controllers/Forecast/ForecastController.php` | `GET /api/forecasts` reads cached results; `POST /api/forecasts/run` triggers Python script |
| Notification | `app/Notifications/BudgetAlertNotification.php` | Creates in-app notification with tier, amounts, context, category |
| Route | `routes/api.php` | `GET /api/forecasts` + `POST /api/forecasts/run` under `auth:api` |
| Migration | `database/migrations/*_create_ml_forecasts_table.php` | Creates `ml_forecasts` table |

### Triggering a Forecast

```
POST /api/forecasts/run          → Forecast for current user
```

This is called automatically when the user opens the Dashboard. The Budgets page has a "Refresh Forecast" button for manual re-run.

---

## Edge Cases Handled

| Scenario | Handling |
|---|---|
| **No expenses this month** | Skip — no forecast possible |
| **<7 days of data** | Linear fallback with historical daily average |
| **<3 days of data in current month** | Uses last 3 months' total / days to estimate daily rate |
| **Single large outlier** | Sanity cap at 3× historical daily average |
| **Negative model prediction** | Clamped to 0 |
| **Budget == 0** | Skip — division by zero guard |
| **Group contexts** | Aggregates all members' expenses for that context |
| **NULL category_id (base budget)** | Summed all categories; DELETE + INSERT avoids UNIQUE constraint issue |
| **LightGBM fitting error** | Falls back to linear projection |

---

## Performance

- **ML model fit**: sub-second per budget for all 3 models (≤90 rows, 20 features)
- **Linear fallback**: <1ms
- **Full user run**: ~3-10 seconds for typical user (1-3 contexts, 3-10 budgets)
- **DB writes**: ~30ms for INSERT batch

The average user will experience <5s latency on dashboard load. No background queue needed — it runs synchronously.

---

## Model Comparison

Run all 3 models on the same backtest to compare accuracy:

```bash
python3 ml/forecast/compare_models.py \
    --user-id <uuid> \
    --target-month 5 \
    --target-year 2026 \
    --cutoff-day 15
```

Output:
```
  Model Comparison: user abc12345.., 5/2026, cutoff day 15
  ══════════════════════════════════════════════════════════════════════
  Model                MAPE   MAE(BDT)   WinRate   Coverage
  ─────────────────────────────────────────────────────────────────
  lightgbm            12.3%    450.2 BDT   58.3%     75.0%
  random_forest       14.1%    510.8 BDT   52.1%     72.5%
  xgboost             11.8%    435.3 BDT   61.5%     77.5%

  Best: xgboost (MAE=435.3 BDT)
```

## Future Improvements

| Area | Improvement | Effort |
|---|---|---|
| **Accuracy** | Replace sanity cap with quantile-based outlier detection | Low |
| **Speed** | Cache model artifacts and only re-fit when new data arrives | Medium |
| **Backtesting** | Add longitudinal MAE trend and baseline win-rate tracking | Low |
| **Confidence** | Expose `pred_lower` / `pred_upper` interval bands in the UI | Low |
| **Model** | Auto-select best model per user via compare_models results | Medium |
