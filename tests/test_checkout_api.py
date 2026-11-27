from decimal import Decimal

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models import Admin, Carrinho, CarrinhoItem, Cliente, Produto, Venda, VendaItem, CheckoutIdempotency


@pytest.fixture
def checkout_client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all([
            Admin(username="checkout-admin", password_hash=hash_password("admin-checkout-password")),
            Cliente(nome="Ada", sobrenome="Lovelace", email="ada@example.com", senha_hash=hash_password("Strong-password-42")),
            Produto(id=1, nome="GPU", descricao=None, preco=Decimal("120.50"), estoque=5),
            Produto(id=2, nome="Mouse", descricao=None, preco=Decimal("25.00"), estoque=3),
        ])
        db.commit()
    app = create_app()
    def override():
        with Session(engine) as db:
            yield db
    app.dependency_overrides[get_db] = override
    client = TestClient(app, backend_options={"use_uvloop": True})
    token = client.post("/api/v1/auth/customers/login", json={"email": "ada@example.com", "senha": "Strong-password-42"}).json()["access_token"]
    yield client, engine, {"Authorization": f"Bearer {token}"}
    client.close()
    engine.dispose()


def test_direct_checkout_confirms_idempotently_without_changing_cart(checkout_client):
    client, engine, auth = checkout_client
    payload = {"modo": "produto", "produto_id": 1, "itens": [{"produto_id": 1, "quantidade": 1, "preco_unitario": "120.50"}], "metodo_pagamento": "pix_simulado", "resultado_pagamento": "aprovado"}
    headers = {**auth, "Idempotency-Key": "direct-key"}
    first = client.post("/api/v1/checkout", json=payload, headers=headers)
    replay = client.post("/api/v1/checkout", json=payload, headers=headers)
    assert first.status_code == replay.status_code == 201
    assert first.json() == replay.json()
    assert first.json()["estado"] == "confirmed" and first.json()["total"] == "120.50"
    with Session(engine) as db:
        assert db.scalar(select(Produto.estoque).where(Produto.id == 1)) == 4
        assert len(list(db.scalars(select(Venda)).all())) == 1
        assert len(list(db.scalars(select(VendaItem)).all())) == 1
        assert db.scalar(select(Carrinho.id)) is None
        assert len(list(db.scalars(select(CheckoutIdempotency)).all())) == 1


def test_cart_checkout_clears_only_after_success_and_rejects_changed_payload_key(checkout_client):
    client, engine, auth = checkout_client
    client.post("/api/v1/cart/items", json={"produto_id": 1, "quantidade": 2}, headers=auth)
    payload = {"modo": "carrinho", "itens": [{"produto_id": 1, "quantidade": 2, "preco_unitario": "120.50"}], "metodo_pagamento": "pix_simulado", "resultado_pagamento": "aprovado"}
    key_headers = {**auth, "Idempotency-Key": "cart-key"}
    changed = {**payload, "resultado_pagamento": "recusado"}
    assert client.post("/api/v1/checkout", json=changed, headers=key_headers).status_code == 402
    with Session(engine) as db:
        assert len(list(db.scalars(select(CarrinhoItem)).all())) == 1
        assert db.scalar(select(Produto.estoque).where(Produto.id == 1)) == 5
        assert db.scalar(select(Venda.id)) is None
    success = client.post("/api/v1/checkout", json=payload, headers=key_headers)
    assert success.status_code == 201
    assert client.post("/api/v1/checkout", json=changed, headers=key_headers).status_code == 409
    with Session(engine) as db:
        assert db.scalar(select(Produto.estoque).where(Produto.id == 1)) == 3
        assert len(list(db.scalars(select(CarrinhoItem)).all())) == 0
        assert db.scalar(select(Venda.estado)) == "confirmed"


def test_api_created_product_can_be_sold_with_stable_historical_name_and_price(checkout_client):
    client, engine, customer_auth = checkout_client
    admin_login = client.post("/api/v1/auth/admin/login", json={"username": "checkout-admin", "password": "admin-checkout-password"})
    assert admin_login.status_code == 200
    admin_auth = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}
    created = client.post("/api/v1/products", json={"nome": "API Product", "preco": "42.75", "estoque": 5}, headers=admin_auth)
    assert created.status_code == 201
    product = created.json()
    added = client.post("/api/v1/cart/items", json={"produto_id": product["id"], "quantidade": 2}, headers=customer_auth)
    assert added.status_code == 200
    payload = {
        "modo": "carrinho",
        "itens": [{"produto_id": product["id"], "quantidade": 2, "preco_unitario": "42.75"}],
        "metodo_pagamento": "pix_simulado",
        "resultado_pagamento": "aprovado",
    }
    idempotency = {**customer_auth, "Idempotency-Key": "api-created-product-sale"}
    sold = client.post("/api/v1/checkout", json=payload, headers=idempotency)
    assert sold.status_code == 201
    assert sold.json()["itens"] == [{
        "produto_id": product["id"], "nome_produto": "API Product", "quantidade": 2,
        "preco_unitario": "42.75", "subtotal": "85.50",
    }]

    update = {
        "nome": "Renamed Product", "descricao": None, "imagem_url": None, "marca_id": None,
        "preco": "99.00", "estoque": 3, "subcategoria_id": None,
    }
    assert client.put(f"/api/v1/products/{product['id']}", json=update, headers=admin_auth).status_code == 200
    replay = client.post("/api/v1/checkout", json=payload, headers=idempotency)
    assert replay.status_code == 201
    assert replay.json() == sold.json()
    admin_sale = client.get(f"/api/v1/admin/sales/{sold.json()['id']}", headers=admin_auth)
    assert admin_sale.status_code == 200
    assert admin_sale.json()["estado"] == "confirmed"
    assert admin_sale.json()["itens"][0]["nome_produto"] == "API Product"

    with Session(engine) as db:
        item = db.scalar(select(VendaItem).where(VendaItem.venda_id == sold.json()["id"]))
        assert item is not None
        assert item.produto_id == product["id"]
        assert item.quantidade == 2
        assert item.nome_produto == "API Product"
        assert item.preco_unitario == Decimal("42.75")
        assert db.scalar(select(Venda.estado).where(Venda.id == sold.json()["id"])) == "confirmed"
        assert db.scalar(select(Produto.estoque).where(Produto.id == product["id"])) == 3
        assert db.scalar(select(CarrinhoItem.id)) is None


def test_database_rejects_non_confirmed_sale_state(checkout_client):
    _, engine, _ = checkout_client
    with Session(engine) as db:
        db.add(Venda(cliente_id=1, estado="pending"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
