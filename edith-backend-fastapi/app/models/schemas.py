"""
Pydantic schemas — every request body and response shape the API exposes.
Keeping these separate from the ORM models means the database layer can
change (e.g. add a column) without automatically changing what the API
returns, and vice versa.
"""

from typing import Optional
from pydantic import BaseModel, Field


# --- Auth -------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    role: str
    display_name: str


class UserOut(BaseModel):
    username: str
    role: str
    display_name: str
    active: bool


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "guardian"
    display_name: str = ""


# --- Cases -------------------------------------------------------------------

class CaseOut(BaseModel):
    case_id: str
    full_name: str
    status: str
    created_at: float
    activated_at: Optional[float] = None
    expires_at: Optional[float] = None
    has_photo: bool = False
    geofence_lat: Optional[float] = None
    geofence_lon: Optional[float] = None
    geofence_radius_meters: Optional[float] = None


class CaseDetailOut(CaseOut):
    guardian_name: Optional[str] = None
    guardian_contact: Optional[str] = None
    care_notes: Optional[str] = None
    consent_signed_by: str
    enrolled_by: str


class ActivateCaseRequest(BaseModel):
    case_id: str
    expires_in_hours: Optional[int] = None


class ExpireCaseRequest(BaseModel):
    reason: str = "expired"


class DeleteUserRequest(BaseModel):
    case_id: str
    reason: str = "erasure_requested"


class SetGeofenceRequest(BaseModel):
    """
    All three null clears the geofence entirely (search everywhere again)
    — the "start narrow, widen later" workflow: activate a case with a
    tight radius around a last-known location, then call this again with
    a larger radius (or nulls) if the search needs to expand.
    """
    lat: Optional[float] = None
    lon: Optional[float] = None
    radius_meters: Optional[float] = Field(None, gt=0)


# --- Recognition / verification ----------------------------------------------

class RecognizeResult(BaseModel):
    result: str  # "match" | "no_match" | "no_face_detected" | "no_active_cases" | "cooldown"
    alert_id: Optional[str] = None
    case_id: Optional[str] = None
    classification: Optional[str] = None
    confidence: Optional[float] = None
    detail: Optional[str] = None


class VerifyResult(BaseModel):
    verified: bool
    case_id: str
    confidence: float
    classification: str


# --- Alerts -------------------------------------------------------------------

class AlertOut(BaseModel):
    alert_id: str
    case_id: str
    full_name: str
    confidence: float
    classification: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    device_uuid: str
    reported_at: float
    reviewed: bool
    has_matched_frame: bool = False
    has_enrollment_photo: bool = False


class HealthOut(BaseModel):
    status: str
    model_ready: bool
