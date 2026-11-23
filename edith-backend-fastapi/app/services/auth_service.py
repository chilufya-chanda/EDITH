import time
from typing import Optional
from sqlalchemy.orm import Session

from app.database.models import User
from app.utilities.security import (
    hash_password, verify_password, is_legacy_hash, verify_legacy_password, create_access_token,
)
from app.utilities.auth_rate_limit import register_failure, register_success, check_lockout


def verify_login(db: Session, username: str, password: str, client_ip: str = "unknown") -> Optional[dict]:
    check_lockout(username, client_ip)  # raises LockedOutError if too many recent failures

    user = db.query(User).filter(User.username == username, User.active == 1).first()

    valid = False
    if user:
        if is_legacy_hash(user.password_hash):
            # Transparent migration: verify against the old scheme once,
            # and if correct, immediately re-hash with bcrypt so this
            # account never has to be checked against the weak scheme
            # again. No account is stuck on SHA-256 forever just because
            # it was created before this fix.
            valid = verify_legacy_password(password, user.password_hash, user.salt)
            if valid:
                user.password_hash = hash_password(password)
                user.salt = ""
                db.commit()
        else:
            valid = verify_password(password, user.password_hash)

    if not valid:
        register_failure(username, client_ip)
        return None

    register_success(username, client_ip)
    token = create_access_token(user.username, user.role)
    return {"access_token": token, "role": user.role, "display_name": user.display_name or user.username}


def create_user(db: Session, username: str, password: str, role: str = "guardian", display_name: str = "") -> User:
    user = User(
        username=username,
        password_hash=hash_password(password),
        salt="",  # unused under bcrypt — bcrypt embeds its own salt in the hash itself
        role=role,
        display_name=display_name,
        created_at=time.time(),
        active=1,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def ensure_seed_admin(db: Session, username: str, password: str):
    existing = db.query(User).count()
    if existing == 0:
        create_user(db, username, password, role="admin", display_name="Default Admin")
        print(f"Seeded default admin account '{username}' — change this password before any real deployment.")
