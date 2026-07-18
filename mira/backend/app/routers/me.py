"""Udyami (enterprise) endpoints: health summary, forecast, alerts, ledger."""
from __future__ import annotations

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import store
from ..config import settings
from ..db import get_db
from ..deps import require_enterprise
from ..models import Alert, LedgerEntry, User
from ..schemas import LedgerBatchIn, LedgerIn

router = APIRouter(prefix="/api/me", tags=["me"])


def _eid(user: User) -> int:
    if user.enterprise_id is None:
        raise HTTPException(400, "No enterprise linked to this account")
    return user.enterprise_id


def _app_entries(db: Session, eid: int) -> pd.DataFrame:
    rows = db.scalars(select(LedgerEntry).where(LedgerEntry.enterprise_id == eid)).all()
    if not rows:
        return pd.DataFrame(columns=["date", "kind", "amount", "category", "note"])
    df = pd.DataFrame([{
        "date": pd.Timestamp(r.date), "kind": r.kind, "amount": r.amount,
        "category": r.category, "note": r.note, "client_uuid": r.client_uuid,
    } for r in rows])
    return df


def _live_balance(sc: dict, app: pd.DataFrame) -> int:
    """Linked savings balance: batch base + app income + app deposits
    − app expenses − app loan repayments. One pool, fully connected."""
    bal = float(sc["savings_balance"])
    if len(app):
        bal += float(app[app.kind == "income"].amount.sum())
        bal += float(app[app.kind == "savings_deposit"].amount.sum())
        bal -= float(app[app.kind == "expense"].amount.sum())
        bal -= float(app[app.kind == "loan_repayment"].amount.sum())
    return round(bal)


@router.get("/summary")
def summary(user: User = Depends(require_enterprise), db: Session = Depends(get_db)):
    eid = _eid(user)
    ent = store.enterprise_row(eid)
    sc = store.score_row(eid)
    if ent is None or sc is None:
        raise HTTPException(404, "Enterprise not scored yet")
    app = _app_entries(db, eid)
    emi = store.emi_info(eid, settings.DEMO_TODAY, extra_entries=app)
    return {
        "enterprise": {k: ent[k] for k in ("id", "name", "type", "sector", "village",
                                           "district", "members_count")},
        "score": sc["mira_score"], "band": sc["band"],
        "stress_prob_3m": sc["stress_prob_3m"],
        "sub_scores": {k: sc[k] for k in ("s1_cashflow", "s2_repayment", "s3_digital",
                                          "s4_market", "s5_climate")},
        "drivers": sc["drivers"],
        "savings_balance": _live_balance(sc, app),
        "as_of": sc["as_of"],
        **emi,
    }


@router.get("/forecast")
def forecast(user: User = Depends(require_enterprise), db: Session = Depends(get_db)):
    eid = _eid(user)
    history = store.monthly_history(eid, months=12, extra_entries=_app_entries(db, eid))
    return {"history": history, "forecast": store.forecast_rows(eid)}


@router.get("/alerts")
def my_alerts(user: User = Depends(require_enterprise), db: Session = Depends(get_db)):
    eid = _eid(user)
    rows = db.scalars(
        select(Alert).where(Alert.enterprise_id == eid,
                            Alert.audience.in_(["enterprise", "both"]))
        .order_by(Alert.severity.desc())
    ).all()
    return [{
        "id": a.id, "code": a.code, "name": a.name, "severity": a.severity,
        "message_en": a.message_en, "message_hi": a.message_hi,
        "action_en": a.action_en, "action_hi": a.action_hi, "acked": a.acked,
    } for a in rows]


@router.get("/ledger")
def ledger_history(from_: str | None = None, to: str | None = None,
                   limit: int = 60,
                   user: User = Depends(require_enterprise),
                   db: Session = Depends(get_db)):
    eid = _eid(user)
    csv = store.ledger()
    csv = csv[csv.enterprise_id == eid][["date", "kind", "amount", "category"]].copy()
    csv["source"] = "history"
    app = _app_entries(db, eid)
    if len(app):
        app = app[["date", "kind", "amount", "category"]].copy()
        app["source"] = "app"
        csv = pd.concat([csv, app], ignore_index=True)
    if from_:
        csv = csv[csv.date >= pd.Timestamp(from_)]
    if to:
        csv = csv[csv.date <= pd.Timestamp(to)]
    csv = csv.sort_values("date", ascending=False).head(limit)
    return [{"date": str(r.date.date()), "kind": r.kind, "amount": round(r.amount),
             "category": r.category, "source": r.source} for r in csv.itertuples()]


def _validate_entry(db: Session, eid: int, e: LedgerIn) -> str | None:
    """Financial-integrity checks. A loan payment must be covered by the
    linked savings balance and cannot exceed the outstanding amount —
    otherwise a farmer could 'write off' a loan with money they don't have."""
    if e.kind != "loan_repayment":
        return None
    sc = store.score_row(eid)
    if sc is None:
        return None
    app = _app_entries(db, eid)
    emi = store.emi_info(eid, settings.DEMO_TODAY, extra_entries=app)
    if emi["outstanding"] <= 0:
        return "Loan is already fully repaid — no payment is due."
    if e.amount > emi["outstanding"]:
        return f"Amount exceeds the outstanding loan (₹{emi['outstanding']:,})."
    bal = _live_balance(sc, app)
    if e.amount > bal:
        return f"Insufficient savings balance — available ₹{max(bal, 0):,}."
    return None


def _insert_entry(db: Session, eid: int, e: LedgerIn) -> dict:
    if e.client_uuid:
        dup = db.scalar(select(LedgerEntry).where(LedgerEntry.client_uuid == e.client_uuid))
        if dup is not None:
            return {"id": dup.id, "client_uuid": e.client_uuid, "deduped": True}
    reason = _validate_entry(db, eid, e)
    if reason is not None:
        return {"client_uuid": e.client_uuid, "rejected": reason}
    row = LedgerEntry(client_uuid=e.client_uuid, enterprise_id=eid, date=e.date,
                      kind=e.kind, category=e.category, amount=e.amount, note=e.note)
    db.add(row)
    db.flush()
    return {"id": row.id, "client_uuid": e.client_uuid, "deduped": False}


@router.post("/ledger")
def add_ledger(body: LedgerIn, user: User = Depends(require_enterprise),
               db: Session = Depends(get_db)):
    res = _insert_entry(db, _eid(user), body)
    if res.get("rejected"):
        raise HTTPException(400, res["rejected"])
    db.commit()
    return res


@router.post("/ledger/batch")
def add_ledger_batch(body: LedgerBatchIn, user: User = Depends(require_enterprise),
                     db: Session = Depends(get_db)):
    results = [_insert_entry(db, _eid(user), e) for e in body.entries]
    db.commit()
    return {"synced": sum(1 for r in results if not r.get("rejected")), "results": results}
