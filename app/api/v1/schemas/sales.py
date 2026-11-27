from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SaleItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    produto_id: int
    nome_produto: str
    quantidade: int = Field(gt=0)
    preco_unitario: Decimal = Field(ge=0)


class SaleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cliente_id: int
    estado: Literal["confirmed"]
    itens: list[SaleItemResponse]
    data_venda: datetime | None
