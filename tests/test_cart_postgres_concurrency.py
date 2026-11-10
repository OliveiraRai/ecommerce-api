import os
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import pytest
from dotenv import load_dotenv
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from fastapi.testclient import TestClient
from app.models import Admin, Carrinho, CarrinhoItem, Cliente, Produto

load_dotenv(dotenv_path=Path(__file__).parents[1] / ".env", override=False)


@pytest.fixture
def postgres_cart_client():
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Defina TEST_DATABASE_URL para executar o teste concorrente PostgreSQL")
    if not database_url.startswith("postgresql"):
        pytest.fail("TEST_DATABASE_URL deve apontar para PostgreSQL dedicado")
    database_name = make_url(database_url).database or ""
    if not database_name.startswith("test_"):
        pytest.fail("TEST_DATABASE_URL deve usar um banco cujo nome comece com 'test_'")

    admin_engine = create_engine(database_url)
    schema_name = f"test_cart_{uuid4().hex}"
    try:
        with admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema_name}"'))
    except OperationalError as error:
        admin_engine.dispose()
        # Skip only connection failures. Permission/configuration/schema errors
        # must fail the test rather than being mislabeled as an unavailable DB.
        if error.connection_invalidated or getattr(error.orig, "sqlstate", None) is None:
            pytest.skip(f"PostgreSQL de teste indisponível: {error.__class__.__name__}")
        raise
    engine = create_engine(
        database_url,
        connect_args={"options": f"-csearch_path={schema_name} -clock_timeout=5s"},
    )
    Base.metadata.create_all(engine)
    with Session(engine) as database:
        database.add_all(
            [
                Admin(username="cart-test-admin", password_hash=hash_password("admin-test-password")),
                Cliente(
                    nome="Ada", sobrenome="Lovelace", email=f"ada-{schema_name}@example.com",
                    senha_hash=hash_password("Strong-password-42"),
                ),
                Cliente(
                    nome="Grace", sobrenome="Hopper", email=f"grace-{schema_name}@example.com",
                    senha_hash=hash_password("Strong-password-42"),
                ),
                Produto(nome="GPU", preco=Decimal("10.00"), estoque=5),
            ]
        )
        database.commit()

    app = create_app()

    def override_get_db():
        with Session(engine) as database:
            yield database

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield app, engine, admin_engine, schema_name
    finally:
        engine.dispose()
        with admin_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema_name}" CASCADE'))
        admin_engine.dispose()


def _login(app, email: str) -> dict[str, str]:
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/customers/login",
            json={"email": email, "senha": "Strong-password-42"},
        )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _run_concurrently(app, operations):
    barrier = Barrier(len(operations))

    def invoke(operation):
        barrier.wait(timeout=10)
        with TestClient(app) as client:
            return operation(client)

    with ThreadPoolExecutor(max_workers=len(operations)) as pool:
        futures = [pool.submit(invoke, operation) for operation in operations]
        return [future.result(timeout=20) for future in futures]


def test_parallel_additions_cannot_exceed_stock_or_duplicate_cart_lines(postgres_cart_client):
    app, engine, _, _ = postgres_cart_client
    with Session(engine) as database:
        email = database.scalar(select(Cliente.email))
    auth = _login(app, email)
    results = _run_concurrently(
        app,
        [
            lambda client: client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 3}, headers=auth).status_code,
            lambda client: client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 3}, headers=auth).status_code,
        ],
    )

    assert sorted(results) == [200, 409]
    with Session(engine) as database:
        rows = list(database.scalars(select(CarrinhoItem)).all())
        assert len(rows) == 1
        assert rows[0].quantidade == 3
        assert len(list(database.scalars(select(Carrinho)).all())) == 1


