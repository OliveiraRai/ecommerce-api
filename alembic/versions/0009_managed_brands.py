"""Replace the product brand text with a managed brand relationship.

Revision ID: 0009_managed_brands
Revises: 0008_product_image_url
Create Date: 2026-10-27
"""

from alembic import op
import sqlalchemy as sa


revision = "0009_managed_brands"
down_revision = "0008_product_image_url"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "marcas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nome", sa.String(length=120), nullable=False),
    )
    op.create_index("uq_marcas_nome_lower", "marcas", [sa.text("lower(nome)")], unique=True)
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        # Rebuild products to add the FK while preserving product and sale rows.
        bind.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            with op.batch_alter_table("produtos", recreate="always") as batch_op:
                batch_op.drop_column("marca")
                batch_op.add_column(sa.Column("marca_id", sa.Integer(), nullable=True))
                batch_op.create_foreign_key(
                    "fk_produtos_marca_id_marcas", "marcas", ["marca_id"], ["id"],
                    ondelete="RESTRICT", onupdate="RESTRICT",
                )
                batch_op.create_index("ix_produtos_marca_id", ["marca_id"])
        finally:
            bind.exec_driver_sql("PRAGMA foreign_keys=ON")
    else:
        op.add_column("produtos", sa.Column("marca_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_produtos_marca_id_marcas", "produtos", "marcas", ["marca_id"], ["id"],
            ondelete="RESTRICT", onupdate="RESTRICT",
        )
        op.create_index("ix_produtos_marca_id", "produtos", ["marca_id"])
        op.drop_column("produtos", "marca")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        bind.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            with op.batch_alter_table("produtos", recreate="always") as batch_op:
                batch_op.drop_index("ix_produtos_marca_id")
                batch_op.drop_constraint("fk_produtos_marca_id_marcas", type_="foreignkey")
                batch_op.drop_column("marca_id")
                batch_op.add_column(sa.Column("marca", sa.String(length=120), nullable=True))
        finally:
            bind.exec_driver_sql("PRAGMA foreign_keys=ON")
    else:
        op.drop_index("ix_produtos_marca_id", table_name="produtos")
        op.drop_constraint("fk_produtos_marca_id_marcas", "produtos", type_="foreignkey")
        op.drop_column("produtos", "marca_id")
        op.add_column("produtos", sa.Column("marca", sa.String(length=120), nullable=True))
    op.drop_index("uq_marcas_nome_lower", table_name="marcas")
    op.drop_table("marcas")
