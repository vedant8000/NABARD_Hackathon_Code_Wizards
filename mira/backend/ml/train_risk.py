"""
MIRA — risk classifier + anomaly model training (Phase 2).

• LightGBM classifier: P(stress within 3 months), calibrated.
• IsolationForest: unusual-pattern flag (EWS-99).
• SHAP explainer artifact for reason codes.

Run:  python ml/train_risk.py
"""
from __future__ import annotations

import json
import os

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import IsolationForest
from sklearn.metrics import average_precision_score, precision_score, recall_score, roc_auc_score

from features import build_panel

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "artifacts")
DATA_DIR = os.path.join(HERE, "..", "data")


def main():
    os.makedirs(ART, exist_ok=True)
    panel = build_panel()
    feats = panel.attrs["feature_cols"]

    labels = pd.read_csv(os.path.join(DATA_DIR, "labels.csv"))
    labels["month"] = pd.PeriodIndex(labels["month"], freq="M")
    df = panel.merge(labels, on=["enterprise_id", "month"], how="inner")
    df = df.dropna(subset=["net_cf_lag3"])

    months = sorted(df.month.unique())
    val_months = months[-6:]
    train = df[~df.month.isin(val_months)]
    val = df[df.month.isin(val_months)]

    base = lgb.LGBMClassifier(
        n_estimators=400, learning_rate=0.05, num_leaves=31,
        min_child_samples=15, subsample=0.9, colsample_bytree=0.8,
        class_weight="balanced", random_state=42, verbose=-1,
    )
    base.fit(train[feats], train["stressed"])

    # validation metrics (uncalibrated model, honest holdout)
    p_val = base.predict_proba(val[feats])[:, 1]
    metrics = {
        "auc": round(float(roc_auc_score(val["stressed"], p_val)), 4),
        "avg_precision": round(float(average_precision_score(val["stressed"], p_val)), 4),
        "precision_at_0.5": round(float(precision_score(val["stressed"], p_val > 0.5, zero_division=0)), 4),
        "recall_at_0.5": round(float(recall_score(val["stressed"], p_val > 0.5, zero_division=0)), 4),
        "positive_rate_val": round(float(val["stressed"].mean()), 4),
        "n_train": int(len(train)), "n_val": int(len(val)),
    }
    print("risk classifier:", metrics)

    # calibrate + retrain on all data for serving
    calib = CalibratedClassifierCV(
        lgb.LGBMClassifier(
            n_estimators=400, learning_rate=0.05, num_leaves=31,
            min_child_samples=15, subsample=0.9, colsample_bytree=0.8,
            class_weight="balanced", random_state=42, verbose=-1,
        ),
        method="isotonic", cv=3,
    )
    calib.fit(df[feats], df["stressed"])
    joblib.dump(calib, os.path.join(ART, "risk_classifier.joblib"))

    # raw booster for SHAP (TreeExplainer needs the tree model, not the calibrator)
    joblib.dump(base, os.path.join(ART, "risk_booster.joblib"))

    # anomaly model on the full feature space
    iso = IsolationForest(n_estimators=200, contamination=0.06, random_state=42)
    X = panel.dropna(subset=["net_cf_lag3"])[feats].fillna(0)
    iso.fit(X)
    joblib.dump(iso, os.path.join(ART, "anomaly.joblib"))

    # merge metrics into the backtest report
    report_path = os.path.join(ART, "backtest_report.json")
    report = {}
    if os.path.exists(report_path):
        with open(report_path) as f:
            report = json.load(f)
    report["risk_classifier"] = metrics
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print("Saved risk_classifier / risk_booster / anomaly artifacts")


if __name__ == "__main__":
    main()
