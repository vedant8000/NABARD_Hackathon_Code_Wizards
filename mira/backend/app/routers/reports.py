"""Credit Passport PDF (reportlab) — downloadable by officer and by the
enterprise itself (data-ownership story)."""
from __future__ import annotations

import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import (Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import store
from ..config import settings
from ..db import get_db
from ..deps import get_current_user
from ..models import Alert, User

router = APIRouter(prefix="/api/reports", tags=["reports"])

GREEN = colors.HexColor("#14532d")
BAND_COLORS = {"green": colors.HexColor("#16a34a"),
               "amber": colors.HexColor("#d97706"),
               "red": colors.HexColor("#dc2626")}


def _fmt(x) -> str:
    try:
        return f"Rs {int(round(float(x))):,}"
    except (TypeError, ValueError):
        return "-"


@router.get("/{eid}/credit-passport")
def credit_passport(eid: int, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if user.role == "enterprise" and user.enterprise_id != eid:
        raise HTTPException(403, "You can only download your own passport")
    ent = store.enterprise_row(eid)
    sc = store.score_row(eid)
    if ent is None or sc is None:
        raise HTTPException(404, "Enterprise not found")

    from .me import _app_entries
    app = _app_entries(db, eid)
    emi = store.emi_info(eid, settings.DEMO_TODAY, extra_entries=app)
    history = store.monthly_history(eid, months=12, extra_entries=app)
    fc = store.forecast_rows(eid)
    alerts = db.scalars(select(Alert).where(Alert.enterprise_id == eid,
                                            Alert.acked == False)).all()  # noqa: E712

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=16 * mm, bottomMargin=14 * mm,
                            leftMargin=16 * mm, rightMargin=16 * mm)
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], textColor=GREEN, fontSize=20, spaceAfter=2)
    sub = ParagraphStyle("sub", parent=ss["Normal"], textColor=colors.grey, fontSize=8)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], textColor=GREEN, fontSize=12,
                        spaceBefore=10, spaceAfter=4)
    body = ss["Normal"]

    el = [
        Paragraph("MIRA — Credit Passport", h1),
        Paragraph("Mitra for Intelligence, Risk &amp; Analytics · NABARD Hackathon prototype · "
                  f"Generated {datetime.now():%d %b %Y}", sub),
        Spacer(1, 6 * mm),
    ]

    # identity + score block
    band = str(sc["band"])
    ident = Table([
        ["Enterprise", ent["name"], "MIRA Score", f"{sc['mira_score']:.0f} / 100"],
        ["Type / Sector", f"{ent['type']} · {ent['sector'].replace('_', ' ')}", "Band", band.upper()],
        ["Location", f"{ent['village']}, {ent['district']}", "Stress prob. (3m)", f"{float(sc['stress_prob_3m']) * 100:.0f}%"],
        ["Members", str(ent.get("members_count", "-")), "As of", str(sc["as_of"])],
    ], colWidths=[30 * mm, 65 * mm, 35 * mm, 40 * mm])
    ident.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.grey),
        ("TEXTCOLOR", (2, 0), (2, -1), colors.grey),
        ("TEXTCOLOR", (3, 1), (3, 1), BAND_COLORS.get(band, colors.black)),
        ("FONTNAME", (3, 0), (3, 1), "Helvetica-Bold"),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.lightgrey),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    el.append(ident)

    # sub-scores
    el.append(Paragraph("Score components", h2))
    labels = {"s1_cashflow": "Cash-flow health (30%)", "s2_repayment": "Repayment discipline (25%)",
              "s3_digital": "Digital activity trend (15%)", "s4_market": "Market stress (15%)",
              "s5_climate": "Climate exposure (15%)"}
    subt = Table([[labels[k], f"{float(sc[k]):.0f} / 100"] for k in labels],
                 colWidths=[110 * mm, 60 * mm])
    subt.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9),
                              ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.whitesmoke, colors.white]),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    el.append(subt)

    # forecast
    el.append(Paragraph("6-month net cash flow forecast", h2))
    fct = Table([["Month", "P10 (low)", "P50 (expected)", "P90 (high)"]] +
                [[r["month"], _fmt(r["p10"]), _fmt(r["p50"]), _fmt(r["p90"])] for r in fc],
                colWidths=[40 * mm, 43 * mm, 43 * mm, 43 * mm])
    fct.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), GREEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.whitesmoke]),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    el.append(fct)

    # 12-month summary
    el.append(Paragraph("Last 12 months — cash flow summary", h2))
    tot_inc = sum(r["income"] for r in history)
    tot_exp = sum(r["expense"] for r in history)
    el.append(Paragraph(
        f"Total income {_fmt(tot_inc)} · total expenses {_fmt(tot_exp)} · net {_fmt(tot_inc - tot_exp)} · "
        f"savings deposits {_fmt(sum(r['savings'] for r in history))}", body))

    # repayment
    el.append(Paragraph("Repayment record", h2))
    if emi["outstanding"] <= 0 and emi.get("repaid_via_app", 0) > 0:
        el.append(Paragraph(
            f"<b>Loan fully repaid.</b> EMI was {_fmt(emi['emi_amount'])}/month · on-time streak "
            f"{emi['ontime_streak']} months · principal {_fmt(emi.get('loan_principal', 0))} cleared "
            f"(including {_fmt(emi['repaid_via_app'])} repaid early via MIRA).", body))
    else:
        el.append(Paragraph(
            f"EMI {_fmt(emi['emi_amount'])}/month · on-time streak {emi['ontime_streak']} months · "
            f"outstanding {_fmt(emi['outstanding'])}"
            + (f" · next EMI {emi['next_emi_date']}" if emi["next_emi_date"] else ""), body))

    # risk flags
    el.append(Paragraph("Active risk flags", h2))
    if alerts:
        for a in alerts:
            el.append(Paragraph(f"<b>{a.code}</b> — {a.message_en} <i>Action: {a.action_en}</i>", body))
    else:
        el.append(Paragraph("None — no open early-warning signals.", body))

    # drivers
    el.append(Paragraph("Main score drivers (model explanation)", h2))
    for d in (sc.get("drivers") or [])[:3]:
        arrow = "raises risk" if d.get("direction") == "up" else "lowers risk"
        el.append(Paragraph(f"• {d.get('label_en', d.get('feature'))} — {arrow}", body))

    el.append(Spacer(1, 8 * mm))
    el.append(Paragraph(
        "Disclaimer: MIRA model outputs are decision-support for financial inclusion, "
        "not a credit decision. Generated from enterprise-recorded data and public "
        "market/weather feeds. NABARD Hackathon prototype — synthetic demo data.", sub))

    doc.build(el)
    buf.seek(0)
    fname = f"MIRA_credit_passport_{eid}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="{fname}"'})
