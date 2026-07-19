"""Phase 1 verification: MongoDB-backed login for both roles (officer +
SHG/enterprise), and completeness/integrity of the Mongo user migration.

Run from mira/backend (venv active, MONGODB_URI set in .env):
    python -m pytest tests/test_mongo_auth.py -q
"""
from __future__ import annotations

import os
import sys

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


# --------------------------------------------------------------- login: officer
def test_officer_login_succeeds(client):
    r = client.post("/api/auth/login", json={"username": "officer1", "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role"] == "officer"
    assert body["enterprise_id"] is None
    assert body["token"]


def test_officer_login_wrong_password_rejected(client):
    r = client.post("/api/auth/login", json={"username": "officer1", "password": "not-the-password"})
    assert r.status_code == 401


# --------------------------------------------------------------- login: SHG
@pytest.mark.parametrize("username,enterprise_id", [
    ("udyami1", 1), ("udyami4", 4), ("udyami18", 18), ("udyami64", 64),
])
def test_shg_login_succeeds(client, username, enterprise_id):
    r = client.post("/api/auth/login", json={"username": username, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role"] == "enterprise"
    assert body["enterprise_id"] == enterprise_id
    assert body["token"]


def test_shg_login_wrong_password_rejected(client):
    r = client.post("/api/auth/login", json={"username": "udyami1", "password": "not-the-password"})
    assert r.status_code == 401


def test_unknown_username_rejected(client):
    r = client.post("/api/auth/login", json={"username": "no-such-user", "password": DEMO_PASSWORD})
    assert r.status_code == 401


# ------------------------------------------------------- token content / guards
def test_login_token_grants_correct_access(client):
    """Officer token unlocks officer routes and is refused enterprise routes, and
    vice versa — proves the JWT round-trips through Mongo lookup correctly."""
    off = client.post("/api/auth/login", json={"username": "officer1", "password": DEMO_PASSWORD}).json()
    ent = client.post("/api/auth/login", json={"username": "udyami1", "password": DEMO_PASSWORD}).json()
    off_h = {"Authorization": f"Bearer {off['token']}"}
    ent_h = {"Authorization": f"Bearer {ent['token']}"}

    assert client.get("/api/portfolio/overview", headers=off_h).status_code == 200
    assert client.get("/api/portfolio/overview", headers=ent_h).status_code == 403
    assert client.get("/api/me/summary", headers=ent_h).status_code == 200
    assert client.get("/api/me/summary", headers=off_h).status_code == 403
    assert client.get("/api/me/summary").status_code == 401  # no token at all


# ------------------------------------------------------- migration completeness
def test_all_enterprises_have_a_mongo_login(client):
    """Every enterprise the ML pipeline generated must have a working udyamiN
    login in MongoDB — catches partial/interrupted migrations."""
    from app import store
    from app.mongo import find_user_by_username

    ents = store.enterprises()
    missing = []
    for r in ents.itertuples():
        u = find_user_by_username(f"udyami{r.id}")
        if u is None or u.enterprise_id != int(r.id) or u.role != "enterprise":
            missing.append(int(r.id))
    assert not missing, f"enterprises missing/broken in Mongo: {missing}"


def test_user_count_matches_expected(client):
    from app import store
    from app.mongo import count_users

    expected = 1 + len(store.enterprises())  # 1 officer + N enterprises
    assert count_users() == expected


def test_officer_present_exactly_once(client):
    from app.mongo import find_users_by_role
    officers = find_users_by_role("officer")
    assert len(officers) == 1
    assert officers[0].username == "officer1"


# ------------------------------------------------------- password storage safety
def test_passwords_are_bcrypt_hashed_not_plaintext(client):
    from app.mongo import find_user_by_username
    for username in ("officer1", "udyami1", "udyami64"):
        u = find_user_by_username(username)
        assert u.password_hash != DEMO_PASSWORD
        assert u.password_hash.startswith("$2b$"), f"{username}: not a bcrypt hash"


def test_same_password_hashes_differently_per_user(client):
    """Confirms real per-hash salting — two users sharing the demo password
    must not have identical stored hashes."""
    from app.mongo import find_user_by_username
    a = find_user_by_username("udyami1").password_hash
    b = find_user_by_username("udyami2").password_hash
    assert a != b
