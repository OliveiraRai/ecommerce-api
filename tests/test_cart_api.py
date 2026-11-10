from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models import Admin, Carrinho, CarrinhoItem, Cliente, Produto


@pytest.fixture
def cart_client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    with Session(engine) as database:
        database.add_all(
            [
                Admin(id=1, username="root", password_hash=hash_password("admin-test-password")),
                Cliente(nome="Ada", sobrenome="Lovelace", email="ada@example.com", senha_hash=hash_password("Strong-password-42")),
                Cliente(nome="Grace", sobrenome="Hopper", email="grace@example.com", senha_hash=hash_password("Strong-password-42")),
                Produto(id=1, nome="GPU", descricao=None, imagem_url="https://example.com/gpu.png", preco=Decimal("120.50"), estoque=4),
                Produto(id=2, nome="Mouse", descricao=None, preco=Decimal("25.00"), estoque=0),
            ]
        )
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


def login(client: TestClient, email: str) -> str:
    response = client.post(
        "/api/v1/auth/customers/login",
        json={"email": email, "senha": "Strong-password-42"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_cart_authentication_requires_customer_role(cart_client):
    client, _ = cart_client
    assert client.get("/api/v1/cart").status_code == 401
    assert client.get("/api/v1/cart", headers=headers("invalid")).status_code == 401
    admin_token = client.post(
        "/api/v1/auth/admin/login", json={"username": "root", "password": "admin-test-password"}
    ).json()["access_token"]
    assert client.get("/api/v1/cart", headers=headers(admin_token)).status_code == 403
    assert client.get("/api/v1/cart", headers=headers(login(client, "ada@example.com"))).status_code == 200


def test_empty_cart_is_not_created_until_first_mutation(cart_client):
    client, engine = cart_client
    response = client.get("/api/v1/cart", headers=headers(login(client, "ada@example.com")))
    assert response.status_code == 200
    assert response.json() == {"id": None, "itens": []}
    with Session(engine) as database:
        assert database.scalar(select(Carrinho.id)) is None


def test_add_repeated_item_returns_current_product_price_stock_and_incremented_quantity(cart_client):
    client, engine = cart_client
    auth = headers(login(client, "ada@example.com"))
    first = client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 2}, headers=auth)
    second = client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 1}, headers=auth)
    assert first.status_code == second.status_code == 200
    assert second.json() == {
        "id": first.json()["id"],
        "produto_id": 1,
        "produto": {"id": 1, "nome": "GPU", "imagem_url": "https://example.com/gpu.png", "preco": "120.50", "estoque": 4},
        "quantidade": 3,
        "subtotal": "361.50",
        "disponivel": True,
    }
    with Session(engine) as database:
        assert len(list(database.scalars(select(CarrinhoItem)).all())) == 1
        assert database.scalar(select(Carrinho).where(Carrinho.cliente_id == 1)) is not None


def test_add_does_not_accept_customer_identity_from_request(cart_client):
    client, engine = cart_client
    auth = headers(login(client, "ada@example.com"))
    response = client.post(
        "/api/v1/cart/items", json={"produto_id": 1, "quantidade": 1, "cliente_id": 2}, headers=auth
    )
    assert response.status_code == 422
    assert client.get("/api/v1/cart", headers=auth).json() == {"id": None, "itens": []}
    with Session(engine) as database:
        assert database.scalar(select(Carrinho.id)) is None


def test_customer_carts_are_isolated_and_item_ids_cannot_cross_owners(cart_client):
    client, _ = cart_client
    ada = headers(login(client, "ada@example.com"))
    grace = headers(login(client, "grace@example.com"))
    item = client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 1}, headers=ada).json()
    assert len(client.get("/api/v1/cart", headers=ada).json()["itens"]) == 1
    assert client.get("/api/v1/cart", headers=grace).json() == {"id": None, "itens": []}
    assert client.patch(f"/api/v1/cart/items/{item['id']}", json={"quantidade": 2}, headers=grace).status_code == 404
    assert client.delete(f"/api/v1/cart/items/{item['id']}", headers=grace).status_code == 404
    assert len(client.get("/api/v1/cart", headers=ada).json()["itens"]) == 1


@pytest.mark.parametrize("quantidade", [0, -1, 1.5, "2", True, None])
def test_add_rejects_invalid_quantities_without_creating_partial_cart(cart_client, quantidade):
    client, engine = cart_client
    auth = headers(login(client, "ada@example.com"))
    response = client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": quantidade}, headers=auth)
    assert response.status_code == 422
    with Session(engine) as database:
        assert database.scalar(select(Carrinho.id)) is None
        assert database.scalar(select(CarrinhoItem.id)) is None


