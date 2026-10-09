"""Shared authentication dependencies for protected API operations."""

import time
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import token_digest
from app.db.session import get_db
from app.models import Admin, AdminSession

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_admin(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    database: Annotated[Session, Depends(get_db)],
) -> Admin:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired admin credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized
    session = database.get(AdminSession, token_digest(credentials.credentials))
    now = int(time.time())
    if session is None or session.revoked_at is not None or session.expires_at <= now:
        raise unauthorized
    admin = database.get(Admin, session.admin_id)
    if admin is None:
        raise unauthorized
    return admin
