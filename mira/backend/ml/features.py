"""
MIRA — feature engineering (Phase 2).

Builds a pooled monthly panel across all enterprises: one row per
(enterprise, month) with lags, rolling stats, behavioural, digital,
market and climate features. Used by both the forecaster and the
risk classifier, and by the live scorer at serve time.
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "..", "data")

SECTOR_INPUT = {
    "dairy": "fodder", "poultry": "feed", "food_processing": "veg_index",
    "handicrafts": "raw_craft", "rural_retail": "wholesale_index",
}
SECTOR_OUTPUT = {
    "dairy": "milk", "poultry": "broiler", "food_processing": "processed_food",
    "handicrafts": "craft_goods", "rural_retail": "retail_basket",
}
SECTORS = list(SECTOR_INPUT.keys())

FEATURE_COLS: list[str] = []  # populated by build_panel


def load_raw():
    ents = pd.read_csv(os.path.join(DATA_DIR, "enterprises.csv"))
    ledger = pd.read_csv(os.path.join(DATA_DIR, "ledger.csv"), parse_dates=["date"])
    digital = pd.read_csv(os.path.join(DATA_DIR, "digital_activity.csv"), parse_dates=["date"])
    prices = pd.read_csv(os.path.join(DATA_DIR, "prices.csv"), parse_dates=["date"])
    weather = pd.read_csv(os.path.join(DATA_DIR, "weather.csv"), parse_dates=["date"])
    return ents, ledger, digital, prices, weather


def _monthly_ledger(ledger: pd.DataFrame) -> pd.DataFrame:
    led = ledger.copy()
    led["month"] = led.date.dt.to_period("M")
    g = led.pivot_table(index=["enterprise_id", "month"], columns="kind",
                        values="amount", aggfunc="sum", fill_value=0).reset_index()
    for col in ("income", "expense", "savings_deposit", "loan_repayment"):
        if col not in g:
            g[col] = 0
    g["net_cf"] = g["income"] - g["expense"]
    # savings regularity: number of deposit events in the month
    dep = led[led.kind == "savings_deposit"].groupby(["enterprise_id", "month"]).size()
    g = g.merge(dep.rename("dep_events"), on=["enterprise_id", "month"], how="left").fillna({"dep_events": 0})
    g["emi_paid"] = (g["loan_repayment"] > 0).astype(int)
    return g


def _monthly_digital(digital: pd.DataFrame) -> pd.DataFrame:
    dig = digital.copy()
    dig["month"] = dig.date.dt.to_period("M")
    g = dig.groupby(["enterprise_id", "month"]).agg(
        txn_count=("txn_count", "sum"),
        txn_value_index=("value_index", "mean"),
        inflow_outflow=("inflow_outflow", "mean"),
        payer_diversity=("payer_diversity", "mean"),
    ).reset_index()
    return g


def _monthly_prices(prices: pd.DataFrame) -> pd.DataFrame:
    px = prices.copy()
    px["month"] = px.date.dt.to_period("M")
    g = px.groupby(["commodity", "month"]).modal_price.mean().reset_index()
    wide = g.pivot(index="month", columns="commodity", values="modal_price")
    return wide


def _monthly_weather(weather: pd.DataFrame) -> pd.DataFrame:
    wx = weather.copy()
    wx["month"] = wx.date.dt.to_period("M")
    g = wx.groupby(["district", "month"]).agg(
        rain=("rainfall_mm", "sum"),
        rain_normal=("rainfall_normal_mm", "sum"),
        heat_days=("tmax", lambda s: int((s > 40).sum())),
    ).reset_index()
    # rain and rain_normal are both monthly sums (aggregated above)
    g["rain_dev"] = (g["rain"] - g["rain_normal"]) / (g["rain_normal"] + 1)
    return g


def build_panel() -> pd.DataFrame:
    """Return the full pooled feature panel (one row per enterprise-month)."""
    ents, ledger, digital, prices, weather = load_raw()

    # drop the trailing partial month (demo "today" mid-month would halve
    # all monthly aggregates and poison slopes/z-scores)
    last = ledger.date.max()
    if last.day != last.days_in_month:
        cutoff = last.to_period("M")
        ledger = ledger[ledger.date.dt.to_period("M") < cutoff]
        digital = digital[digital.date.dt.to_period("M") < cutoff]
        weather = weather[weather.date.dt.to_period("M") < cutoff]

    m_led = _monthly_ledger(ledger)
    m_dig = _monthly_digital(digital)
    m_px = _monthly_prices(prices)
    m_wx = _monthly_weather(weather)

    df = m_led.merge(m_dig, on=["enterprise_id", "month"], how="left")
    df = df.merge(ents[["id", "sector", "district", "size_factor", "type"]],
                  left_on="enterprise_id", right_on="id").drop(columns="id")

    # market features: sector input/output price level + 1/3-month momentum
    def px_feat(row_month, commodity, k):
        try:
            cur = m_px.loc[row_month, commodity]
            prev = m_px.loc[row_month - k, commodity]
            return float(cur / prev - 1)
        except KeyError:
            return 0.0

    df["input_mom_1m"] = df.apply(lambda r: px_feat(r.month, SECTOR_INPUT[r.sector], 1), axis=1)
    df["input_mom_3m"] = df.apply(lambda r: px_feat(r.month, SECTOR_INPUT[r.sector], 3), axis=1)
    df["output_mom_3m"] = df.apply(lambda r: px_feat(r.month, SECTOR_OUTPUT[r.sector], 3), axis=1)
    df["squeeze"] = df["input_mom_3m"] - df["output_mom_3m"]

    # climate features by district-month
    df = df.merge(m_wx[["district", "month", "rain_dev", "heat_days"]],
                  on=["district", "month"], how="left").fillna({"rain_dev": 0, "heat_days": 0})

    # sort + per-enterprise lags/rollings
    df = df.sort_values(["enterprise_id", "month"]).reset_index(drop=True)
    g = df.groupby("enterprise_id")
    for lag in (1, 2, 3, 6, 12):
        df[f"net_cf_lag{lag}"] = g["net_cf"].shift(lag)
    for w in (3, 6):
        df[f"net_cf_rmean{w}"] = g["net_cf"].shift(1).rolling(w).mean().reset_index(level=0, drop=True)
        df[f"net_cf_rstd{w}"] = g["net_cf"].shift(1).rolling(w).std().reset_index(level=0, drop=True)
        df[f"income_rmean{w}"] = g["income"].shift(1).rolling(w).mean().reset_index(level=0, drop=True)
    df["txn_slope_3m"] = g["txn_count"].pct_change(3)
    df["dep_rmean3"] = g["dep_events"].shift(1).rolling(3).mean().reset_index(level=0, drop=True)
    df["emi_ontime_6m"] = g["emi_paid"].shift(1).rolling(6).mean().reset_index(level=0, drop=True)
    df["exp_inc_ratio"] = df["expense"] / (df["income"] + 1)

    # calendar
    df["month_num"] = df["month"].dt.month
    df["month_sin"] = np.sin(2 * np.pi * df.month_num / 12)
    df["month_cos"] = np.cos(2 * np.pi * df.month_num / 12)
    df["festival"] = df.month_num.isin([9, 10, 11]).astype(int)

    # sector one-hots
    for s in SECTORS:
        df[f"sec_{s}"] = (df.sector == s).astype(int)

    feature_cols = (
        [f"net_cf_lag{l}" for l in (1, 2, 3, 6, 12)]
        + ["net_cf_rmean3", "net_cf_rstd3", "net_cf_rmean6", "net_cf_rstd6",
           "income_rmean3", "income_rmean6",
           "txn_count", "txn_value_index", "inflow_outflow", "payer_diversity",
           "txn_slope_3m", "dep_rmean3", "emi_ontime_6m", "exp_inc_ratio",
           "input_mom_1m", "input_mom_3m", "output_mom_3m", "squeeze",
           "rain_dev", "heat_days", "month_sin", "month_cos", "festival",
           "size_factor"]
        + [f"sec_{s}" for s in SECTORS]
    )
    global FEATURE_COLS
    FEATURE_COLS = feature_cols
    df.attrs["feature_cols"] = feature_cols
    return df


if __name__ == "__main__":
    panel = build_panel()
    print(panel.shape)
    print(panel[panel.columns[:12]].tail())
