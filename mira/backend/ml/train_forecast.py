"""
MIRA — cash flow forecaster training (Phase 2).

Pooled LightGBM quantile models per horizon h=1..6 (alpha 0.1/0.5/0.9)
predicting monthly net cash flow, benchmarked against a seasonal-naive
baseline with expanding-window validation. Saves artifacts + an honest
backtest report.

Run:  python ml/train_forecast.py
"""
from __future__ import annotations

import json
import os

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd

from features import build_panel

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "artifacts")

HORIZONS = range(1, 7)
QUANTILES = (0.1, 0.5, 0.9)


def wape(y_true, y_pred):
    denom = np.sum(np.abs(y_true)) + 1e-9
    return float(np.sum(np.abs(y_true - y_pred)) / denom)


def seasonal_naive(df: pd.DataFrame, h: int) -> pd.Series:
    """Prediction for month t+h = value at t+h-12 (fallback: last value)."""
    g = df.groupby("enterprise_id")["net_cf"]
    yearly = g.shift(12 - h)
    last = g.shift(0)
    return yearly.fillna(last)


def main():
    os.makedirs(ART, exist_ok=True)
    panel = build_panel()
    feats = panel.attrs["feature_cols"]

    # targets: net_cf at t+h
    for h in HORIZONS:
        panel[f"y_h{h}"] = panel.groupby("enterprise_id")["net_cf"].shift(-h)

    months = sorted(panel.month.unique())
    # expanding-window: validate on the last 6 usable months
    val_months = months[-12:-6]

    report = {"horizons": {}, "n_rows": int(len(panel))}
    for h in HORIZONS:
        d = panel.dropna(subset=[f"y_h{h}", "net_cf_lag3"]).copy()
        train = d[d.month < val_months[0]]
        val = d[d.month.isin(val_months)]

        models = {}
        preds_val = {}
        for q in QUANTILES:
            m = lgb.LGBMRegressor(
                objective="quantile", alpha=q, n_estimators=350,
                learning_rate=0.05, num_leaves=31, min_child_samples=15,
                subsample=0.9, colsample_bytree=0.8, random_state=42, verbose=-1,
            )
            m.fit(train[feats], train[f"y_h{h}"])
            models[q] = m
            preds_val[q] = m.predict(val[feats])
            joblib.dump(m, os.path.join(ART, f"forecast_h{h}_q{int(q*100)}.joblib"))

        base = seasonal_naive(d, h).loc[val.index]
        w_model = wape(val[f"y_h{h}"].to_numpy(), preds_val[0.5])
        w_base = wape(val[f"y_h{h}"].to_numpy(), base.to_numpy())
        report["horizons"][h] = {
            "wape_model": round(w_model, 4),
            "wape_seasonal_naive": round(w_base, 4),
            "improvement_pct": round(100 * (1 - w_model / w_base), 1) if w_base > 0 else None,
            "n_train": int(len(train)), "n_val": int(len(val)),
        }
        print(f"h={h}: model WAPE {w_model:.3f} vs naive {w_base:.3f} "
              f"({report['horizons'][h]['improvement_pct']}% better)")

    # retrain on ALL data for serving
    for h in HORIZONS:
        d = panel.dropna(subset=[f"y_h{h}", "net_cf_lag3"])
        for q in QUANTILES:
            m = lgb.LGBMRegressor(
                objective="quantile", alpha=q, n_estimators=350,
                learning_rate=0.05, num_leaves=31, min_child_samples=15,
                subsample=0.9, colsample_bytree=0.8, random_state=42, verbose=-1,
            )
            m.fit(d[feats], d[f"y_h{h}"])
            joblib.dump(m, os.path.join(ART, f"forecast_h{h}_q{int(q*100)}.joblib"))

    joblib.dump(feats, os.path.join(ART, "feature_cols.joblib"))
    with open(os.path.join(ART, "backtest_report.json"), "w") as f:
        json.dump(report, f, indent=2)
    print("Saved artifacts + backtest_report.json")


if __name__ == "__main__":
    main()
