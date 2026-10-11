"""Shared authentication dependencies for protected API operations."""

import time
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import token_digest
from app.db.session import get_db
from app.models import Admin, AdminSession, Cliente, CustomerSession

bearer_scheme = HTTPBearer(auto_error=False)


class Security:
    """Resolve bearer identities and enforce their application role."""

    @staticmethod
    def identity(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
        database: Annotated[Session, Depends(get_db)],
    ) -> tuple[str, Admin | Cliente]:
        unauthorized = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
        if credentials is None or credentials.scheme.lower() != "bearer":
            raise unauthorized

        digest = token_digest(credentials.credentials)
        now = int(time.time())
        admin_session = database.get(AdminSession, digest)
        if admin_session is not None:
            if admin_session.revoked_at is not None or admin_session.expires_at <= now:
                raise unauthorized
            admin = database.get(Admin, admin_session.admin_id)
            if admin is None:
                raise unauthorized
            return "admin", admin

        customer_session = database.get(CustomerSession, digest)
        if customer_session is not None:
            if customer_session.revoked_at is not None or customer_session.expires_at <= now:
                raise unauthorized
            customer = database.get(Cliente, customer_session.customer_id)
            if customer is None:
                raise unauthorized
            return "customer", customer

        raise unauthorized

    @staticmethod
    def require_admin(identity: Annotated[tuple[str, Admin | Cliente], Depends(identity)]) -> Admin:
        role, subject = identity
        if role != "admin" or not isinstance(subject, Admin):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")
        return subject

    @staticmethod
    def require_customer(identity: Annotated[tuple[str, Admin | Cliente], Depends(identity)]) -> Cliente:
        role, subject = identity
        if role != "customer" or not isinstance(subject, Cliente):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Customer access required")
        return subject


def get_current_admin(
    admin: Annotated[Admin, Depends(Security.require_admin)],
) -> Admin:
    """Compatibility dependency for existing administrative endpoints."""
    return admin
