"""MitraBot — Gemini-powered assistant, grounded in the user's live data.

Security: GEMINI_API_KEY never leaves the backend. The browser talks only
to POST /api/chat, which streams text deltas back as SSE.
"""
from __future__ import annotations

import json
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import store
from ..config import settings
from ..db import SessionLocal, get_db
from ..deps import get_current_user
from ..models import ChatMessage, User

router = APIRouter(prefix="/api", tags=["chat"])

# simple in-memory rate bucket: max 20 messages/min per user
_bucket: dict[int, deque] = defaultdict(deque)

# failover pointer: index of the last known-good Gemini key
_key_state = {"idx": 0}

_QUOTA_MARKERS = ("429", "RESOURCE_EXHAUSTED", "quota", "rate limit", "PERMISSION_DENIED",
                  "API key not valid", "INVALID_ARGUMENT", "403")


def _quota_error(exc: Exception) -> bool:
    msg = str(exc)
    return any(m.lower() in msg.lower() for m in _QUOTA_MARKERS)


def _rate_ok(uid: int) -> bool:
    now = time.time()
    q = _bucket[uid]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= 20:
        return False
    q.append(now)
    return True


def _fmt_inr(x) -> str:
    try:
        return f"₹{int(round(float(x))):,}"
    except (TypeError, ValueError):
        return "—"


def _enterprise_context(eid: int) -> str:
    ent = store.enterprise_row(eid) or {}
    sc = store.score_row(eid) or {}
    fc = store.forecast_rows(eid)
    emi = store.emi_info(eid, settings.DEMO_TODAY)

    from sqlalchemy import select
    from ..models import Alert
    with SessionLocal() as db:
        alerts = db.scalars(select(Alert).where(
            Alert.enterprise_id == eid,
            Alert.audience.in_(["enterprise", "both"]))).all()

    drivers = ", ".join(
        f"{d.get('label_en', d.get('feature'))} ({'raises risk' if d.get('direction') == 'up' else 'lowers risk'})"
        for d in (sc.get("drivers") or [])[:3])
    fc_lines = "; ".join(f"{r['month']}: {_fmt_inr(r['p50'])}" for r in fc)
    alert_lines = " | ".join(f"{a.code} {a.message_en} ACTION: {a.action_en}" for a in alerts) or "none"

    sector = ent.get("sector", "")
    px = store.prices()
    import pandas as pd
    end = pd.Timestamp(settings.DEMO_TODAY)
    price_lines = []
    for com, g in px[px.date <= end].groupby("commodity"):
        g = g.sort_values("date")
        cur = float(g.modal_price.iloc[-1])
        old = float(g.modal_price.iloc[-60]) if len(g) > 60 else cur
        price_lines.append(f"{com}: {_fmt_inr(cur)} ({(cur / old - 1) * 100:+.0f}% in 60d)")

    wx = store.weather()
    d = ent.get("district")
    wline = ""
    if d:
        recent = wx[(wx.district == d) & (wx.date <= end)].tail(30)
        wline = (f"last 30d rain {recent.rainfall_mm.sum():.0f}mm vs normal "
                 f"{recent.rainfall_normal_mm.sum():.0f}mm; heat days {(recent.tmax > 40).sum()}")

    return f"""THEIR CURRENT DATA (use it — never invent numbers):
- Enterprise: {ent.get('name')}, a {sector} {ent.get('type')} in {ent.get('village')}, {ent.get('district')}. Members: {ent.get('members_count')}.
- MIRA Score: {sc.get('mira_score')}/100 ({str(sc.get('band', '')).upper()}). Top drivers: {drivers}.
- Stress probability (next 3 months): {round(float(sc.get('stress_prob_3m', 0)) * 100)}%.
- 6-month net cash flow forecast (P50): {fc_lines}
- Active alerts: {alert_lines}
- Savings balance {_fmt_inr(sc.get('savings_balance'))}; next EMI {_fmt_inr(emi['emi_amount'])} on {emi['next_emi_date']}; on-time streak {emi['ontime_streak']} months; loan outstanding {_fmt_inr(emi['outstanding'])}.
- Market prices: {'; '.join(price_lines)}
- Weather ({d}): {wline}"""


def _officer_context() -> str:
    s = store.scores()
    e = store.enterprises()
    m = s.merge(e, left_on="enterprise_id", right_on="id")
    bands = m.band.value_counts().to_dict()
    worst = m.nsmallest(7, "mira_score")[["name", "sector", "village", "mira_score", "band"]]
    worst_lines = "; ".join(f"{r.name} ({r.sector}, {r.village}) score {r.mira_score} {r.band}"
                            for r in worst.itertuples())
    sector_avg = m.groupby("sector").mira_score.mean().round(1).to_dict()

    from sqlalchemy import select
    from ..models import Alert
    with SessionLocal() as db:
        alerts = db.scalars(select(Alert).where(Alert.acked == False)).all()  # noqa: E712
    by_code: dict[str, int] = {}
    for a in alerts:
        by_code[a.code] = by_code.get(a.code, 0) + 1

    return f"""PORTFOLIO DATA (use it — never invent numbers):
- {len(m)} enterprises. Bands: {bands}. Average MIRA score {m.mira_score.mean():.1f}.
- 7 riskiest: {worst_lines}
- Average score by sector: {sector_avg}
- Open alerts by EWS code: {by_code}
- EWS legend: {json.dumps({k: v['desc'] for k, v in store.ews_rules().items()})}"""


