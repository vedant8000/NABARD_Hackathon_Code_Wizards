"""
MIRA — batch scorer (Phase 2).

For every enterprise: features → 6-month P10/P50/P90 forecast →
5 transparent sub-scores → MIRA Score (0–100) → calibrated stress
probability → SHAP top drivers → EWS alerts. Writes scores.csv,
forecasts.csv, alerts.csv into backend/data/ for the API to load.

Run:  python ml/score_all.py
"""
from __future__ import annotations

import json
import os

import joblib
import numpy as np
import pandas as pd

from ews import evaluate, export_rules_json
from explain import top_drivers
from features import build_panel

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "artifacts")
DATA_DIR = os.path.join(HERE, "..", "data")

CLIMATE_WEIGHT = {"dairy": 1.0, "poultry": 1.0, "food_processing": 0.6,
                  "handicrafts": 0.4, "rural_retail": 0.6}

SUBSCORE_WEIGHTS = {"s1_cashflow": 0.30, "s2_repayment": 0.25,
                    "s3_digital": 0.15, "s4_market": 0.15, "s5_climate": 0.15}


def _clip01(x):
    return float(np.clip(x, 0, 1))


def sub_scores(row: pd.Series, hist: pd.DataFrame, forecast_p50: list[float],
               savings_balance: float) -> dict:
    avg_exp = float(hist["expense"].tail(6).mean() or 1)
    runway = savings_balance / avg_exp                       # months of buffer
    fc_pos = sum(1 for v in forecast_p50 if v > 0) / len(forecast_p50)
    vol = float(row.get("net_cf_rstd6") or 0) / (abs(float(row.get("net_cf_rmean6") or 1)) + 1)

    s1 = 100 * _clip01(0.40 * min(runway / 3, 1) + 0.45 * fc_pos + 0.15 * (1 - min(vol, 1)))
    s2 = 100 * _clip01(0.65 * float(row.get("emi_ontime_6m") or 0)
                       + 0.35 * min(float(row.get("dep_rmean3") or 0) / 4, 1))
    slope = float(row.get("txn_slope_3m") or 0)
    s3 = 100 * _clip01(0.5 + slope)                          # -0.5 slope → 0, +0.5 → 100
    squeeze = float(row.get("squeeze") or 0)
    s4 = 100 * _clip01(0.5 - 1.6 * squeeze)                  # squeeze 0.3 → ~2
    cw = CLIMATE_WEIGHT[row.sector]
    # penalize only *excess* stress: deficit beyond 15% of normal, heat beyond
    # 8 days/month (an ordinary hot June should not drag every score down)
    rain_pen = _clip01((-float(row.get("rain_dev") or 0) - 0.15) / 0.5)
    heat_pen = _clip01((float(row.get("heat_days") or 0) - 8) / 12)
    s5 = 100 * _clip01(1 - cw * (rain_pen + heat_pen) / 2)
    return {"s1_cashflow": round(s1, 1), "s2_repayment": round(s2, 1),
            "s3_digital": round(s3, 1), "s4_market": round(s4, 1),
            "s5_climate": round(s5, 1)}


def band(score: float) -> str:
    return "green" if score >= 70 else ("amber" if score >= 45 else "red")


def main():
    import shap

    export_rules_json()
    panel = build_panel()
    feats = panel.attrs["feature_cols"]

    fc_models = {(h, q): joblib.load(os.path.join(ART, f"forecast_h{h}_q{q}.joblib"))
                 for h in range(1, 7) for q in (10, 50, 90)}
    clf = joblib.load(os.path.join(ART, "risk_classifier.joblib"))
    booster = joblib.load(os.path.join(ART, "risk_booster.joblib"))
    iso = joblib.load(os.path.join(ART, "anomaly.joblib"))
    explainer = shap.TreeExplainer(booster)

    ledger = pd.read_csv(os.path.join(DATA_DIR, "ledger.csv"), parse_dates=["date"])
    dep_total = ledger[ledger.kind == "savings_deposit"].groupby("enterprise_id").amount.sum()

    latest_month = panel.month.max()
    score_rows, fc_rows, alert_rows = [], [], []

    for eid, hist in panel.groupby("enterprise_id"):
        hist = hist.sort_values("month")
        row = hist.iloc[-1]
        if pd.isna(row.get("net_cf_lag3")):
            continue
        X = row[feats].to_frame().T.astype(float)

        # forecast
        p10 = [float(fc_models[(h, 10)].predict(X)[0]) for h in range(1, 7)]
        p50 = [float(fc_models[(h, 50)].predict(X)[0]) for h in range(1, 7)]
        p90 = [float(fc_models[(h, 90)].predict(X)[0]) for h in range(1, 7)]
        # keep quantiles ordered
        p10, p90 = np.minimum(p10, p50).tolist(), np.maximum(p90, p50).tolist()

        savings_balance = float(dep_total.get(eid, 0)) * 0.4  # portion still parked
        subs = sub_scores(row, hist, p50, savings_balance)
        raw = sum(subs[k] * w for k, w in SUBSCORE_WEIGHTS.items())
        # scorecard calibration: stretch around the Amber midpoint so the
        # weighted average (naturally compressed) maps onto the full 0-100 band
        mira_score = round(float(np.clip(63 + (raw - 63) * 2.5, 5, 98)), 1)

        prob = float(clf.predict_proba(X)[0, 1])
        sv = explainer.shap_values(X)
        sv = sv[1] if isinstance(sv, list) else sv
        drivers = top_drivers(np.array(sv).reshape(-1), feats)

        anomaly = bool(iso.predict(X.fillna(0))[0] == -1)
        alerts = evaluate(row, hist, p50, savings_balance, anomaly_flag=anomaly)

        score_rows.append({
            "enterprise_id": eid, "as_of": str(latest_month),
            "mira_score": mira_score, "band": band(mira_score),
            "stress_prob_3m": round(prob, 4),
            **subs,
            "savings_balance": round(savings_balance),
            "drivers_json": json.dumps(drivers, ensure_ascii=False),
        })
        for h in range(6):
            m = (latest_month + h + 1)
            fc_rows.append({"enterprise_id": eid, "month": str(m),
                            "p10": round(p10[h]), "p50": round(p50[h]), "p90": round(p90[h])})
        for a in alerts:
            alert_rows.append({"enterprise_id": eid, "as_of": str(latest_month), **a})

    pd.DataFrame(score_rows).to_csv(os.path.join(DATA_DIR, "scores.csv"), index=False)
    pd.DataFrame(fc_rows).to_csv(os.path.join(DATA_DIR, "forecasts.csv"), index=False)
    pd.DataFrame(alert_rows).to_csv(os.path.join(DATA_DIR, "alerts.csv"), index=False)

    s = pd.DataFrame(score_rows)
    print(f"scored {len(s)} enterprises -> bands: {s.band.value_counts().to_dict()}")
    print(f"alerts: {len(alert_rows)}  (by code: "
          f"{pd.DataFrame(alert_rows).code.value_counts().to_dict() if alert_rows else {}})")
    print("DONE — scores.csv / forecasts.csv / alerts.csv in backend/data/")


if __name__ == "__main__":
    main()
