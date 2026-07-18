"""Adhikari (field officer) endpoints: portfolio KPIs, enterprise list,
360-degree profile, risk panel, what-if scenarios."""
from __future__ import annotations

from datetime import datetime

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import store
from ..config import settings
from ..db import get_db
from ..deps import require_officer
from ..models import Alert, Intervention, LedgerEntry, User
from ..schemas import AckIn, InterventionIn, WhatIfIn
from ..services import scoring

router = APIRouter(prefix="/api", tags=["portfolio"])

_SEV_ORDER = {"red": 0, "amber": 1, "info": 2}


@router.get("/portfolio/overview")
def overview(user: User = Depends(require_officer), db: Session = Depends(get_db)):
    s = store.scores()
    e = store.enterprises()
    m = s.merge(e, left_on="enterprise_id", right_on="id")
    open_alerts = db.scalar(select(func.count()).select_from(Alert)
                            .where(Alert.acked == False))  # noqa: E712

    bands = m.band.value_counts().to_dict()
    sector_band = (m.groupby(["sector", "band"]).size().unstack(fill_value=0)
                   .reindex(columns=["green", "amber", "red"], fill_value=0))
    district = (m.groupby(["district", "village"])
                .agg(avg_score=("mira_score", "mean"), n=("enterprise_id", "count"),
                     reds=("band", lambda b: int((b == "red").sum())),
                     ambers=("band", lambda b: int((b == "amber").sum())))
                .round(1).reset_index())
    return {
        "total": int(len(m)),
        "bands": {b: int(bands.get(b, 0)) for b in ("green", "amber", "red")},
        "avg_score": round(float(m.mira_score.mean()), 1),
        "open_alerts": int(open_alerts or 0),
        "avg_stress_prob": round(float(m.stress_prob_3m.mean()), 3),
        "sector_matrix": [
            {"sector": idx, **{b: int(row[b]) for b in ("green", "amber", "red")}}
            for idx, row in sector_band.iterrows()
        ],
        "villages": district.to_dict("records"),
        "as_of": str(s.as_of.iloc[0]) if len(s) else None,
    }


@router.get("/enterprises")
def list_enterprises(sort: str = "risk", sector: str | None = None,
                     village: str | None = None, band: str | None = None,
                     q: str | None = None,
                     user: User = Depends(require_officer),
                     db: Session = Depends(get_db)):
    s = store.scores()
    e = store.enterprises()
    m = s.merge(e, left_on="enterprise_id", right_on="id")
    if sector:
        m = m[m.sector == sector]
    if village:
        m = m[m.village == village]
    if band:
        m = m[m.band == band]
    if q:
        m = m[m.name.str.contains(q, case=False)]

    alert_counts = dict(
        db.execute(select(Alert.enterprise_id, func.count())
                   .where(Alert.acked == False)  # noqa: E712
                   .group_by(Alert.enterprise_id)).all()
    )
    m = m.sort_values("mira_score", ascending=(sort == "risk"))
    return [{
        "id": int(r.enterprise_id), "name": r.name, "type": r.type, "sector": r.sector,
        "village": r.village, "district": r.district,
        "score": float(r.mira_score), "band": r.band,
        "stress_prob": float(r.stress_prob_3m),
        "open_alerts": int(alert_counts.get(r.enterprise_id, 0)),
        "drivers": r.drivers[:2],
    } for r in m.itertuples()]


@router.get("/enterprises/{eid}")
def enterprise_360(eid: int, user: User = Depends(require_officer),
                   db: Session = Depends(get_db)):
    ent = store.enterprise_row(eid)
    sc = store.score_row(eid)
    if ent is None or sc is None:
        raise HTTPException(404, "Enterprise not found")
    alerts = db.scalars(select(Alert).where(Alert.enterprise_id == eid)).all()
    notes = db.scalars(select(Intervention).where(Intervention.enterprise_id == eid)
                       .order_by(Intervention.created_at.desc())).all()
    from .me import _app_entries
    app = _app_entries(db, eid)
    emi = store.emi_info(eid, settings.DEMO_TODAY, extra_entries=app)
    return {
        "enterprise": ent,
        "score": sc["mira_score"], "band": sc["band"],
        "stress_prob_3m": sc["stress_prob_3m"],
        "sub_scores": {k: sc[k] for k in ("s1_cashflow", "s2_repayment", "s3_digital",
                                          "s4_market", "s5_climate")},
        "drivers": sc["drivers"],
        # NOTE: savings balance is deliberately NOT exposed to the officer view —
        # it is the beneficiary's private money. Loan/EMI facts are shared because
        # the officer supports repayment.
        "as_of": sc["as_of"],
        "history": store.monthly_history(eid, months=18, extra_entries=app),
        "forecast": store.forecast_rows(eid),
        "alerts": [{
            "id": a.id, "code": a.code, "name": a.name, "severity": a.severity,
            "message_en": a.message_en, "message_hi": a.message_hi,
            "action_en": a.action_en, "acked": a.acked, "acked_by": a.acked_by,
        } for a in sorted(alerts, key=lambda a: _SEV_ORDER.get(a.severity, 3))],
        "interventions": [{"id": n.id, "officer": n.officer, "note": n.note,
                           "at": n.created_at.isoformat()} for n in notes],
        **emi,
    }


