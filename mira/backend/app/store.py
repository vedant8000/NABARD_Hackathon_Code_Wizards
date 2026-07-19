"""In-memory read store over the generated CSVs.

The ML pipeline writes enterprises/ledger/prices/weather/scores/forecasts
CSVs; this module loads them once and serves fast pandas lookups to the
routers. Mutable state (new ledger rows, acks, chat) lives in SQLite.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache

import pandas as pd

from . import mongo
from .config import ARTIFACTS_DIR, DATA_DIR


def _csv(name: str, **kw) -> pd.DataFrame:
    return pd.read_csv(os.path.join(DATA_DIR, name), **kw)


@lru_cache(maxsize=1)
def enterprises() -> pd.DataFrame:
    return _csv("enterprises.csv")


@lru_cache(maxsize=1)
def ledger() -> pd.DataFrame:
    return _csv("ledger.csv", parse_dates=["date"])


@lru_cache(maxsize=1)
def digital() -> pd.DataFrame:
    return _csv("digital_activity.csv", parse_dates=["date"])


@lru_cache(maxsize=1)
def prices() -> pd.DataFrame:
    return _csv("prices.csv", parse_dates=["date"])


@lru_cache(maxsize=1)
def weather() -> pd.DataFrame:
    return _csv("weather.csv", parse_dates=["date"])


@lru_cache(maxsize=1)
def scores() -> pd.DataFrame:
    df = _csv("scores.csv")
    df["drivers"] = df["drivers_json"].apply(json.loads)
    return df


@lru_cache(maxsize=1)
def forecasts() -> pd.DataFrame:
    return _csv("forecasts.csv")


@lru_cache(maxsize=1)
def backtest_report() -> dict:
    with open(os.path.join(ARTIFACTS_DIR, "backtest_report.json"), encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def ews_rules() -> dict:
    with open(os.path.join(ARTIFACTS_DIR, "ews.rules.json"), encoding="utf-8") as f:
        return json.load(f)


def invalidate():
    """Call after a rescore rewrites the CSVs."""
    for fn in (enterprises, ledger, digital, prices, weather, scores, forecasts,
               backtest_report, ews_rules):
        fn.cache_clear()


# ---------------------------------------------------------------- helpers
def enterprise_row(eid: int) -> dict | None:
    """Per-enterprise profile facts (loan_principal, sector, village, ...).
    Served from MongoDB (app/mongo.py: enterprise_profiles) — the one-time
    generated enterprises.csv seeds it at startup but is no longer read here."""
    return mongo.find_enterprise_profile(eid)


def score_row(eid: int) -> dict | None:
    df = scores()
    m = df[df.enterprise_id == eid]
    return None if m.empty else m.iloc[0].to_dict()


def forecast_rows(eid: int) -> list[dict]:
    df = forecasts()
    return df[df.enterprise_id == eid][["month", "p10", "p50", "p90"]].to_dict("records")


def monthly_history(eid: int, months: int = 12, extra_entries: pd.DataFrame | None = None) -> list[dict]:
    """Monthly income/expense/net for the last N *complete* months,
    optionally folding in app-entered ledger rows."""
    led = ledger()
    led = led[led.enterprise_id == eid][["date", "kind", "amount"]]
    if extra_entries is not None and len(extra_entries):
        led = pd.concat([led, extra_entries[["date", "kind", "amount"]]], ignore_index=True)
    led = led.copy()
    led["month"] = led.date.dt.to_period("M")
    last_day = led.date.max()
    if pd.notna(last_day) and last_day.day != last_day.days_in_month:
        led = led[led.month < last_day.to_period("M")]
    piv = led.pivot_table(index="month", columns="kind", values="amount",
                          aggfunc="sum", fill_value=0)
    for c in ("income", "expense", "savings_deposit", "loan_repayment"):
        if c not in piv:
            piv[c] = 0
    piv["net"] = piv["income"] - piv["expense"]
    piv = piv.tail(months).reset_index()
    return [
        {"month": str(r.month), "income": round(r.income), "expense": round(r.expense),
         "net": round(r.net), "savings": round(r.savings_deposit),
         "loan_repayment": round(r.loan_repayment)}
        for r in piv.itertuples()
    ]


def emi_info(eid: int, demo_today, extra_entries: pd.DataFrame | None = None) -> dict:
    """EMI amount = typical monthly loan_repayment; streak = consecutive
    recent months with a repayment. App-entered repayments (`extra_entries`)
    count in full toward the outstanding principal — so a farmer can close
    the loan early through the app."""
    led = ledger()
    rep = led[(led.enterprise_id == eid) & (led.kind == "loan_repayment")][["date", "amount"]].copy()

    app_rep = None
    if extra_entries is not None and len(extra_entries):
        app_rep = extra_entries[extra_entries.kind == "loan_repayment"][["date", "amount"]].copy()
        if not len(app_rep):
            app_rep = None

    rep_all = pd.concat([rep, app_rep], ignore_index=True) if app_rep is not None else rep
    if rep_all.empty:
        return {"emi_amount": 0, "next_emi_date": None, "ontime_streak": 0,
                "outstanding": 0, "schedule": []}
    rep_all["month"] = pd.to_datetime(rep_all.date).dt.to_period("M")
    monthly = rep_all.groupby("month").amount.sum()
    # typical EMI from the historical series (app lump sums shouldn't skew it)
    hist_monthly = rep.assign(month=pd.to_datetime(rep.date).dt.to_period("M")).groupby("month").amount.sum()
    emi_amount = float((hist_monthly if len(hist_monthly) else monthly).tail(6).median())

    ent = enterprise_row(eid) or {}
    principal = float(ent.get("loan_principal", 0))
    csv_paid = float(rep.amount.sum()) * 0.7  # historic payments: part interest
    app_paid = float(app_rep.amount.sum()) if app_rep is not None else 0.0
    pre_app_outstanding = max(principal - csv_paid, 0)
    outstanding = max(pre_app_outstanding - app_paid, 0)

    # prepayment lowers the installment (tenure preserved): the remaining
    # balance is re-spread over the months the original EMI would have taken
    import math
    if outstanding <= 0:
        adj_emi = 0.0
    elif app_paid > 0 and emi_amount > 0 and pre_app_outstanding > 0:
        months_left = max(1, math.ceil(pre_app_outstanding / emi_amount))
        adj_emi = min(emi_amount, math.ceil(outstanding / months_left / 10) * 10)
    else:
        adj_emi = emi_amount

    # streak over complete months; the current month counts once it has a payment
    cur = pd.Period(demo_today, freq="M")
    end = cur if float(monthly.get(cur, 0)) > 0 else cur - 1
    all_months = pd.period_range(monthly.index.min(), end, freq="M")
    paid = set(monthly[monthly > 0].index)
    streak = 0
    for m in reversed(all_months):
        if m in paid:
            streak += 1
        else:
            break

    if outstanding <= 0:
        next_emi = None
    else:
        next_emi = str(((pd.Timestamp(demo_today) + pd.offsets.MonthBegin(1)) + pd.Timedelta(days=4)).date())
    schedule = [{"month": str(m), "paid": bool(m in paid), "amount": round(float(monthly.get(m, 0)))}
                for m in all_months[-12:]]
    return {"emi_amount": round(adj_emi), "emi_original": round(emi_amount),
            "next_emi_date": next_emi,
            "ontime_streak": int(streak), "outstanding": round(outstanding),
            "loan_principal": round(principal), "repaid_via_app": round(app_paid),
            "schedule": schedule}
