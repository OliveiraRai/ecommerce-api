from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class SaleItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    produto_id: int
    quantidade: int = Field(gt=0)
    preco_unitario: Decimal = Field(ge=0)


class SaleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cliente_id: int
    itens: list[SaleItemResponse]
    data_venda: datetime | None
