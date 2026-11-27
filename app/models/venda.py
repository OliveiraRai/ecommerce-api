from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Venda(Base):
    __tablename__ = "vendas"
    __table_args__ = (CheckConstraint("estado = 'confirmed'", name="ck_vendas_estado_confirmed"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    cliente_id: Mapped[int] = mapped_column(
        ForeignKey("clientes.id", ondelete="RESTRICT", onupdate="RESTRICT"),
        nullable=False,
        index=True,
    )
    data_venda: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        server_default=func.now(),
    )
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="confirmed", server_default="confirmed")

    cliente: Mapped["Cliente"] = relationship(back_populates="vendas")
    itens: Mapped[list["VendaItem"]] = relationship(back_populates="venda")
