"""Add catalog categories, subcategories and optional product brand.

Revision ID: 0007_product_catalog
Revises: 0006_sale_timestamp
Create Date: 2026-10-27
"""

from alembic import op
import sqlalchemy as sa


revision = "0007_product_catalog"
down_revision = "0006_sale_timestamp"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "categorias",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nome", sa.String(length=120), nullable=False),
        sa.UniqueConstraint("nome", name="uq_categorias_nome"),
    )
    op.create_table(
        "subcategorias",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("categoria_id", sa.Integer(), nullable=False),
        sa.Column("nome", sa.String(length=120), nullable=False),
        sa.ForeignKeyConstraint(
            ["categoria_id"], ["categorias.id"], ondelete="RESTRICT", onupdate="RESTRICT"
        ),
        sa.UniqueConstraint("categoria_id", "nome", name="uq_subcategorias_categoria_nome"),
    )
    op.create_index("ix_subcategorias_categoria_id", "subcategorias", ["categoria_id"])
    op.add_column("produtos", sa.Column("marca", sa.String(length=120), nullable=True))
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        # SQLite cannot add a foreign-key constraint with ALTER TABLE ADD CONSTRAINT.
        # Rebuild the table in Alembic batch mode while leaving existing sale-item
        # rows and their foreign keys intact.
        bind.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            with op.batch_alter_table("produtos", recreate="always") as batch_op:
                batch_op.add_column(sa.Column("subcategoria_id", sa.Integer(), nullable=True))
                batch_op.create_foreign_key(
                    "fk_produtos_subcategoria_id_subcategorias",
                    "subcategorias",
                    ["subcategoria_id"],
                    ["id"],
                    ondelete="RESTRICT",
                    onupdate="RESTRICT",
                )
        finally:
            bind.exec_driver_sql("PRAGMA foreign_keys=ON")
    else:
        op.add_column("produtos", sa.Column("subcategoria_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_produtos_subcategoria_id_subcategorias",
            "produtos",
            "subcategorias",
            ["subcategoria_id"],
            ["id"],
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        )
    op.create_index("ix_produtos_subcategoria_id", "produtos", ["subcategoria_id"])


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_index("ix_produtos_subcategoria_id", table_name="produtos")
    if bind.dialect.name == "sqlite":
        # Rebuild products with foreign-key enforcement disabled because sale items
        # still point to the same products table.
        bind.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            with op.batch_alter_table("produtos", recreate="always") as batch_op:
                batch_op.drop_column("subcategoria_id")
                batch_op.drop_column("marca")
        finally:
            bind.exec_driver_sql("PRAGMA foreign_keys=ON")
    else:
        op.drop_column("produtos", "subcategoria_id")
        op.drop_column("produtos", "marca")
    op.drop_index("ix_subcategorias_categoria_id", table_name="subcategorias")
    op.drop_table("subcategorias")
    op.drop_table("categorias")
