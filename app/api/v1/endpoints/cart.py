from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from sqlalchemy.orm import Session, selectinload

from app.api.v1.dependencies import Security
from app.api.v1.schemas.cart import CartItemCreate, CartItemQuantity, CartItemResponse, CartProductResponse, CartResponse
from app.db.session import get_db
from app.models import Carrinho, CarrinhoItem, Cliente, Produto

router = APIRouter(prefix="/cart", tags=["cart"])


@router.get("", response_model=CartResponse)
def get_cart(customer: Cliente = Depends(Security.require_customer), database: Session = Depends(get_db)) -> CartResponse:
    cart = database.scalar(
        select(Carrinho)
        .options(selectinload(Carrinho.itens).joinedload(CarrinhoItem.produto))
        .where(Carrinho.cliente_id == customer.id)
    )
    if cart is None:
        return CartResponse(id=None, itens=[])
    return _cart_response(cart)


@router.post("/items", response_model=CartItemResponse, status_code=status.HTTP_200_OK)
def add_cart_item(
    payload: CartItemCreate,
    customer: Cliente = Depends(Security.require_customer),
    database: Session = Depends(get_db),
) -> CartItemResponse:
    customer = _lock_customer(database, customer.id)
    # Lock order is customer -> product -> item. Product deletion uses the FK action
    # for cart items, so it never needs a customer lock and cannot form a lock cycle.
    product = database.scalar(select(Produto).where(Produto.id == payload.produto_id).with_for_update())
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    if product.estoque == 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product is out of stock")

    cart = _get_or_create_cart(database, customer)
    item = database.scalar(
        select(CarrinhoItem).where(
            CarrinhoItem.carrinho_id == cart.id,
            CarrinhoItem.produto_id == product.id,
        )
    )
    resulting_quantity = payload.quantidade + (item.quantidade if item else 0)
    if resulting_quantity > product.estoque:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Requested quantity exceeds current stock")
    if item is None:
        item = CarrinhoItem(carrinho=cart, produto=product, quantidade=resulting_quantity)
        database.add(item)
    else:
        item.quantidade = resulting_quantity
    return _commit_item(database, item)


@router.patch("/items/{item_id}", response_model=CartItemResponse)
def update_cart_item(
    item_id: int,
    payload: CartItemQuantity,
    customer: Cliente = Depends(Security.require_customer),
    database: Session = Depends(get_db),
) -> CartItemResponse:
    customer = _lock_customer(database, customer.id)
    candidate = _owned_item(database, item_id, customer.id)
    if candidate.produto_id is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product is no longer available")
    # Lock product first, matching catalog deletion/FK lock order, then lock the owned item.
    product = database.scalar(select(Produto).where(Produto.id == candidate.produto_id).with_for_update())
    if product is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product is no longer available")
    item = _owned_item(database, item_id, customer.id, lock=True)
    if item.produto_id != product.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product is no longer available")
    item.produto = product
    if product.estoque == 0 or payload.quantidade > product.estoque:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Requested quantity exceeds current stock")
    item.quantidade = payload.quantidade
    return _commit_item(database, item)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cart_item(
    item_id: int,
    customer: Cliente = Depends(Security.require_customer),
    database: Session = Depends(get_db),
) -> None:
    customer = _lock_customer(database, customer.id)
    item = _owned_item(database, item_id, customer.id)
    database.delete(item)
    try:
        database.commit()
    except StaleDataError:
        database.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart item not found") from None


def _lock_customer(database: Session, customer_id: int) -> Cliente:
    """Serialize all cart mutations for one customer on PostgreSQL."""
    customer = database.scalar(select(Cliente).where(Cliente.id == customer_id).with_for_update())
    if customer is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Customer session is no longer valid")
    return customer


def _owned_item(database: Session, item_id: int, customer_id: int, *, lock: bool = False) -> CarrinhoItem:
    statement = (
        select(CarrinhoItem)
        .join(Carrinho, CarrinhoItem.carrinho_id == Carrinho.id)
        .where(CarrinhoItem.id == item_id, Carrinho.cliente_id == customer_id)
    )
    if lock:
        statement = statement.with_for_update(of=CarrinhoItem)
    item = database.scalar(statement)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart item not found")
    return item


def _get_or_create_cart(database: Session, customer: Cliente) -> Carrinho:
    cart = database.scalar(select(Carrinho).where(Carrinho.cliente_id == customer.id))
    if cart is not None:
        return cart
    cart = Carrinho(cliente_id=customer.id)
    database.add(cart)
    # The customer row lock serializes this insert against every cart mutation.
    # Do not roll back and continue: a failed flush must abort this whole request.
    database.flush()
    return cart


def _commit_item(database: Session, item: CarrinhoItem) -> CartItemResponse:
    try:
        database.commit()
    except IntegrityError as error:
        database.rollback()
        if _is_duplicate_product_item(error):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Product already has a line in this cart; retry the operation",
            ) from error
        raise
    except StaleDataError as error:
        database.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cart item changed concurrently; retry the operation",
        ) from error
    database.refresh(item)
    if item.produto is not None:
        database.refresh(item.produto)
    return _item_response(item)


def _is_duplicate_product_item(error: IntegrityError) -> bool:
    """Recognize only the expected live-product uniqueness conflict."""
    original = error.orig
    diagnostic = getattr(original, "diag", None)
    if getattr(diagnostic, "constraint_name", None) == "uq_carrinho_itens_carrinho_produto":
        return True
    return "UNIQUE constraint failed: carrinho_itens.carrinho_id, carrinho_itens.produto_id" in str(original)


def _cart_response(cart: Carrinho) -> CartResponse:
    return CartResponse(id=cart.id, itens=[_item_response(item) for item in cart.itens])


def _item_response(item: CarrinhoItem) -> CartItemResponse:
    product = item.produto
    product_data = (
        CartProductResponse(
            id=product.id,
            nome=product.nome,
            imagem_url=product.imagem_url,
            preco=product.preco,
            estoque=product.estoque,
        )
        if product is not None
        else None
    )
    return CartItemResponse(
        id=item.id,
        produto_id=item.produto_id,
        produto=product_data,
        quantidade=item.quantidade,
        subtotal=product.preco * item.quantidade if product is not None else None,
        disponivel=product is not None and product.estoque > 0,
    )
