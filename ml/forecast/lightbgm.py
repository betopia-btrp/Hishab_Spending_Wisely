"""
LightGBM-based forecast for remaining monthly spend.

Builds calendar + history features from daily expense data and predicts
spend for remaining days in the month. Uses a sanity cap to limit
outlier-driven projections.
"""

import pandas as pd
from _features import (
    _build_features,
    _add_history_to_features,
    _make_forecast,
)


def _fit_model(train_df):
    from lightgbm import LGBMRegressor

    X_train = _build_features(train_df["ds"])
    y_vals = train_df["y"].fillna(0).values
    X_train = _add_history_to_features(X_train, y_vals)

    model = LGBMRegressor(
        objective="regression",
        n_estimators=200,
        learning_rate=0.05,
        num_leaves=31,
        min_child_samples=5,
        subsample=0.9,
        colsample_bytree=0.9,
        random_state=42,
        verbose=-1,
    )
    model.fit(X_train, y_vals)
    return model


forecast_remaining_with_interval, forecast_remaining = _make_forecast(
    _fit_model, model_name="lightgbm"
)
