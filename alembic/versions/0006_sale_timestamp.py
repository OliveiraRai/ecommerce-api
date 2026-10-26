"""Add a nullable timestamp to sales, defaulting new rows to now.

Revision ID: 0006_sale_timestamp
Revises: 0005_remove_vendors
Create Date: 2026-10-26
"""

from alembic import op
import sqlalchemy as sa


revision = "0006_sale_timestamp"
down_revision = "0005_remove_vendors"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    column = sa.Column(
        "data_venda",
        sa.DateTime(timezone=True),
        nullable=True,
        server_default=sa.func.now(),
    )
    if bind.dialect.name == "sqlite":
        # Rebuild to install a non-constant default while preserving old rows.
        # venda_itens has an FK to vendas, so disable checks during the rebuild.
        bind.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            with op.batch_alter_table("vendas", recreate="always") as batch_op:
                batch_op.add_column(column)
        finally:
            bind.exec_driver_sql("PRAGMA foreign_keys=ON")
    else:
        op.add_column("vendas", column)

    # Old rows have no trustworthy timestamp. Do not mislabel them with the
    # migration time; the server default applies only to subsequently inserted sales.
    op.execute(sa.text("UPDATE vendas SET data_venda = NULL"))


def downgrade() -> None:
    """Drop the timestamp column; timestamps recorded after upgrade are lost."""
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        bind.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            with op.batch_alter_table("vendas", recreate="always") as batch_op:
                batch_op.drop_column("data_venda")
        finally:
            bind.exec_driver_sql("PRAGMA foreign_keys=ON")
    else:
        op.drop_column("vendas", "data_venda")
