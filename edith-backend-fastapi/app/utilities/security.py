"""
Security utilities: password hashing, JWT issuing/verification, and the
FastAPI dependency every protected route uses to get the current user.
"""

import hashlib
import secrets
import time
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database.session import get_db
from app.database.models import User

settings = get_settings()

# tokenUrl is only used for OpenAPI docs' "Authorize" button; auth itself
# happens against /api/auth/login.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    """
    bcrypt — a deliberately slow, salt-built-in hash designed for
    passwords. Replaces an earlier SHA-256+salt scheme, which is fast
    hashing (built for speed, e.g. file checksums) and cheap to brute-force
    at scale on modern GPUs; bcrypt's built-in work factor makes that
    attack meaningfully more expensive.
    """
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def is_legacy_hash(password_hash: str) -> bool:
    """SHA-256 hex digests are 64 chars; bcrypt hashes start with $2 and are 60 chars."""
    return not password_hash.startswith("$2")


def verify_legacy_password(password: str, password_hash: str, salt: str) -> bool:
    """Only used to transparently migrate accounts created before the bcrypt switch."""
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest() == password_hash


def make_salt() -> str:
    """Kept only for the legacy verification path above — bcrypt salts itself."""
    return secrets.token_hex(16)


def create_access_token(username: str, role: str) -> str:
    payload = {
        "sub": username,
        "role": role,
        "iat": time.time(),
        "exp": time.time() + settings.JWT_EXPIRES_MINUTES * 60,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_access_token(token)
    username = payload.get("sub")
    user = db.query(User).filter(User.username == username, User.active == 1).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


def require_role(*allowed_roles: str):
    """
    Dependency factory: require_role("admin", "officer") restricts a route
    to those roles — used for case activation, which guardians can enroll
    into but never self-activate.
    """
    async def _dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(allowed_roles)}",
            )
        return user
    return _dependency
