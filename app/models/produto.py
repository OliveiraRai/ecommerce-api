from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Produto(Base):
    __tablename__ = "produtos"
    __table_args__ = (
        CheckConstraint("preco >= 0", name="ck_produtos_preco_nao_negativo"),
        CheckConstraint("estoque >= 0", name="ck_produtos_estoque_nao_negativo"),
        Index("ix_produtos_subcategoria_id", "subcategoria_id"),
        Index("ix_produtos_marca_id", "marca_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text)
    imagem_url: Mapped[str | None] = mapped_column(Text)
    marca_id: Mapped[int | None] = mapped_column(
        ForeignKey("marcas.id", name="fk_produtos_marca_id_marcas", ondelete="RESTRICT", onupdate="RESTRICT"),
        nullable=True,
    )
    preco: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    estoque: Mapped[int] = mapped_column(nullable=False)
    subcategoria_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "subcategorias.id",
            name="fk_produtos_subcategoria_id_subcategorias",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        nullable=True,
    )

    venda_itens: Mapped[list["VendaItem"]] = relationship(back_populates="produto")
    subcategoria: Mapped["Subcategoria | None"] = relationship(back_populates="produtos")
    marca: Mapped["Marca | None"] = relationship(back_populates="produtos")
