import json

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import User
from app.models.schemas import AlertOut
from app.services import alert_service
from app.utilities.security import get_current_user

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("/live", response_model=list[AlertOut])
def live_alerts(since: float = 0, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return alert_service.get_live_alerts(db, since)


@router.get("/{alert_id}/frame")
def get_alert_frame(alert_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    The actual frame the spotter device captured that triggered this
    alert — for human-review comparison against the case's enrollment
    photo. Requires auth.
    """
    frame_bytes = alert_service.get_alert_frame(db, alert_id)
    if frame_bytes is None:
        raise HTTPException(status_code=404, detail="no matched frame on file for this alert")
    return Response(content=frame_bytes, media_type="image/jpeg")


@router.put("/{alert_id}/review")
def review_alert(alert_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ok = alert_service.mark_reviewed(db, alert_id, user.username)
    if not ok:
        raise HTTPException(status_code=404, detail="alert not found")
    return {"alert_id": alert_id, "reviewed": True}


@router.get("/stream")
async def stream_alerts(user: User = Depends(get_current_user)):
    """
    Server-Sent Events: pushes each new alert to the dashboard the instant
    it's recorded. Authenticates via the standard Authorization header,
    same as every other route — the dashboard reads this with fetch +
    ReadableStream rather than the browser's EventSource API specifically
    so no token ever has to travel in the URL, where it could end up in
    server access logs or browser history.
    """
    async def event_generator():
        q = alert_service.subscribe()
        try:
            yield ": connected\n\n"
            while True:
                payload = await q.get()
                yield f"data: {json.dumps(payload)}\n\n"
        finally:
            alert_service.unsubscribe(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
