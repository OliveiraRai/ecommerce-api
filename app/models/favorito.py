from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Favorito(Base):
    __tablename__ = "favoritos"
    __table_args__ = (UniqueConstraint("cliente_id", "produto_id", name="uq_favoritos_cliente_produto"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    cliente_id: Mapped[int] = mapped_column(
        ForeignKey("clientes.id", name="fk_favoritos_cliente_id_clientes", ondelete="CASCADE", onupdate="RESTRICT"),
        nullable=False,
    )
    produto_id: Mapped[int] = mapped_column(
        ForeignKey("produtos.id", name="fk_favoritos_produto_id_produtos", ondelete="CASCADE", onupdate="RESTRICT"),
        nullable=False,
    )

    cliente: Mapped["Cliente"] = relationship(back_populates="favoritos")
    produto: Mapped["Produto"] = relationship(back_populates="favoritos")
