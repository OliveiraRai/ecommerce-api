"""Add customer product favorites."""

from alembic import op
import sqlalchemy as sa


revision = "0011_product_favorites"
down_revision = "0010_customer_cart"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "favoritos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cliente_id", sa.Integer(), nullable=False),
        sa.Column("produto_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["cliente_id"], ["clientes.id"], name="fk_favoritos_cliente_id_clientes",
            ondelete="CASCADE", onupdate="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["produto_id"], ["produtos.id"], name="fk_favoritos_produto_id_produtos",
            ondelete="CASCADE", onupdate="RESTRICT",
        ),
        sa.UniqueConstraint("cliente_id", "produto_id", name="uq_favoritos_cliente_produto"),
    )


def downgrade() -> None:
    op.drop_table("favoritos")
