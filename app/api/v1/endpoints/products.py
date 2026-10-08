from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.schemas.product import ProductCreate, ProductResponse, ProductUpdate
from app.db.session import get_db
from app.models import Produto

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=list[ProductResponse])
def list_products(database: Session = Depends(get_db)) -> list[Produto]:
    return list(database.scalars(select(Produto)).all())


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: int, database: Session = Depends(get_db)) -> Produto:
    product = database.get(Produto, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, database: Session = Depends(get_db)) -> Produto:
    product = Produto(**payload.model_dump())
    database.add(product)
    database.commit()
    database.refresh(product)
    return product


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    database: Session = Depends(get_db),
) -> Produto:
    product = database.get(Produto, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    for field, value in payload.model_dump().items():
        setattr(product, field, value)
    database.commit()
    database.refresh(product)
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, database: Session = Depends(get_db)) -> Response:
    product = database.get(Produto, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    database.delete(product)
    try:
        database.commit()
    except IntegrityError as error:
        database.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Product cannot be deleted because it is referenced by sales",
        ) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)
