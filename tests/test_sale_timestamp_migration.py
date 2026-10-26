import importlib.util
from datetime import datetime
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


MIGRATION_PATH = Path(__file__).parents[1] / "alembic" / "versions" / "0006_sale_timestamp.py"
SPEC = importlib.util.spec_from_file_location("sale_timestamp_migration", MIGRATION_PATH)
assert SPEC is not None and SPEC.loader is not None
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


def test_timestamp_migration_leaves_legacy_sales_undated_and_defaults_new_sales():
    engine = create_engine("sqlite://")
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.execute(text("CREATE TABLE clientes (id INTEGER PRIMARY KEY)"))
            connection.execute(text("CREATE TABLE vendas (id INTEGER PRIMARY KEY, cliente_id INTEGER NOT NULL REFERENCES clientes(id))"))
            connection.execute(text("CREATE TABLE venda_itens (id INTEGER PRIMARY KEY, venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE RESTRICT)"))
            connection.execute(text("INSERT INTO clientes VALUES (1)"))
            connection.execute(text("INSERT INTO vendas VALUES (10, 1)"))
            connection.execute(text("INSERT INTO venda_itens VALUES (100, 10)"))
            connection.commit()

            with Operations.context(MigrationContext.configure(connection)):
                MIGRATION.upgrade()

            legacy_date = connection.execute(text("SELECT data_venda FROM vendas WHERE id = 10")).scalar_one()
            assert legacy_date is None
            assert {column["name"] for column in inspect(connection).get_columns("vendas")} == {
                "id", "cliente_id", "data_venda"
            }
            assert connection.execute(text("PRAGMA foreign_key_check")).all() == []

            connection.execute(text("INSERT INTO vendas (id, cliente_id) VALUES (11, 1)"))
            new_date = connection.execute(text("SELECT data_venda FROM vendas WHERE id = 11")).scalar_one()
            assert new_date is not None
            assert datetime.fromisoformat(new_date)
            timestamp_column = next(
                column for column in inspect(connection).get_columns("vendas")
                if column["name"] == "data_venda"
            )
            assert timestamp_column["nullable"] is True
            assert timestamp_column["default"] is not None
            assert connection.execute(text("SELECT venda_id FROM venda_itens WHERE id = 100")).scalar_one() == 10

            with Operations.context(MigrationContext.configure(connection)):
                MIGRATION.downgrade()

            assert "data_venda" not in {column["name"] for column in inspect(connection).get_columns("vendas")}
            assert connection.execute(text("SELECT venda_id FROM venda_itens WHERE id = 100")).scalar_one() == 10
            assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    finally:
        engine.dispose()
