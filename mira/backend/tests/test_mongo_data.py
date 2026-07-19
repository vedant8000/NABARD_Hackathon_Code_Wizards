"""Verification for the enterprise_profiles + ledger_entries MongoDB
migration: static per-enterprise facts (loan_principal, sector, village...)
and app-entered ledger transactions now live in Mongo, not
enterprises.csv / the SQLite LedgerEntry table.

Run from mira/backend (venv active, MONGODB_URI set in .env):
    python -m pytest tests/test_mongo_data.py -q
"""
from __future__ import annotations

import os
import sys
import uuid

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

DEMO_PASSWORD = "mira2026"


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        yield c


def _login(client, username):
    r = client.post("/api/auth/login", json={"username": username, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


# ------------------------------------------------------- profile migration
def test_all_enterprises_have_a_mongo_profile(client):
    from app import store
    from app.mongo import find_enterprise_profile

    ents = store.enterprises()
    missing = []
    for r in ents.itertuples():
        p = find_enterprise_profile(int(r.id))
        if p is None:
            missing.append(int(r.id))
    assert not missing, f"enterprises missing a Mongo profile: {missing}"


def test_profile_count_matches_csv(client):
    from app import store
    from app.mongo import count_enterprise_profiles
    assert count_enterprise_profiles() == len(store.enterprises())


def test_profile_fields_match_source_csv(client):
    """Spot-check that the Mongo copy's financial facts (loan_principal,
    sector) match what the ML pipeline actually generated — catches a
    broken/partial seed silently drifting from the source of truth."""
    from app import store
    from app.mongo import find_enterprise_profile

    ents = store.enterprises().set_index("id")
    for eid in (1, 18, 64):
        row = ents.loc[eid]
        profile = find_enterprise_profile(eid)
        assert profile is not None
        assert profile["loan_principal"] == pytest.approx(float(row.loan_principal))
        assert profile["sector"] == row.sector
        assert profile["village"] == row.village


def test_summary_uses_mongo_loan_principal(client):
    """/api/me/summary's EMI math (store.emi_info) reads loan_principal via
    store.enterprise_row -> Mongo, not the CSV directly."""
    from app import store
    ent_hdrs = _login(client, "udyami1")
    body = client.get("/api/me/summary", headers=ent_hdrs).json()
    expected_principal = float(store.enterprises().set_index("id").loc[1].loan_principal)
    assert body["loan_principal"] == round(expected_principal)


# ------------------------------------------------------- ledger migration
def test_ledger_entry_persists_to_mongo(client):
    from app.mongo import find_ledger_entries_by_enterprise
    ent_hdrs = _login(client, "udyami2")
    before = len(find_ledger_entries_by_enterprise(2))

    r = client.post("/api/me/ledger", json={
        "date": "2026-07-10", "kind": "income", "amount": 250, "category": "milk",
    }, headers=ent_hdrs)
    assert r.status_code == 200, r.text
    assert r.json()["deduped"] is False

    after = find_ledger_entries_by_enterprise(2)
    assert len(after) == before + 1
    assert any(e["amount"] == 250 and e["category"] == "milk" for e in after)


def test_ledger_dedup_via_mongo_client_uuid(client):
    ent_hdrs = _login(client, "udyami3")
    cu = str(uuid.uuid4())
    entry = {"date": "2026-07-11", "kind": "income", "amount": 300,
             "category": "milk", "client_uuid": cu}
    r1 = client.post("/api/me/ledger", json=entry, headers=ent_hdrs).json()
    r2 = client.post("/api/me/ledger", json=entry, headers=ent_hdrs).json()
    assert r1["deduped"] is False
    assert r2["deduped"] is True
    assert r2["id"] == r1["id"]


def test_ledger_appears_in_history_and_forecast_endpoints(client):
    """Confirms me.py's _app_entries() (now Mongo-backed) still feeds
    /api/me/ledger and /api/me/forecast correctly."""
    ent_hdrs = _login(client, "udyami4")
    cu = str(uuid.uuid4())
    client.post("/api/me/ledger", json={
        "date": "2026-07-12", "kind": "income", "amount": 777,
        "category": "milk", "client_uuid": cu,
    }, headers=ent_hdrs)

    hist = client.get("/api/me/ledger", headers=ent_hdrs).json()
    assert any(row["amount"] == 777 and row["source"] == "app" for row in hist)

    fc = client.get("/api/me/forecast", headers=ent_hdrs).json()
    assert len(fc["forecast"]) == 6
