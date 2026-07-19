"""Direct messaging between the field officer and enterprises.

One thread per enterprise. Officers can open any thread; an enterprise
user can only open their own. Read receipts are tracked per side so both
UIs can show unread badges. REST here covers history/inbox/read-receipts;
live push happens over the WebSocket endpoint in app/routers/ws_chat.py,
which calls send_message() below so both paths share one rate limit and
persistence path.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import mongo, store
from ..deps import get_current_user
from ..mongo import User

router = APIRouter(prefix="/api/messages", tags=["messages"])


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


def _guard_thread(user: User, enterprise_id: int) -> None:
    if user.role == "enterprise" and user.enterprise_id != enterprise_id:
        raise HTTPException(403, "You can only access your own messages")


def send_message(user: User, enterprise_id: int, content: str) -> dict:
    """Shared by the REST POST below and the WebSocket handler — one place
    enforces the thread guard, the enterprise's daily send cap, and persists
    to Mongo, so both delivery paths stay consistent."""
    _guard_thread(user, enterprise_id)
    if store.enterprise_row(enterprise_id) is None:
        raise HTTPException(404, "Enterprise not found")
    content = content.strip()
    if not content:
        raise HTTPException(400, "Message cannot be empty")
    if len(content) > 2000:
        raise HTTPException(400, "Message is too long")
    # professional guardrail: beneficiaries may send at most 10 messages/day —
    # this is an advisory channel, not an instant-messenger
    if user.role == "enterprise":
        since = datetime.utcnow() - timedelta(hours=24)
        n_today = mongo.count_messages_since(enterprise_id, "enterprise", since)
        if n_today >= 10:
            raise HTTPException(
                429,
                "Daily message limit reached. Your officer has your messages and "
                "will respond — for emergencies, please call directly.")
    doc = mongo.insert_direct_message(
        enterprise_id=enterprise_id, sender_role=user.role,
        sender_name=user.display_name or user.username, content=content)
    return doc


def message_dict(doc: dict) -> dict:
    """Role-agnostic shape — used for WebSocket broadcasts, where a single
    payload goes to every connected viewer regardless of their role."""
    return {
        "id": mongo.message_id(doc), "sender_role": doc["sender_role"],
        "sender_name": doc["sender_name"], "content": doc["content"],
        "at": doc["created_at"].isoformat(),
    }


def serialize_message(doc: dict, viewer_role: str) -> dict:
    return {**message_dict(doc), "mine": doc["sender_role"] == viewer_role}


@router.get("/unread")
def unread(user: User = Depends(get_current_user)):
    """Unread counts for the current user (messages sent by the other side)."""
    eid = user.enterprise_id if user.role == "enterprise" else None
    by_ent = mongo.unread_counts_for(user.role, eid)
    return {"total": sum(by_ent.values()), "by_enterprise": by_ent}


_BAND_ORDER = {"red": 0, "amber": 1, "green": 2}


@router.get("/threads")
def threads(user: User = Depends(get_current_user)):
    """Officer inbox: one row per conversation, unread + risk-prioritized."""
    if user.role != "officer":
        raise HTTPException(403, "Officer only")
    msgs = mongo.find_all_messages()
    by: dict[int, dict] = {}
    for m in msgs:
        t = by.setdefault(m["enterprise_id"], {"unread": 0, "last": None, "count": 0})
        t["last"] = m
        t["count"] += 1
        if m["sender_role"] == "enterprise" and not m["read_by_officer"]:
            t["unread"] += 1

    scores = store.scores()
    out = []
    for eid, t in by.items():
        ent = store.enterprise_row(eid) or {}
        sc = scores[scores.enterprise_id == eid]
        band = sc.band.iloc[0] if len(sc) else "green"
        last = t["last"]
        out.append({
            "enterprise_id": eid,
            "name": ent.get("name", f"#{eid}"),
            "village": ent.get("village"), "sector": ent.get("sector"),
            "band": band,
            "score": float(sc.mira_score.iloc[0]) if len(sc) else None,
            "unread": t["unread"], "message_count": t["count"],
            "last_content": last["content"][:120], "last_sender": last["sender_role"],
            "last_at": last["created_at"].isoformat(),
        })
    # triage order: unread first, then risk band (red > amber > green), then newest
    out.sort(key=lambda r: (-(r["unread"] > 0), _BAND_ORDER.get(r["band"], 3), r["last_at"] and -datetime.fromisoformat(r["last_at"]).timestamp()))
    return out


@router.get("/{enterprise_id}")
def thread(enterprise_id: int, user: User = Depends(get_current_user)):
    _guard_thread(user, enterprise_id)
    msgs = mongo.find_messages_by_enterprise(enterprise_id)
    mongo.mark_thread_read(enterprise_id, user.role)

    ent = store.enterprise_row(enterprise_id) or {}
    return {
        "enterprise": {"id": enterprise_id, "name": ent.get("name", f"#{enterprise_id}"),
                       "village": ent.get("village"), "sector": ent.get("sector")},
        "messages": [serialize_message(m, user.role) for m in msgs],
    }


@router.post("/{enterprise_id}")
def send(enterprise_id: int, body: MessageIn, user: User = Depends(get_current_user)):
    doc = send_message(user, enterprise_id, body.content)
    return {"id": mongo.message_id(doc), "at": doc["created_at"].isoformat()}
