from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.v1.dependencies import get_current_admin
from app.api.v1.schemas.sales import SaleResponse
from app.db.session import get_db
from app.models import Venda

router = APIRouter(prefix="/admin", tags=["admin-sales"])


@router.get("/sales", response_model=list[SaleResponse])
def list_sales(
    database: Annotated[Session, Depends(get_db)],
    _admin=Depends(get_current_admin),
) -> list[Venda]:
    return list(database.scalars(select(Venda).options(selectinload(Venda.itens)).order_by(Venda.id.desc())).all())


@router.get("/sales/{sale_id}", response_model=SaleResponse)
def get_sale(
    sale_id: int,
    database: Annotated[Session, Depends(get_db)],
    _admin=Depends(get_current_admin),
) -> Venda:
    sale = database.scalar(select(Venda).where(Venda.id == sale_id).options(selectinload(Venda.itens)))
    if sale is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sale not found")
    return sale
