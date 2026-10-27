from pydantic import BaseModel, ConfigDict, Field


class BrandCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    nome: str = Field(min_length=1, max_length=120)


class BrandUpdate(BrandCreate):
    pass


class BrandResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
