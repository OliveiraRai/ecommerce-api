from typing import Annotated
import time

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.dependencies import Security, bearer_scheme
from app.api.v1.schemas.customer import (
    CustomerIdentity,
    CustomerLogin,
    CustomerRegistration,
    CustomerResponse,
    CustomerToken,
)
from app.core.config import get_settings
from app.core.security import hash_password, new_token, token_digest, verify_password
from app.db.session import get_db
from app.models import Cliente, CustomerSession

router = APIRouter(prefix="/auth/customers", tags=["customer-auth"])


@router.post("/register", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
def register_customer(payload: CustomerRegistration, database: Session = Depends(get_db)) -> Cliente:
    if database.scalar(select(Cliente.id).where(func.lower(Cliente.email) == payload.email)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")

    customer = Cliente(
        nome=payload.nome,
        sobrenome=payload.sobrenome,
        email=payload.email,
        senha_hash=hash_password(payload.senha),
    )
    database.add(customer)
    try:
        database.commit()
    except IntegrityError as error:
        database.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered") from error
    database.refresh(customer)
    return customer


@router.post("/login", response_model=CustomerToken)
def login_customer(payload: CustomerLogin, database: Session = Depends(get_db)) -> CustomerToken:
    customer = database.scalar(select(Cliente).where(func.lower(Cliente.email) == payload.email))
    if customer is None:
        hash_password("dummy-password-that-is-never-used")
    valid = customer is not None and verify_password(customer.senha_hash, payload.senha)
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = new_token()
    expires_in = get_settings().customer_session_ttl_seconds
    database.add(
        CustomerSession(
            token_hash=token_digest(token),
            customer_id=customer.id,
            expires_at=int(time.time()) + expires_in,
        )
    )
    database.commit()
    return CustomerToken(access_token=token, expires_in=expires_in)


@router.get("/me", response_model=CustomerIdentity)
def customer_identity(customer: Cliente = Depends(Security.require_customer)) -> CustomerIdentity:
    return CustomerIdentity(id=customer.id, nome=customer.nome, sobrenome=customer.sobrenome, email=customer.email)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout_customer(
    customer: Annotated[Cliente, Depends(Security.require_customer)],
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    database: Session = Depends(get_db),
) -> None:
    session = database.get(CustomerSession, token_digest(credentials.credentials))
    if session is not None and session.customer_id == customer.id and session.revoked_at is None:
        session.revoked_at = int(time.time())
        database.commit()
