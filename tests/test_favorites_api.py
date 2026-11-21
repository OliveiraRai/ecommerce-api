from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import time
from app.core.security import token_digest
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models import Admin, AdminSession, Cliente, CustomerSession, Favorito, Produto


@pytest.fixture
def favorites_client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    with Session(engine) as database:
        database.add_all([
            Admin(id=1, username="root", password_hash="unused"),
            Cliente(nome="Ada", sobrenome="Lovelace", email="ada@example.com", senha_hash="unused"),
            Cliente(nome="Grace", sobrenome="Hopper", email="grace@example.com", senha_hash="unused"),
            Produto(id=1, nome="GPU", descricao="private description", imagem_url="https://example.com/gpu.png", preco=Decimal("120.50"), estoque=4),
        ])
        database.commit()

    def override_get_db():
        with Session(engine) as database:
            yield database

    app = create_app()
    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app, backend_options={"use_uvloop": True})
    try:
        yield client, engine
    finally:
        client.close()
        engine.dispose()


def _token(engine, email: str = "ada@example.com", *, admin: bool = False) -> str:
    token = f"favorites-test-{email}-{admin}"
    with Session(engine) as database:
        if admin:
            database.add(AdminSession(token_hash=token_digest(token), admin_id=1, expires_at=int(time.time()) + 3600))
        else:
            customer = database.scalar(select(Cliente).where(Cliente.email == email))
            database.add(CustomerSession(token_hash=token_digest(token), customer_id=customer.id, expires_at=int(time.time()) + 3600))
        database.commit()
    return token


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_create_favorite_returns_public_payload_and_persists(favorites_client):
    client, engine = favorites_client
    response = client.post("/api/v1/favorites/1", headers=_auth(_token(engine)))
    assert response.status_code == 201
    assert response.json() == {
        "id": 1,
        "produto_id": 1,
        "produto": {"id": 1, "nome": "GPU", "imagem_url": "https://example.com/gpu.png", "preco": "120.50"},
    }
    assert "private description" not in response.text and "estoque" not in response.text
    with Session(engine) as database:
        favorite = database.scalar(select(Favorito))
        assert favorite is not None and favorite.cliente_id == 1 and favorite.produto_id == 1


def test_create_favorite_handles_missing_duplicate_and_auth_roles(favorites_client):
    client, engine = favorites_client
    assert client.post("/api/v1/favorites/1").status_code == 401
    admin = _token(engine, admin=True)
    assert client.post("/api/v1/favorites/1", headers=_auth(admin)).status_code == 403
    ada = _auth(_token(engine))
    assert client.post("/api/v1/favorites/999", headers=ada).status_code == 404
    assert client.post("/api/v1/favorites/1", headers=ada).status_code == 201
    assert client.post("/api/v1/favorites/1", headers=ada).status_code == 409


def test_delete_favorite_is_owned_and_returns_empty_204(favorites_client):
    client, engine = favorites_client
    ada = _auth(_token(engine))
    grace = _auth(_token(engine, "grace@example.com"))
    assert client.delete("/api/v1/favorites/1", headers=ada).status_code == 404
    assert client.post("/api/v1/favorites/1", headers=ada).status_code == 201
    assert client.delete("/api/v1/favorites/1", headers=grace).status_code == 404
    response = client.delete("/api/v1/favorites/1", headers=ada)
    assert response.status_code == 204 and response.content == b""
    with Session(engine) as database:
        assert database.scalar(select(Favorito.id)) is None


def test_list_favorites_is_empty_and_isolated_and_matches_persisted_data(favorites_client):
    client, engine = favorites_client
    ada = _auth(_token(engine))
    grace = _auth(_token(engine, "grace@example.com"))
    empty = client.get("/api/v1/favorites", headers=ada)
    assert empty.status_code == 200
    assert empty.json() == {"items": [], "page": 1, "page_size": 12, "total_items": 0, "total_pages": 0}
    created = client.post("/api/v1/favorites/1", headers=ada).json()
    response = client.get("/api/v1/favorites", headers=ada)
    assert response.status_code == 200
    assert response.json() == {"items": [created], "page": 1, "page_size": 12, "total_items": 1, "total_pages": 1}
    assert client.get("/api/v1/favorites", headers=grace).json()["items"] == []
    with Session(engine) as database:
        favorite = database.scalar(select(Favorito))
        assert response.json()["items"][0]["id"] == favorite.id
        assert response.json()["items"][0]["produto_id"] == favorite.produto_id


def test_list_favorites_returns_requested_server_page(favorites_client):
    client, engine = favorites_client
    auth = _auth(_token(engine))
    with Session(engine) as database:
        database.add_all([
            Produto(id=2, nome="Mouse", descricao=None, preco=Decimal("25.00"), estoque=2),
            Produto(id=3, nome="Headset", descricao=None, preco=Decimal("75.00"), estoque=1),
        ])
        database.flush()
        database.add_all([Favorito(cliente_id=1, produto_id=1), Favorito(cliente_id=1, produto_id=2), Favorito(cliente_id=1, produto_id=3)])
        database.commit()
    response = client.get("/api/v1/favorites?page=2&page_size=2", headers=auth)
    assert response.status_code == 200
    assert response.json()["page"] == 2
    assert response.json()["page_size"] == 2
    assert response.json()["total_items"] == 3
    assert response.json()["total_pages"] == 2
    assert [item["produto_id"] for item in response.json()["items"]] == [3]
    assert client.get("/api/v1/favorites?page=0", headers=auth).status_code == 422
