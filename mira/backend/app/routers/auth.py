from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import create_token, verify_password
from ..models import User
from ..schemas import LoginIn, LoginOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == body.username))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid username or password")
    return LoginOut(token=create_token(user), role=user.role,
                    enterprise_id=user.enterprise_id, display_name=user.display_name)


@router.get("/demo-users")
def demo_users(db: Session = Depends(get_db)):
    """Demo persona shortcuts for the login screen (prototype convenience):
    one officer + one enterprise per band storyline (red / amber / green)."""
    officers = db.scalars(select(User).where(User.role == "officer")).all()
    from .. import store
    s = store.scores().merge(store.enterprises()[["id", "sector"]],
                             left_on="enterprise_id", right_on="id")
    picks = []
    red = s[s.band == "red"].sort_values("mira_score")
    if len(red):
        picks.append(int(red.iloc[0].enterprise_id))
    amber = s[s.band == "amber"].sort_values("mira_score")
    amber_dairy = amber[amber.sector == "dairy"]
    if len(amber_dairy) or len(amber):
        picks.append(int((amber_dairy if len(amber_dairy) else amber).iloc[0].enterprise_id))
    green = s[s.band == "green"].sort_values("mira_score", ascending=False)
    if len(green):
        picks.append(int(green.iloc[0].enterprise_id))
    ents = db.scalars(select(User).where(User.enterprise_id.in_(picks))).all()
    order = {eid: i for i, eid in enumerate(picks)}
    ents.sort(key=lambda u: order.get(u.enterprise_id, 9))
    ents_df = store.enterprises()
    all_ents = [{
        "username": f"udyami{int(r.id)}", "display_name": r.name,
        "enterprise_id": int(r.id), "sector": r.sector, "village": r.village,
        "band": s[s.enterprise_id == r.id].band.iloc[0] if len(s[s.enterprise_id == r.id]) else "green",
    } for r in ents_df.itertuples()]
    all_ents.sort(key=lambda e: e["display_name"])
    return {
        "officer": [{"username": u.username, "display_name": u.display_name} for u in officers[:1]],
        "enterprise": [{"username": u.username, "display_name": u.display_name,
                        "enterprise_id": u.enterprise_id} for u in ents],
        "all_enterprises": all_ents,
    }
