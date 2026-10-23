import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.dependencies import bearer_scheme, get_current_admin
from app.api.v1.schemas.auth import AdminIdentity, AdminLogin, AdminToken
from app.core.security import hash_password, new_token, token_digest, verify_password
from app.db.session import get_db
from app.models import Admin, AdminSession

router = APIRouter(prefix="/auth/admin", tags=["admin-auth"])
ADMIN_SESSION_TTL_SECONDS = 30 * 60
ADMIN_REMEMBER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60


@router.post("/login", response_model=AdminToken)
def login(payload: AdminLogin, database: Session = Depends(get_db)) -> AdminToken:
    admin = database.scalar(select(Admin).where(Admin.username == payload.username))
    # Verify against a fixed dummy hash when the username is unknown to reduce timing-based enumeration.
    if admin is None:
        hash_password("dummy-password-that-is-never-used")
    valid = admin is not None and verify_password(admin.password_hash, payload.password)
    if not valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    token = new_token()
    expires_in = ADMIN_REMEMBER_SESSION_TTL_SECONDS if payload.remember_me else ADMIN_SESSION_TTL_SECONDS
    expires_at = int(time.time()) + expires_in
    database.add(
        AdminSession(
            token_hash=token_digest(token),
            admin_id=admin.id,
            expires_at=expires_at,
        )
    )
    database.commit()
    return AdminToken(access_token=token, expires_in=expires_in)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    admin: Annotated[Admin, Depends(get_current_admin)],
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    database: Session = Depends(get_db),
) -> None:
    session = database.get(AdminSession, token_digest(credentials.credentials))
    if session is not None and session.revoked_at is None:
        session.revoked_at = int(time.time())
        database.commit()


@router.get("/me", response_model=AdminIdentity)
def me(admin: Annotated[Admin, Depends(get_current_admin)]) -> AdminIdentity:
    return AdminIdentity(id=admin.id, username=admin.username)
