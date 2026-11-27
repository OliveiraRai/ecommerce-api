from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CheckoutLineIntent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    produto_id: int = Field(ge=1, strict=True)
    quantidade: int = Field(gt=0, strict=True)
    preco_unitario: Decimal = Field(ge=0)


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    modo: Literal["produto", "carrinho"]
    produto_id: int | None = Field(default=None, ge=1, strict=True)
    itens: list[CheckoutLineIntent] = Field(default_factory=list, max_length=100)
    metodo_pagamento: Literal["pix_simulado", "cartao_simulado"]
    resultado_pagamento: Literal["aprovado", "recusado"]


class CheckoutItemResponse(BaseModel):
    produto_id: int
    nome_produto: str
    quantidade: int
    preco_unitario: Decimal
    subtotal: Decimal


class CheckoutResponse(BaseModel):
    id: int
    data_venda: datetime | None
    estado: Literal["confirmed"]
    itens: list[CheckoutItemResponse]
    total: Decimal
