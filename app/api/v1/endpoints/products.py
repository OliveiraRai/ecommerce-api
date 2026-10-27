from decimal import Decimal
from http import HTTPStatus
from math import ceil
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.v1.dependencies import get_current_admin
from app.api.v1.schemas.product import ProductCreate, ProductPage, ProductResponse, ProductUpdate
from app.db.session import get_db
from app.models import Marca, Produto, Subcategoria

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=ProductPage)
def list_products(
    database: Session = Depends(get_db),
    q: str | None = Query(default=None, max_length=200),
    category_id: int | None = Query(default=None, ge=1),
    subcategory_id: int | None = Query(default=None, ge=1),
    brand_id: int | None = Query(default=None, ge=1),
    min_price: Decimal | None = Query(default=None, ge=0),
    max_price: Decimal | None = Query(default=None, ge=0),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    sort: Literal["name_asc", "name_desc", "price_asc", "price_desc"] = "name_asc",
) -> ProductPage:
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(status_code=HTTPStatus.UNPROCESSABLE_ENTITY, detail="min_price must not exceed max_price")
    if category_id is not None and subcategory_id is not None:
        parent_id = database.scalar(select(Subcategoria.categoria_id).where(Subcategoria.id == subcategory_id))
        if parent_id is not None and parent_id != category_id:
            raise HTTPException(
                status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
                detail="subcategory_id does not belong to category_id",
            )

    statement = select(Produto).outerjoin(Subcategoria, Produto.subcategoria_id == Subcategoria.id)
    count_statement = select(func.count(Produto.id)).select_from(Produto).outerjoin(
        Subcategoria, Produto.subcategoria_id == Subcategoria.id
    )
    filters = []
    term = (q or "").strip()
    if term:
        escaped_term = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped_term}%"
        filters.append(or_(Produto.nome.ilike(pattern, escape="\\"), Produto.descricao.ilike(pattern, escape="\\")))
    if category_id is not None:
        filters.append(Subcategoria.categoria_id == category_id)
    if subcategory_id is not None:
        filters.append(Produto.subcategoria_id == subcategory_id)
    if brand_id is not None:
        filters.append(Produto.marca_id == brand_id)
    if min_price is not None:
        filters.append(Produto.preco >= min_price)
    if max_price is not None:
        filters.append(Produto.preco <= max_price)
    if filters:
        statement = statement.where(*filters)
        count_statement = count_statement.where(*filters)

    total_items = database.scalar(count_statement) or 0
    order_columns = {
        "name_asc": (Produto.nome.asc(), Produto.id.asc()),
        "name_desc": (Produto.nome.desc(), Produto.id.asc()),
        "price_asc": (Produto.preco.asc(), Produto.id.asc()),
        "price_desc": (Produto.preco.desc(), Produto.id.asc()),
    }
    products = list(
        database.scalars(
            statement.options(
                selectinload(Produto.subcategoria).selectinload(Subcategoria.categoria),
                selectinload(Produto.marca),
            )
            .order_by(*order_columns[sort])
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
    )
    return ProductPage(
        items=products,
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=ceil(total_items / page_size) if total_items else 0,
    )


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: int, database: Session = Depends(get_db)) -> Produto:
    product = database.scalar(
        select(Produto)
        .options(
            selectinload(Produto.subcategoria).selectinload(Subcategoria.categoria),
            selectinload(Produto.marca),
        )
        .where(Produto.id == product_id)
    )
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(get_current_admin)])
def create_product(payload: ProductCreate, database: Session = Depends(get_db)) -> Produto:
    _validate_subcategory(payload.subcategoria_id, database)
    _validate_brand(payload.marca_id, database)
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
    admin=Depends(get_current_admin),
) -> Produto:
    product = database.scalar(
        select(Produto)
        .options(
            selectinload(Produto.subcategoria).selectinload(Subcategoria.categoria),
            selectinload(Produto.marca),
        )
        .where(Produto.id == product_id)
    )
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    _validate_subcategory(payload.subcategoria_id, database)
    _validate_brand(payload.marca_id, database)
    values = payload.model_dump()
    if "marca_id" not in payload.model_fields_set:
        values.pop("marca_id")
    if "subcategoria_id" not in payload.model_fields_set:
        values.pop("subcategoria_id")
    if "imagem_url" not in payload.model_fields_set:
        values.pop("imagem_url")
    for field, value in values.items():
        setattr(product, field, value)
    database.commit()
    database.refresh(product)
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, database: Session = Depends(get_db), admin=Depends(get_current_admin)) -> Response:
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


def _validate_subcategory(subcategory_id: int | None, database: Session) -> None:
    if subcategory_id is not None and database.get(Subcategoria, subcategory_id) is None:
        raise HTTPException(status_code=HTTPStatus.UNPROCESSABLE_ENTITY, detail="Unknown subcategory_id")


def _validate_brand(brand_id: int | None, database: Session) -> None:
    if brand_id is not None and database.get(Marca, brand_id) is None:
        raise HTTPException(status_code=HTTPStatus.UNPROCESSABLE_ENTITY, detail="Unknown brand_id")
