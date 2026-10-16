from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models import Admin, Cliente, Produto, Venda, VendaItem, Vendedor


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
        vendor = Vendedor(nome="Loja de teste")
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
        database.add_all([vendor, customer, other_customer])
        database.flush()

        first_product = Produto(
            vendedor_id=vendor.id,
            nome="Mouse",
            descricao=None,
            preco=Decimal("999.99"),
            estoque=0,
        )
        second_product = Produto(
            vendedor_id=vendor.id,
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

        customer_login = client.post(
            "/api/v1/auth/customers/login",
            json={"email": "ada@example.com", "senha": "customer-password"},
        )
        assert customer_login.status_code == 200
        client.headers["Authorization"] = f"Bearer {customer_login.json()['access_token']}"
        assert client.get("/api/v1/admin/dashboard/summary").status_code == 403
    finally:
        client.close()
        engine.dispose()