@router.post("/enterprises/{eid}/interventions")
def add_intervention(eid: int, body: InterventionIn,
                     user: User = Depends(require_officer),
                     db: Session = Depends(get_db)):
    n = Intervention(enterprise_id=eid, officer=user.display_name or user.username,
                     note=body.note)
    db.add(n)
    db.commit()
    return {"id": n.id}


@router.get("/alerts")
def risk_panel(group: str = "code", severity: str | None = None,
               user: User = Depends(require_officer), db: Session = Depends(get_db)):
    q = select(Alert).where(Alert.audience.in_(["officer", "both"]))
    if severity:
        q = q.where(Alert.severity == severity)
    alerts = db.scalars(q).all()
    ents = store.enterprises().set_index("id")

    rules = store.ews_rules()
    groups: dict[str, dict] = {}
    for a in alerts:
        g = groups.setdefault(a.code, {
            "code": a.code, "name": a.name, "severity": a.severity,
            "desc": rules.get(a.code, {}).get("desc", ""),
            "alerts": [],
        })
        ent = ents.loc[a.enterprise_id] if a.enterprise_id in ents.index else None
        g["alerts"].append({
            "id": a.id, "enterprise_id": a.enterprise_id,
            "enterprise": None if ent is None else ent["name"],
            "sector": None if ent is None else ent.sector,
            "village": None if ent is None else ent.village,
            "message_en": a.message_en, "action_en": a.action_en,
            "acked": a.acked,
        })
    out = sorted(groups.values(), key=lambda g: (_SEV_ORDER.get(g["severity"], 3),
                                                 -len(g["alerts"])))
    for g in out:
        g["count"] = len(g["alerts"])
        g["open"] = sum(1 for a in g["alerts"] if not a["acked"])
    return out


@router.post("/alerts/{alert_id}/ack")
def ack_alert(alert_id: int, body: AckIn,
              user: User = Depends(require_officer), db: Session = Depends(get_db)):
    a = db.get(Alert, alert_id)
    if a is None:
        raise HTTPException(404, "Alert not found")
    a.acked = True
    a.acked_by = user.display_name or user.username
    a.acked_at = datetime.utcnow()
    if body.note:
        db.add(Intervention(enterprise_id=a.enterprise_id,
                            officer=a.acked_by, note=f"[{a.code}] {body.note}"))
    db.commit()
    return {"ok": True}


@router.post("/whatif")
def what_if(body: WhatIfIn, user: User = Depends(require_officer)):
    return scoring.whatif(body.rain_deficit_pct, body.price_shock_pct,
                          store.scores(), store.enterprises())


@router.get("/model/card")
def model_card(user: User = Depends(require_officer)):
    return {
        "report": store.backtest_report(),
        "score_design": {
            "sub_scores": {
                "s1_cashflow": {"weight": 0.30, "desc": "Cash-flow health: savings runway, forecast positivity, volatility"},
                "s2_repayment": {"weight": 0.25, "desc": "Repayment discipline: on-time EMI rate, savings deposit regularity"},
                "s3_digital": {"weight": 0.15, "desc": "Digital activity trend (3-month transaction slope)"},
                "s4_market": {"weight": 0.15, "desc": "Market stress: input-vs-output price squeeze"},
                "s5_climate": {"weight": 0.15, "desc": "Climate exposure: rainfall deviation + heat days, sector-weighted"},
            },
            "bands": {"green": ">=70", "amber": "45-69", "red": "<45"},
            "disclaimer": "Model outputs are decision-support, not a credit decision.",
        },
    }
