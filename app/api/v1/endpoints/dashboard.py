from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_admin
from app.api.v1.schemas.dashboard import DashboardSummary
from app.db.session import get_db
from app.models import Produto, Venda, VendaItem

router = APIRouter(prefix="/admin/dashboard", tags=["admin-dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def get_dashboard_summary(
    database: Annotated[Session, Depends(get_db)],
    _admin=Depends(get_current_admin),
) -> DashboardSummary:
    """Return aggregate product, sales, and historical revenue indicators."""
    product_count = select(func.count(Produto.id)).scalar_subquery()
    sales_count = select(func.count(Venda.id)).scalar_subquery()
    revenue = select(
        func.coalesce(
            func.sum(VendaItem.quantidade * VendaItem.preco_unitario),
            Decimal("0.00"),
        )
    ).scalar_subquery()

    summary = database.execute(
        select(
            product_count.label("total_products"),
            sales_count.label("total_sales"),
            revenue.label("total_revenue"),
        )
    ).one()
    return DashboardSummary(
        total_products=summary.total_products,
        total_sales=summary.total_sales,
        total_revenue=summary.total_revenue,
    )
