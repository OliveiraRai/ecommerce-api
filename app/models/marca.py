from sqlalchemy import Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Marca(Base):
    __tablename__ = "marcas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)

    produtos: Mapped[list["Produto"]] = relationship(back_populates="marca", passive_deletes="all")


Index("uq_marcas_nome_lower", func.lower(Marca.nome), unique=True)
