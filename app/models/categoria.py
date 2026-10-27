from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Categoria(Base):
    __tablename__ = "categorias"
    __table_args__ = (UniqueConstraint("nome", name="uq_categorias_nome"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)

    subcategorias: Mapped[list["Subcategoria"]] = relationship(
        back_populates="categoria", order_by="Subcategoria.nome", passive_deletes="all"
    )


class Subcategoria(Base):
    __tablename__ = "subcategorias"
    __table_args__ = (UniqueConstraint("categoria_id", "nome", name="uq_subcategorias_categoria_nome"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    categoria_id: Mapped[int] = mapped_column(
        ForeignKey("categorias.id", ondelete="RESTRICT", onupdate="RESTRICT"),
        nullable=False,
        index=True,
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)

    categoria: Mapped[Categoria] = relationship(back_populates="subcategorias")
    produtos: Mapped[list["Produto"]] = relationship(back_populates="subcategoria", passive_deletes="all")
