"""Add customer identity and password hash fields.

Revision ID: 0003_cliente_credentials
Revises: 0002_admin_auth
Create Date: 2026-10-10
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_cliente_credentials"
down_revision = "0002_admin_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    existing_customers = connection.execute(
        sa.text("SELECT count(*) FROM clientes")
    ).scalar_one()
    if existing_customers:
        raise RuntimeError(
            "Migration 0003_cliente_credentials canceled: clientes has existing "
            f"rows ({existing_customers}). Provide real sobrenome, email, and "
            "senha_hash values through an approved data migration before making "
            "these fields required. No customer data was changed."
        )

    op.add_column("clientes", sa.Column("sobrenome", sa.String(length=150), nullable=False))
    op.add_column("clientes", sa.Column("email", sa.String(length=320), nullable=False))
    op.add_column("clientes", sa.Column("senha_hash", sa.String(length=255), nullable=False))
    op.create_index(
        "uq_clientes_email_lower",
        "clientes",
        [sa.text("lower(email)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_clientes_email_lower", table_name="clientes")
    op.drop_column("clientes", "senha_hash")
    op.drop_column("clientes", "email")
    op.drop_column("clientes", "sobrenome")
