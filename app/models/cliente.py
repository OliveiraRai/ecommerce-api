from sqlalchemy import ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    sobrenome: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    senha_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    enderecos: Mapped[list["Endereco"]] = relationship(back_populates="cliente")
    vendas: Mapped[list["Venda"]] = relationship(back_populates="cliente")


class CustomerSession(Base):
    __tablename__ = "customer_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("clientes.id", ondelete="CASCADE"), nullable=False)
    expires_at: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    revoked_at: Mapped[int | None] = mapped_column(Integer, nullable=True)


Index("uq_clientes_email_lower", func.lower(Cliente.email), unique=True)
