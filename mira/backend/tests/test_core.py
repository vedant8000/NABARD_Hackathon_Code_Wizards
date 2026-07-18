"""MIRA pragmatic test suite (Phase 13.2): scoring math, EWS rules,
API auth/role guards, offline sync idempotency.

Run from mira/backend:  python -m pytest tests/ -q
"""
from __future__ import annotations

import os
import sys
import uuid

import pandas as pd
import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)
sys.path.insert(0, os.path.join(BACKEND, "ml"))

from ews import RULES, evaluate  # noqa: E402
from score_all import band, sub_scores  # noqa: E402


# ------------------------------------------------------------- scoring math
def test_band_thresholds():
    assert band(70) == "green"
    assert band(69.9) == "amber"
    assert band(45) == "amber"
    assert band(44.9) == "red"


def _mk_row(**over):
    base = {
        "sector": "dairy", "net_cf_rstd6": 100, "net_cf_rmean6": 1000,
        "emi_ontime_6m": 1.0, "dep_rmean3": 4, "txn_slope_3m": 0.0,
        "squeeze": 0.0, "rain_dev": 0.0, "heat_days": 0, "expense": 5000,
        "emi_paid": 1, "payer_diversity": 0.6, "input_mom_3m": 0.0,
        "output_mom_3m": 0.0,
    }
    base.update(over)
    return pd.Series(base)


def _mk_hist(months=12, expense=5000, dep_events=4, emi_paid=1):
    return pd.DataFrame({
        "month": pd.period_range("2025-01", periods=months, freq="M"),
        "expense": [expense] * months,
        "dep_events": [dep_events] * months,
        "emi_paid": [emi_paid] * months,
    })


def test_subscores_healthy_beats_stressed():
    healthy = sub_scores(_mk_row(), _mk_hist(), [5000] * 6, savings_balance=20000)
    stressed = sub_scores(
        _mk_row(emi_ontime_6m=0.3, txn_slope_3m=-0.4, squeeze=0.3, rain_dev=-0.5),
        _mk_hist(), [-2000] * 6, savings_balance=1000)
    for k in healthy:
        assert healthy[k] >= stressed[k], f"{k}: {healthy[k]} < {stressed[k]}"


# ------------------------------------------------------------------ EWS rules
def _codes(row, hist, fc=None, savings=50000, anomaly=False):
    return {a["code"] for a in evaluate(row, hist, fc or [5000] * 6, savings, anomaly)}


def test_ews_clean_enterprise_no_alerts():
    assert _codes(_mk_row(), _mk_hist()) == set()


def test_ews01_savings_break():
    hist = _mk_hist()
    hist.loc[hist.index[-2:], "dep_events"] = 0
    assert "EWS-01" in _codes(_mk_row(), hist)


def test_ews02_missed_emi():
    assert "EWS-02" in _codes(_mk_row(emi_paid=0), _mk_hist())


def test_ews03_negative_forecast():
    assert "EWS-03" in _codes(_mk_row(), _mk_hist(), fc=[-100, -100, 500, 0, 0, 0])


def test_ews04_low_runway():
    assert "EWS-04" in _codes(_mk_row(), _mk_hist(expense=5000), savings=2000)


def test_ews06_input_price_shock():
    assert "EWS-06" in _codes(_mk_row(input_mom_3m=0.2), _mk_hist())


def test_ews08_drought_fires_heatwave_gated_by_sector():
    assert "EWS-08" in _codes(_mk_row(rain_dev=-0.5), _mk_hist())
    # heatwave alone: fires for dairy, not for handicrafts
    assert "EWS-08" in _codes(_mk_row(heat_days=16, sector="dairy"), _mk_hist())
    assert "EWS-08" not in _codes(_mk_row(heat_days=16, sector="handicrafts"), _mk_hist())


def test_rules_have_bilingual_messages():
    from ews import MESSAGES
    for code in RULES:
        assert code in MESSAGES and len(MESSAGES[code]) == 4


# ------------------------------------------------------------------- API
@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        yield c


def _login(client, username):
    r = client.post("/api/auth/login", json={"username": username, "password": "mira2026"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_login_bad_password(client):
    r = client.post("/api/auth/login", json={"username": "officer1", "password": "wrong"})
    assert r.status_code == 401


def test_role_guard(client):
    ent = _login(client, "udyami1")
    assert client.get("/api/portfolio/overview", headers=ent).status_code == 403
    off = _login(client, "officer1")
    assert client.get("/api/me/summary", headers=off).status_code == 403


def test_summary_shape(client):
    ent = _login(client, "udyami1")
    r = client.get("/api/me/summary", headers=ent)
    assert r.status_code == 200
    body = r.json()
    assert {"score", "band", "sub_scores", "drivers", "emi_amount"} <= set(body)
    assert body["band"] in ("green", "amber", "red")


def test_forecast_six_months(client):
    ent = _login(client, "udyami1")
    body = client.get("/api/me/forecast", headers=ent).json()
    assert len(body["forecast"]) == 6
    for row in body["forecast"]:
        assert row["p10"] <= row["p50"] <= row["p90"]


def test_sync_idempotency(client):
    ent = _login(client, "udyami1")
    cu = str(uuid.uuid4())
    entry = {"date": "2026-07-15", "kind": "income", "amount": 900,
             "category": "milk", "client_uuid": cu}
    r1 = client.post("/api/me/ledger", json=entry, headers=ent).json()
    r2 = client.post("/api/me/ledger", json=entry, headers=ent).json()
    assert r1["deduped"] is False
    assert r2["deduped"] is True and r2["id"] == r1["id"]
    # batch resend also dedupes
    r3 = client.post("/api/me/ledger/batch", json={"entries": [entry]}, headers=ent).json()
    assert r3["results"][0]["deduped"] is True


def test_overview_counts(client):
    off = _login(client, "officer1")
    body = client.get("/api/portfolio/overview", headers=off).json()
    assert body["total"] == sum(body["bands"].values()) == 64


def test_credit_passport_pdf(client):
    off = _login(client, "officer1")
    r = client.get("/api/reports/18/credit-passport", headers=off)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")
    assert r.content[:5] == b"%PDF-"
