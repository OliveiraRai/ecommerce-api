from sqlalchemy import CheckConstraint, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Carrinho(Base):
    __tablename__ = "carrinhos"
    __table_args__ = (UniqueConstraint("cliente_id", name="uq_carrinhos_cliente_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    cliente_id: Mapped[int] = mapped_column(
        ForeignKey("clientes.id", name="fk_carrinhos_cliente_id_clientes", ondelete="CASCADE", onupdate="RESTRICT"),
        nullable=False,
    )

    cliente: Mapped["Cliente"] = relationship(back_populates="carrinho")
    itens: Mapped[list["CarrinhoItem"]] = relationship(
        back_populates="carrinho", cascade="all, delete-orphan", passive_deletes=True
    )


class CarrinhoItem(Base):
    __tablename__ = "carrinho_itens"
    __table_args__ = (
        CheckConstraint("quantidade > 0", name="ck_carrinho_itens_quantidade_positiva"),
        UniqueConstraint("carrinho_id", "produto_id", name="uq_carrinho_itens_carrinho_produto"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    carrinho_id: Mapped[int] = mapped_column(
        ForeignKey("carrinhos.id", name="fk_carrinho_itens_carrinho_id_carrinhos", ondelete="CASCADE", onupdate="RESTRICT"),
        nullable=False,
        index=True,
    )
    produto_id: Mapped[int | None] = mapped_column(
        ForeignKey("produtos.id", name="fk_carrinho_itens_produto_id_produtos", ondelete="SET NULL", onupdate="RESTRICT"),
        nullable=True,
        index=True,
    )
    quantidade: Mapped[int] = mapped_column(nullable=False)

    carrinho: Mapped["Carrinho"] = relationship(back_populates="itens")
    produto: Mapped["Produto | None"] = relationship(back_populates="carrinho_itens")
