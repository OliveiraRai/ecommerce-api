import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


MIGRATION_PATH = Path(__file__).parents[1] / "alembic" / "versions" / "0005_remove_vendors.py"
SPEC = importlib.util.spec_from_file_location("remove_vendors_migration", MIGRATION_PATH)
assert SPEC is not None and SPEC.loader is not None
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


def test_upgrade_preserves_products_sales_and_historical_prices_and_downgrade_documents_lost_links():
    engine = create_engine("sqlite://")
    try:
        with engine.connect() as connection:
            connection.execute(text("PRAGMA foreign_keys=ON"))
            connection.execute(text("CREATE TABLE vendedores (id INTEGER PRIMARY KEY, nome VARCHAR(150) NOT NULL)"))
            connection.execute(text("""
                CREATE TABLE produtos (
                    id INTEGER PRIMARY KEY,
                    vendedor_id INTEGER NOT NULL,
                    nome VARCHAR(200) NOT NULL,
                    descricao TEXT,
                    preco NUMERIC(12, 2) NOT NULL,
                    estoque INTEGER NOT NULL,
                    FOREIGN KEY(vendedor_id) REFERENCES vendedores(id) ON DELETE RESTRICT ON UPDATE RESTRICT
                )
            """))
            connection.execute(text("CREATE INDEX ix_produtos_vendedor_id ON produtos (vendedor_id)"))
            connection.execute(text("CREATE TABLE vendas (id INTEGER PRIMARY KEY)"))
            connection.execute(text("""
                CREATE TABLE venda_itens (
                    id INTEGER PRIMARY KEY,
                    venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE RESTRICT,
                    produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
                    quantidade INTEGER NOT NULL,
                    preco_unitario NUMERIC(12, 2) NOT NULL
                )
            """))
            connection.execute(text("INSERT INTO vendedores VALUES (7, 'Loja antiga')"))
            connection.execute(text("INSERT INTO produtos VALUES (11, 7, 'Mouse', NULL, 80.00, 3)"))
            connection.execute(text("INSERT INTO vendas VALUES (21)"))
            connection.execute(text("INSERT INTO venda_itens VALUES (31, 21, 11, 2, 75.00)"))
            connection.commit()

            with Operations.context(MigrationContext.configure(connection)):
                MIGRATION.upgrade()

            assert "vendedores" not in inspect(connection).get_table_names()
            assert {column["name"] for column in inspect(connection).get_columns("produtos")} == {
                "id", "nome", "descricao", "preco", "estoque"
            }
            assert connection.execute(text("SELECT id, nome, preco FROM produtos")).one() == (11, "Mouse", 80)
            assert connection.execute(text("SELECT id, produto_id, quantidade, preco_unitario FROM venda_itens")).one() == (
                31, 11, 2, 75
            )
            assert connection.execute(text("SELECT SUM(quantidade * preco_unitario) FROM venda_itens")).scalar_one() == 150

            with Operations.context(MigrationContext.configure(connection)):
                MIGRATION.downgrade()

            assert "vendedores" in inspect(connection).get_table_names()
            restored = {column["name"]: column for column in inspect(connection).get_columns("produtos")}
            assert restored["vendedor_id"]["nullable"] is True
            assert connection.execute(text("SELECT id, nome FROM produtos")).one() == (11, "Mouse")
            assert connection.execute(text("SELECT produto_id, quantidade, preco_unitario FROM venda_itens")).one() == (
                11, 2, 75
            )
    finally:
        engine.dispose()
