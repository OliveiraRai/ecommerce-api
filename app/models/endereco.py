from sqlalchemy import CHAR, CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Endereco(Base):
    __tablename__ = "enderecos"
    __table_args__ = (
        CheckConstraint("cep ~ '^[0-9]{8}$'", name="ck_enderecos_cep_oito_digitos").ddl_if(
            dialect="postgresql"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    cliente_id: Mapped[int] = mapped_column(
        ForeignKey("clientes.id", ondelete="RESTRICT", onupdate="RESTRICT"),
        nullable=False,
        index=True,
    )
    cep: Mapped[str] = mapped_column(CHAR(8), nullable=False)
    logradouro: Mapped[str] = mapped_column(String(200), nullable=False)
    numero: Mapped[str] = mapped_column(String(20), nullable=False)
    complemento: Mapped[str | None] = mapped_column(String(100))
    bairro: Mapped[str] = mapped_column(String(100), nullable=False)
    cidade: Mapped[str] = mapped_column(String(100), nullable=False)
    estado: Mapped[str] = mapped_column(CHAR(2), nullable=False)

    cliente: Mapped["Cliente"] = relationship(back_populates="enderecos")
