import hashlib
import json
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.v1.dependencies import Security
from app.api.v1.schemas.checkout import CheckoutRequest, CheckoutResponse
from app.db.session import get_db
from app.models import Carrinho, CarrinhoItem, CheckoutIdempotency, Cliente, Produto, Venda, VendaItem

router = APIRouter(prefix="/checkout", tags=["checkout"])


@router.post("", response_model=CheckoutResponse, status_code=status.HTTP_201_CREATED)
def checkout(
    payload: CheckoutRequest,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)],
    customer: Cliente = Depends(Security.require_customer),
    database: Session = Depends(get_db),
) -> CheckoutResponse:
    if payload.modo == "produto" and (payload.produto_id is None or len(payload.itens) != 1 or payload.itens[0].produto_id != payload.produto_id or payload.itens[0].quantidade != 1):
        raise HTTPException(422, "Informe produto_id e a intenção de uma unidade")
    if payload.modo == "carrinho" and payload.produto_id is not None:
        raise HTTPException(422, "produto_id não é aceito no modo carrinho")
    fingerprint = hashlib.sha256(json.dumps(payload.model_dump(mode="json"), sort_keys=True, separators=(",", ":")).encode()).hexdigest()

    prior = database.scalar(select(CheckoutIdempotency).where(
        CheckoutIdempotency.cliente_id == customer.id, CheckoutIdempotency.chave == idempotency_key
    ))
    if prior:
        if prior.fingerprint != fingerprint:
            raise HTTPException(409, "Idempotency-Key já utilizada com outro payload")
        return _sale_response(database, prior.venda_id)

    # Same lock order as cart mutations: customer first, then products by ID.
    locked_customer = database.scalar(select(Cliente).where(Cliente.id == customer.id).with_for_update())
    if locked_customer is None:
        raise HTTPException(401, "Sessão do cliente inválida")

    cart = None
    if payload.modo == "carrinho":
        cart = database.scalar(select(Carrinho).where(Carrinho.cliente_id == customer.id))
        if cart is None:
            raise HTTPException(409, "O carrinho está vazio")
        cart_items = list(database.scalars(select(CarrinhoItem).where(CarrinhoItem.carrinho_id == cart.id).order_by(CarrinhoItem.id)).all())
        if not cart_items:
            raise HTTPException(409, "O carrinho está vazio")
        if any(item.produto_id is None for item in cart_items):
            raise HTTPException(409, "Remova os produtos indisponíveis do carrinho")
        expected = {line.produto_id: line for line in payload.itens}
        if len(expected) != len(payload.itens) or set(expected) != {item.produto_id for item in cart_items}:
            raise HTTPException(409, "O conteúdo do carrinho mudou; revise a compra")
        for item in cart_items:
            if expected[item.produto_id].quantidade != item.quantidade:
                raise HTTPException(409, "O conteúdo do carrinho mudou; revise a compra")
        quantities = {item.produto_id: item.quantidade for item in cart_items}
    else:
        quantities = {payload.produto_id: 1}
        expected = {payload.produto_id: payload.itens[0]}

    product_ids = sorted(quantities)
    products = list(database.scalars(
        select(Produto).where(Produto.id.in_(product_ids)).order_by(Produto.id).with_for_update().execution_options(populate_existing=True)
    ).all())
    if len(products) != len(product_ids):
        raise HTTPException(404, "Um ou mais produtos não existem mais")
    by_id = {product.id: product for product in products}
    for product_id, quantity in quantities.items():
        product = by_id[product_id]
        if product.estoque <= 0:
            raise HTTPException(409, f"{product.nome} está sem estoque")
        if quantity > product.estoque:
            raise HTTPException(409, f"Estoque insuficiente para {product.nome}")
        intent = expected.get(product_id)
        if intent is not None and intent.preco_unitario != product.preco:
            raise HTTPException(409, f"O preço de {product.nome} mudou; revise a compra")

    if payload.resultado_pagamento == "recusado":
        database.rollback()
        raise HTTPException(402, "Pagamento simulado recusado. Tente novamente com uma nova tentativa.")

    try:
        sale = Venda(cliente_id=customer.id, estado="confirmed")
        database.add(sale)
        database.flush()
        for product_id, quantity in quantities.items():
            product = by_id[product_id]
            product.estoque -= quantity
            database.add(VendaItem(
                venda_id=sale.id,
                produto_id=product.id,
                nome_produto=product.nome,
                quantidade=quantity,
                preco_unitario=product.preco,
            ))
        database.flush()
        database.add(CheckoutIdempotency(cliente_id=customer.id, chave=idempotency_key, fingerprint=fingerprint, venda_id=sale.id))
        if cart is not None:
            database.execute(delete(CarrinhoItem).where(CarrinhoItem.carrinho_id == cart.id))
        database.commit()
    except IntegrityError:
        database.rollback()
        winner = database.scalar(select(CheckoutIdempotency).where(
            CheckoutIdempotency.cliente_id == customer.id, CheckoutIdempotency.chave == idempotency_key
        ))
        if winner:
            if winner.fingerprint != fingerprint:
                raise HTTPException(409, "Idempotency-Key já utilizada com outro payload") from None
            return _sale_response(database, winner.venda_id)
        raise
    return _sale_response(database, sale.id)


def _sale_response(database: Session, sale_id: int) -> CheckoutResponse:
    sale = database.scalar(select(Venda).where(Venda.id == sale_id).options(selectinload(Venda.itens)))
    if sale is None:
        raise HTTPException(409, "Resultado idempotente indisponível")
    lines = [
        {"produto_id": item.produto_id, "nome_produto": item.nome_produto, "quantidade": item.quantidade,
         "preco_unitario": item.preco_unitario, "subtotal": item.preco_unitario * item.quantidade}
        for item in sale.itens
    ]
    return CheckoutResponse(id=sale.id, data_venda=sale.data_venda, estado="confirmed", itens=lines,
                            total=sum((line["subtotal"] for line in lines), start=0))
