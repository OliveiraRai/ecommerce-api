from decimal import Decimal
from urllib.parse import urlsplit

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, TypeAdapter, field_validator


_http_url_adapter = TypeAdapter(AnyHttpUrl)


def _clean_image_url(value: str | None) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("imagem_url must be a string")
    normalized = value.strip()
    if not normalized:
        return None
    parts = urlsplit(normalized)
    if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
        raise ValueError("imagem_url must be an absolute HTTP or HTTPS URL with a host")
    _http_url_adapter.validate_python(normalized)
    return normalized


class CategoryInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


class BrandInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


class SubcategoryInfo(CategoryInfo):
    categoria: CategoryInfo


class ProductResponse(BaseModel):
    """Public representation of a product."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str = Field(max_length=200)
    descricao: str | None
    imagem_url: str | None
    marca_id: int | None
    marca: BrandInfo | None
    preco: Decimal = Field(ge=0)
    estoque: int = Field(ge=0)
    subcategoria_id: int | None
    subcategoria: SubcategoryInfo | None


class ProductCreate(BaseModel):
    """Fields required to create a product."""

    model_config = ConfigDict(extra="forbid")

    nome: str = Field(max_length=200)
    descricao: str | None = None
    imagem_url: str | None = None
    marca_id: int | None = Field(default=None, ge=1)
    preco: Decimal = Field(ge=0)
    estoque: int = Field(ge=0)
    subcategoria_id: int | None = Field(default=None, ge=1)

    _normalize_image_url = field_validator("imagem_url", mode="before")(_clean_image_url)


class ProductUpdate(BaseModel):
    """Complete set of product fields that can be replaced with PUT."""

    model_config = ConfigDict(extra="forbid")

    nome: str = Field(max_length=200)
    descricao: str | None = None
    imagem_url: str | None = None
    marca_id: int | None = Field(default=None, ge=1)
    preco: Decimal = Field(ge=0)
    estoque: int = Field(ge=0)
    subcategoria_id: int | None = Field(default=None, ge=1)

    _normalize_image_url = field_validator("imagem_url", mode="before")(_clean_image_url)


class ProductPage(BaseModel):
    items: list[ProductResponse]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total_items: int = Field(ge=0)
    total_pages: int = Field(ge=0)
