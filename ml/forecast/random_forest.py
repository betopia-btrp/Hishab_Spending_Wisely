"""
Random Forest forecast for remaining monthly spend.

Alternative to LightGBM using sklearn's RandomForestRegressor.
Same public API: forecast_remaining, forecast_remaining_with_interval.
"""

import pandas as pd
from _features import (
    _build_features,
    _add_history_to_features,
    _make_forecast,
)


def _fit_model(train_df):
    from sklearn.ensemble import RandomForestRegressor

    X_train = _build_features(train_df["ds"])
    y_vals = train_df["y"].fillna(0).values
    X_train = _add_history_to_features(X_train, y_vals)

    model = RandomForestRegressor(
        n_estimators=200,
        min_samples_leaf=3,
        max_depth=12,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_vals)
    return model


forecast_remaining_with_interval, forecast_remaining = _make_forecast(
    _fit_model, model_name="random_forest"
)
