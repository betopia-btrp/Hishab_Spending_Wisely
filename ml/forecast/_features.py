"""
Shared feature engineering and forecast pipeline for all ML models.

Calendar features, history-dependent (rolling/lag) features, dense daily,
sanity cap, and a generic _make_forecast factory that each model module
calls with its own _fit_model function.
"""

import numpy as np
import pandas as pd
from datetime import date, timedelta

MAX_MULTIPLIER = 3.0

# ── Calendar-based helpers ──────────────────────────────────────────────

_RAMADAN_PERIODS = [
    (date(2024, 3, 10), date(2024, 4, 8)),
    (date(2025, 2, 28), date(2025, 3, 29)),
    (date(2026, 2, 17), date(2026, 3, 18)),
    (date(2027, 2, 7),  date(2027, 3, 8)),
]

_FESTIVAL_WINDOWS = [
    ("Pohela Boishakh", date(2024, 4, 14), date(2024, 4, 14), 7),
    ("Pohela Boishakh", date(2025, 4, 14), date(2025, 4, 14), 7),
    ("Pohela Boishakh", date(2026, 4, 14), date(2026, 4, 14), 7),
    ("Eid-ul-Fitr",     date(2024, 4, 10), date(2024, 4, 10), 5),
    ("Eid-ul-Fitr",     date(2025, 3, 31), date(2025, 3, 31), 5),
    ("Eid-ul-Fitr",     date(2026, 3, 20), date(2026, 3, 20), 5),
    ("Eid-ul-Adha",     date(2024, 6, 17), date(2024, 6, 17), 5),
    ("Eid-ul-Adha",     date(2025, 6, 7),  date(2025, 6, 7), 5),
    ("Eid-ul-Adha",     date(2026, 5, 28), date(2026, 5, 28), 5),
    ("Durga Puja",      date(2024, 10, 9), date(2024, 10, 13), 3),
    ("Durga Puja",      date(2025, 9, 28), date(2025, 10, 2), 3),
    ("Durga Puja",      date(2026, 10, 17), date(2026, 10, 21), 3),
    ("Christmas",       date(2024, 12, 25), date(2024, 12, 25), 5),
    ("Christmas",       date(2025, 12, 25), date(2025, 12, 25), 5),
    ("Christmas",       date(2026, 12, 25), date(2026, 12, 25), 5),
]

_HIST_COLS = ["rolling_7d_sum", "rolling_30d_sum", "lag_1d", "lag_7d", "days_since_last_expense"]


def _to_date(dt):
    if hasattr(dt, "date"):
        return dt.date()
    return dt


def _is_ramadan_series(dates):
    result = np.zeros(len(dates), dtype=int)
    for i, d in enumerate(dates):
        d_date = _to_date(d)
        for start, end in _RAMADAN_PERIODS:
            if start <= d_date <= end:
                result[i] = 1
                break
    return result


def _is_festival_season_series(dates):
    result = np.zeros(len(dates), dtype=int)
    for i, d in enumerate(dates):
        d_date = _to_date(d)
        for _, f_start, f_end, window in _FESTIVAL_WINDOWS:
            if (f_start - timedelta(days=window)) <= d_date <= (f_end + timedelta(days=window)):
                result[i] = 1
                break
    return result


def _days_since_last_expense(y_vals):
    y = np.asarray(y_vals, dtype=float)
    non_zero = y > 0
    last_idx = -1
    out = np.zeros(len(y), dtype=float)
    for i in range(len(y)):
        if non_zero[i]:
            last_idx = i
            out[i] = 0.0
        else:
            out[i] = float(i - last_idx) if last_idx >= 0 else float(i + 1)
    return out


# ── Feature engineering ────────────────────────────────────────────────


