"""Add the single administrative identity and revocable sessions."""

from alembic import op
import sqlalchemy as sa


revision = "0002_admin_auth"
down_revision = "0001_domain_models"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admins",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=120), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_admins_singleton"),
    )
    op.create_table(
        "admin_sessions",
        sa.Column("token_hash", sa.String(length=64), primary_key=True),
        sa.Column("admin_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.Integer(), nullable=False),
        sa.Column("revoked_at", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["admin_id"], ["admins.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_admin_sessions_expires_at", "admin_sessions", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_admin_sessions_expires_at", table_name="admin_sessions")
    op.drop_table("admin_sessions")
    op.drop_table("admins")
