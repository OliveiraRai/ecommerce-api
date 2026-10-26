"""Make products belong directly to the single store catalog.

Revision ID: 0005_remove_vendors
Revises: 0004_customer_sessions
Create Date: 2026-10-26
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_remove_vendors"
down_revision = "0004_customer_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    foreign_key = next(
        fk for fk in inspector.get_foreign_keys("produtos")
        if fk["constrained_columns"] == ["vendedor_id"]
    )

    op.drop_index("ix_produtos_vendedor_id", table_name="produtos")
    if foreign_key["name"]:
        op.drop_constraint(foreign_key["name"], "produtos", type_="foreignkey")
    if bind.dialect.name == "sqlite":
        # SQLite rebuilds this table for DROP COLUMN. Temporarily disable FK
        # enforcement because venda_itens still references the unchanged table.
        bind.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            with op.batch_alter_table("produtos") as batch_op:
                batch_op.drop_column("vendedor_id")
        finally:
            bind.exec_driver_sql("PRAGMA foreign_keys=ON")
    else:
        op.drop_column("produtos", "vendedor_id")
    op.drop_table("vendedores")


def downgrade() -> None:
    """Restore the old schema shape; seller records and product links are lost."""
    bind = op.get_bind()
    op.create_table(
        "vendedores",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nome", sa.String(length=150), nullable=False),
    )
    if bind.dialect.name == "sqlite":
        bind.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            with op.batch_alter_table("produtos") as batch_op:
                batch_op.add_column(sa.Column("vendedor_id", sa.Integer(), nullable=True))
                batch_op.create_foreign_key(
                    "fk_produtos_vendedor_id_vendedores",
                    "vendedores",
                    ["vendedor_id"],
                    ["id"],
                    ondelete="RESTRICT",
                    onupdate="RESTRICT",
                )
        finally:
            bind.exec_driver_sql("PRAGMA foreign_keys=ON")
    else:
        op.add_column("produtos", sa.Column("vendedor_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_produtos_vendedor_id_vendedores",
            "produtos",
            "vendedores",
            ["vendedor_id"],
            ["id"],
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        )
    op.create_index("ix_produtos_vendedor_id", "produtos", ["vendedor_id"])
