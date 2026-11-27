"""Add confirmed sale state and checkout idempotency records."""

from alembic import op
import sqlalchemy as sa

revision = "0012_simulated_checkout"
down_revision = "0011_product_favorites"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vendas", sa.Column("estado", sa.String(length=20), server_default="confirmed", nullable=False))
    op.create_table(
        "checkout_idempotencias",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cliente_id", sa.Integer(), nullable=False),
        sa.Column("chave", sa.String(length=128), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("venda_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["cliente_id"], ["clientes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["venda_id"], ["vendas.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("cliente_id", "chave", name="uq_checkout_idempotencia_cliente_chave"),
    )


def downgrade() -> None:
    op.drop_table("checkout_idempotencias")
    op.drop_column("vendas", "estado")
