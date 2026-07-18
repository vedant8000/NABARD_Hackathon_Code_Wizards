"""Direct messaging between the field officer and enterprises.

One thread per enterprise. Officers can open any thread; an enterprise
user can only open their own. Read receipts are tracked per side so both
UIs can show unread badges. Polling-based (prototype-simple, offline-tolerant).
"""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import store
from ..db import get_db
from ..deps import get_current_user
from ..models import DirectMessage, User

router = APIRouter(prefix="/api/messages", tags=["messages"])


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


def _guard_thread(user: User, enterprise_id: int) -> None:
    if user.role == "enterprise" and user.enterprise_id != enterprise_id:
        raise HTTPException(403, "You can only access your own messages")


@router.get("/unread")
def unread(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Unread counts for the current user (messages sent by the other side)."""
    other = "enterprise" if user.role == "officer" else "officer"
    read_col = DirectMessage.read_by_officer if user.role == "officer" else DirectMessage.read_by_enterprise
    q = select(DirectMessage.enterprise_id, func.count()).where(
        DirectMessage.sender_role == other, read_col == False)  # noqa: E712
    if user.role == "enterprise":
        q = q.where(DirectMessage.enterprise_id == user.enterprise_id)
    rows = db.execute(q.group_by(DirectMessage.enterprise_id)).all()
    by_ent = {int(eid): int(n) for eid, n in rows}
    return {"total": sum(by_ent.values()), "by_enterprise": by_ent}


_BAND_ORDER = {"red": 0, "amber": 1, "green": 2}


@router.get("/threads")
def threads(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Officer inbox: one row per conversation, unread + risk-prioritized."""
    if user.role != "officer":
        raise HTTPException(403, "Officer only")
    msgs = db.scalars(select(DirectMessage).order_by(DirectMessage.created_at)).all()
    by: dict[int, dict] = {}
    for m in msgs:
        t = by.setdefault(m.enterprise_id, {"unread": 0, "last": None, "count": 0})
        t["last"] = m
        t["count"] += 1
        if m.sender_role == "enterprise" and not m.read_by_officer:
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
            "last_content": last.content[:120], "last_sender": last.sender_role,
            "last_at": last.created_at.isoformat(),
        })
    # triage order: unread first, then risk band (red > amber > green), then newest
    out.sort(key=lambda r: (-(r["unread"] > 0), _BAND_ORDER.get(r["band"], 3), r["last_at"] and -datetime.fromisoformat(r["last_at"]).timestamp()))
    return out


@router.get("/{enterprise_id}")
def thread(enterprise_id: int, user: User = Depends(get_current_user),
           db: Session = Depends(get_db)):
    _guard_thread(user, enterprise_id)
    msgs = db.scalars(select(DirectMessage)
                      .where(DirectMessage.enterprise_id == enterprise_id)
                      .order_by(DirectMessage.created_at)).all()
    # mark the other side's messages as read for this viewer
    other = "enterprise" if user.role == "officer" else "officer"
    for m in msgs:
        if m.sender_role == other:
            if user.role == "officer":
                m.read_by_officer = True
            else:
                m.read_by_enterprise = True
    db.commit()

    ent = store.enterprise_row(enterprise_id) or {}
    return {
        "enterprise": {"id": enterprise_id, "name": ent.get("name", f"#{enterprise_id}"),
                       "village": ent.get("village"), "sector": ent.get("sector")},
        "messages": [{
            "id": m.id, "sender_role": m.sender_role, "sender_name": m.sender_name,
            "content": m.content, "at": m.created_at.isoformat(),
            "mine": m.sender_role == user.role,
        } for m in msgs],
    }


@router.post("/{enterprise_id}")
def send(enterprise_id: int, body: MessageIn,
         user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _guard_thread(user, enterprise_id)
    if store.enterprise_row(enterprise_id) is None:
        raise HTTPException(404, "Enterprise not found")
    # professional guardrail: beneficiaries may send at most 10 messages/day —
    # this is an advisory channel, not an instant-messenger
    if user.role == "enterprise":
        since = datetime.utcnow() - timedelta(hours=24)
        n_today = db.scalar(select(func.count()).where(
            DirectMessage.enterprise_id == enterprise_id,
            DirectMessage.sender_role == "enterprise",
            DirectMessage.created_at >= since)) or 0
        if n_today >= 10:
            raise HTTPException(
                429,
                "Daily message limit reached. Your officer has your messages and "
                "will respond — for emergencies, please call directly.")
    m = DirectMessage(
        enterprise_id=enterprise_id,
        sender_role=user.role,
        sender_name=user.display_name or user.username,
        content=body.content.strip(),
        read_by_officer=(user.role == "officer"),
        read_by_enterprise=(user.role == "enterprise"),
    )
    db.add(m)
    db.commit()
    return {"id": m.id, "at": m.created_at.isoformat()}
