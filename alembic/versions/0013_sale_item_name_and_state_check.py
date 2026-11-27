"""Store historical product names and constrain sales to confirmed state."""

from alembic import op
import sqlalchemy as sa


revision = "0013_sale_item_name&state_check"
down_revision = "0012_simulated_checkout"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    op.add_column("venda_itens", sa.Column("nome_produto", sa.String(length=200), nullable=True))
    if bind.dialect.name == "sqlite":
        op.execute(sa.text(
            "UPDATE venda_itens SET nome_produto = "
            "(SELECT produtos.nome FROM produtos WHERE produtos.id = venda_itens.produto_id)"
        ))
    else:
        op.execute(sa.text(
            "UPDATE venda_itens SET nome_produto = produtos.nome "
            "FROM produtos WHERE produtos.id = venda_itens.produto_id"
        ))
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("venda_itens", recreate="always") as batch_op:
            batch_op.alter_column("nome_produto", existing_type=sa.String(length=200), nullable=False)
        bind.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            with op.batch_alter_table("vendas", recreate="always") as batch_op:
                batch_op.create_check_constraint("ck_vendas_estado_confirmed", "estado = 'confirmed'")
        finally:
            bind.exec_driver_sql("PRAGMA foreign_keys=ON")
    else:
        op.alter_column("venda_itens", "nome_produto", existing_type=sa.String(length=200), nullable=False)
        op.create_check_constraint("ck_vendas_estado_confirmed", "vendas", "estado = 'confirmed'")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        bind.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            with op.batch_alter_table("vendas", recreate="always") as batch_op:
                batch_op.drop_constraint("ck_vendas_estado_confirmed", type_="check")
        finally:
            bind.exec_driver_sql("PRAGMA foreign_keys=ON")
        with op.batch_alter_table("venda_itens", recreate="always") as batch_op:
            batch_op.drop_column("nome_produto")
    else:
        op.drop_constraint("ck_vendas_estado_confirmed", "vendas", type_="check")
        op.drop_column("venda_itens", "nome_produto")
