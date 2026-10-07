from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(150), nullable=False)

    enderecos: Mapped[list["Endereco"]] = relationship(back_populates="cliente")
    vendas: Mapped[list["Venda"]] = relationship(back_populates="cliente")
