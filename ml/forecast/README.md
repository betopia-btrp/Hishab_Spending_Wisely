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
   │  Prophet    │  ← Bayesian time-series model
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

## Model Choice: Prophet

### What is Prophet?

[Prophet](https://facebook.github.io/prophet/) is an open-source time-series forecasting library developed by Meta (Facebook). It decomposes time-series data into:

```
y(t) = trend(t) + weekly(t) + yearly(t) + holidays(t) + error
```

It uses a **Bayesian additive regression model** with:
- A piecewise-linear trend with automatic changepoint detection
- Weekly seasonality (users spend differently on weekends)
- Custom seasonality (month-end bill payment cycle)
- No daily seasonality (expenses are daily aggregates, not hourly)

### Why Prophet Instead of Alternatives?

| Model | Train Time | Data Required | Handles Missing Days | Handles Seasonality | Confidence Intervals |
|---|---|---|---|---|---|
| **Prophet** ✅ | ~3s | 7+ days | ✅ (native) | ✅ (weekly, custom) | ✅ |
| **ARIMA** | ~2s | 30+ days | ❌ (needs imputation) | ⚠️ (manual) | ✅ |
| **Holt-Winters** | ~1s | 14+ days | ❌ (needs imputation) | ✅ (additive) | ❌ |
| **XGBoost** | ~1s | 100+ rows | ❌ (needs feature eng) | ⚠️ (hand-crafted) | ❌ |
| **LSTM** | ~5min | 1000+ rows | ❌ | ✅ | ❌ |

**Decision rationale:**

1. **Data sparsity**: Most budget lines have 7–23 data points over 90 days. Prophet's Bayesian foundation handles sparsity gracefully — it was designed exactly for this scenario.

2. **Missing days**: Users don't log expenses every day. Prophet treats missing dates as non-events (no imputation needed). ARIMA and Holt-Winters require filling gaps, which introduces bias.

3. **Seasonality**: Weekend vs weekday spending is significant in Bangladesh (Friday peak). Prophet's `weekly_seasonality=True` captures this automatically. ARIMA needs manual seasonal differencing.

4. **Confidence intervals**: Prophet outputs uncertainty bounds (`yhat_lower`, `yhat_upper`). This is critical for alert tier decisions — a wide interval means low confidence, and we can fall back to a simpler model.

5. **Interpretability**: Prophet's parameters (`changepoint_prior_scale`, `seasonality_prior_scale`) have clear meanings. An admin can tune them without understanding Bayesian inference.

6. **Training speed**: ~3 seconds per fit. With ~600 Prophet-ready budget lines, the full run takes ~30 minutes sequentially, but runs per-user on dashboard load in ~3-6 seconds.

### Why Not Deep Learning?

Deep learning (LSTM, Transformers) requires thousands of data points per time series to outperform simpler models. A typical user has ~50-100 expenses in 90 days spread across 12 categories. That's 4-8 data points per category — far too few for neural networks. Even aggregated at the context level, we rarely exceed 200 data points.

---

## Architecture

### Files

| File | Purpose |
|---|---|
| `ml/forecast/run.py` | Entry point. Called by Laravel's `POST /api/forecasts/run`. Accepts `--user-id` flag. Queries budgets + expenses, orchestrates model fitting. |
| `ml/forecast/prophet_model.py` | Prophet fitting on last 90 days of data. Returns forecasted remaining amount. Applies sanity cap at 3× historical average. |
| `ml/forecast/linear_fallback.py` | Linear projection: `(spent_so_far / days_passed) × days_remaining`. Uses historical daily average when current month has <3 days of logged expenses. |
| `ml/forecast/alert_tiers.py` | 3-tier alert evaluation: overspend → on_track_exceed → early_warning |
| `ml/forecast/requirements.txt` | Prophet 1.3+, psycopg2-binary, pandas, numpy |
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
  │      │     Prophet(weekly=True, month_end=True)
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
| Last 90 days | 90 calendar days | Prophet training data (≥7 days with expenses) |
| Last 3 months (monthly) | 3 calendar months | Historical daily average fallback |

The 90-day window captures recent spending behavior while being short enough to adapt to lifestyle changes (new job, moved cities, etc.).

---

## Sanity Cap

Prophet can produce absurd projections when there's a single large outlier. Example: a user spends 26,300 BDT on a laptop in one day. Without a cap, Prophet projects 9,000/day for the rest of the month → 171,000 total on a 4,180 budget.

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
| **Negative Prophet prediction** | Clamped to 0 |
| **Budget == 0** | Skip — division by zero guard |
| **Group contexts** | Aggregates all members' expenses for that context |
| **NULL category_id (base budget)** | Summed all categories; DELETE + INSERT avoids UNIQUE constraint issue |
| **Prophet fitting error** | Falls back to linear projection |

---

## Performance

- **Prophet fit**: ~3 seconds per budget (including compilation)
- **Linear fallback**: <1ms
- **Full user run**: ~3-10 seconds for typical user (1-3 contexts, 3-10 budgets)
- **DB writes**: ~30ms for INSERT batch

The average admin user will experience <5s latency on dashboard load. No background queue needed — it runs synchronously.

---

## Future Improvements

| Area | Improvement | Effort |
|---|---|---|
| **Accuracy** | Replace sanity cap with quantile-based outlier detection | Low |
| **Speed** | Cache Prophet models and only re-fit when new data arrives | Medium |
| **Backtesting** | Monthly report: projected vs actual by category with MAPE | Low |
| **Confidence** | Expose `yhat_upper` / `yhat_lower` in the UI | Low |
| **Switching cost** | Replace Prophet with lightweight Holt-Winters if Prophet compilation time is too high | Medium |