def test_parallel_first_adds_create_one_cart_and_keep_customer_carts_isolated(postgres_cart_client):
    app, engine, _, _ = postgres_cart_client
    with Session(engine) as database:
        customers = list(database.scalars(select(Cliente).order_by(Cliente.id)).all())
    ada_auth = _login(app, customers[0].email)
    grace_auth = _login(app, customers[1].email)
    results = _run_concurrently(
        app,
        [
            lambda client: client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 1}, headers=ada_auth).status_code,
            lambda client: client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 1}, headers=grace_auth).status_code,
        ],
    )
    assert results == [200, 200]
    with TestClient(app) as client:
        ada_cart = client.get("/api/v1/cart", headers=ada_auth).json()
        grace_cart = client.get("/api/v1/cart", headers=grace_auth).json()
    assert ada_cart["id"] != grace_cart["id"]
    assert ada_cart["itens"][0]["quantidade"] == grace_cart["itens"][0]["quantidade"] == 1
    with Session(engine) as database:
        assert len(list(database.scalars(select(CarrinhoItem)).all())) == 2


def test_parallel_post_and_delete_are_serialized_without_stale_update(postgres_cart_client):
    app, engine, _, _ = postgres_cart_client
    with Session(engine) as database:
        email = database.scalar(select(Cliente.email).order_by(Cliente.id))
    auth = _login(app, email)
    with TestClient(app) as client:
        item = client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 1}, headers=auth).json()
    results = _run_concurrently(
        app,
        [
            lambda client: client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 1}, headers=auth).status_code,
            lambda client: client.delete(f"/api/v1/cart/items/{item['id']}", headers=auth).status_code,
        ],
    )
    assert sorted(results) == [200, 204]
    with TestClient(app) as client:
        final_items = client.get("/api/v1/cart", headers=auth).json()["itens"]
    assert final_items == [] or (len(final_items) == 1 and final_items[0]["quantidade"] == 1)
    with Session(engine) as database:
        assert len(list(database.scalars(select(CarrinhoItem)).all())) <= 1


def test_parallel_patch_and_delete_return_success_or_not_found_without_500(postgres_cart_client):
    app, _, _, _ = postgres_cart_client
    with Session(postgres_cart_client[1]) as database:
        email = database.scalar(select(Cliente.email).order_by(Cliente.id))
    auth = _login(app, email)
    with TestClient(app) as client:
        item = client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 1}, headers=auth).json()
    results = _run_concurrently(
        app,
        [
            lambda client: client.patch(f"/api/v1/cart/items/{item['id']}", json={"quantidade": 2}, headers=auth).status_code,
            lambda client: client.delete(f"/api/v1/cart/items/{item['id']}", headers=auth).status_code,
        ],
    )
    assert results[0] in (200, 404)
    assert results[1] == 204


def test_parallel_deletes_return_one_success_and_one_not_found(postgres_cart_client):
    app, engine, _, _ = postgres_cart_client
    with Session(engine) as database:
        email = database.scalar(select(Cliente.email).order_by(Cliente.id))
    auth = _login(app, email)
    with TestClient(app) as client:
        item = client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 1}, headers=auth).json()
    results = _run_concurrently(
        app,
        [
            lambda client: client.delete(f"/api/v1/cart/items/{item['id']}", headers=auth).status_code,
            lambda client: client.delete(f"/api/v1/cart/items/{item['id']}", headers=auth).status_code,
        ],
    )
    assert sorted(results) == [204, 404]
    with Session(engine) as database:
        assert database.scalar(select(CarrinhoItem.id)) is None


def test_cart_item_delete_does_not_deadlock_with_product_deletion(postgres_cart_client):
    app, engine, _, _ = postgres_cart_client
    with Session(engine) as database:
        email = database.scalar(select(Cliente.email).order_by(Cliente.id))
    auth = _login(app, email)
    with TestClient(app) as client:
        item = client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 1}, headers=auth).json()
        admin_response = client.post(
            "/api/v1/auth/admin/login",
            json={"username": "cart-test-admin", "password": "admin-test-password"},
        )
    admin_auth = {"Authorization": f"Bearer {admin_response.json()['access_token']}"}
    results = _run_concurrently(
        app,
        [
            lambda client: client.delete(f"/api/v1/cart/items/{item['id']}", headers=auth).status_code,
            lambda client: client.delete("/api/v1/products/1", headers=admin_auth).status_code,
        ],
    )
    assert sorted(results) == [204, 204]
    with Session(engine) as database:
        assert database.scalar(select(Produto.id)) is None
        assert database.scalar(select(CarrinhoItem.id)) is None
