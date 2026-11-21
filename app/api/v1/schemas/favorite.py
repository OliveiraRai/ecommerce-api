from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class FavoriteProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    imagem_url: str | None
    preco: Decimal


class FavoriteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    produto_id: int
    produto: FavoriteProductResponse


class FavoritePage(BaseModel):
    items: list[FavoriteResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int
