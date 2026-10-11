import re

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class CustomerRegistration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str = Field(min_length=1, max_length=150)
    sobrenome: str = Field(min_length=1, max_length=150)
    email: str = Field(min_length=1, max_length=320)
    senha: str = Field(min_length=1, max_length=1024)
    confirmar_senha: str = Field(min_length=1, max_length=1024)

    @field_validator("nome", "sobrenome")
    @classmethod
    def trim_required_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Field cannot be blank")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not value:
            raise ValueError("Email cannot be blank")
        return value

    @field_validator("senha")
    @classmethod
    def validate_password_policy(cls, value: str) -> str:
        if len(value) < 12:
            raise ValueError("Password must contain at least 12 characters")
        if not re.search(r"[A-Z]", value):
            raise ValueError("Password must contain an uppercase letter")
        if not re.search(r"[a-z]", value):
            raise ValueError("Password must contain a lowercase letter")
        if not re.search(r"[^A-Za-z0-9]", value):
            raise ValueError("Password must contain a special character")
        return value

    @model_validator(mode="after")
    def passwords_match(self):
        if self.senha != self.confirmar_senha:
            raise ValueError("Passwords do not match")
        return self


class CustomerResponse(BaseModel):
    id: int
    nome: str
    sobrenome: str
    email: str


class CustomerLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=1, max_length=320)
    senha: str = Field(min_length=1, max_length=1024)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not value:
            raise ValueError("Email cannot be blank")
        return value


class CustomerToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class CustomerIdentity(CustomerResponse):
    role: str = "customer"
