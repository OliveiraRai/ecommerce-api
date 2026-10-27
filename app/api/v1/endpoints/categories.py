from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.v1.dependencies import get_current_admin
from app.api.v1.schemas.category import (
    CategoryCreate,
    CategoryResponse,
    CategoryUpdate,
    SubcategoryCreate,
    SubcategoryResponse,
    SubcategoryUpdate,
)
from app.db.session import get_db
from app.models import Categoria, Subcategoria

router = APIRouter(prefix="/categories", tags=["categories"])


def _conflict(error: IntegrityError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category is in use or its name already exists")


@router.get("", response_model=list[CategoryResponse])
def list_categories(database: Session = Depends(get_db)) -> list[Categoria]:
    statement = select(Categoria).options(selectinload(Categoria.subcategorias)).order_by(Categoria.nome, Categoria.id)
    return list(database.scalars(statement).all())


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate,
    database: Session = Depends(get_db),
    admin=Depends(get_current_admin),
) -> Categoria:
    category = Categoria(nome=payload.nome)
    database.add(category)
    try:
        database.commit()
    except IntegrityError as error:
        database.rollback()
        raise _conflict(error)
    database.refresh(category)
    return category


@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    database: Session = Depends(get_db),
    admin=Depends(get_current_admin),
) -> Categoria:
    category = database.get(Categoria, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    category.nome = payload.nome
    try:
        database.commit()
    except IntegrityError as error:
        database.rollback()
        raise _conflict(error)
    database.refresh(category)
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: int,
    database: Session = Depends(get_db),
    admin=Depends(get_current_admin),
) -> None:
    category = database.get(Categoria, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    database.delete(category)
    try:
        database.commit()
    except IntegrityError as error:
        database.rollback()
        raise _conflict(error)


@router.post("/{category_id}/subcategories", response_model=SubcategoryResponse, status_code=status.HTTP_201_CREATED)
def create_subcategory(
    category_id: int,
    payload: SubcategoryCreate,
    database: Session = Depends(get_db),
    admin=Depends(get_current_admin),
) -> Subcategoria:
    if database.get(Categoria, category_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    subcategory = Subcategoria(categoria_id=category_id, nome=payload.nome)
    database.add(subcategory)
    try:
        database.commit()
    except IntegrityError as error:
        database.rollback()
        raise _conflict(error)
    database.refresh(subcategory)
    return subcategory


@router.put("/subcategories/{subcategory_id}", response_model=SubcategoryResponse)
def update_subcategory(
    subcategory_id: int,
    payload: SubcategoryUpdate,
    database: Session = Depends(get_db),
    admin=Depends(get_current_admin),
) -> Subcategoria:
    subcategory = database.get(Subcategoria, subcategory_id)
    if subcategory is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subcategory not found")
    subcategory.nome = payload.nome
    try:
        database.commit()
    except IntegrityError as error:
        database.rollback()
        raise _conflict(error)
    database.refresh(subcategory)
    return subcategory


@router.delete("/subcategories/{subcategory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subcategory(
    subcategory_id: int,
    database: Session = Depends(get_db),
    admin=Depends(get_current_admin),
) -> None:
    subcategory = database.get(Subcategoria, subcategory_id)
    if subcategory is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subcategory not found")
    database.delete(subcategory)
    try:
        database.commit()
    except IntegrityError as error:
        database.rollback()
        raise _conflict(error)
