"""
MIRA — Early Warning Signal engine (Phase 2).

Declarative thresholds (RULES) + an evaluate() that turns an
enterprise's latest feature row into concrete, bilingual alerts.
The same thresholds are exported to ews.rules.json so the frontend
can re-evaluate the rule layer on-device when offline.
"""
from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))

# thresholds kept declarative — mirrored in the frontend offline engine
RULES = {
    "EWS-01": {"name": "SAVINGS_BREAK", "severity": "amber",
               "desc": "No savings deposit in 2 consecutive months"},
    "EWS-02": {"name": "REPAY_SLIP", "severity": "red",
               "desc": "EMI missed in latest month"},
    "EWS-03": {"name": "CF_DETERIORATION", "severity": "red",
               "desc": "Forecast net cash flow negative for >=2 of next 3 months"},
    "EWS-04": {"name": "RUNWAY_LOW", "severity": "amber", "threshold_months": 1.0,
               "desc": "Savings buffer below 1 month of average expenses"},
    "EWS-05": {"name": "TXN_SLOWDOWN", "severity": "amber", "threshold": -0.30,
               "desc": "Digital activity down >30% vs 3-month norm"},
    "EWS-06": {"name": "INPUT_PRICE_SHOCK", "severity": "amber", "threshold": 0.15,
               "desc": "Sector input cost up >15% in 3 months"},
    "EWS-07": {"name": "OUTPUT_PRICE_DROP", "severity": "amber", "threshold": -0.12,
               "desc": "Sector output price down >12% in 3 months"},
    "EWS-08": {"name": "CLIMATE_ALERT", "severity": "amber",
               "rain_dev": -0.40, "heat_days": 15,
               "heat_sectors": ["dairy", "poultry"],
               "desc": "Rainfall deficit >40% of normal, or a heatwave spell "
                       "for heat-sensitive sectors"},
    "EWS-09": {"name": "EXPENSE_SPIKE", "severity": "amber", "z": 2.5,
               "desc": "Monthly expense anomaly vs own history"},
    "EWS-10": {"name": "CONCENTRATION", "severity": "info", "threshold": 0.25,
               "desc": "Income highly concentrated (low payer diversity)"},
    "EWS-99": {"name": "ANOMALY", "severity": "amber",
               "desc": "Unusual overall pattern flagged by anomaly model"},
}

MESSAGES = {
    "EWS-01": ("Savings deposits have stopped for 2 months.",
               "2 महीने से बचत जमा नहीं हुई है।",
               "Restart small weekly deposits — even ₹100 keeps the group record strong.",
               "छोटी साप्ताहिक बचत फिर शुरू करें — ₹100 भी समूह का रिकॉर्ड मज़बूत रखता है।"),
    "EWS-02": ("Last EMI was missed.",
               "पिछली किस्त (EMI) छूट गई है।",
               "Talk to your field officer about part-payment before the next due date.",
               "अगली तारीख़ से पहले अधिकारी से आंशिक भुगतान की बात करें।"),
    "EWS-03": ("Cash flow is predicted to be negative in the coming months.",
               "आने वाले महीनों में खर्च कमाई से ज़्यादा रहने का अनुमान है।",
               "Cut non-urgent expenses now and build a small buffer.",
               "ग़ैर-ज़रूरी खर्च अभी घटाएँ और थोड़ा पैसा बचाकर रखें।"),
    "EWS-04": ("Savings buffer is below 1 month of expenses.",
               "बचत 1 महीने के खर्च से भी कम है।",
               "Set aside a fixed amount from each sale until you have 1 month saved.",
               "हर बिक्री से थोड़ी रक़म अलग रखें जब तक 1 महीने की बचत न हो।"),
    "EWS-05": ("Your digital sales activity has slowed sharply.",
               "आपकी डिजिटल बिक्री में तेज़ गिरावट है।",
               "Check demand — talk to regular buyers; consider a small promotion.",
               "मांग जाँचें — नियमित ख़रीदारों से बात करें; छोटा ऑफ़र आज़माएँ।"),
    "EWS-06": ("Input prices for your sector rose sharply.",
               "आपके काम की लागत (कच्चा माल) तेज़ी से बढ़ी है।",
               "Buy inputs in bulk with your group/FPO now to lock the price.",
               "समूह/FPO के साथ थोक में ख़रीदें ताकि दाम तय हो जाए।"),
    "EWS-07": ("Selling prices for your produce have dropped.",
               "आपकी उपज के बिक्री दाम गिरे हैं।",
               "Hold stock if storable, or find an alternate buyer via your FPO.",
               "रुक सकने वाला माल रोकें, या FPO से दूसरा ख़रीदार खोजें।"),
    "EWS-08": ("Weather risk: rainfall deficit or heatwave in your area.",
               "मौसम जोख़िम: आपके इलाक़े में कम बारिश या लू।",
               "Protect animals/stock from heat; plan water use; avoid new EMIs this month.",
               "पशु/माल को गर्मी से बचाएँ; पानी की योजना बनाएँ; इस महीने नया क़र्ज़ न लें।"),
    "EWS-09": ("An unusually large expense was recorded.",
               "एक असामान्य बड़ा खर्च दर्ज हुआ है।",
               "If it was an emergency, tell your officer — support schemes may apply.",
               "अगर आपात खर्च था तो अधिकारी को बताएँ — सहायता योजना मिल सकती है।"),
    "EWS-10": ("Most income comes from very few buyers.",
               "ज़्यादातर कमाई बहुत कम ख़रीदारों से आती है।",
               "Add one more buyer or market channel to reduce risk.",
               "जोख़िम घटाने के लिए एक और ख़रीदार या बाज़ार जोड़ें।"),
    "EWS-99": ("Your recent pattern looks unusual compared to normal.",
               "आपका हालिया रिकॉर्ड सामान्य से अलग दिख रहा है।",
               "Review this month's entries with your field officer.",
               "इस महीने की एंट्री अधिकारी के साथ जाँचें।"),
}