_BASE_PROMPT = """You are MitraBot (मित्रबॉट), the friendly financial companion inside MIRA — Mitra for Intelligence, Risk & Analytics — a NABARD hackathon platform that predicts cash flow and flags financial risk early for rural micro enterprises (SHGs, FPOs, small businesses) in India.

RULES:
- Reply in the user's language: {lang_name}. Keep it very simple — the user may have limited literacy. Short sentences. No jargon.
- Amounts in Indian rupee format (₹12,500).
- Give ONE clear, doable action per answer.
- When asked about loans/credit: explain how a good MIRA score and on-time EMI streak help them get bank credit faster.
- Never give guarantees or promises about money. Never invent data that is not listed below. If asked something outside business finances, gently steer back.
- Model outputs are decision-support, not a credit decision — say so if asked about final loan approval.
"""

_OFFICER_PROMPT = """You are MitraBot, the analyst copilot inside MIRA — Mitra for Intelligence, Risk & Analytics — a NABARD hackathon platform for AI cash-flow prediction and early risk flagging across a portfolio of rural micro enterprises.

RULES:
- You are talking to a NABARD field officer. Be professional, concise, structured (short bullet lists are good).
- Reply in {lang_name}.
- Use ONLY the portfolio data below — never invent numbers.
- When asked for plans (visit plans, SMS drafts), be concrete and actionable.
- Model outputs are decision-support, not a credit decision.
"""


@router.post("/chat")
def chat(body: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    messages = body.get("messages", [])
    lang = body.get("lang", "en")
    if not messages:
        raise HTTPException(400, "messages required")
    if not _rate_ok(user.id):
        raise HTTPException(429, "Too many messages — please wait a minute.")
    if not settings.gemini_keys:
        raise HTTPException(503, "MitraBot is not configured (missing API key)")

    lang_name = "Hindi (Devanagari)" if lang == "hi" else "English"
    if user.role == "enterprise" and user.enterprise_id:
        system = _BASE_PROMPT.format(lang_name=lang_name) + "\n" + _enterprise_context(user.enterprise_id)
    else:
        system = _OFFICER_PROMPT.format(lang_name=lang_name) + "\n" + _officer_context()

    from google import genai
    from google.genai import types

    contents = [
        types.Content(role=("user" if m.get("role") == "user" else "model"),
                      parts=[types.Part(text=str(m.get("content", "")))])
        for m in messages[-12:]
    ]

    user_text = str(messages[-1].get("content", ""))
    uid = user.id

    def gen():
        full = []
        try:
            keys = settings.gemini_keys
            n = len(keys)
            last_exc: Exception | None = None
            for attempt in range(n):
                idx = (_key_state["idx"] + attempt) % n
                client = genai.Client(api_key=keys[idx])
                try:
                    stream = client.models.generate_content_stream(
                        model=settings.GEMINI_MODEL,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            system_instruction=system, temperature=0.4,
                            max_output_tokens=2048),
                    )
                    for chunk in stream:
                        text = getattr(chunk, "text", None)
                        if text:
                            full.append(text)
                            yield f"data: {json.dumps({'delta': text})}\n\n"
                    _key_state["idx"] = idx  # this key works — keep using it
                    yield "data: {\"done\": true}\n\n"
                    return
                except Exception as exc:
                    last_exc = exc
                    # quota/rate exhausted → try the next key; anything else
                    # after text already streamed → stop
                    if full or not _quota_error(exc):
                        break
            fallback = ("MitraBot अभी उपलब्ध नहीं है। कृपया थोड़ी देर बाद फिर कोशिश करें।"
                        if lang == "hi" else
                        "MitraBot is unavailable right now — please try again in a moment.")
            yield f"data: {json.dumps({'delta': fallback, 'error': str(last_exc)[:200]})}\n\n"
            yield "data: {\"done\": true}\n\n"
        finally:
            reply = "".join(full)
            if reply:
                with SessionLocal() as s2:
                    s2.add(ChatMessage(user_id=uid, role="user", content=user_text))
                    s2.add(ChatMessage(user_id=uid, role="model", content=reply))
                    s2.commit()

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/chat/history")
def chat_history(limit: int = 30, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    from sqlalchemy import select
    rows = db.scalars(select(ChatMessage).where(ChatMessage.user_id == user.id)
                      .order_by(ChatMessage.created_at.desc()).limit(limit)).all()
    return [{"role": r.role, "content": r.content, "at": r.created_at.isoformat()}
            for r in reversed(rows)]
