from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_admin
from app.api.v1.schemas.brand import BrandCreate, BrandResponse, BrandUpdate
from app.db.session import get_db
from app.models import Marca

router = APIRouter(prefix="/brands", tags=["brands"])


def _conflict(error: IntegrityError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Brand is in use or its name already exists")


@router.get("", response_model=list[BrandResponse])
def list_brands(database: Session = Depends(get_db)) -> list[Marca]:
    statement = select(Marca).order_by(Marca.nome, Marca.id)
    return list(database.scalars(statement).all())


@router.post("", response_model=BrandResponse, status_code=status.HTTP_201_CREATED)
def create_brand(
    payload: BrandCreate,
    database: Session = Depends(get_db),
    admin=Depends(get_current_admin),
) -> Marca:
    brand = Marca(nome=payload.nome)
    database.add(brand)
    try:
        database.commit()
    except IntegrityError as error:
        database.rollback()
        raise _conflict(error) from error
    database.refresh(brand)
    return brand


@router.put("/{brand_id}", response_model=BrandResponse)
def update_brand(
    brand_id: int,
    payload: BrandUpdate,
    database: Session = Depends(get_db),
    admin=Depends(get_current_admin),
) -> Marca:
    brand = database.get(Marca, brand_id)
    if brand is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
    brand.nome = payload.nome
    try:
        database.commit()
    except IntegrityError as error:
        database.rollback()
        raise _conflict(error) from error
    database.refresh(brand)
    return brand


@router.delete("/{brand_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_brand(
    brand_id: int,
    database: Session = Depends(get_db),
    admin=Depends(get_current_admin),
) -> None:
    brand = database.get(Marca, brand_id)
    if brand is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
    database.delete(brand)
    try:
        database.commit()
    except IntegrityError as error:
        database.rollback()
        raise _conflict(error) from error