def export_rules_json(path: str | None = None):
    path = path or os.path.join(HERE, "artifacts", "ews.rules.json")
    payload = {code: {**rule, "messages": MESSAGES[code]} for code, rule in RULES.items()}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    return path


def evaluate(row: pd.Series, history: pd.DataFrame, forecast_p50: list[float],
             savings_balance: float, anomaly_flag: bool = False) -> list[dict]:
    """Evaluate all rules for one enterprise.

    row       : latest feature-panel row for the enterprise
    history   : that enterprise's full panel history (for z-scores)
    forecast_p50 : 6-month median net-CF forecast
    """
    alerts: list[dict] = []

    def add(code: str, severity: str | None = None, audience: str = "both"):
        r, m = RULES[code], MESSAGES[code]
        alerts.append({
            "code": code, "name": r["name"],
            "severity": severity or r["severity"], "audience": audience,
            "message_en": m[0], "message_hi": m[1],
            "action_en": m[2], "action_hi": m[3],
        })

    # EWS-01: no deposits for 2 months
    dep = history.sort_values("month")["dep_events"].tail(2)
    if len(dep) == 2 and (dep == 0).all():
        add("EWS-01")
    # EWS-02: missed EMI latest month (only if enterprise ever pays EMIs)
    if history["emi_paid"].sum() > 3 and row.get("emi_paid", 1) == 0:
        add("EWS-02", severity="red")
    # EWS-03: forecast deterioration
    if sum(1 for v in forecast_p50[:3] if v < 0) >= 2:
        add("EWS-03", severity="red")
    # EWS-04: runway
    avg_exp = float(history["expense"].tail(6).mean() or 0)
    if avg_exp > 0 and savings_balance < RULES["EWS-04"]["threshold_months"] * avg_exp:
        add("EWS-04")
    # EWS-05: txn slowdown
    if float(row.get("txn_slope_3m") or 0) < RULES["EWS-05"]["threshold"]:
        add("EWS-05")
    # EWS-06 / EWS-07: market
    if float(row.get("input_mom_3m") or 0) > RULES["EWS-06"]["threshold"]:
        add("EWS-06")
    if float(row.get("output_mom_3m") or 0) < RULES["EWS-07"]["threshold"]:
        add("EWS-07")
    # EWS-08: climate — drought anywhere; heatwave only for sensitive sectors
    r8 = RULES["EWS-08"]
    heat_hit = (float(row.get("heat_days") or 0) >= r8["heat_days"]
                and row.get("sector") in r8["heat_sectors"])
    if float(row.get("rain_dev") or 0) < r8["rain_dev"] or heat_hit:
        add("EWS-08")
    # EWS-09: expense z-score
    exp_hist = history["expense"].iloc[:-1]
    if len(exp_hist) >= 6 and exp_hist.std() > 0:
        z = (float(row["expense"]) - exp_hist.mean()) / exp_hist.std()
        if z > RULES["EWS-09"]["z"]:
            add("EWS-09")
    # EWS-10: concentration
    if float(row.get("payer_diversity") or 1) < RULES["EWS-10"]["threshold"]:
        add("EWS-10", audience="officer")
    # EWS-99: ML anomaly
    if anomaly_flag:
        add("EWS-99", audience="officer")

    return alerts
