from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.security import verify_password
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models import Cliente


def make_client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)

    def override_get_db():
        with Session(engine) as database:
            yield database

    application = create_app()
    application.dependency_overrides[get_db] = override_get_db
    return TestClient(application, backend_options={"use_uvloop": True}), engine


def registration_payload(**overrides):
    return {
        "nome": "Ada",
        "sobrenome": "Lovelace",
        "email": "Ada@example.com",
        "senha": "Strong-password-42",
        "confirmar_senha": "Strong-password-42",
        **overrides,
    }


def test_register_customer_persists_normalized_email_and_password_hash():
    client, engine = make_client()
    try:
        response = client.post("/api/v1/auth/customers/register", json=registration_payload())
        assert response.status_code == 201
        assert response.json() == {
            "id": 1,
            "nome": "Ada",
            "sobrenome": "Lovelace",
            "email": "ada@example.com",
        }
        assert "senha" not in response.text
        assert "senha_hash" not in response.text
        with Session(engine) as database:
            customer = database.get(Cliente, 1)
            assert customer is not None
            assert customer.email == "ada@example.com"
            assert customer.senha_hash != "Strong-password-42"
            assert verify_password(customer.senha_hash, "Strong-password-42")
    finally:
        client.close()
        engine.dispose()


@pytest.mark.parametrize(
    "overrides",
    [
        {"nome": ""},
        {"sobrenome": ""},
        {"email": ""},
        {"senha": ""},
        {"confirmar_senha": ""},
        {"confirmar_senha": "Different-password-42"},
        {"senha": "Short-1!", "confirmar_senha": "Short-1!"},
        {"senha": "alllowercase-42!", "confirmar_senha": "alllowercase-42!"},
        {"senha": "ALLUPPERCASE-42!", "confirmar_senha": "ALLUPPERCASE-42!"},
        {"senha": "NoSpecialChar42", "confirmar_senha": "NoSpecialChar42"},
        {"nome": "n" * 151},
        {"sobrenome": "s" * 151},
        {"email": "e" * 321},
        {"senha": "P" * 1025, "confirmar_senha": "P" * 1025},
        {"unexpected": "forbidden"},
    ],
)
def test_register_rejects_invalid_or_missing_fields(overrides):
    client, engine = make_client()
    try:
        response = client.post("/api/v1/auth/customers/register", json=registration_payload(**overrides))
        assert response.status_code == 422
    finally:
        client.close()
        engine.dispose()


def test_register_rejects_duplicate_email_case_insensitively():
    client, engine = make_client()
    try:
        first = client.post("/api/v1/auth/customers/register", json=registration_payload())
        duplicate = client.post(
            "/api/v1/auth/customers/register",
            json=registration_payload(email="ADA@EXAMPLE.COM"),
        )
        assert first.status_code == 201
        assert duplicate.status_code == 409
        assert "UNIQUE constraint" not in duplicate.text
    finally:
        client.close()
        engine.dispose()


@pytest.mark.parametrize("field", ["nome", "sobrenome", "email", "senha", "confirmar_senha"])
def test_register_requires_all_fields(field):
    client, engine = make_client()
    try:
        payload = registration_payload()
        del payload[field]
        response = client.post("/api/v1/auth/customers/register", json=payload)
        assert response.status_code == 422
    finally:
        client.close()
        engine.dispose()
