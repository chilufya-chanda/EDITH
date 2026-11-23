from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import User
from app.models.schemas import LoginRequest, TokenResponse, CreateUserRequest, UserOut
from app.services import auth_service
from app.utilities.security import require_role, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])
admin_router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    result = auth_service.verify_login(db, payload.username, payload.password, client_ip)
    if not result:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return result


@admin_router.post("/users", response_model=UserOut, dependencies=[Depends(require_role("admin"))])
def create_user(payload: CreateUserRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=409, detail="username already exists")
    user = auth_service.create_user(db, payload.username, payload.password, payload.role, payload.display_name)
    return UserOut(username=user.username, role=user.role, display_name=user.display_name, active=bool(user.active))


@admin_router.get("/users", response_model=list[UserOut], dependencies=[Depends(require_role("admin"))])
def list_users(db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.created_at).all()
    return [UserOut(username=u.username, role=u.role, display_name=u.display_name, active=bool(u.active)) for u in users]


@admin_router.put("/users/{username}/deactivate", dependencies=[Depends(require_role("admin"))])
def deactivate_user(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    user.active = 0
    db.commit()
    return {"username": username, "active": False}
