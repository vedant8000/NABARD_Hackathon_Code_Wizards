"""MIRA backend — FastAPI entrypoint.

Run:  uvicorn app.main:app --reload   (from mira/backend, venv active)

Startup: creates SQLite tables, seeds users + alerts from the generated
CSVs if empty. In production mode also serves ../frontend/dist.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

import pandas as pd
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from . import mongo, store
from .config import DATA_DIR, settings
from .db import Base, SessionLocal, engine
from .deps import hash_password, require_officer
from .models import Alert

DEMO_PASSWORD = "mira2026"


def seed_mongo_users():
    mongo.ensure_indexes()
    if mongo.count_users() == 0:
        ents = store.enterprises()
        mongo.insert_user(mongo.User(
            id=0, username="officer1", password_hash=hash_password(DEMO_PASSWORD),
            role="officer", enterprise_id=None,
            display_name="Anjali Verma (Field Officer)"))
        for r in ents.itertuples():
            mongo.insert_user(mongo.User(
                id=int(r.id), username=f"udyami{r.id}",
                password_hash=hash_password(DEMO_PASSWORD),
                role="enterprise", enterprise_id=int(r.id), display_name=r.name))
        print(f"seeded MongoDB users: 1 officer + {len(ents)} enterprises (password: {DEMO_PASSWORD})")


def seed_mongo_enterprise_profiles():
    """One-time copy of the ML pipeline's generated enterprises.csv into
    MongoDB — enterprises.csv/ml/generate_data.py stay the source of truth
    for the ML pipeline; Mongo is the serving copy the API reads."""
    if mongo.count_enterprise_profiles() == 0:
        ents = store.enterprises()
        for r in ents.itertuples():
            mongo.insert_enterprise_profile({
                "id": int(r.id), "name": r.name, "type": r.type, "sector": r.sector,
                "village": r.village, "district": r.district,
                "size_factor": float(r.size_factor), "established_date": str(r.established_date),
                "members_count": int(r.members_count), "loan_principal": float(r.loan_principal),
                "shock": r.shock,
            })
        print(f"seeded MongoDB enterprise_profiles: {len(ents)} enterprises")


def seed_db():
    Base.metadata.create_all(engine)
    seed_mongo_users()
    seed_mongo_enterprise_profiles()
    with SessionLocal() as db:
        if db.scalar(select(Alert).limit(1)) is None:
            path = os.path.join(DATA_DIR, "alerts.csv")
            if os.path.exists(path):
                alerts = pd.read_csv(path)
                for r in alerts.itertuples():
                    db.add(Alert(enterprise_id=int(r.enterprise_id), as_of=str(r.as_of),
                                 code=r.code, name=r.name, severity=r.severity,
                                 audience=r.audience, message_en=r.message_en,
                                 message_hi=r.message_hi, action_en=r.action_en,
                                 action_hi=r.action_hi))
                db.commit()
                print(f"seeded {len(alerts)} alerts")


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_db()
    yield


app = FastAPI(title="MIRA API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from .routers import auth, chat, market, me, messages, portfolio, reports, ws_chat  # noqa: E402

app.include_router(auth.router)
app.include_router(me.router)
app.include_router(portfolio.router)
app.include_router(market.router)
app.include_router(chat.router)
app.include_router(messages.router)
app.include_router(reports.router)
app.include_router(ws_chat.router)


@app.get("/api/health")
def health():
    from .services.scoring import GOMP_DEBUG
    return {"ok": True, "demo_today": str(settings.DEMO_TODAY), "gomp": GOMP_DEBUG}


@app.get("/api/ews-rules")
def ews_rules():
    """Declarative EWS thresholds — consumed by the frontend offline engine."""
    return store.ews_rules()


@app.post("/api/admin/rescore")
def rescore(user=Depends(require_officer)):
    """Re-run the batch scorer (blocking; demo convenience)."""
    import subprocess
    import sys
    r = subprocess.run([sys.executable, os.path.join("ml", "score_all.py")],
                       capture_output=True, text=True,
                       cwd=os.path.dirname(DATA_DIR))
    store.invalidate()
    return {"ok": r.returncode == 0, "tail": (r.stdout or r.stderr)[-500:]}


# production mode: serve the built frontend as one process (SPA fallback)
_dist = os.path.abspath(os.path.join(os.path.dirname(DATA_DIR), "frontend", "dist"))
if not os.path.isdir(_dist):
    _dist = os.path.abspath(os.path.join(os.path.dirname(DATA_DIR), "..", "frontend", "dist"))
if os.path.isdir(_dist):
    from fastapi.responses import FileResponse

    app.mount("/assets", StaticFiles(directory=os.path.join(_dist, "assets")), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        full = os.path.join(_dist, path)
        if path and os.path.isfile(full):
            return FileResponse(full)
        return FileResponse(os.path.join(_dist, "index.html"))
