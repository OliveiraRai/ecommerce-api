from decimal import Decimal
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models import Admin, Cliente, Produto, Venda, VendaItem


def make_dashboard_client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_sqlite_foreign_keys(connection, _):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    with Session(engine) as database:
        database.add(Admin(id=1, username="admin-test", password_hash=hash_password("test-password-123")))
        customer = Cliente(
            nome="Ada",
            sobrenome="Lovelace",
            email="ada@example.com",
            senha_hash=hash_password("customer-password"),
        )
        other_customer = Cliente(
            nome="Grace",
            sobrenome="Hopper",
            email="grace@example.com",
            senha_hash="stored-hash-only",
        )
        database.add_all([customer, other_customer])
        database.flush()

        first_product = Produto(
            nome="Mouse",
            descricao=None,
            preco=Decimal("999.99"),
            estoque=0,
        )
        second_product = Produto(
            nome="Teclado",
            descricao=None,
            preco=Decimal("0.01"),
            estoque=5,
        )
        database.add_all([first_product, second_product])
        database.flush()

        first_sale = Venda(cliente_id=customer.id)
        second_sale = Venda(cliente_id=other_customer.id)
        database.add_all([first_sale, second_sale])
        database.flush()
        database.add_all(
            [
                VendaItem(
                    venda_id=first_sale.id,
                    produto_id=first_product.id,
                    quantidade=3,
                    preco_unitario=Decimal("0.10"),
                ),
                VendaItem(
                    venda_id=first_sale.id,
                    produto_id=second_product.id,
                    quantidade=2,
                    preco_unitario=Decimal("0.20"),
                ),
                VendaItem(
                    venda_id=second_sale.id,
                    produto_id=first_product.id,
                    quantidade=1,
                    preco_unitario=Decimal("0.03"),
                ),
            ]
        )
        database.commit()

        # A later catalog price change must not affect historical revenue.
        first_product.preco = Decimal("1234.56")
        database.commit()

    def override_get_db():
        with Session(engine) as database:
            yield database

    application = create_app()
    application.dependency_overrides[get_db] = override_get_db
    client = TestClient(application, backend_options={"use_uvloop": True})
    login = client.post(
        "/api/v1/auth/admin/login",
        json={"username": "admin-test", "password": "test-password-123"},
    )
    assert login.status_code == 200
    client.headers.update({"Authorization": f"Bearer {login.json()['access_token']}"})
    return client, engine


def test_dashboard_summary_counts_every_product_and_sale_and_uses_historical_prices():
    client, engine = make_dashboard_client()
    try:
        response = client.get("/api/v1/admin/dashboard/summary")

        assert response.status_code == 200
        assert set(response.json()) == {"total_products", "total_sales", "total_revenue"}
        assert response.json()["total_products"] == 2
        assert response.json()["total_sales"] == 2
        assert response.json()["total_revenue"] == "0.73"
        assert Decimal(response.json()["total_revenue"]) == Decimal("0.73")
        assert response.json() == {
            "total_products": 2,
            "total_sales": 2,
            "total_revenue": "0.73",
        }
    finally:
        client.close()
        engine.dispose()


def test_dashboard_summary_returns_zeroes_when_database_is_empty():
    client, engine = make_dashboard_client()
    try:
        with Session(engine) as database:
            database.query(VendaItem).delete()
            database.query(Venda).delete()
            database.query(Produto).delete()
            database.commit()

        response = client.get("/api/v1/admin/dashboard/summary")

        assert response.status_code == 200
        assert response.json() == {
            "total_products": 0,
            "total_sales": 0,
            "total_revenue": "0.00",
        }
    finally:
        client.close()
        engine.dispose()


def test_dashboard_summary_requires_administrator_access():
    client, engine = make_dashboard_client()
    try:
        client.headers.pop("Authorization")
        assert client.get("/api/v1/admin/dashboard/summary").status_code == 401
        assert client.get("/api/v1/admin/dashboard/recent-sales").status_code == 401

        customer_login = client.post(
            "/api/v1/auth/customers/login",
            json={"email": "ada@example.com", "senha": "customer-password"},
        )
        assert customer_login.status_code == 200
        client.headers["Authorization"] = f"Bearer {customer_login.json()['access_token']}"
        assert client.get("/api/v1/admin/dashboard/summary").status_code == 403
        assert client.get("/api/v1/admin/dashboard/recent-sales").status_code == 403
    finally:
        client.close()
        engine.dispose()


