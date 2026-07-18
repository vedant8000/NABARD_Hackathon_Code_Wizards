"""ORM models — only the mutable state lives in SQLite.
Generated analytics (scores, forecasts, market data) are served from
the ML pipeline's CSVs through app/store.py."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Date, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(16))  # 'officer' | 'enterprise'
    enterprise_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    display_name: Mapped[str] = mapped_column(String(128), default="")


class LedgerEntry(Base):
    """Rows added through the app (the generated history stays in ledger.csv)."""
    __tablename__ = "ledger_entries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_uuid: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    enterprise_id: Mapped[int] = mapped_column(Integer, index=True)
    date: Mapped[str] = mapped_column(String(10))  # ISO yyyy-mm-dd
    kind: Mapped[str] = mapped_column(String(24))  # income|expense|savings_deposit|loan_repayment
    category: Mapped[str] = mapped_column(String(48), default="other")
    amount: Mapped[float] = mapped_column(Float)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Alert(Base):
    """EWS alerts loaded from alerts.csv at startup + ack state."""
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    enterprise_id: Mapped[int] = mapped_column(Integer, index=True)
    as_of: Mapped[str] = mapped_column(String(10))
    code: Mapped[str] = mapped_column(String(8), index=True)
    name: Mapped[str] = mapped_column(String(32))
    severity: Mapped[str] = mapped_column(String(8))
    audience: Mapped[str] = mapped_column(String(16))
    message_en: Mapped[str] = mapped_column(Text)
    message_hi: Mapped[str] = mapped_column(Text)
    action_en: Mapped[str] = mapped_column(Text)
    action_hi: Mapped[str] = mapped_column(Text)
    acked: Mapped[bool] = mapped_column(Boolean, default=False)
    acked_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    acked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    role: Mapped[str] = mapped_column(String(12))  # 'user' | 'model'
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DirectMessage(Base):
    """Officer ↔ enterprise chat. One thread per enterprise_id."""
    __tablename__ = "direct_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    enterprise_id: Mapped[int] = mapped_column(Integer, index=True)
    sender_role: Mapped[str] = mapped_column(String(16))  # 'officer' | 'enterprise'
    sender_name: Mapped[str] = mapped_column(String(128), default="")
    content: Mapped[str] = mapped_column(Text)
    read_by_officer: Mapped[bool] = mapped_column(Boolean, default=False)
    read_by_enterprise: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Intervention(Base):
    __tablename__ = "interventions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    enterprise_id: Mapped[int] = mapped_column(Integer, index=True)
    officer: Mapped[str] = mapped_column(String(64))
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
