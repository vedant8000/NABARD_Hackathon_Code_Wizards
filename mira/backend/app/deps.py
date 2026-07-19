"""Auth helpers: password hashing (bcrypt), JWT issue/verify, role guards."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from . import mongo
from .config import settings
from .mongo import User

_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """bcrypt generates and embeds a random per-password salt automatically."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), stored.encode())
    except ValueError:
        return False


def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "eid": user.enterprise_id,
        "name": user.display_name,
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.TOKEN_HOURS),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGO)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing token")
    try:
        payload = jwt.decode(creds.credentials, settings.JWT_SECRET,
                             algorithms=[settings.JWT_ALGO])
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    user = mongo.find_user_by_id(int(payload["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown user")
    return user


def require_role(role: str):
    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role != role:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires {role} role")
        return user
    return dep


require_officer = require_role("officer")
require_enterprise = require_role("enterprise")
