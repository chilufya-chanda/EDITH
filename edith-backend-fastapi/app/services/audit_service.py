import time
from sqlalchemy.orm import Session

from app.database.models import AuditLog


def log_action(db: Session, actor: str, action: str, target_case_id: str = None, detail: str = ""):
    entry = AuditLog(
        actor=actor,
        action=action,
        target_case_id=target_case_id,
        detail=detail,
        timestamp=time.time(),
    )
    db.add(entry)
    db.commit()