def test_recent_sales_are_ordered_by_sale_date_then_id_and_limited():
    client, engine = make_dashboard_client()
    try:
        with Session(engine) as database:
            sales = [database.get(Venda, sale_id) for sale_id in (1, 2)]
            sales[0].data_venda = datetime(2026, 10, 20, tzinfo=timezone.utc)
            sales[1].data_venda = datetime(2024, 1, 1, tzinfo=timezone.utc)
            same_date = datetime(2025, 6, 1, tzinfo=timezone.utc)
            extra_sales = [Venda(cliente_id=2, data_venda=same_date) for _ in range(4)]
            database.add_all(extra_sales)
            database.flush()
            for sale in extra_sales:
                sale.data_venda = same_date
            database.commit()
            extra_ids = [sale.id for sale in extra_sales]

        response = client.get("/api/v1/admin/dashboard/recent-sales")
        assert response.status_code == 200
        payload = response.json()
        assert [sale["id"] for sale in payload] == [1, *reversed(extra_ids)]
        assert payload[0]["cliente_id"] == 1
        assert payload[0]["data_venda"].startswith("2026-10-20T")
        assert payload[0]["itens"] == [
            {"id": 1, "produto_id": 1, "quantidade": 3, "preco_unitario": "0.10"},
            {"id": 2, "produto_id": 2, "quantidade": 2, "preco_unitario": "0.20"},
        ]
        limited = client.get("/api/v1/admin/dashboard/recent-sales?limit=3")
        assert [sale["id"] for sale in limited.json()] == [1, *reversed(extra_ids[-2:])]
        assert client.get("/api/v1/admin/dashboard/recent-sales?limit=2").status_code == 422
        assert client.get("/api/v1/admin/dashboard/recent-sales?limit=6").status_code == 422

        # The regular full sales list keeps its existing ID-descending behavior.
        all_sales = client.get("/api/v1/admin/sales")
        assert [sale["id"] for sale in all_sales.json()] == sorted([1, 2, *extra_ids], reverse=True)
    finally:
        client.close()
        engine.dispose()


def test_recent_sales_returns_empty_list_when_there_are_no_sales():
    client, engine = make_dashboard_client()
    try:
        with Session(engine) as database:
            database.query(VendaItem).delete()
            database.query(Venda).delete()
            database.commit()

        response = client.get("/api/v1/admin/dashboard/recent-sales")
        assert response.status_code == 200
        assert response.json() == []
    finally:
        client.close()
        engine.dispose()


def test_admin_sales_list_and_detail_return_historical_items_and_empty_state():
    client, engine = make_dashboard_client()
    try:
        response = client.get("/api/v1/admin/sales")
        assert response.status_code == 200
        assert [sale["id"] for sale in response.json()] == [2, 1]
        first_sale = client.get("/api/v1/admin/sales/1")
        assert first_sale.status_code == 200
        first_sale_payload = first_sale.json()
        assert isinstance(datetime.fromisoformat(first_sale_payload.pop("data_venda")), datetime)
        assert first_sale_payload == {
            "id": 1,
            "cliente_id": 1,
            "itens": [
                {"id": 1, "produto_id": 1, "quantidade": 3, "preco_unitario": "0.10"},
                {"id": 2, "produto_id": 2, "quantidade": 2, "preco_unitario": "0.20"},
            ],
        }
        assert client.get("/api/v1/admin/sales/999").status_code == 404

        with Session(engine) as database:
            database.query(VendaItem).delete()
            database.query(Venda).delete()
            database.commit()
        assert client.get("/api/v1/admin/sales").json() == []
    finally:
        client.close()
        engine.dispose()


def test_admin_sales_require_admin_role():
    client, engine = make_dashboard_client()
    try:
        client.headers.pop("Authorization")
        assert client.get("/api/v1/admin/sales").status_code == 401
        customer_login = client.post(
            "/api/v1/auth/customers/login",
            json={"email": "ada@example.com", "senha": "customer-password"},
        )
        assert customer_login.status_code == 200
        client.headers["Authorization"] = f"Bearer {customer_login.json()['access_token']}"
        assert client.get("/api/v1/admin/sales").status_code == 403
        assert client.get("/api/v1/admin/sales/1").status_code == 403
    finally:
        client.close()
        engine.dispose()
