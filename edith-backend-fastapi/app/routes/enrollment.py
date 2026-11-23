from fastapi import APIRouter, Depends, HTTPException, UploadFile, Form, File
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import User
from app.models.schemas import ActivateCaseRequest, ExpireCaseRequest, DeleteUserRequest, CaseDetailOut
from app.services import case_service, face_service
from app.services.face_service import NoFaceDetectedError, ModelUnavailableError
from app.utilities.security import get_current_user, require_role

router = APIRouter(prefix="/api", tags=["enrollment"])


@router.post("/register", response_model=CaseDetailOut)
async def register(
    full_name: str = Form(...),
    consent_signed_by: str = Form(...),
    photo: UploadFile = File(...),
    guardian_name: str = Form(""),
    guardian_contact: str = Form(""),
    care_notes: str = Form(""),
    id_number: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Enroll a new case. Requires a consent-signed photo — this is the ONLY
    way a face embedding enters the system (see the project's consent
    model).

    The photo itself is now RETAINED, encrypted at rest, alongside the
    embedding — a deliberate change from this project's earlier
    zero-retention design. It exists for exactly one purpose: so a human
    reviewer can visually compare it against a matched frame before
    acting on any alert (see /api/cases/{case_id}/photo). It is never
    used in matching itself, and is permanently deleted the moment the
    case is deleted (see /api/delete-user). The consent text presented to
    the guardian/officer must reflect this retention — see the
    dashboard's enrollment form.
    """
    if photo is None or not photo.filename:
        raise HTTPException(status_code=400, detail="photo is required")

    image_bytes = await photo.read()
    try:
        embedding = face_service.generate_embedding_from_bytes(image_bytes)
    except NoFaceDetectedError:
        raise HTTPException(status_code=422, detail="No face detected in the enrollment photo")
    except ModelUnavailableError:
        raise HTTPException(status_code=503, detail="Face recognition model is not available on this server")

    case = case_service.create_case(
        db,
        full_name=full_name,
        embedding=embedding,
        consent_signed_by=consent_signed_by,
        enrolled_by=user.username,
        guardian_name=guardian_name,
        guardian_contact=guardian_contact,
        care_notes=care_notes,
        id_number=id_number,
        enrollment_photo_bytes=image_bytes,
    )
    return CaseDetailOut(
        case_id=case.case_id, full_name=case.full_name, status=case.status,
        created_at=case.created_at, activated_at=case.activated_at, expires_at=case.expires_at,
        guardian_name=case.guardian_name, guardian_contact=case.guardian_contact,
        care_notes=case.care_notes, consent_signed_by=case.consent_signed_by, enrolled_by=case.enrolled_by,
        has_photo=True,
        geofence_lat=case.geofence_lat, geofence_lon=case.geofence_lon,
        geofence_radius_meters=case.geofence_radius_meters,
    )


@router.post("/enroll/activate")
def activate(
    payload: ActivateCaseRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "officer")),
):
    """Case activation is deliberately restricted — a guardian can enroll but never self-activate a search."""
    ok = case_service.activate_case(db, payload.case_id, user.username, payload.expires_in_hours)
    if not ok:
        raise HTTPException(status_code=404, detail="case not found or not in an activatable state")
    return {"case_id": payload.case_id, "status": "active"}


@router.put("/enroll/{case_id}/expire")
def expire(
    case_id: str,
    payload: ExpireCaseRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "officer")),
):
    ok = case_service.expire_case(db, case_id, user.username, payload.reason)
    if not ok:
        raise HTTPException(status_code=404, detail="case not found or not active")
    return {"case_id": case_id, "status": payload.reason}


@router.post("/delete-user")
def delete_user(
    payload: DeleteUserRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "officer")),
):
    """
    Full erasure of a case and its embedding — a right-to-erasure endpoint,
    distinct from expire/close which just changes status. Use this when a
    person (or their guardian) withdraws consent, or once a case is
    permanently resolved and there's no reason to retain the record.
    """
    ok = case_service.delete_case(db, payload.case_id, user.username, payload.reason)
    if not ok:
        raise HTTPException(status_code=404, detail="case not found")
    return {"case_id": payload.case_id, "deleted": True}
