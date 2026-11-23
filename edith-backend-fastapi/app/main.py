"""
EDITH Guardian Network — FastAPI backend entrypoint.

Local dev:
    uvicorn app.main:app --reload

Production (see DEPLOY.md):
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
"""

import sys
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database.session import Base, engine, SessionLocal
from app.routes import health, auth, enrollment, recognition, cases, alerts
from app.services import auth_service, face_service

# Makes the recognize route's per-request timing logs (read/embed/match
# breakdown, and a warning if a request takes >3s) actually show up.
# Uvicorn's own default logging config doesn't enable INFO for app-level
# loggers otherwise, and "the log I added is silently invisible" is a
# worse debugging experience than not having timing logs at all.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

settings = get_settings()

# The exact default values baked into config.py for zero-setup local dev —
# checked at startup so a real deployment can't accidentally go live still
# using them (see the production safety check below).
_DEFAULT_JWT_SECRET = "867ea6815271e5c0a2c5fd00d6283ddabb54abad8bfa3444fd432e95c17f688b"
_DEFAULT_ENCRYPTION_KEY = "K829sAcL1ZfvlBbkzpdKk6aw3qIRB6DVVlc7sZPy_80="
_DEFAULT_ADMIN_PASSWORD = "EDITH"

app = FastAPI(
    title="EDITH Guardian Network API",
    description="AI-assisted, consent-gated missing persons detection network.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    # Standard defensive headers — cheap to add, closes off a handful of
    # common browser-side attack classes (clickjacking, MIME-sniffing,
    # protocol downgrade) that don't require any application logic to fix.
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(auth.admin_router)
app.include_router(enrollment.router)
app.include_router(recognition.router)
app.include_router(cases.router)
app.include_router(cases.devices_router)
app.include_router(alerts.router)


def _check_production_safety():
    """
    Refuses to start with known-default secrets/passwords when
    EDITH_ENVIRONMENT=production is set. Local dev and demos (the
    default, "development") are never blocked by this — it only matters
    once you've deliberately told the app it's a real deployment.
    """
    if settings.ENVIRONMENT != "production":
        return

    problems = []
    if settings.JWT_SECRET_KEY == _DEFAULT_JWT_SECRET:
        problems.append("EDITH_JWT_SECRET is still the default value from source code")
    if settings.ENCRYPTION_KEY == _DEFAULT_ENCRYPTION_KEY:
        problems.append("EDITH_ENCRYPTION_KEY is still the default value from source code")
    if settings.SEED_ADMIN_PASSWORD == _DEFAULT_ADMIN_PASSWORD:
        problems.append("EDITH_SEED_ADMIN_PASSWORD is still the default 'EDITH'")

    if problems:
        print("\nREFUSING TO START IN PRODUCTION MODE:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        print(
            "Set real values for these via environment variables before "
            "deploying with EDITH_ENVIRONMENT=production. This check only "
            "runs in production mode — local/demo use is unaffected.\n",
            file=sys.stderr,
        )
        sys.exit(1)


@app.on_event("startup")
def on_startup():
    _check_production_safety()

    # Create tables if they don't exist yet (SQLite dev or a fresh Postgres
    # database). For a real production rollout you'd swap this for Alembic
    # migrations, but for a from-scratch deploy this is enough.
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        auth_service.ensure_seed_admin(db, settings.SEED_ADMIN_USERNAME, settings.SEED_ADMIN_PASSWORD)
    finally:
        db.close()

    # Pre-warm the face model BEFORE the server starts accepting requests
    # (not fire-and-forget in a background thread) — that was racing
    # against the very first real request trying to load the same model
    # concurrently, which isn't guaranteed thread-safe and caused an
    # intermittent spurious "no face detected" failure in testing. A few
    # seconds of slower startup is the right trade for eliminating that.
    try:
        import numpy as np
        import cv2
        dummy = np.zeros((160, 160, 3), dtype=np.uint8)
        _, encoded = cv2.imencode(".jpg", dummy)
        try:
            face_service.generate_embedding_from_bytes(encoded.tobytes())
        except Exception:
            pass  # dummy frame has no real face — expected; the point is loading weights
        print("AI model pre-warmed and ready.")
    except Exception as e:
        print(f"Warmup note: {e}")