def _build_features(dates):
    dates = pd.Series(pd.to_datetime(dates))
    dow = dates.dt.dayofweek
    day = dates.dt.day
    dim = dates.dt.days_in_month
    days_to_month_end = dim - day
    week_of_month = ((day - 1) // 7) + 1

    return pd.DataFrame({
        "dow": dow,
        "is_friday": (dow == 4).astype(int),
        "is_weekend": (dow >= 5).astype(int),
        "is_month_start": (day <= 3).astype(int),
        "is_month_end": (days_to_month_end <= 2).astype(int),
        "is_pay_cycle_window": ((day >= 25) | (day <= 5)).astype(int),
        "week_of_month": week_of_month,
        "day_of_month": day,
        "day_of_month_norm": day / dim,
        "days_to_month_end": days_to_month_end,
        "days_to_nearest_salary": np.minimum.reduce([
            np.abs(day - sd) for sd in [1, 5, 10, 25]
        ]),
        "is_winter": dates.dt.month.isin([11, 12, 1, 2]).astype(int),
        "is_monsoon": dates.dt.month.isin([6, 7, 8, 9]).astype(int),
        "is_ramadan": _is_ramadan_series(dates),
        "is_festival_season": _is_festival_season_series(dates),
    })


def _to_dense_daily(daily_df):
    df = daily_df.copy()
    df.columns = ["ds", "y"]
    df["ds"] = pd.to_datetime(df["ds"])
    df["y"] = df["y"].astype(float)
    start = df["ds"].min()
    end = df["ds"].max()
    full_dates = pd.date_range(start=start, end=end, freq="D")
    dense = (
        pd.DataFrame({"ds": full_dates})
        .merge(df, on="ds", how="left")
        .fillna({"y": 0.0})
    )
    return dense


def _get_last_history_state(y_vals):
    y = np.asarray(y_vals, dtype=float)
    n = len(y)
    rolling_7 = float(np.sum(y[max(0, n - 7):n]))
    rolling_30 = float(np.sum(y[max(0, n - 30):n]))
    lag_1 = float(y[n - 1]) if n >= 1 else 0.0
    lag_7 = float(y[n - 7]) if n >= 7 else 0.0
    non_zero = y > 0
    last_idx = -1
    for i in range(n - 1, -1, -1):
        if non_zero[i]:
            last_idx = i
            break
    dle = float(n - 1 - last_idx) if last_idx >= 0 else float(n)
    return {
        "rolling_7d_sum": rolling_7,
        "rolling_30d_sum": rolling_30,
        "lag_1d": lag_1,
        "lag_7d": lag_7,
        "days_since_last_expense": dle,
    }


def _add_history_to_features(X, y_vals):
    y = pd.Series(np.asarray(y_vals, dtype=float)).fillna(0)
    X["rolling_7d_sum"] = y.rolling(7, min_periods=1).sum().values
    X["rolling_30d_sum"] = y.rolling(30, min_periods=1).sum().values
    X["lag_1d"] = y.shift(1).fillna(0).values
    X["lag_7d"] = y.shift(7).fillna(0).values
    X["days_since_last_expense"] = _days_since_last_expense(y_vals)
    return X


def _add_history_to_future(X_future, history_state):
    if history_state is not None:
        for col in _HIST_COLS:
            X_future[col] = history_state.get(col, 0.0)
        base_dle = history_state.get("days_since_last_expense", 0.0)
        X_future["days_since_last_expense"] = base_dle + np.arange(len(X_future), dtype=float)
    else:
        for col in _HIST_COLS:
            X_future[col] = 0.0
    return X_future


def _apply_sanity_cap(predicted_total, days_remaining, historical_daily_avg):
    if historical_daily_avg and historical_daily_avg > 0 and days_remaining > 0:
        predicted_daily_rate = predicted_total / days_remaining
        cap = historical_daily_avg * MAX_MULTIPLIER * days_remaining
        if predicted_daily_rate > historical_daily_avg * MAX_MULTIPLIER:
            return min(predicted_total, cap)
    return predicted_total


def _predict_nonnegative(model, future_dates, history_state):
    X_future = _build_features(future_dates)
    X_future = _add_history_to_future(X_future, history_state)
    predictions = model.predict(X_future)
    return np.clip(predictions, a_min=0, a_max=None)


# ── Generic residual estimation & forecast factory ─────────────────────


def _estimate_residuals(dense_df, interval_level, fit_fn):
    min_train_days = 7
    if len(dense_df) < min_train_days + 5:
        return None
    residuals = []
    for idx in range(min_train_days, len(dense_df)):
        train_slice = dense_df.iloc[:idx]
        test_slice = dense_df.iloc[idx:idx + 1]
        try:
            model = fit_fn(train_slice)
            state = _get_last_history_state(train_slice["y"].values)
            pred = float(_predict_nonnegative(model, test_slice["ds"], state)[0])
        except Exception:
            continue
        actual = float(test_slice["y"].iloc[0])
        residuals.append(actual - pred)
    if len(residuals) < 5:
        return None
    alpha = (1.0 - interval_level) / 2.0
    lower_q = float(np.quantile(residuals, alpha))
    upper_q = float(np.quantile(residuals, 1.0 - alpha))
    return lower_q, upper_q


def _make_forecast(fit_fn, model_name="model"):
    """
    Returns (forecast_remaining_with_interval, forecast_remaining)
    wired to the given fit_fn.

    fit_fn(train_df: DataFrame with columns ds, y) → model with .predict()
    """

    def forecast_remaining_with_interval(
        daily_df,
        days_remaining,
        historical_daily_avg=None,
        interval_level=0.8,
    ):
        if days_remaining <= 0:
            return {
                "point": 0.0, "lower": 0.0, "upper": 0.0,
                "interval_level": interval_level,
            }
        if len(daily_df) < 7:
            return None

        dense = _to_dense_daily(daily_df)
        if len(dense) < 7:
            return None

        try:
            model = fit_fn(dense)
        except Exception:
            return None

        last_date = dense["ds"].max()
        future_dates = pd.date_range(
            start=last_date + pd.Timedelta(days=1),
            periods=days_remaining,
            freq="D",
        )
        state = _get_last_history_state(dense["y"].values)
        predictions = _predict_nonnegative(model, future_dates, state)
        predicted_total = float(predictions.sum())

        predicted_total = _apply_sanity_cap(
            predicted_total, days_remaining, historical_daily_avg
        )
        point = round(predicted_total, 2)

        interval = _estimate_residuals(dense, interval_level, fit_fn)
        if interval is None:
            return {
                "point": point, "lower": None, "upper": None,
                "interval_level": interval_level,
            }

        lower_daily_q, upper_daily_q = interval
        horizon_scale = np.sqrt(days_remaining)
        lower = max(0.0, predicted_total + lower_daily_q * horizon_scale)
        upper = max(lower, predicted_total + upper_daily_q * horizon_scale)

        return {
            "point": point,
            "lower": round(float(lower), 2),
            "upper": round(float(upper), 2),
            "interval_level": interval_level,
        }

    def forecast_remaining(daily_df, days_remaining, historical_daily_avg=None):
        result = forecast_remaining_with_interval(
            daily_df=daily_df,
            days_remaining=days_remaining,
            historical_daily_avg=historical_daily_avg,
            interval_level=0.8,
        )
        if result is None:
            return None
        return result["point"]

    return forecast_remaining_with_interval, forecast_remaining
