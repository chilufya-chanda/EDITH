from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import User
from app.models.schemas import CaseOut, CaseDetailOut, SetGeofenceRequest
from app.services import case_service, device_service, alert_service
from app.utilities.security import get_current_user, require_role

router = APIRouter(prefix="/api/cases", tags=["cases"])
devices_router = APIRouter(prefix="/api/devices", tags=["devices"])


def _to_case_out(c) -> CaseOut:
    return CaseOut(
        case_id=c.case_id, full_name=c.full_name, status=c.status,
        created_at=c.created_at, activated_at=c.activated_at, expires_at=c.expires_at,
        has_photo=bool(c.enrollment_photo),
        geofence_lat=c.geofence_lat, geofence_lon=c.geofence_lon,
        geofence_radius_meters=c.geofence_radius_meters,
    )


@router.get("", response_model=list[CaseOut])
def list_cases(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [_to_case_out(c) for c in case_service.list_cases(db)]


@router.get("/active")
def active_cases(device_uuid: str = None, db: Session = Depends(get_db)):
    """
    Deliberately unauthenticated — this is exactly what spotter devices
    pull. Returns case_id, full_name, and geofence info only — never the
    embedding (see case_service.get_active_cases_public): matching
    happens entirely server-side via /api/recognize, so no client has
    needed the raw embedding since that design, and a public,
    unauthenticated endpoint should never serve real biometric vectors.

    Every spotter device polls this endpoint on a timer whether or not
    it's found a match, so it doubles as a heartbeat: passing device_uuid
    marks that device "seen" for /api/devices/active, giving the
    dashboard a real connected-device count instead of one derived only
    from past alerts.
    """
    if device_uuid:
        device_service.record_heartbeat(device_uuid)
    return case_service.get_active_cases_public(db)


@devices_router.get("/active")
def active_devices(user: User = Depends(get_current_user)):
    """Devices heard from in the last 30 seconds — a real "is anything actually connected" signal."""
    devices = device_service.get_active_devices()
    return {"count": len(devices), "devices": devices}


@router.get("/{case_id}", response_model=CaseDetailOut)
def get_case(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    case = case_service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="case not found")
    return CaseDetailOut(
        case_id=case.case_id, full_name=case.full_name, status=case.status,
        created_at=case.created_at, activated_at=case.activated_at, expires_at=case.expires_at,
        guardian_name=case.guardian_name, guardian_contact=case.guardian_contact,
        care_notes=case.care_notes, consent_signed_by=case.consent_signed_by, enrolled_by=case.enrolled_by,
        has_photo=bool(case.enrollment_photo),
        geofence_lat=case.geofence_lat, geofence_lon=case.geofence_lon,
        geofence_radius_meters=case.geofence_radius_meters,
    )


@router.get("/{case_id}/photo")
def get_case_photo(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    The enrollment photo the guardian/officer originally presented —
    for human-review comparison against a matched frame only. Requires
    auth; never served to spotter devices.
    """
    photo_bytes = case_service.get_case_photo(db, case_id)
    if photo_bytes is None:
        raise HTTPException(status_code=404, detail="no photo on file for this case")
    return Response(content=photo_bytes, media_type="image/jpeg")


@router.put("/{case_id}/geofence")
def set_geofence(
    case_id: str,
    payload: SetGeofenceRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "officer")),
):
    """
    Restricts (or widens, or clears) which spotter reports this case is
    matched against, based on the reporting device's location. Search
    narrow first, expand later — pass nulls to remove the restriction
    entirely.
    """
    if (payload.lat is None) != (payload.lon is None):
        raise HTTPException(status_code=400, detail="lat and lon must be provided together, or both omitted")
    if payload.lat is not None and payload.radius_meters is None:
        raise HTTPException(status_code=400, detail="radius_meters is required when setting a geofence center")

    ok = case_service.set_geofence(db, case_id, user.username, payload.lat, payload.lon, payload.radius_meters)
    if not ok:
        raise HTTPException(status_code=404, detail="case not found")
    return {"case_id": case_id, "geofence_lat": payload.lat, "geofence_lon": payload.lon,
            "geofence_radius_meters": payload.radius_meters}
