from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class DashboardSummary(BaseModel):
    """Administrative dashboard summary indicators."""

    model_config = ConfigDict(extra="forbid")

    total_products: int = Field(ge=0)
    total_sales: int = Field(ge=0)
    total_revenue: Decimal = Field(ge=0)
