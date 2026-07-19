"""Real-time delivery for officer <-> SHG direct messages.

Browsers can't set custom headers on a WebSocket handshake, so the JWT
travels as a query param (?token=...) instead of the Authorization header
used elsewhere — same token, same validation, just a different transport.
Persistence and the daily send-cap guardrail are NOT duplicated here: every
inbound message goes through messages.send_message(), the same function the
REST POST /api/messages/{id} endpoint uses.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from .. import mongo
from ..config import settings
from ..mongo import User
from .messages import _guard_thread, message_dict, send_message

router = APIRouter(tags=["messages"])


class ConnectionManager:
    def __init__(self) -> None:
        self._by_thread: dict[int, list[WebSocket]] = {}

    async def connect(self, eid: int, ws: WebSocket) -> None:
        await ws.accept()
        self._by_thread.setdefault(eid, []).append(ws)

    def disconnect(self, eid: int, ws: WebSocket) -> None:
        conns = self._by_thread.get(eid)
        if conns and ws in conns:
            conns.remove(ws)
        if conns is not None and not conns:
            self._by_thread.pop(eid, None)

    async def broadcast(self, eid: int, payload: dict) -> None:
        for ws in list(self._by_thread.get(eid, [])):
            try:
                await ws.send_json(payload)
            except Exception:
                self.disconnect(eid, ws)


manager = ConnectionManager()


def _authenticate(token: str | None) -> User | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGO])
    except JWTError:
        return None
    return mongo.find_user_by_id(int(payload["sub"]))


@router.websocket("/api/ws/messages/{enterprise_id}")
async def ws_messages(websocket: WebSocket, enterprise_id: int):
    user = _authenticate(websocket.query_params.get("token"))
    if user is None:
        await websocket.close(code=4401)
        return
    try:
        _guard_thread(user, enterprise_id)
    except HTTPException:
        await websocket.close(code=4403)
        return

    await manager.connect(enterprise_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            content = str(data.get("content", ""))
            try:
                doc = send_message(user, enterprise_id, content)
            except HTTPException as e:
                await websocket.send_json({"type": "error", "status": e.status_code, "detail": e.detail})
                continue
            payload = {"type": "message", "message": message_dict(doc)}
            await manager.broadcast(enterprise_id, payload)
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(enterprise_id, websocket)
