"""ORM models — only the mutable state lives in SQLite.
Generated analytics (scores, forecasts, market data) are served from
the ML pipeline's CSVs through app/store.py."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base

# NOTE: users now live in MongoDB (see app/mongo.py: User dataclass +
# users_collection()), as do enterprise profiles (enterprise_profiles),
# app-entered ledger transactions (ledger_entries), and officer<->SHG direct
# messages (direct_messages). This model file only covers state that is
# still SQLite-backed.


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


class Intervention(Base):
    __tablename__ = "interventions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    enterprise_id: Mapped[int] = mapped_column(Integer, index=True)
    officer: Mapped[str] = mapped_column(String(64))
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
