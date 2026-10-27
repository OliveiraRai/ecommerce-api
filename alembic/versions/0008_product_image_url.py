"""Add optional external image URL to products.

Revision ID: 0008_product_image_url
Revises: 0007_product_catalog
Create Date: 2026-10-27
"""

from alembic import op
import sqlalchemy as sa


revision = "0008_product_image_url"
down_revision = "0007_product_catalog"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("produtos", sa.Column("imagem_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("produtos", "imagem_url")
