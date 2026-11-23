"""
Alert service: recording matches to the database, listing/reviewing them,
and broadcasting new alerts live to any connected dashboard via
Server-Sent Events (async, since this runs under FastAPI/ASGI rather than
Flask's sync model).
"""

import asyncio
import time
from typing import Optional

from sqlalchemy.orm import Session

from app.database.models import Alert, Case
from app.services import audit_service
from app.utilities.encryption import encrypt_image, decrypt_image


def record_alert(
    db: Session,
    case_id: str,
    confidence: float,
    classification: str,
    latitude: Optional[float],
    longitude: Optional[float],
    device_uuid: str,
    matched_frame_bytes: Optional[bytes] = None,
) -> Alert:
    alert = Alert(
        case_id=case_id,
        confidence=confidence,
        classification=classification,
        latitude=latitude,
        longitude=longitude,
        device_uuid=device_uuid,
        reported_at=time.time(),
        reviewed=0,
        matched_frame=encrypt_image(matched_frame_bytes) if matched_frame_bytes else None,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    audit_service.log_action(db, device_uuid, "ALERT_REPORTED", case_id,
                              f"{classification} match, confidence={confidence:.3f}")
    return alert


def get_alert_frame(db: Session, alert_id: str) -> Optional[bytes]:
    """Decrypted matched-frame image — for human-review display only."""
    alert = db.query(Alert).filter(Alert.alert_id == alert_id).first()
    if not alert or not alert.matched_frame:
        return None
    return decrypt_image(alert.matched_frame)


def get_live_alerts(db: Session, since_timestamp: float = 0) -> list[dict]:
    rows = (
        db.query(Alert, Case.full_name, Case.enrollment_photo)
        .join(Case, Alert.case_id == Case.case_id)
        .filter(Alert.reported_at > since_timestamp)
        .order_by(Alert.reported_at.desc())
        .all()
    )
    return [
        {
            "alert_id": a.alert_id,
            "case_id": a.case_id,
            "full_name": full_name,
            "confidence": a.confidence,
            "classification": a.classification,
            "latitude": a.latitude,
            "longitude": a.longitude,
            "device_uuid": a.device_uuid,
            "reported_at": a.reported_at,
            "reviewed": bool(a.reviewed),
            "has_matched_frame": bool(a.matched_frame),
            "has_enrollment_photo": bool(enrollment_photo),
        }
        for a, full_name, enrollment_photo in rows
    ]


def mark_reviewed(db: Session, alert_id: str, actor: str) -> bool:
    alert = db.query(Alert).filter(Alert.alert_id == alert_id).first()
    if not alert:
        return False
    alert.reviewed = 1
    db.commit()
    audit_service.log_action(db, actor, "ALERT_REVIEWED", None, f"Alert {alert_id} reviewed by human.")
    return True


# ---------------------------------------------------------------------------
# Live broadcast — async pub/sub. Each connected dashboard SSE stream gets
# its own asyncio.Queue; every recorded alert is pushed to all of them.
# ---------------------------------------------------------------------------
_subscribers: set[asyncio.Queue] = set()


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue):
    _subscribers.discard(q)


async def broadcast(payload: dict):
    for q in list(_subscribers):
        await q.put(payload)
