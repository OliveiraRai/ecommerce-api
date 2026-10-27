from pydantic import BaseModel, ConfigDict, Field


class CategoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    nome: str = Field(min_length=1, max_length=120)


class CategoryUpdate(CategoryCreate):
    pass


class SubcategoryCreate(CategoryCreate):
    pass


class SubcategoryUpdate(CategoryCreate):
    pass


class SubcategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    categoria_id: int
    nome: str


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    subcategorias: list[SubcategoryResponse]
