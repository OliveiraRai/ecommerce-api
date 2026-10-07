from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Produto(Base):
    __tablename__ = "produtos"
    __table_args__ = (
        CheckConstraint("preco >= 0", name="ck_produtos_preco_nao_negativo"),
        CheckConstraint("estoque >= 0", name="ck_produtos_estoque_nao_negativo"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    vendedor_id: Mapped[int] = mapped_column(
        ForeignKey("vendedores.id", ondelete="RESTRICT", onupdate="RESTRICT"),
        nullable=False,
        index=True,
    )
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text)
    preco: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    estoque: Mapped[int] = mapped_column(nullable=False)

    vendedor: Mapped["Vendedor"] = relationship(back_populates="produtos")
    venda_itens: Mapped[list["VendaItem"]] = relationship(back_populates="produto")
