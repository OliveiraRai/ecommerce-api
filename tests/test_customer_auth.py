import time
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password, token_digest
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models import Admin, Cliente, CustomerSession, Produto


@pytest.fixture
def auth_client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as database:
        admin = Admin(id=1, username="root", password_hash=hash_password("admin-test-password"))
        customer = Cliente(
            nome="Ada",
            sobrenome="Lovelace",
            email="ada@example.com",
            senha_hash=hash_password("Strong-password-42"),
        )
        database.add_all([admin, customer, Produto(nome="Mouse", descricao=None, preco=Decimal("50.00"), estoque=3)])
        database.commit()

    def override_get_db():
        with Session(engine) as database:
            yield database

    application = create_app()
    application.dependency_overrides[get_db] = override_get_db
    client = TestClient(application, backend_options={"use_uvloop": True})
    try:
        yield client, engine
    finally:
        client.close()
        engine.dispose()


def customer_login(client):
    response = client.post(
        "/api/v1/auth/customers/login",
        json={"email": "ADA@EXAMPLE.COM", "senha": "Strong-password-42"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def admin_login(client):
    response = client.post(
        "/api/v1/auth/admin/login",
        json={"username": "root", "password": "admin-test-password"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_customer_login_returns_opaque_token_and_recognizes_customer_identity(auth_client):
    client, _ = auth_client
    token = customer_login(client)
    assert token
    identity = client.get("/api/v1/auth/customers/me", headers={"Authorization": f"Bearer {token}"})
    assert identity.status_code == 200
    assert identity.json() == {
        "id": 1,
        "nome": "Ada",
        "sobrenome": "Lovelace",
        "email": "ada@example.com",
        "role": "customer",
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "ada@example.com", "senha": "wrong-password"},
        {"email": "unknown@example.com", "senha": "wrong-password"},
    ],
)
def test_customer_login_rejects_invalid_credentials_without_email_disclosure(auth_client, payload):
    client, _ = auth_client
    response = client.post("/api/v1/auth/customers/login", json=payload)
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"
    assert "senha_hash" not in response.text


def test_customer_login_validates_payload_and_does_not_expose_credentials(auth_client):
    client, _ = auth_client
    assert client.post("/api/v1/auth/customers/login", json={"email": "ada@example.com"}).status_code == 422
    response = client.post(
        "/api/v1/auth/customers/login",
        json={"email": "ada@example.com", "senha": "Strong-password-42"},
    )
    assert response.status_code == 200
    assert "senha" not in response.text
    assert "senha_hash" not in response.text


def test_customer_session_rejects_expired_and_unknown_tokens(auth_client):
    client, engine = auth_client
    assert client.get("/api/v1/auth/customers/me", headers={"Authorization": "Bearer invalid"}).status_code == 401
    token = customer_login(client)
    with Session(engine) as database:
        session = database.get(CustomerSession, token_digest(token))
        assert session is not None
        session.expires_at = int(time.time()) - 1
        database.commit()
    assert client.get("/api/v1/auth/customers/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_customer_logout_revokes_session(auth_client):
    client, _ = auth_client
    token = customer_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    assert client.post("/api/v1/auth/customers/logout", headers=headers).status_code == 204
    assert client.get("/api/v1/auth/customers/me", headers=headers).status_code == 401


def test_customer_can_read_catalog_but_cannot_mutate_products(auth_client):
    client, _ = auth_client
    token = customer_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v1/products").status_code == 200
    assert client.get("/api/v1/products/1").status_code == 200
    assert client.get("/api/v1/products", headers=headers).status_code == 200
    assert client.get("/api/v1/products/1", headers=headers).status_code == 200
    payload = {"nome": "Keyboard", "preco": "10.00", "estoque": 1}
    assert client.post("/api/v1/products", json=payload, headers=headers).status_code == 403
    assert client.put("/api/v1/products/1", json=payload, headers=headers).status_code == 403
    assert client.delete("/api/v1/products/1", headers=headers).status_code == 403


def test_admin_identity_and_permissions_are_preserved_and_customer_token_is_not_admin(auth_client):
    client, _ = auth_client
    customer_token = customer_login(client)
    admin_token = admin_login(client)
    admin_identity = client.get("/api/v1/auth/admin/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_identity.status_code == 200
    assert admin_identity.json()["role"] == "admin"
    admin_create = client.post(
        "/api/v1/products",
        json={"nome": "Admin product", "preco": "25.00", "estoque": 1},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert admin_create.status_code == 201
    assert client.post(
        "/api/v1/products",
        json={"nome": "Forged", "preco": "1.00", "estoque": 1, "role": "admin"},
        headers={"Authorization": f"Bearer {customer_token}"},
    ).status_code in (403, 422)
    assert client.post("/api/v1/products", json={}).status_code == 401


def test_admin_token_cannot_be_used_as_customer_identity(auth_client):
    client, _ = auth_client
    token = admin_login(client)
    response = client.get("/api/v1/auth/customers/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
