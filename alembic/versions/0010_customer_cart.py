"""Add customer-owned persistent carts.

Revision ID: 0010_customer_cart
Revises: 0009_managed_brands
Create Date: 2026-10-28
"""

from alembic import op
import sqlalchemy as sa


revision = "0010_customer_cart"
down_revision = "0009_managed_brands"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "carrinhos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cliente_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["cliente_id"], ["clientes.id"], name="fk_carrinhos_cliente_id_clientes",
            ondelete="CASCADE", onupdate="RESTRICT",
        ),
        sa.UniqueConstraint("cliente_id", name="uq_carrinhos_cliente_id"),
    )
    op.create_table(
        "carrinho_itens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("carrinho_id", sa.Integer(), nullable=False),
        sa.Column("produto_id", sa.Integer(), nullable=True),
        sa.Column("quantidade", sa.Integer(), nullable=False),
        sa.CheckConstraint("quantidade > 0", name="ck_carrinho_itens_quantidade_positiva"),
        sa.ForeignKeyConstraint(
            ["carrinho_id"], ["carrinhos.id"], name="fk_carrinho_itens_carrinho_id_carrinhos",
            ondelete="CASCADE", onupdate="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["produto_id"], ["produtos.id"], name="fk_carrinho_itens_produto_id_produtos",
            ondelete="SET NULL", onupdate="RESTRICT",
        ),
        sa.UniqueConstraint("carrinho_id", "produto_id", name="uq_carrinho_itens_carrinho_produto"),
    )
    op.create_index("ix_carrinho_itens_carrinho_id", "carrinho_itens", ["carrinho_id"])
    op.create_index("ix_carrinho_itens_produto_id", "carrinho_itens", ["produto_id"])


def downgrade() -> None:
    op.drop_index("ix_carrinho_itens_produto_id", table_name="carrinho_itens")
    op.drop_index("ix_carrinho_itens_carrinho_id", table_name="carrinho_itens")
    op.drop_table("carrinho_itens")
    op.drop_table("carrinhos")
