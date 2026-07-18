"""Pydantic request/response schemas (only where validation matters —
read-heavy endpoints return shaped dicts)."""
from __future__ import annotations

from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    username: str
    password: str


class LoginOut(BaseModel):
    token: str
    role: str
    enterprise_id: int | None = None
    display_name: str = ""


class LedgerIn(BaseModel):
    date: str  # yyyy-mm-dd
    kind: str = Field(pattern="^(income|expense|savings_deposit|loan_repayment)$")
    amount: float = Field(gt=0)
    category: str = "other"
    note: str = ""
    client_uuid: str | None = None


class LedgerBatchIn(BaseModel):
    entries: list[LedgerIn]


class AckIn(BaseModel):
    note: str = ""


class InterventionIn(BaseModel):
    note: str


class WhatIfIn(BaseModel):
    rain_deficit_pct: float = Field(0, ge=0, le=80)
    price_shock_pct: float = Field(0, ge=-30, le=60)


class ChatIn(BaseModel):
    messages: list[dict]  # [{role: 'user'|'model', content: str}]
    lang: str = "en"
