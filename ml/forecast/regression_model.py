"""
Linear regression forecast for remaining monthly spend.

Lightweight replacement for Prophet. Uses scikit-learn LinearRegression
with engineered time features to capture weekly and month-end patterns.

Features:
  - day_of_week (one-hot, 7 dimensions)
  - is_weekend (binary)
  - is_month_end (binary: last 3 days of month)
  - day_of_month_norm (0-1 normalized position in month)
"""

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler

MAX_MULTIPLIER = 3.0


def _build_features(dates, total_days_in_month=None):
    """
    Build feature matrix from a sequence of dates.

    Args:
        dates: array-like of datetime-like objects
        total_days_in_month: if known (for future dates where month length matters)

    Returns:
        DataFrame of features (one row per date)
    """
    dates = pd.Series(pd.to_datetime(dates))
    if total_days_in_month is None:
        total_days_in_month = dates.dt.days_in_month.iloc[0]

    dow = dates.dt.dayofweek
    day = dates.dt.day
    features = pd.DataFrame({
        "dow_0": (dow == 0).astype(int),
        "dow_1": (dow == 1).astype(int),
        "dow_2": (dow == 2).astype(int),
        "dow_3": (dow == 3).astype(int),
        "dow_4": (dow == 4).astype(int),
        "dow_5": (dow == 5).astype(int),
        "dow_6": (dow == 6).astype(int),
        "is_weekend": (dow >= 5).astype(int),
        "is_month_end": (day >= (total_days_in_month - 2)).astype(int),
        "day_of_month_norm": day / total_days_in_month,
    })
    return features


def forecast_remaining(daily_df, days_remaining, historical_daily_avg=None):
    """
    Fit LinearRegression on daily expense history and forecast remaining days.

    Args:
        daily_df: DataFrame with columns [ds, y] (date, daily total)
        days_remaining: number of days to forecast
        historical_daily_avg: average daily spend from last 3 months (for sanity cap)

    Returns:
        forecast_remaining (float) or None if insufficient data
    """
    if len(daily_df) < 7:
        return None

    df = daily_df.copy()
    df.columns = ["ds", "y"]
    df["ds"] = pd.to_datetime(df["ds"])
    df["y"] = df["y"].astype(float)

    total_days_in_month = (
        df["ds"].iloc[0] + pd.offsets.MonthEnd(0)
    ).days_in_month

    # Build training features from historical dates
    X_train = _build_features(df["ds"], total_days_in_month)
    y_train = df["y"].values

    # Standardize features for stability
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)

    model = LinearRegression()
    try:
        model.fit(X_train_scaled, y_train)
    except Exception:
        return None

    # Build future dates (next days_remaining days after last training date)
    last_date = df["ds"].max()
    future_dates = pd.date_range(
        start=last_date + pd.Timedelta(days=1),
        periods=days_remaining,
    )

    # Determine month length for future dates
    future_month_total = (
        future_dates[0] + pd.offsets.MonthEnd(0)
    ).days_in_month if len(future_dates) > 0 else total_days_in_month

    X_future = _build_features(future_dates, future_month_total)
    X_future_scaled = scaler.transform(X_future)

    predictions = model.predict(X_future_scaled)
    predictions = np.clip(predictions, a_min=0, a_max=None)

    predicted_total = float(predictions.sum())

    # Sanity cap: same as Prophet — 3x historical daily average
    if historical_daily_avg and historical_daily_avg > 0 and days_remaining > 0:
        predicted_daily_rate = predicted_total / days_remaining
        cap = historical_daily_avg * MAX_MULTIPLIER * days_remaining
        if predicted_daily_rate > historical_daily_avg * MAX_MULTIPLIER:
            predicted_total = min(predicted_total, cap)

    return round(predicted_total, 2)
