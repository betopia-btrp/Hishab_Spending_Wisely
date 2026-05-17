"""
Prophet-based time-series forecast for remaining monthly spend.

Given daily expense history for a (context, category) pair,
fits a Prophet model and predicts spending for the remaining
days of the month.

Applies a sanity cap: if the predicted daily rate exceeds
MAX_MULTIPLIER × historical daily average, the forecast is
clamped to prevent outliers from skewing the projection.
"""

import pandas as pd
import numpy as np

MAX_MULTIPLIER = 3.0  # max ratio of predicted daily rate to historical avg


def forecast_remaining(daily_df, days_remaining, historical_daily_avg=None):
    """
    Fit Prophet on daily expense history and forecast remaining days.

    Args:
        daily_df: DataFrame with columns [ds, y]
        days_remaining: number of days to forecast
        historical_daily_avg: average daily spend from last 3 months

    Returns:
        forecast_remaining (float) or None
    """
    try:
        from prophet import Prophet
    except ImportError:
        raise ImportError("prophet is not installed. pip install prophet")

    if len(daily_df) < 7:
        return None

    df = daily_df.copy()
    df.columns = ["ds", "y"]

    model = Prophet(
        weekly_seasonality=True,
        daily_seasonality=False,
        changepoint_prior_scale=0.05,
        seasonality_prior_scale=10.0,
    )
    model.add_seasonality(name="month_end", period=30.5, fourier_order=3)

    try:
        model.fit(df)
    except Exception:
        return None

    future = model.make_future_dataframe(periods=days_remaining)
    forecast = model.predict(future)
    remaining = forecast.tail(days_remaining)["yhat"]
    remaining = remaining.clip(lower=0)

    predicted_total = remaining.sum()

    # Sanity cap: if predicted daily rate >> historical avg, clamp it
    if historical_daily_avg and historical_daily_avg > 0:
        predicted_daily_rate = predicted_total / days_remaining
        cap = historical_daily_avg * MAX_MULTIPLIER * days_remaining
        if predicted_daily_rate > historical_daily_avg * MAX_MULTIPLIER:
            predicted_total = min(predicted_total, cap)

    return round(predicted_total, 2)
