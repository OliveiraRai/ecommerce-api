from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class CartItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    produto_id: int = Field(ge=1, strict=True)
    quantidade: int = Field(gt=0, strict=True)


class CartItemQuantity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantidade: int = Field(gt=0, strict=True)


class CartProductResponse(BaseModel):
    id: int
    nome: str
    imagem_url: str | None
    preco: Decimal = Field(ge=0)
    estoque: int = Field(ge=0)


class CartItemResponse(BaseModel):
    id: int
    produto_id: int | None
    produto: CartProductResponse | None
    quantidade: int = Field(gt=0)
    subtotal: Decimal | None
    disponivel: bool


class CartResponse(BaseModel):
    id: int | None
    itens: list[CartItemResponse]
