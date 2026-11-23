"""
Central configuration, read entirely from environment variables. Nothing in
this codebase should hardcode a URL, secret, or file path — everything
that differs between local dev and a real deployment lives here so
deploying is a matter of setting env vars, not editing code.
"""

import os
from functools import lru_cache
from dotenv import load_dotenv

# Loads .env into the process environment if one exists in the working
# directory (local dev). In a real deployment (Docker, Hugging Face
# Spaces, systemd), real environment variables/secrets are already set by
# the platform and this is a harmless no-op — it never overrides a
# variable that's already set.
load_dotenv()


class Settings:
    # --- Identity / secrets -------------------------------------------------
    # These defaults are real, working values so the app runs immediately
    # with zero setup. For anything beyond local testing/demo, override
    # them via environment variables instead of editing this file.
    JWT_SECRET_KEY: str = os.environ.get(
        "EDITH_JWT_SECRET", "867ea6815271e5c0a2c5fd00d6283ddabb54abad8bfa3444fd432e95c17f688b"
    )
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRES_MINUTES: int = int(os.environ.get("EDITH_JWT_EXPIRES_MINUTES", "480"))

    # --- Database -------------------------------------------------------------
    # Local dev: a plain SQLite file, zero setup.
    # Real deployment: set DATABASE_URL to a hosted Postgres URL (Supabase,
    # Neon, Railway Postgres, etc.) — nothing else in the codebase changes,
    # SQLAlchemy handles the dialect difference.
    DATABASE_URL: str = os.environ.get("DATABASE_URL", "sqlite:///./edith.db")

    # --- CORS -------------------------------------------------------------
    # Comma-separated list of allowed origins, e.g.
    # "https://edith-dashboard.vercel.app,https://your-flutter-web.app"
    # Defaults to "*" for local development only.
    ALLOWED_ORIGINS: list[str] = [
        o.strip() for o in os.environ.get("EDITH_ALLOWED_ORIGINS", "*").split(",")
    ]

    # --- Face matching -------------------------------------------------------
    FACE_MODEL_NAME: str = os.environ.get("EDITH_FACE_MODEL", "ArcFace")
    # "opencv" is bundled inside the opencv-python package itself — zero
    # network dependency, guaranteed available. "yunet" (a newer, more
    # accurate DeepFace detector option) downloads its weight file from a
    # Git-LFS-backed path that can silently return a small broken stub
    # instead of the real ~230KB model on some networks, which then
    # detects zero faces with no obvious error. Reliability wins over the
    # marginal speed/accuracy difference for a live demo — set
    # EDITH_FACE_DETECTOR=yunet or retinaface if you've verified the
    # download works cleanly in your deployment environment first.
    FACE_DETECTOR_BACKEND: str = os.environ.get("EDITH_FACE_DETECTOR", "opencv")
    MATCH_THRESHOLD_POSSIBLE: float = float(os.environ.get("EDITH_THRESHOLD_POSSIBLE", "0.68"))
    MATCH_THRESHOLD_LIKELY: float = float(os.environ.get("EDITH_THRESHOLD_LIKELY", "0.82"))
    MATCH_THRESHOLD_HIGH: float = float(os.environ.get("EDITH_THRESHOLD_HIGH", "0.91"))

    # --- Runtime behaviour -------------------------------------------------
    REPORT_COOLDOWN_SECONDS: float = float(os.environ.get("EDITH_REPORT_COOLDOWN", "0.4"))
    ACTIVE_CASES_CACHE_TTL_SECONDS: float = float(os.environ.get("EDITH_CACHE_TTL", "2.0"))
    DEFAULT_CASE_EXPIRY_HOURS: int = int(os.environ.get("EDITH_DEFAULT_EXPIRY_HOURS", "72"))

    # --- Encryption at rest -------------------------------------------------
    # Encrypts face embeddings (and other sensitive fields) before they're
    # written to the database. This default is a real, working key so
    # local dev needs zero setup — but it means anyone with this source
    # code can decrypt any database encrypted with the default. Generate
    # your own before any real deployment: python -c "from
    # cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    ENCRYPTION_KEY: str = os.environ.get(
        "EDITH_ENCRYPTION_KEY", "K829sAcL1ZfvlBbkzpdKk6aw3qIRB6DVVlc7sZPy_80="
    )

    # --- Environment -------------------------------------------------------
    # "development" (default) never blocks startup. Set to "production" in
    # any real deployment — main.py refuses to start with default
    # secrets/passwords still in place when this is "production", instead
    # of silently going live with credentials anyone could read from this
    # source code.
    ENVIRONMENT: str = os.environ.get("EDITH_ENVIRONMENT", "development")

    # --- Seed admin (first run only) -------------------------------------------
    SEED_ADMIN_USERNAME: str = os.environ.get("EDITH_SEED_ADMIN_USER", "admin")
    SEED_ADMIN_PASSWORD: str = os.environ.get("EDITH_SEED_ADMIN_PASSWORD", "EDITH")


@lru_cache
def get_settings() -> Settings:
    return Settings()
