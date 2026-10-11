"""Add opaque revocable customer sessions."""

from alembic import op
import sqlalchemy as sa


revision = "0004_customer_sessions"
down_revision = "0003_cliente_credentials"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customer_sessions",
        sa.Column("token_hash", sa.String(length=64), primary_key=True),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.Integer(), nullable=False),
        sa.Column("revoked_at", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["customer_id"], ["clientes.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_customer_sessions_expires_at", "customer_sessions", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_customer_sessions_expires_at", table_name="customer_sessions")
    op.drop_table("customer_sessions")
