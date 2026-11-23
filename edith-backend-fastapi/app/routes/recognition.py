import time
import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import User
from app.models.schemas import RecognizeResult, VerifyResult
from app.services import case_service, alert_service, face_service, device_service
from app.services.face_service import NoFaceDetectedError, ModelUnavailableError
from app.utilities.security import get_current_user
from app.utilities.rate_limit import is_on_cooldown
from app.utilities.geo import within_geofence
from app.utilities.encryption import encrypt_image

router = APIRouter(prefix="/api", tags=["recognition"])
logger = logging.getLogger("edith.recognize")


@router.post("/recognize", response_model=RecognizeResult)
async def recognize(
    face_image: UploadFile = File(...),
    device_uuid: str = Form(...),
    latitude: float = Form(None),
    longitude: float = Form(None),
    db: Session = Depends(get_db),
):
    """
    The spotter hot path: given a face image from a citizen device, check
    it against every currently ACTIVE (consented) case. No auth required
    here by design — the same trust model as the original project, where
    spotter devices only ever pull the active-case list and report
    candidate matches, never access anything else.

    Tries real face detection+alignment first (best match accuracy), and
    falls back to a raw embedding only if that fails — see
    face_service.generate_embedding_from_bytes for why. The client
    doesn't need to know or care which path was used.

    Every call logs its total time and where that time went (read vs.
    embedding vs. matching) at INFO level — if recognize ever feels slow
    in practice, the server log is where to look first, not a guess.
    """
    request_start = time.monotonic()

    on_cooldown, retry_after = is_on_cooldown(device_uuid)
    device_service.record_heartbeat(device_uuid)
    if on_cooldown:
        return RecognizeResult(result="cooldown", detail=f"retry after {retry_after}s")

    active_cases = case_service.get_active_cases_cached(db)
    if not active_cases:
        return RecognizeResult(result="no_active_cases")

    # Geofence filtering: a case with no geofence set matches everywhere
    # (unchanged default behaviour); a geofenced case only matches
    # against devices reporting a position within its configured radius.
    in_scope_cases = [c for c in active_cases if within_geofence(c, latitude, longitude)]
    if not in_scope_cases:
        return RecognizeResult(result="no_active_cases")

    read_start = time.monotonic()
    image_bytes = await face_image.read()
    read_time = time.monotonic() - read_start

    embed_start = time.monotonic()
    try:
        embedding = face_service.generate_embedding_from_bytes(image_bytes, allow_fallback=True)
    except NoFaceDetectedError as e:
        logger.info(
            "recognize: no_face_detected in %.2fs (read=%.2fs, embed=%.2fs) device=%s",
            time.monotonic() - request_start, read_time, time.monotonic() - embed_start, device_uuid,
        )
        return RecognizeResult(result="no_face_detected", detail=str(e))
    except ModelUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))
    embed_time = time.monotonic() - embed_start

    match_start = time.monotonic()
    match = face_service.find_best_match(embedding, in_scope_cases)
    match_time = time.monotonic() - match_start

    total_time = time.monotonic() - request_start
    logger.info(
        "recognize: %s in %.2fs total (read=%.2fs, embed=%.2fs, match=%.2fs, %d in-scope case(s)) device=%s",
        "match" if match else "no_match", total_time, read_time, embed_time, match_time,
        len(in_scope_cases), device_uuid,
    )
    if total_time > 3.0:
        logger.warning(
            "recognize: SLOW request (%.2fs) — if this keeps happening, it's the hosting "
            "tier's CPU, not the app logic (measured ~0.35-0.4s on adequate hardware). "
            "device=%s", total_time, device_uuid,
        )

    if match is None:
        return RecognizeResult(result="no_match")

    case_id, full_name, score, classification = match
    alert = alert_service.record_alert(
        db, case_id, score, classification, latitude, longitude, device_uuid,
        matched_frame_bytes=image_bytes,
    )

    await alert_service.broadcast({
        "alert_id": alert.alert_id,
        "case_id": case_id,
        "full_name": full_name,
        "classification": classification,
        "confidence": round(score, 4),
        "latitude": latitude,
        "longitude": longitude,
        "device_uuid": device_uuid,
        "reported_at": alert.reported_at,
        "reviewed": False,
        "has_matched_frame": bool(alert.matched_frame),
        "has_enrollment_photo": bool(case_service.get_case(db, case_id).enrollment_photo),
    })

    return RecognizeResult(
        result="match", alert_id=alert.alert_id, case_id=case_id,
        classification=classification, confidence=round(score, 4),
    )


@router.post("/verify", response_model=VerifyResult)
async def verify(
    case_id: str = Form(...),
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    1:1 verification — "is this photo actually the person on this specific
    case file?" Used at the point of physical recovery to double-check
    before closing a case, distinct from /recognize's 1:N search.
    Requires auth (officer/admin/guardian) since it's a deliberate lookup
    against one named case, not passive scanning.
    """
    case = case_service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="case not found")

    image_bytes = await photo.read()
    try:
        embedding = face_service.generate_embedding_from_bytes(image_bytes)
    except NoFaceDetectedError:
        raise HTTPException(status_code=422, detail="No face detected in the supplied photo")
    except ModelUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))

    case_embedding = case_service.get_case_embedding(db, case_id)
    score, classification = face_service.verify_against_case(embedding, case_embedding)

    return VerifyResult(
        verified=classification in ("likely", "high_confidence"),
        case_id=case_id,
        confidence=round(score, 4),
        classification=classification,
    )