def test_add_rejects_missing_out_of_stock_or_over_stock_products_without_partial_changes(cart_client):
    client, engine = cart_client
    auth = headers(login(client, "ada@example.com"))
    assert client.post("/api/v1/cart/items", json={"produto_id": 999, "quantidade": 1}, headers=auth).status_code == 404
    assert client.post("/api/v1/cart/items", json={"produto_id": 2, "quantidade": 1}, headers=auth).status_code == 409
    assert client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 5}, headers=auth).status_code == 409
    with Session(engine) as database:
        assert database.scalar(select(Carrinho.id)) is None


def test_rejected_increment_keeps_existing_cart_quantity_unchanged(cart_client):
    client, _ = cart_client
    auth = headers(login(client, "ada@example.com"))
    item = client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 2}, headers=auth).json()
    assert client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 3}, headers=auth).status_code == 409
    current = client.get("/api/v1/cart", headers=auth).json()["itens"][0]
    assert current["id"] == item["id"]
    assert current["quantidade"] == 2


def test_cart_reads_current_product_price_instead_of_persisting_a_price_snapshot(cart_client):
    client, engine = cart_client
    auth = headers(login(client, "ada@example.com"))
    client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 2}, headers=auth)
    with Session(engine) as database:
        product = database.get(Produto, 1)
        product.preco = Decimal("130.75")
        database.commit()
    current = client.get("/api/v1/cart", headers=auth).json()["itens"][0]
    assert current["produto"]["preco"] == "130.75"
    assert current["subtotal"] == "261.50"


def test_update_checks_current_stock_and_delete_removes_owned_item(cart_client):
    client, engine = cart_client
    auth = headers(login(client, "ada@example.com"))
    item = client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 2}, headers=auth).json()
    with Session(engine) as database:
        product = database.get(Produto, 1)
        product.estoque = 1
        database.commit()
    assert client.patch(f"/api/v1/cart/items/{item['id']}", json={"quantidade": 2}, headers=auth).status_code == 409
    assert client.patch(f"/api/v1/cart/items/{item['id']}", json={"quantidade": 1}, headers=auth).status_code == 200
    with Session(engine) as database:
        product = database.get(Produto, 1)
        product.estoque = 0
        database.commit()
    current_item = client.get("/api/v1/cart", headers=auth).json()["itens"][0]
    assert current_item["disponivel"] is False
    assert current_item["produto"]["estoque"] == 0
    assert client.patch(f"/api/v1/cart/items/{item['id']}", json={"quantidade": 1}, headers=auth).status_code == 409
    assert client.delete(f"/api/v1/cart/items/{item['id']}", headers=auth).status_code == 204
    assert client.get("/api/v1/cart", headers=auth).json()["itens"] == []


@pytest.mark.parametrize("quantidade", [0, -2, 2.5, "3", True])
def test_update_rejects_invalid_quantities(cart_client, quantidade):
    client, _ = cart_client
    auth = headers(login(client, "ada@example.com"))
    item = client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 1}, headers=auth).json()
    response = client.patch(f"/api/v1/cart/items/{item['id']}", json={"quantidade": quantidade}, headers=auth)
    assert response.status_code == 422
    assert client.get("/api/v1/cart", headers=auth).json()["itens"][0]["quantidade"] == 1


def test_deleted_catalog_product_remains_as_removable_unavailable_cart_item(cart_client):
    client, engine = cart_client
    auth = headers(login(client, "ada@example.com"))
    item = client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 1}, headers=auth).json()
    admin_token = client.post(
        "/api/v1/auth/admin/login", json={"username": "root", "password": "admin-test-password"}
    ).json()["access_token"]
    assert client.delete("/api/v1/products/1", headers=headers(admin_token)).status_code == 204
    cart_item = client.get("/api/v1/cart", headers=auth).json()["itens"][0]
    assert cart_item == {
        "id": item["id"], "produto_id": None, "produto": None, "quantidade": 1, "subtotal": None, "disponivel": False
    }
    assert client.delete(f"/api/v1/cart/items/{item['id']}", headers=auth).status_code == 204


def test_cart_survives_logout_and_new_login_and_foreign_id_has_no_effect(cart_client):
    client, _ = cart_client
    token = login(client, "ada@example.com")
    auth = headers(token)
    client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 2}, headers=auth)
    assert client.post("/api/v1/auth/customers/logout", headers=auth).status_code == 204
    renewed = headers(login(client, "ada@example.com"))
    assert client.get("/api/v1/cart", headers=renewed).json()["itens"][0]["quantidade"] == 2


def test_database_unique_constraint_prevents_duplicate_product_rows(cart_client):
    _, engine = cart_client
    with Session(engine) as database:
        cart = Carrinho(cliente_id=1)
        database.add(cart)
        database.flush()
        database.add_all(
            [CarrinhoItem(carrinho_id=cart.id, produto_id=1, quantidade=1), CarrinhoItem(carrinho_id=cart.id, produto_id=1, quantidade=2)]
        )
        with pytest.raises(IntegrityError):
            database.commit()
        database.rollback()
