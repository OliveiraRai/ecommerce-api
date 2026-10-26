import os
from datetime import datetime
from uuid import uuid4
from decimal import Decimal
from dotenv import load_dotenv

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import Cliente, Endereco, Produto, Venda, VendaItem

load_dotenv()

@pytest.fixture(scope="module")
def engine():
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Defina TEST_DATABASE_URL para executar os testes PostgreSQL")
    if not database_url.startswith("postgresql"):
        pytest.fail("TEST_DATABASE_URL deve apontar para PostgreSQL")
    admin_engine = create_engine(database_url)
    schema_name = f"test_{uuid4().hex}"
    with admin_engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema_name}"'))
    test_engine = create_engine(
        database_url,
        connect_args={"options": f"-csearch_path={schema_name}"},
    )
    Base.metadata.create_all(test_engine)
    yield test_engine
    Base.metadata.drop_all(test_engine)
    test_engine.dispose()
    with admin_engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema_name}" CASCADE'))
    admin_engine.dispose()


def test_complete_purchase_persists_and_preserves_historical_price(engine):
    with Session(engine) as session:
        cliente = Cliente(
            nome="Ada",
            sobrenome="Lovelace",
            email="john.doe@example.com",
            senha_hash="scrypt-hash-value",
        )
        produto = Produto(nome="Teclado", preco=Decimal("299.90"), estoque=5)
        endereco = Endereco(
            cliente=cliente,
            cep="01310930",
            logradouro="Avenida Paulista",
            numero="1000",
            bairro="Bela Vista",
            cidade="São Paulo",
            estado="SP",
        )
        venda = Venda(cliente=cliente)
        item = VendaItem(venda=venda, produto=produto, quantidade=2, preco_unitario=Decimal("279.90"))
        session.add_all([cliente, produto, endereco, venda, item])
        session.commit()

        assert endereco.cliente_id == cliente.id
        assert venda.cliente_id == cliente.id
        assert venda.data_venda is not None
        assert isinstance(venda.data_venda, datetime)
        assert item.venda_id == venda.id
        assert item.produto_id == produto.id
        assert venda.itens == [item]
        assert cliente.enderecos == [endereco]
        assert cliente.vendas == [venda]

        produto.preco = Decimal("349.90")
        session.commit()
        session.refresh(item)
        assert item.preco_unitario == Decimal("279.90")


def test_customer_fields_are_required_and_id_is_generated(engine):
    with Session(engine) as session:
        cliente = Cliente(
            nome="Grace",
            sobrenome="Hopper",
            email="grace@example.com",
            senha_hash="stored-hash-only",
        )
        session.add(cliente)
        session.commit()
        assert cliente.id is not None
        assert cliente.senha_hash == "stored-hash-only"
        assert "senha" not in Cliente.__table__.columns

    for missing_field in ("nome", "sobrenome", "email", "senha_hash"):
        with Session(engine) as session:
            cliente_data = {
                "nome": "Grace",
                "sobrenome": "Hopper",
                "email": f"grace-{missing_field}@example.com",
                "senha_hash": "stored-hash-only",
            }
            cliente_data[missing_field] = None
            session.add(Cliente(**cliente_data))
            with pytest.raises(IntegrityError):
                session.commit()
            session.rollback()


def test_customer_email_is_unique_case_insensitively(engine):
    with Session(engine) as session:
        session.add(
            Cliente(
                nome="Ada",
                sobrenome="Lovelace",
                email="ada@example.com",
                senha_hash="stored-hash-only",
            )
        )
        session.commit()
        session.add(
            Cliente(
                nome="Augusta",
                sobrenome="King",
                email="ADA@EXAMPLE.COM",
                senha_hash="another-hash",
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()


@pytest.mark.parametrize(
    "produto_data",
    [
        {"nome": "Preço inválido", "preco": Decimal("-0.01"), "estoque": 0},
        {"nome": "Estoque inválido", "preco": Decimal("1.00"), "estoque": -1},
    ],
)
def test_product_checks_are_enforced_by_postgresql(engine, produto_data):
    with Session(engine) as session:
        session.add(Produto(**produto_data))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()


def test_item_checks_and_foreign_keys_are_enforced_by_postgresql(engine):
    with Session(engine) as session:
        with pytest.raises(IntegrityError):
            session.add(VendaItem(venda_id=999999, produto_id=999999, quantidade=0, preco_unitario=Decimal("-1.00")))
            session.commit()
        session.rollback()


def test_restrict_deletes_preserve_sales_history(engine):
    with Session(engine) as session:
        cliente = Cliente(
            nome="Cliente",
            sobrenome="Protegido",
            email="protegido@example.com",
            senha_hash="stored-hash-only",
        )
        produto = Produto(nome="Mouse", preco=Decimal("50.00"), estoque=1)
        venda = Venda(cliente=cliente)
        item = VendaItem(venda=venda, produto=produto, quantidade=1, preco_unitario=Decimal("50.00"))
        session.add_all([cliente, produto, venda, item])
        session.commit()

        session.delete(produto)
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        cliente = session.get(Cliente, cliente.id)
        session.delete(cliente)
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        assert session.get(Venda, venda.id) is not None
        assert session.get(VendaItem, item.id) is not None
