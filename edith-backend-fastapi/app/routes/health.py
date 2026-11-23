from fastapi import APIRouter

from app.models.schemas import HealthOut
from app.services.face_service import DEEPFACE_AVAILABLE

router = APIRouter(tags=["health"])


@router.get("/api/health", response_model=HealthOut)
def health():
    return HealthOut(status="ok", model_ready=DEEPFACE_AVAILABLE)
