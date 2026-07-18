"""MIRA backend settings (Phase 3)."""
from __future__ import annotations

import os
from datetime import date

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BACKEND_DIR, "data")
ML_DIR = os.path.join(BACKEND_DIR, "ml")
ARTIFACTS_DIR = os.path.join(ML_DIR, "artifacts")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=os.path.join(BACKEND_DIR, ".env"), extra="ignore"
    )

    GEMINI_API_KEY: str = ""
    GEMINI_API_KEYS: str = ""  # comma-separated failover pool
    JWT_SECRET: str = "dev-secret-change-me"

    @property
    def gemini_keys(self) -> list[str]:
        """All configured keys, in failover order."""
        keys = [k.strip() for k in self.GEMINI_API_KEYS.split(",") if k.strip()]
        if self.GEMINI_API_KEY and self.GEMINI_API_KEY not in keys:
            keys.insert(0, self.GEMINI_API_KEY)
        return keys
    JWT_ALGO: str = "HS256"
    TOKEN_HOURS: int = 24 * 7
    GEMINI_MODEL: str = "gemini-flash-latest"

    # demo clock — sits inside the engineered shock window (see generate_data.py)
    DEMO_TODAY: date = date(2026, 7, 15)

    DB_URL: str = f"sqlite:///{os.path.join(DATA_DIR, 'mira.db')}"


settings = Settings()
