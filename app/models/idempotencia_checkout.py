from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CheckoutIdempotency(Base):
    __tablename__ = "checkout_idempotencias"
    __table_args__ = (UniqueConstraint("cliente_id", "chave", name="uq_checkout_idempotencia_cliente_chave"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id", ondelete="CASCADE"), nullable=False)
    chave: Mapped[str] = mapped_column(String(128), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    venda_id: Mapped[int] = mapped_column(ForeignKey("vendas.id", ondelete="RESTRICT"), nullable=False)
