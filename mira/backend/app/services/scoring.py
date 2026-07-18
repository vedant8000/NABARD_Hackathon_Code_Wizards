"""Live scoring service — wraps the ml/ package for the What-If endpoint
and admin rescore. Loads the feature panel + models lazily (first call),
then re-scores the whole portfolio under shocked climate/price inputs.
"""
from __future__ import annotations

import os
import sys
import threading

import joblib
import numpy as np
import pandas as pd

from ..config import ARTIFACTS_DIR, ML_DIR

if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

_lock = threading.Lock()
_cache: dict = {}


def _load():
    with _lock:
        if "panel" in _cache:
            return _cache
        from features import build_panel  # ml/features.py
        import score_all  # ml/score_all.py — reuse sub_scores/band/calibration

        panel = build_panel()
        _cache["panel"] = panel
        _cache["feats"] = panel.attrs["feature_cols"]
        _cache["fc"] = {(h, q): joblib.load(os.path.join(ARTIFACTS_DIR, f"forecast_h{h}_q{q}.joblib"))
                        for h in range(1, 7) for q in (10, 50, 90)}
        _cache["clf"] = joblib.load(os.path.join(ARTIFACTS_DIR, "risk_classifier.joblib"))
        _cache["score_all"] = score_all
        return _cache


def whatif(rain_deficit_pct: float, price_shock_pct: float, base_scores: pd.DataFrame,
           enterprises: pd.DataFrame) -> dict:
    """Re-score every enterprise with shocked climate/price features."""
    c = _load()
    panel, feats, sa = c["panel"], c["feats"], c["score_all"]
    rain_shock = rain_deficit_pct / 100.0
    price_shock = price_shock_pct / 100.0

    results = []
    for eid, hist in panel.groupby("enterprise_id"):
        hist = hist.sort_values("month")
        row = hist.iloc[-1].copy()
        if pd.isna(row.get("net_cf_lag3")):
            continue
        base = base_scores[base_scores.enterprise_id == eid]
        if base.empty:
            continue
        base = base.iloc[0]

        # apply shocks to the climate / market features
        row["rain_dev"] = float(row["rain_dev"]) - rain_shock
        row["input_mom_3m"] = float(row["input_mom_3m"]) + price_shock
        row["input_mom_1m"] = float(row["input_mom_1m"]) + price_shock / 2
        row["squeeze"] = float(row["input_mom_3m"]) - float(row["output_mom_3m"])

        X = row[feats].to_frame().T.astype(float)
        p50 = [float(c["fc"][(h, 50)].predict(X)[0]) for h in range(1, 7)]
        # price shocks bite into forecast cash flow directly too
        exp_ratio = float(sa.CLIMATE_WEIGHT.get(row.sector, 0.6))
        p50 = [v * (1 - 0.5 * price_shock) - abs(v) * 0.3 * rain_shock * exp_ratio for v in p50]

        subs = sa.sub_scores(row, hist, p50, float(base["savings_balance"]))
        raw = sum(subs[k] * w for k, w in sa.SUBSCORE_WEIGHTS.items())
        new_score = round(float(np.clip(63 + (raw - 63) * 2.5, 5, 98)), 1)
        prob = float(c["clf"].predict_proba(X)[0, 1])

        results.append({
            "enterprise_id": int(eid),
            "old_score": float(base["mira_score"]), "old_band": base["band"],
            "new_score": new_score, "new_band": sa.band(new_score),
            "new_stress_prob": round(prob, 4),
        })

    df = pd.DataFrame(results)
    return {
        "params": {"rain_deficit_pct": rain_deficit_pct, "price_shock_pct": price_shock_pct},
        "before": df.old_band.value_counts().to_dict(),
        "after": df.new_band.value_counts().to_dict(),
        "enterprises": results,
    }
