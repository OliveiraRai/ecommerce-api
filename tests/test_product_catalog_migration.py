import os
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from dotenv import load_dotenv
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings


PROJECT_ROOT = Path(__file__).parents[1]
load_dotenv(dotenv_path=PROJECT_ROOT / ".env", override=False)


def _assert_catalog_migration_round_trip(database_url: str, monkeypatch) -> None:
    """Run real Alembic revisions against a disposable database/schema."""
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("path_separator", "os")
    engine = None
    try:
        command.upgrade(config, "0006_sale_timestamp")
        engine = create_engine(database_url)
        if engine.dialect.name == "sqlite":
            @event.listens_for(engine, "connect")
            def enable_sqlite_foreign_keys(connection, _):
                cursor = connection.cursor()
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.close()

        with engine.begin() as connection:
            # Seed real pre-0007 rows with an existing sale item and historical price.
            connection.execute(text(
                "INSERT INTO clientes (id, nome, sobrenome, email, senha_hash) "
                "VALUES (1, 'Ada', 'Lovelace', 'ada@example.com', 'stored-hash')"
            ))
            connection.execute(text(
                "INSERT INTO produtos (id, nome, descricao, preco, estoque) "
                "VALUES (10, 'Teclado', 'Mecânico', 299.90, 4)"
            ))
            connection.execute(text(
                "INSERT INTO vendas (id, cliente_id) VALUES (20, 1)"
            ))
            connection.execute(text(
                "INSERT INTO venda_itens (id, venda_id, produto_id, quantidade, preco_unitario) "
                "VALUES (30, 20, 10, 2, 279.90)"
            ))

        command.upgrade(config, "head")
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        assert {"categorias", "subcategorias"} <= tables
        product_columns = {column["name"]: column for column in inspector.get_columns("produtos")}
        assert {"marca_id", "subcategoria_id"} <= product_columns.keys()
        assert "marca" not in product_columns
        assert product_columns["marca_id"]["nullable"] is True
        assert product_columns["subcategoria_id"]["nullable"] is True
        assert "imagem_url" in product_columns
        assert product_columns["imagem_url"]["nullable"] is True
        assert str(product_columns["imagem_url"]["type"]).upper() == "TEXT"
        assert "marcas" in tables
        brand_fk = next(
            foreign_key for foreign_key in inspector.get_foreign_keys("produtos")
            if foreign_key["constrained_columns"] == ["marca_id"]
        )
        assert brand_fk["referred_table"] == "marcas"
        assert brand_fk["options"]["ondelete"].upper() == "RESTRICT"
        product_fk = next(
            foreign_key for foreign_key in inspector.get_foreign_keys("produtos")
            if foreign_key["constrained_columns"] == ["subcategoria_id"]
        )
        assert product_fk["referred_table"] == "subcategorias"
        assert product_fk["options"]["ondelete"].upper() == "RESTRICT"
        subcategory_fk = inspector.get_foreign_keys("subcategorias")[0]
        assert subcategory_fk["referred_table"] == "categorias"
        assert subcategory_fk["options"]["ondelete"].upper() == "RESTRICT"

        with engine.begin() as connection:
            product = connection.execute(text(
                "SELECT id, nome, preco, estoque, marca_id, subcategoria_id, imagem_url FROM produtos WHERE id=10"
            )).mappings().one()
            assert product["id"] == 10
            assert product["nome"] == "Teclado"
            assert Decimal(str(product["preco"])) == Decimal("299.90")
            assert product["estoque"] == 4
            assert product["marca_id"] is None
            assert product["subcategoria_id"] is None
            assert product["imagem_url"] is None
            sale = connection.execute(text(
                "SELECT id, cliente_id FROM vendas WHERE id=20"
            )).one()
            assert sale == (20, 1)
            sale_item = connection.execute(text(
                "SELECT id, venda_id, produto_id, quantidade, preco_unitario FROM venda_itens WHERE id=30"
            )).mappings().one()
            assert sale_item["id"] == 30
            assert sale_item["venda_id"] == 20
            assert sale_item["produto_id"] == 10
            assert sale_item["quantidade"] == 2
            assert Decimal(str(sale_item["preco_unitario"])) == Decimal("279.90")
            connection.execute(text("INSERT INTO categorias (id, nome) VALUES (7, 'Periféricos')"))
            connection.execute(text(
                "INSERT INTO subcategorias (id, categoria_id, nome) VALUES (8, 7, 'Teclados')"
            ))
            connection.execute(text("INSERT INTO marcas (id, nome) VALUES (5, 'Logitech')"))
            connection.execute(text(
                "UPDATE produtos SET marca_id=5, subcategoria_id=8 WHERE id=10"
            ))
            connection.execute(text(
                "UPDATE produtos SET imagem_url='https://images.example.com/keyboard.png' WHERE id=10"
            ))
            introduced_catalog_values = connection.execute(text(
                "SELECT marca_id, subcategoria_id, imagem_url FROM produtos WHERE id=10"
            )).one()
            assert introduced_catalog_values == (
                5, 8, "https://images.example.com/keyboard.png",
            )

        # Downgrading 0009 restores the old nullable text column structurally,
        # without reconstructing any discarded brand text.
        command.downgrade(config, "0008_product_image_url")
        inspector = inspect(engine)
        columns_at_0008 = {column["name"] for column in inspector.get_columns("produtos")}
        assert "marca" in columns_at_0008
        assert "marca_id" not in columns_at_0008
        assert "marcas" not in set(inspector.get_table_names())
        with engine.connect() as connection:
            assert connection.execute(text("SELECT marca FROM produtos WHERE id=10")).scalar_one() is None

        command.downgrade(config, "0006_sale_timestamp")
        inspector = inspect(engine)
        assert not ({"categorias", "subcategorias"} & set(inspector.get_table_names()))
        downgraded_columns = {column["name"] for column in inspector.get_columns("produtos")}
        assert "marca" not in downgraded_columns
        assert "subcategoria_id" not in downgraded_columns
        assert "imagem_url" not in downgraded_columns
        with engine.connect() as connection:
            product = connection.execute(text(
                "SELECT id, nome, preco, estoque FROM produtos WHERE id=10"
            )).one()
            assert product[0:2] == (10, "Teclado")
            assert Decimal(str(product[2])) == Decimal("299.90")
            assert product[3] == 4
            assert connection.execute(text(
                "SELECT id, cliente_id FROM vendas WHERE id=20"
            )).one() == (20, 1)
            downgraded_item = connection.execute(text(
                "SELECT venda_id, produto_id, quantidade, preco_unitario FROM venda_itens WHERE id=30"
            )).one()
            assert downgraded_item[:3] == (20, 10, 2)
            assert Decimal(str(downgraded_item[3])) == Decimal("279.90")
    finally:
        if engine is not None:
            engine.dispose()
        get_settings.cache_clear()


