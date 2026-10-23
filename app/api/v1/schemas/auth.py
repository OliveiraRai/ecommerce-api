from pydantic import BaseModel, ConfigDict, Field


class AdminLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=1024)
    remember_me: bool = False


class AdminIdentity(BaseModel):
    id: int
    username: str
    role: str = "admin"


class AdminToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
