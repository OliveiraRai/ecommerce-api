from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.core.security import hash_password
from app.main import create_app
from app.models import Admin, Cliente, Produto, Venda, VendaItem, Vendedor


def make_client_with_products(products: list[dict] | None = None):
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
        vendedor = Vendedor(nome="Loja de teste")
        database.add(vendedor)
        database.flush()
        for product in products or []:
            database.add(Produto(vendedor_id=vendedor.id, **product))
        database.commit()
        vendor_id = vendedor.id

    def override_get_db():
        with Session(engine) as database:
            yield database

    application = create_app()
    application.dependency_overrides[get_db] = override_get_db
    client = TestClient(application, backend_options={"use_uvloop": True})
    response = client.post("/api/v1/auth/admin/login", json={"username": "admin-test", "password": "test-password-123"})
    assert response.status_code == 200
    client.headers.update({"Authorization": f"Bearer {response.json()['access_token']}"})
    return client, engine, vendor_id


def public_product(id: int, *, nome="Teclado", descricao="Mecânico", preco="299.90", estoque=5):
    return {
        "id": id,
        "nome": nome,
        "descricao": descricao,
        "preco": preco,
        "estoque": estoque,
    }


def test_list_products_returns_public_product_fields():
    client, engine, _ = make_client_with_products(
        [{"nome": "Teclado", "descricao": "Mecânico", "preco": Decimal("299.90"), "estoque": 5}]
    )
    try:
        response = client.get("/api/v1/products")
        assert response.status_code == 200
        assert response.json() == [public_product(1)]
        assert "vendedor_id" not in response.json()[0]
        assert "vendedor" not in response.json()[0]
    finally:
        client.close()
        engine.dispose()


def test_list_products_returns_empty_collection():
    client, engine, _ = make_client_with_products()
    try:
        response = client.get("/api/v1/products")
        assert response.status_code == 200
        assert response.json() == []
    finally:
        client.close()
        engine.dispose()


def test_get_product_returns_product_and_404_when_missing():
    client, engine, _ = make_client_with_products(
        [{"nome": "Teclado", "descricao": "Mecânico", "preco": Decimal("299.90"), "estoque": 5}]
    )
    try:
        response = client.get("/api/v1/products/1")
        assert response.status_code == 200
        assert response.json() == public_product(1)
        assert client.get("/api/v1/products/999").status_code == 404
    finally:
        client.close()
        engine.dispose()


def test_create_product_persists_and_rejects_invalid_or_internal_fields():
    client, engine, vendor_id = make_client_with_products()
    payload = {
        "vendedor_id": vendor_id,
        "nome": "Teclado",
        "descricao": "Mecânico",
        "preco": "299.90",
        "estoque": 5,
    }
    try:
        response = client.post("/api/v1/products", json=payload)
        assert response.status_code == 201
        assert response.json() == public_product(1)
        assert "vendedor_id" not in response.json()
        with Session(engine) as database:
            product = database.get(Produto, 1)
            assert product is not None
            assert product.nome == "Teclado"
            assert product.vendedor_id == vendor_id
            assert product.preco == Decimal("299.90")
            assert product.estoque == 5

        assert client.post("/api/v1/products", json={**payload, "id": 100}).status_code == 422
        assert client.post("/api/v1/products", json={"nome": "Sem preço"}).status_code == 422
        assert client.post("/api/v1/products", json={**payload, "preco": "-1"}).status_code == 422
    finally:
        client.close()
        engine.dispose()


def test_put_replaces_product_fields_and_returns_404_when_missing():
    client, engine, vendor_id = make_client_with_products(
        [{"nome": "Teclado", "descricao": "Mecânico", "preco": Decimal("299.90"), "estoque": 5}]
    )
    payload = {
        "vendedor_id": vendor_id,
        "nome": "Mouse",
        "descricao": None,
        "preco": "49.90",
        "estoque": 12,
    }
    try:
        response = client.put("/api/v1/products/1", json=payload)
        assert response.status_code == 200
        assert response.json() == public_product(1, nome="Mouse", descricao=None, preco="49.90", estoque=12)
        with Session(engine) as database:
            product = database.get(Produto, 1)
            assert product is not None
            assert product.nome == "Mouse"
            assert product.descricao is None
            assert product.preco == Decimal("49.90")
            assert product.estoque == 12
        assert client.put("/api/v1/products/999", json=payload).status_code == 404
        assert client.put("/api/v1/products/1", json={"nome": "Parcial"}).status_code == 422
        assert client.put("/api/v1/products/1", json={**payload, "id": 2}).status_code == 422
    finally:
        client.close()
        engine.dispose()


def test_delete_product_removes_unreferenced_and_protects_sales_history():
    client, engine, vendor_id = make_client_with_products(
        [
            {"nome": "Mouse", "descricao": None, "preco": Decimal("50.00"), "estoque": 1},
            {"nome": "Teclado", "descricao": None, "preco": Decimal("100.00"), "estoque": 1},
        ]
    )
    try:
        response = client.delete("/api/v1/products/1")
        assert response.status_code == 204
        with Session(engine) as database:
            assert database.get(Produto, 1) is None

            cliente = Cliente(
                nome="Cliente",
                sobrenome="Teste",
                email="cliente@example.com",
                senha_hash="stored-hash-only",
            )
            database.add(cliente)
            database.flush()
            venda = Venda(cliente_id=cliente.id)
            database.add(venda)
            database.flush()
            item = VendaItem(
                venda_id=venda.id,
                produto_id=2,
                quantidade=1,
                preco_unitario=Decimal("100.00"),
            )
            database.add(item)
            database.commit()
            item_id = item.id

        blocked = client.delete("/api/v1/products/2")
        assert blocked.status_code == 409
        assert client.delete("/api/v1/products/999").status_code == 404
        with Session(engine) as database:
            assert database.get(Produto, 2) is not None
            assert database.get(VendaItem, item_id) is not None
    finally:
        client.close()
        engine.dispose()
