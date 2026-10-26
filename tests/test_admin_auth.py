import time
from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password, token_digest
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models import Admin, AdminSession, Produto


@pytest.fixture
def auth_client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as database:
        admin = Admin(id=1, username="root", password_hash=hash_password("correct-horse-battery"))
        database.add_all([admin, Produto(nome="Mouse", descricao=None, preco=Decimal("50.00"), estoque=3)])
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


def login(client: TestClient) -> str:
    response = client.post("/api/v1/auth/admin/login", json={"username": "root", "password": "correct-horse-battery"})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_login_rejects_bad_or_unknown_credentials_without_account_disclosure(auth_client):
    client, _ = auth_client
    wrong = client.post("/api/v1/auth/admin/login", json={"username": "root", "password": "wrong-password"})
    unknown = client.post("/api/v1/auth/admin/login", json={"username": "missing", "password": "wrong-password"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert client.post("/api/v1/auth/admin/login", json={"username": "root"}).status_code == 422
    assert client.post("/api/v1/auth/admin/login", json={"username": "", "password": "x"}).status_code == 422
    assert "password_hash" not in wrong.text


@pytest.mark.parametrize(
    ("remember_me", "expected_ttl"),
    [(False, 30 * 60), (True, 30 * 24 * 60 * 60)],
)
def test_login_persists_the_selected_session_expiration(auth_client, remember_me, expected_ttl):
    client, engine = auth_client
    issued_at = 1_700_000_000
    with patch("app.api.v1.endpoints.auth.time.time", return_value=issued_at):
        response = client.post(
            "/api/v1/auth/admin/login",
            json={"username": "root", "password": "correct-horse-battery", "remember_me": remember_me},
        )

    assert response.status_code == 200
    assert response.json()["expires_in"] == expected_ttl
    with Session(engine) as database:
        session = database.get(AdminSession, token_digest(response.json()["access_token"]))
        assert session is not None
        assert session.expires_at == issued_at + expected_ttl


def test_login_rejects_an_invalid_remember_me_value(auth_client):
    client, _ = auth_client
    response = client.post(
        "/api/v1/auth/admin/login",
        json={"username": "root", "password": "correct-horse-battery", "remember_me": "sometimes"},
    )
    assert response.status_code == 422


def test_identity_and_protected_routes_require_valid_authentication(auth_client):
    client, _ = auth_client
    assert client.get("/api/v1/auth/admin/me").status_code == 401
    assert client.post("/api/v1/products", json={}).status_code == 401
    assert client.put("/api/v1/products/1", json={}).status_code == 401
    assert client.delete("/api/v1/products/1").status_code == 401
    assert client.get("/api/v1/products").status_code == 200
    client.headers["Authorization"] = "Bearer invalid-token"
    assert client.get("/api/v1/auth/admin/me").status_code == 401


def test_admin_token_reports_identity_and_is_revocable_on_logout(auth_client):
    client, _ = auth_client
    token = login(client)
    client.headers["Authorization"] = f"Bearer {token}"
    identity = client.get("/api/v1/auth/admin/me")
    assert identity.status_code == 200
    assert identity.json() == {"id": 1, "username": "root", "role": "admin"}
    assert client.post("/api/v1/auth/admin/logout").status_code == 204
    assert client.get("/api/v1/auth/admin/me").status_code == 401


def test_expired_token_is_rejected(auth_client):
    client, engine = auth_client
    token = login(client)
    with Session(engine) as database:
        session = database.get(AdminSession, token_digest(token))
        assert session is not None
        session.expires_at = int(time.time()) - 1
        database.commit()
    client.headers["Authorization"] = f"Bearer {token}"
    assert client.get("/api/v1/auth/admin/me").status_code == 401


def test_admin_can_create_update_and_delete_product(auth_client):
    client, _ = auth_client
    token = login(client)
    client.headers["Authorization"] = f"Bearer {token}"
    created = client.post(
        "/api/v1/products",
        json={"nome": "Keyboard", "descricao": None, "preco": "100.00", "estoque": 2},
    )
    assert created.status_code == 201
    updated = client.put(
        f"/api/v1/products/{created.json()['id']}",
        json={"nome": "New keyboard", "descricao": None, "preco": "80.00", "estoque": 4},
    )
    assert updated.status_code == 200
    assert updated.json()["nome"] == "New keyboard"
    assert client.delete(f"/api/v1/products/{created.json()['id']}").status_code == 204


def test_database_rejects_a_second_admin_identity(auth_client):
    _, engine = auth_client
    with Session(engine) as database:
        database.add(Admin(id=2, username="another", password_hash=hash_password("another-password")))
        with pytest.raises(IntegrityError):
            database.commit()
        database.rollback()


def test_provisioning_command_refuses_to_create_duplicate_account(auth_client, monkeypatch, capsys):
    _, engine = auth_client
    from sqlalchemy.orm import sessionmaker

    import app.cli

    monkeypatch.setattr(app.cli, "SessionLocal", sessionmaker(bind=engine))
    with patch("builtins.input", return_value="second-admin"), patch(
        "app.cli.getpass.getpass", side_effect=["a-long-test-password", "a-long-test-password"]
    ):
        assert app.cli.create_admin() == 1
    assert "already exists" in capsys.readouterr().err
    with Session(engine) as database:
        assert database.query(Admin).count() == 1
