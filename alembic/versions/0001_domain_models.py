"""Create the e-commerce domain tables.

Revision ID: 0001_domain_models
Revises:
Create Date: 2026-10-07
"""

from alembic import op
import sqlalchemy as sa


revision = "0001_domain_models"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vendedores",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nome", sa.String(length=150), nullable=False),
    )
    op.create_table(
        "clientes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nome", sa.String(length=150), nullable=False),
    )
    op.create_table(
        "produtos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("vendedor_id", sa.Integer(), nullable=False),
        sa.Column("nome", sa.String(length=200), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("preco", sa.Numeric(12, 2), nullable=False),
        sa.Column("estoque", sa.Integer(), nullable=False),
        sa.CheckConstraint("preco >= 0", name="ck_produtos_preco_nao_negativo"),
        sa.CheckConstraint("estoque >= 0", name="ck_produtos_estoque_nao_negativo"),
        sa.ForeignKeyConstraint(["vendedor_id"], ["vendedores.id"], ondelete="RESTRICT", onupdate="RESTRICT"),
    )
    op.create_index("ix_produtos_vendedor_id", "produtos", ["vendedor_id"])
    op.create_table(
        "enderecos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cliente_id", sa.Integer(), nullable=False),
        sa.Column("cep", sa.CHAR(length=8), nullable=False),
        sa.Column("logradouro", sa.String(length=200), nullable=False),
        sa.Column("numero", sa.String(length=20), nullable=False),
        sa.Column("complemento", sa.String(length=100), nullable=True),
        sa.Column("bairro", sa.String(length=100), nullable=False),
        sa.Column("cidade", sa.String(length=100), nullable=False),
        sa.Column("estado", sa.CHAR(length=2), nullable=False),
        sa.CheckConstraint("cep ~ '^[0-9]{8}$'", name="ck_enderecos_cep_oito_digitos"),
        sa.ForeignKeyConstraint(["cliente_id"], ["clientes.id"], ondelete="RESTRICT", onupdate="RESTRICT"),
    )
    op.create_index("ix_enderecos_cliente_id", "enderecos", ["cliente_id"])
    op.create_table(
        "vendas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cliente_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["cliente_id"], ["clientes.id"], ondelete="RESTRICT", onupdate="RESTRICT"),
    )
    op.create_index("ix_vendas_cliente_id", "vendas", ["cliente_id"])
    op.create_table(
        "venda_itens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("venda_id", sa.Integer(), nullable=False),
        sa.Column("produto_id", sa.Integer(), nullable=False),
        sa.Column("quantidade", sa.Integer(), nullable=False),
        sa.Column("preco_unitario", sa.Numeric(12, 2), nullable=False),
        sa.CheckConstraint("quantidade > 0", name="ck_venda_itens_quantidade_positiva"),
        sa.CheckConstraint("preco_unitario >= 0", name="ck_venda_itens_preco_nao_negativo"),
        sa.ForeignKeyConstraint(["venda_id"], ["vendas.id"], ondelete="RESTRICT", onupdate="RESTRICT"),
        sa.ForeignKeyConstraint(["produto_id"], ["produtos.id"], ondelete="RESTRICT", onupdate="RESTRICT"),
    )
    op.create_index("ix_venda_itens_venda_id", "venda_itens", ["venda_id"])
    op.create_index("ix_venda_itens_produto_id", "venda_itens", ["produto_id"])


def downgrade() -> None:
    op.drop_index("ix_venda_itens_produto_id", table_name="venda_itens")
    op.drop_index("ix_venda_itens_venda_id", table_name="venda_itens")
    op.drop_table("venda_itens")
    op.drop_index("ix_vendas_cliente_id", table_name="vendas")
    op.drop_table("vendas")
    op.drop_index("ix_enderecos_cliente_id", table_name="enderecos")
    op.drop_table("enderecos")
    op.drop_index("ix_produtos_vendedor_id", table_name="produtos")
    op.drop_table("produtos")
    op.drop_table("clientes")
    op.drop_table("vendedores")
