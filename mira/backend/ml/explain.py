"""
MIRA — SHAP reason codes (Phase 2).

Turns SHAP values from the risk booster into human-readable,
bilingual "top driver" chips.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

FRIENDLY = {
    "net_cf_lag1": ("Recent cash flow", "हालिया नक़दी प्रवाह"),
    "net_cf_lag2": ("Recent cash flow", "हालिया नक़दी प्रवाह"),
    "net_cf_lag3": ("Recent cash flow", "हालिया नक़दी प्रवाह"),
    "net_cf_lag6": ("Half-year cash trend", "छमाही नक़दी रुझान"),
    "net_cf_lag12": ("Year-ago comparison", "पिछले साल से तुलना"),
    "net_cf_rmean3": ("3-month cash average", "3-माह औसत नक़दी"),
    "net_cf_rstd3": ("Cash flow volatility", "नक़दी में उतार-चढ़ाव"),
    "net_cf_rmean6": ("6-month cash average", "6-माह औसत नक़दी"),
    "net_cf_rstd6": ("Cash flow volatility", "नक़दी में उतार-चढ़ाव"),
    "income_rmean3": ("Recent income level", "हालिया आमदनी"),
    "income_rmean6": ("Income level", "आमदनी स्तर"),
    "txn_count": ("Digital transaction volume", "डिजिटल लेन-देन"),
    "txn_value_index": ("Digital sales value", "डिजिटल बिक्री"),
    "inflow_outflow": ("Money in vs out", "आय बनाम खर्च"),
    "payer_diversity": ("Buyer diversity", "ख़रीदार विविधता"),
    "txn_slope_3m": ("Digital activity trend", "डिजिटल गतिविधि रुझान"),
    "dep_rmean3": ("Savings regularity", "बचत की नियमितता"),
    "emi_ontime_6m": ("EMI repayment record", "EMI चुकाने का रिकॉर्ड"),
    "exp_inc_ratio": ("Expense-to-income ratio", "खर्च/आय अनुपात"),
    "input_mom_1m": ("Input price change", "लागत मूल्य बदलाव"),
    "input_mom_3m": ("Input cost trend", "लागत मूल्य रुझान"),
    "output_mom_3m": ("Selling price trend", "बिक्री मूल्य रुझान"),
    "squeeze": ("Cost-price squeeze", "लागत-दाम दबाव"),
    "rain_dev": ("Rainfall deficit", "बारिश की कमी"),
    "heat_days": ("Heatwave days", "लू के दिन"),
    "month_sin": ("Season", "मौसम"),
    "month_cos": ("Season", "मौसम"),
    "festival": ("Festival season", "त्योहार सीज़न"),
    "size_factor": ("Business size", "कारोबार का आकार"),
}


def top_drivers(shap_row: np.ndarray, feature_cols: list[str], k: int = 3) -> list[dict]:
    """Return top-k drivers by |SHAP|, positive shap = pushes risk UP."""
    order = np.argsort(-np.abs(shap_row))
    out = []
    seen = set()
    for i in order:
        col = feature_cols[i]
        label = FRIENDLY.get(col, (col, col))
        if label[0] in seen or col.startswith("sec_"):
            continue
        seen.add(label[0])
        out.append({
            "feature": col,
            "label_en": label[0], "label_hi": label[1],
            "direction": "up" if shap_row[i] > 0 else "down",  # up = raises risk
            "magnitude": round(float(abs(shap_row[i])), 4),
        })
        if len(out) == k:
            break
    return out