def test_product_catalog_migration_upgrade_and_downgrade_with_alembic_on_sqlite(tmp_path, monkeypatch):
    database_url = f"sqlite:///{tmp_path / 'catalog_migration.db'}"
    _assert_catalog_migration_round_trip(database_url, monkeypatch)


def test_product_catalog_migration_upgrade_and_downgrade_with_alembic_on_postgresql(monkeypatch):
    raw_test_url = os.getenv("TEST_DATABASE_URL")
    if not raw_test_url:
        pytest.skip("TEST_DATABASE_URL não está configurada para PostgreSQL")

    url = make_url(raw_test_url)
    if url.get_backend_name() != "postgresql":
        pytest.fail("TEST_DATABASE_URL deve apontar para PostgreSQL")
    if url.drivername == "postgresql":
        url = url.set(drivername="postgresql+psycopg")

    admin_engine = create_engine(url)
    schema_name = f"test_product_catalog_{uuid4().hex}"
    try:
        with admin_engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as error:
        admin_engine.dispose()
        pytest.skip(f"PostgreSQL de teste indisponível: {type(error).__name__}")

    schema_created = False
    try:
        with admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema_name}"'))
        schema_created = True
        isolated_url = url.set(query={**url.query, "options": f"-csearch_path={schema_name}"})
        _assert_catalog_migration_round_trip(str(isolated_url), monkeypatch)
    finally:
        try:
            if schema_created:
                with admin_engine.begin() as connection:
                    connection.execute(text(f'DROP SCHEMA "{schema_name}" CASCADE'))
        finally:
            admin_engine.dispose()
