from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.v1.dependencies import Security
from app.api.v1.schemas.favorite import FavoritePage, FavoriteProductResponse, FavoriteResponse
from app.db.session import get_db
from app.models import Cliente, Favorito, Produto

router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.post("/{produto_id}", response_model=FavoriteResponse, status_code=status.HTTP_201_CREATED)
def add_favorite(
    produto_id: int,
    customer: Cliente = Depends(Security.require_customer),
    database: Session = Depends(get_db),
) -> FavoriteResponse:
    product = database.get(Produto, produto_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    favorite = Favorito(cliente_id=customer.id, produto_id=product.id, produto=product)
    database.add(favorite)
    try:
        database.commit()
    except IntegrityError as error:
        database.rollback()
        if _is_duplicate_favorite(error):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product already favorited") from error
        raise
    database.refresh(favorite)
    return _favorite_response(favorite)


@router.delete("/{produto_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_favorite(
    produto_id: int,
    customer: Cliente = Depends(Security.require_customer),
    database: Session = Depends(get_db),
) -> None:
    favorite = database.scalar(
        select(Favorito).where(Favorito.cliente_id == customer.id, Favorito.produto_id == produto_id)
    )
    if favorite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Favorite not found")
    database.delete(favorite)
    database.commit()


@router.get("", response_model=FavoritePage)
def list_favorites(
    customer: Cliente = Depends(Security.require_customer),
    database: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=100),
) -> FavoritePage:
    total_items = database.scalar(
        select(func.count(Favorito.id)).where(Favorito.cliente_id == customer.id)
    ) or 0
    favorites = database.scalars(
        select(Favorito)
        .options(joinedload(Favorito.produto))
        .where(Favorito.cliente_id == customer.id)
        .order_by(Favorito.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return FavoritePage(
        items=[_favorite_response(favorite) for favorite in favorites],
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=ceil(total_items / page_size) if total_items else 0,
    )


def _favorite_response(favorite: Favorito) -> FavoriteResponse:
    product = favorite.produto
    return FavoriteResponse(
        id=favorite.id,
        produto_id=favorite.produto_id,
        produto=FavoriteProductResponse(
            id=product.id, nome=product.nome, imagem_url=product.imagem_url, preco=product.preco
        ),
    )


def _is_duplicate_favorite(error: IntegrityError) -> bool:
    diagnostic = getattr(error.orig, "diag", None)
    return (
        getattr(diagnostic, "constraint_name", None) == "uq_favoritos_cliente_produto"
        or "UNIQUE constraint failed: favoritos.cliente_id, favoritos.produto_id" in str(error.orig)
    )
