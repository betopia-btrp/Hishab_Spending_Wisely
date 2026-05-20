"""
XGBoost forecast for remaining monthly spend.

Alternative to LightGBM using XGBRegressor.
Same public API: forecast_remaining, forecast_remaining_with_interval.
"""

import pandas as pd
from _features import (
    _build_features,
    _add_history_to_features,
    _make_forecast,
)


def _fit_model(train_df):
    from xgboost import XGBRegressor

    X_train = _build_features(train_df["ds"])
    y_vals = train_df["y"].fillna(0).values
    X_train = _add_history_to_features(X_train, y_vals)

    model = XGBRegressor(
        n_estimators=200,
        learning_rate=0.05,
        max_depth=4,
        min_child_weight=3,
        subsample=0.9,
        colsample_bytree=0.9,
        random_state=42,
        verbosity=0,
    )
    model.fit(X_train, y_vals)
    return model


forecast_remaining_with_interval, forecast_remaining = _make_forecast(
    _fit_model, model_name="xgboost"
)
