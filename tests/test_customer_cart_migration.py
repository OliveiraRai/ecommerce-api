import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


MIGRATION_PATH = Path(__file__).parents[1] / "alembic" / "versions" / "0010_customer_cart.py"
SPEC = importlib.util.spec_from_file_location("customer_cart_migration", MIGRATION_PATH)
assert SPEC is not None and SPEC.loader is not None
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


def test_customer_cart_migration_creates_integrity_rules_and_downgrades_cleanly():
    engine = create_engine("sqlite://")
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.execute(text("CREATE TABLE clientes (id INTEGER PRIMARY KEY)"))
            connection.execute(text("CREATE TABLE produtos (id INTEGER PRIMARY KEY)"))
            connection.commit()

            with Operations.context(MigrationContext.configure(connection)):
                MIGRATION.upgrade()

            inspector = inspect(connection)
            assert {"carrinhos", "carrinho_itens"} <= set(inspector.get_table_names())
            assert any(
                constraint["name"] == "uq_carrinhos_cliente_id"
                for constraint in inspector.get_unique_constraints("carrinhos")
            )
            assert any(
                constraint["name"] == "uq_carrinho_itens_carrinho_produto"
                for constraint in inspector.get_unique_constraints("carrinho_itens")
            )
            product_fk = next(
                foreign_key for foreign_key in inspector.get_foreign_keys("carrinho_itens")
                if foreign_key["constrained_columns"] == ["produto_id"]
            )
            assert product_fk["options"]["ondelete"].upper() == "SET NULL"

            connection.execute(text("INSERT INTO clientes (id) VALUES (1)"))
            connection.execute(text("INSERT INTO produtos (id) VALUES (1)"))
            connection.execute(text("INSERT INTO carrinhos (id, cliente_id) VALUES (1, 1)"))
            connection.execute(text(
                "INSERT INTO carrinho_itens (id, carrinho_id, produto_id, quantidade) VALUES (1, 1, 1, 2)"
            ))
            connection.commit()
            connection.execute(text("DELETE FROM produtos WHERE id = 1"))
            connection.commit()
            assert connection.execute(text("SELECT produto_id, quantidade FROM carrinho_itens WHERE id=1")).one() == (None, 2)
            assert connection.execute(text("PRAGMA foreign_key_check")).all() == []

            with Operations.context(MigrationContext.configure(connection)):
                MIGRATION.downgrade()
            assert not ({"carrinhos", "carrinho_itens"} & set(inspect(connection).get_table_names()))
    finally:
        engine.dispose()
