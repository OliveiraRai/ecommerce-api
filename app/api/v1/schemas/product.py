from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ProductResponse(BaseModel):
    """Public representation of a product."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    descricao: str | None
    preco: Decimal = Field(ge=0)
    estoque: int = Field(ge=0)


class ProductCreate(BaseModel):
    """Fields required to create a product."""

    model_config = ConfigDict(extra="forbid")

    nome: str
    descricao: str | None = None
    preco: Decimal = Field(ge=0)
    estoque: int = Field(ge=0)


class ProductUpdate(BaseModel):
    """Complete set of product fields that can be replaced with PUT."""

    model_config = ConfigDict(extra="forbid")

    nome: str
    descricao: str | None = None
    preco: Decimal = Field(ge=0)
    estoque: int = Field(ge=0)
