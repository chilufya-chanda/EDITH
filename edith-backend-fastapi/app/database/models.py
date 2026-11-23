"""
ORM models. Mirrors the original schema (users / cases / alerts /
audit_log) but expressed as SQLAlchemy models instead of raw SQL, so it
runs unchanged against SQLite or Postgres.
"""

import uuid
import time

from sqlalchemy import Column, String, Float, Integer, Text, ForeignKey
from app.database.session import Base


def _uuid_hex():
    return uuid.uuid4().hex


class User(Base):
    __tablename__ = "users"

    username = Column(String, primary_key=True)
    password_hash = Column(String, nullable=False)
    salt = Column(String, nullable=False)
    role = Column(String, nullable=False, default="guardian")  # admin | officer | guardian
    display_name = Column(String, default="")
    created_at = Column(Float, nullable=False)
    active = Column(Integer, nullable=False, default=1)


class Case(Base):
    __tablename__ = "cases"

    case_id = Column(String, primary_key=True, default=lambda: "CASE-" + _uuid_hex()[:8].upper())
    full_name = Column(String, nullable=False)
    guardian_name = Column(String, default="")
    guardian_contact = Column(String, default="")
    care_notes = Column(Text, default="")
    id_number = Column(String, default="")  # user-supplied only, never externally queried
    embedding = Column(Text, nullable=False)  # JSON array, 512-D ArcFace vector, encrypted at rest
    enrollment_photo = Column(Text, nullable=True)  # base64 JPEG, encrypted at rest — kept ONLY for
    # human-review purposes (comparing a live match against the photo the
    # guardian originally presented), never used in matching itself.
    # Deleted whenever the case is deleted (see case_service.delete_case).
    consent_signed_at = Column(Float, nullable=False)
    consent_signed_by = Column(String, nullable=False)
    enrolled_by = Column(String, nullable=False)
    status = Column(String, nullable=False, default="enrolled")  # enrolled|active|found|expired|cancelled
    created_at = Column(Float, nullable=False)
    activated_at = Column(Float, nullable=True)
    expires_at = Column(Float, nullable=True)
    closed_at = Column(Float, nullable=True)

    # Optional search geofence: if set, spotter reports are only matched
    # against this case when they come from a device within radius_meters
    # of this point. Null (the default) means no geofence — search
    # everywhere, matching the original behaviour. An admin/officer can
    # widen or clear this later without re-enrolling the case.
    geofence_lat = Column(Float, nullable=True)
    geofence_lon = Column(Float, nullable=True)
    geofence_radius_meters = Column(Float, nullable=True)


class Alert(Base):
    __tablename__ = "alerts"

    alert_id = Column(String, primary_key=True, default=lambda: "ALERT-" + _uuid_hex()[:8].upper())
    case_id = Column(String, ForeignKey("cases.case_id"), nullable=False)
    confidence = Column(Float, nullable=False)
    classification = Column(String, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    device_uuid = Column(String, nullable=False)
    reported_at = Column(Float, nullable=False)
    reviewed = Column(Integer, nullable=False, default=0)
    matched_frame = Column(Text, nullable=True)  # base64 JPEG, encrypted at rest — the actual frame
    # the spotter device captured, kept so a human reviewer can compare it
    # directly against the case's enrollment photo before acting on the alert.


class AuditLog(Base):
    __tablename__ = "audit_log"

    log_id = Column(String, primary_key=True, default=_uuid_hex)
    actor = Column(String, nullable=False)
    action = Column(String, nullable=False)
    target_case_id = Column(String, nullable=True)
    detail = Column(Text, default="")
    timestamp = Column(Float, nullable=False, default=time.time)
