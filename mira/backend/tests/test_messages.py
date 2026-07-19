"""Phase 2 verification: officer<->SHG messaging, migrated from SQLite
DirectMessage to MongoDB direct_messages, plus the WebSocket delivery path.

Run from mira/backend (venv active, MONGODB_URI set in .env):
    python -m pytest tests/test_messages.py -q
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


def _login(client, username):
    r = client.post("/api/auth/login", json={"username": username, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    body = r.json()
    return {"Authorization": f"Bearer {body['token']}"}, body["token"]


# --------------------------------------------------------------------- REST
def test_enterprise_can_only_open_own_thread(client):
    hdrs, _ = _login(client, "udyami5")
    assert client.get("/api/messages/6", headers=hdrs).status_code == 403
    assert client.get("/api/messages/5", headers=hdrs).status_code == 200


def test_send_and_read_roundtrip(client):
    off_hdrs, _ = _login(client, "officer1")
    ent_hdrs, _ = _login(client, "udyami6")

    r = client.post("/api/messages/6", json={"content": "Hello from officer"}, headers=off_hdrs)
    assert r.status_code == 200, r.text
    msg_id = r.json()["id"]

    thread = client.get("/api/messages/6", headers=ent_hdrs).json()
    contents = [m["content"] for m in thread["messages"]]
    assert "Hello from officer" in contents
    sent = next(m for m in thread["messages"] if m["id"] == msg_id)
    assert sent["mine"] is False  # viewer is the enterprise, sender was the officer
    assert sent["sender_role"] == "officer"


def test_officer_sees_own_message_as_mine(client):
    off_hdrs, _ = _login(client, "officer1")
    client.post("/api/messages/7", json={"content": "checking in"}, headers=off_hdrs)
    thread = client.get("/api/messages/7", headers=off_hdrs).json()
    last = thread["messages"][-1]
    assert last["mine"] is True


def test_thread_marks_messages_read(client):
    off_hdrs, _ = _login(client, "officer1")
    ent_hdrs, _ = _login(client, "udyami8")
    client.post("/api/messages/8", json={"content": "need advice"}, headers=ent_hdrs)

    before = client.get("/api/messages/unread", headers=off_hdrs).json()
    assert before["by_enterprise"].get("8", before["by_enterprise"].get(8, 0)) or \
        any(k in (8, "8") for k in before["by_enterprise"])

    client.get("/api/messages/8", headers=off_hdrs)  # officer opens thread -> marks read
    after = client.get("/api/messages/unread", headers=off_hdrs).json()
    assert after["by_enterprise"].get(8, 0) == 0


def test_officer_threads_listing_includes_conversation(client):
    off_hdrs, _ = _login(client, "officer1")
    ent_hdrs, _ = _login(client, "udyami9")
    client.post("/api/messages/9", json={"content": "hi"}, headers=ent_hdrs)

    threads = client.get("/api/messages/threads", headers=off_hdrs).json()
    assert any(t["enterprise_id"] == 9 for t in threads)


def test_daily_send_cap_enforced_for_enterprise(client):
    ent_hdrs, _ = _login(client, "udyami10")
    last = None
    for i in range(11):
        last = client.post("/api/messages/10", json={"content": f"msg {i}"}, headers=ent_hdrs)
    assert last.status_code == 429


def test_officer_not_subject_to_daily_cap(client):
    off_hdrs, _ = _login(client, "officer1")
    for i in range(12):
        r = client.post("/api/messages/11", json={"content": f"officer msg {i}"}, headers=off_hdrs)
        assert r.status_code == 200


# ---------------------------------------------------------------- WebSocket
def test_websocket_delivers_message_live(client):
    """Officer sends over the WS connection; confirms the same call path
    (messages.send_message) persists to Mongo and echoes the broadcast."""
    off_hdrs, off_token = _login(client, "officer1")
    ent_hdrs, _ = _login(client, "udyami12")

    with client.websocket_connect(f"/api/ws/messages/12?token={off_token}") as ws:
        ws.send_json({"content": "ws hello"})
        payload = ws.receive_json()
        assert payload["type"] == "message"
        assert payload["message"]["content"] == "ws hello"
        assert payload["message"]["sender_role"] == "officer"

    thread = client.get("/api/messages/12", headers=ent_hdrs).json()
    assert any(m["content"] == "ws hello" for m in thread["messages"])


def test_websocket_rejects_wrong_thread_for_enterprise(client):
    _, ent_token = _login(client, "udyami13")
    with pytest.raises(Exception):
        with client.websocket_connect(f"/api/ws/messages/14?token={ent_token}") as ws:
            ws.receive_json()


def test_websocket_rejects_missing_token(client):
    with pytest.raises(Exception):
        with client.websocket_connect("/api/ws/messages/15") as ws:
            ws.receive_json()


def test_websocket_enforces_daily_cap_via_error_frame(client):
    _, ent_token = _login(client, "udyami16")
    with client.websocket_connect(f"/api/ws/messages/16?token={ent_token}") as ws:
        last = None
        for i in range(11):
            ws.send_json({"content": f"cap test {i}"})
            last = ws.receive_json()
        assert last["type"] == "error"
        assert last["status"] == 429
