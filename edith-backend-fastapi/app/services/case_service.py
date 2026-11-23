"""
Case management service. All the business rules that used to live inline
in Flask route handlers now live here, independent of any web framework —
the routes layer is a thin adapter that parses the HTTP request, calls
into this service, and serializes the response.
"""

import json
import time
import threading
from typing import Optional

from sqlalchemy.orm import Session

from app.database.models import Case
from app.services import audit_service
from app.utilities.encryption import encrypt_text, decrypt_text, encrypt_image, decrypt_image
from app.config import get_settings

settings = get_settings()


def create_case(
    db: Session,
    full_name: str,
    embedding: list[float],
    consent_signed_by: str,
    enrolled_by: str,
    guardian_name: str = "",
    guardian_contact: str = "",
    care_notes: str = "",
    id_number: str = "",
    enrollment_photo_bytes: Optional[bytes] = None,
) -> Case:
    case = Case(
        full_name=full_name,
        guardian_name=guardian_name,
        guardian_contact=guardian_contact,
        care_notes=care_notes,
        id_number=id_number,
        embedding=encrypt_text(json.dumps(embedding)),
        enrollment_photo=encrypt_image(enrollment_photo_bytes) if enrollment_photo_bytes else None,
        consent_signed_at=time.time(),
        consent_signed_by=consent_signed_by,
        enrolled_by=enrolled_by,
        status="enrolled",
        created_at=time.time(),
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    audit_service.log_action(db, enrolled_by, "ENROLL_CREATE", case.case_id,
                              f"Enrolled '{full_name}' with signed consent.")
    return case


def activate_case(db: Session, case_id: str, actor: str, expires_in_hours: Optional[int] = None) -> bool:
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case or case.status not in ("enrolled", "expired", "cancelled"):
        return False
    hours = expires_in_hours or settings.DEFAULT_CASE_EXPIRY_HOURS
    case.status = "active"
    case.activated_at = time.time()
    case.expires_at = time.time() + hours * 3600
    db.commit()
    audit_service.log_action(db, actor, "CASE_ACTIVATE", case_id, f"Case activated. Auto-expires in {hours}h.")
    invalidate_active_cases_cache()
    return True


def expire_case(db: Session, case_id: str, actor: str, reason: str = "expired") -> bool:
    case = db.query(Case).filter(Case.case_id == case_id, Case.status == "active").first()
    if not case:
        return False
    case.status = reason
    case.closed_at = time.time()
    db.commit()
    audit_service.log_action(db, actor, "CASE_CLOSE", case_id, f"Case closed: {reason}")
    invalidate_active_cases_cache()
    return True


def delete_case(db: Session, case_id: str, actor: str, reason: str = "erasure_requested") -> bool:
    """
    Hard delete — full erasure of a case and its embedding, not just a
    status change. Used by /api/delete-user for right-to-erasure requests.
    The audit log entry itself is kept (it records that a deletion
    happened and by whom) but references the case only by ID, since the
    case row it would join against no longer exists.
    """
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        return False
    db.delete(case)
    db.commit()
    audit_service.log_action(db, actor, "CASE_DELETE", case_id, f"Case permanently erased: {reason}")
    invalidate_active_cases_cache()
    return True


def get_case(db: Session, case_id: str) -> Optional[Case]:
    return db.query(Case).filter(Case.case_id == case_id).first()


def get_case_photo(db: Session, case_id: str) -> Optional[bytes]:
    """Decrypted enrollment photo — for human-review display only, never used in matching."""
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case or not case.enrollment_photo:
        return None
    return decrypt_image(case.enrollment_photo)


def set_geofence(
    db: Session, case_id: str, actor: str,
    lat: Optional[float], lon: Optional[float], radius_meters: Optional[float],
) -> bool:
    """
    Sets, widens, or clears a case's search geofence. Passing all three as
    None clears it entirely (search everywhere again) — this is exactly
    the "start narrow, widen later" workflow: activate with a tight
    radius around where the person was last seen, then call this again
    with a larger radius (or None to remove the limit) if the search
    needs to expand.
    """
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        return False
    case.geofence_lat = lat
    case.geofence_lon = lon
    case.geofence_radius_meters = radius_meters
    db.commit()
    if lat is None:
        detail = "Geofence cleared — case now searches everywhere."
    else:
        detail = f"Geofence set: {radius_meters}m around ({lat}, {lon})"
    audit_service.log_action(db, actor, "CASE_GEOFENCE_SET", case_id, detail)
    invalidate_active_cases_cache()
    return True


def list_cases(db: Session) -> list[Case]:
    return db.query(Case).order_by(Case.created_at.desc()).all()


def get_active_cases_raw(db: Session) -> list[dict]:
    rows = db.query(Case).filter(Case.status == "active").all()
    return [
        {
            "case_id": r.case_id,
            "full_name": r.full_name,
            "embedding": json.loads(decrypt_text(r.embedding)),
            "geofence_lat": r.geofence_lat,
            "geofence_lon": r.geofence_lon,
            "geofence_radius_meters": r.geofence_radius_meters,
        }
        for r in rows
    ]


def get_case_embedding(db: Session, case_id: str) -> Optional[list]:
    """Decrypted embedding for a single case — used by /api/verify's 1:1 check."""
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        return None
    return json.loads(decrypt_text(case.embedding))


# ---------------------------------------------------------------------------
# Cached active-case lookup. This is on the hottest path in the system —
# every single spotter frame calls it — so a short TTL cache avoids a DB
# round-trip per frame while still picking up activations/closures within
# a couple of seconds.
# ---------------------------------------------------------------------------
_cache = {"data": None, "loaded_at": 0.0}
_cache_lock = threading.Lock()


def get_active_cases_cached(db: Session) -> list[dict]:
    now = time.time()
    with _cache_lock:
        if _cache["data"] is None or (now - _cache["loaded_at"]) > settings.ACTIVE_CASES_CACHE_TTL_SECONDS:
            _cache["data"] = get_active_cases_raw(db)
            _cache["loaded_at"] = now
        return _cache["data"]


def invalidate_active_cases_cache():
    with _cache_lock:
        _cache["data"] = None


def get_active_cases_public(db: Session) -> list[dict]:
    """
    What spotter devices actually receive from GET /api/cases/active —
    reuses the same cache as the internal matching path (get_active_cases_cached)
    but strips the embedding before returning. Matching happens entirely
    server-side via /api/recognize; no client has needed the raw
    embedding since that design, so there's no reason a public,
    unauthenticated endpoint should ever serve real biometric vectors.
    """
    cases = get_active_cases_cached(db)
    return [
        {
            "case_id": c["case_id"],
            "full_name": c["full_name"],
            "geofence_lat": c["geofence_lat"],
            "geofence_lon": c["geofence_lon"],
            "geofence_radius_meters": c["geofence_radius_meters"],
        }
        for c in cases
    ]
