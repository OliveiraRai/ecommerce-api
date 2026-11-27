import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { submitCheckout, type CheckoutConfirmation, type CheckoutRequest } from '../api/checkout'
import { getProduct, type Product } from '../api/products'
import { useCart } from '../cart/CartContext'
import { formatCents, priceToCents } from '../cart/cartStore'
import { StorefrontHeader } from './StorefrontHeader'

export function CheckoutPage() {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode') === 'product' ? 'produto' : 'carrinho'
  const productId = Number(params.get('id'))
  const { lines, loading: cartLoading, refresh } = useCart()
  const [directProduct, setDirectProduct] = useState<Product | null>(null)
  const [loadingProduct, setLoadingProduct] = useState(mode === 'produto')
  const [method, setMethod] = useState<'pix_simulado' | 'cartao_simulado'>('pix_simulado')
  const [result, setResult] = useState<'aprovado' | 'recusado'>('aprovado')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<CheckoutConfirmation | null>(null)
  const key = useRef<string | null>(null)
  const uncertain = useRef(false)
  const uncertainPayload = useRef<CheckoutRequest | null>(null)

  useEffect(() => {
    if (mode !== 'produto' || !Number.isSafeInteger(productId) || productId < 1) { setLoadingProduct(false); return }
    getProduct(productId).then(setDirectProduct).catch(() => setError('Não foi possível carregar o produto. Volte ao catálogo e tente novamente.')).finally(() => setLoadingProduct(false))
  }, [mode, productId])

  const intent = mode === 'produto'
    ? directProduct ? [{ productId: directProduct.id, name: directProduct.nome, quantity: 1, price: directProduct.preco, stock: directProduct.estoque }] : []
    : lines.map((line) => line.produto ? ({ productId: line.produto.id, name: line.produto.nome, quantity: line.quantidade, price: line.produto.preco, stock: line.produto.estoque }) : null).filter((line): line is NonNullable<typeof line> => line !== null)
  const unavailableCartItem = mode === 'carrinho' && lines.some((line) => !line.produto || !line.disponivel || line.quantidade > (line.produto?.estoque ?? 0))

  async function pay(retryUncertain = false) {
    if (busy || confirmation) return
    setBusy(true); setError('')
    if (!retryUncertain || !key.current) key.current = crypto.randomUUID()
    const requestPayload: CheckoutRequest = {
      modo: mode,
      ...(mode === 'produto' ? { produto_id: productId } : {}),
      itens: intent.map((line) => ({ produto_id: line.productId, quantidade: line.quantity, preco_unitario: line.price })),
      metodo_pagamento: method, resultado_pagamento: result,
    }
    const payload = retryUncertain && uncertainPayload.current ? uncertainPayload.current : requestPayload
    if (!retryUncertain) uncertainPayload.current = payload
    try {
      const confirmed = await submitCheckout(payload, key.current)
      setConfirmation(confirmed); uncertain.current = false; uncertainPayload.current = null
      if (mode === 'carrinho') await refresh()
    } catch (cause) {
      const network = !(cause instanceof ApiError)
      uncertain.current = network
      if (cause instanceof ApiError && cause.status === 401) setError('Sua sessão expirou. Entre novamente para continuar.')
      else if (cause instanceof ApiError && cause.status === 402) setError('Pagamento simulado recusado. Você pode iniciar uma nova tentativa.')
      else if (cause instanceof ApiError && cause.status === 409) setError('Preço, estoque ou conteúdo da compra mudou. Revise os dados e tente novamente.')
      else if (cause instanceof ApiError && cause.status === 404) setError('Um produto não está mais disponível no catálogo.')
      else setError('Não foi possível confirmar a resposta. Tente novamente; a mesma chave será usada para verificar o resultado.')
    } finally { setBusy(false) }
  }

  function retry() { key.current = null; uncertain.current = false; uncertainPayload.current = null; void pay(false) }

  return <div className="storefront"><StorefrontHeader /><main className="storefront-main cart-main">
    <a className="storefront-back-link" href={mode === 'carrinho' ? '/cart' : `/catalog/${productId}`}>← Voltar</a>
    <div className="storefront-heading"><p className="storefront-eyebrow">GAMER STORE</p><h1>{confirmation ? 'Compra confirmada' : 'Revisar compra'}</h1></div>
    {confirmation ? <section className="cart-empty" role="status"><h2>Venda #{confirmation.id} confirmada</h2><p>Total: <strong>{formatCents(priceToCents(confirmation.total))}</strong></p><a className="primary-action storefront-action-link" href="/catalog">Continuar comprando</a></section>
      : loadingProduct || cartLoading ? <p className="catalog-status" role="status">Carregando intenção de compra…</p>
        : intent.length === 0 ? <section className="cart-empty"><h2>{mode === 'carrinho' ? 'Seu carrinho está vazio' : 'Produto indisponível'}</h2><a className="primary-action storefront-action-link" href="/catalog">Voltar ao catálogo</a></section>
          : <div className="cart-layout"><section className="cart-items" aria-label="Revisão da compra">{intent.map((line) => <article className="cart-item" key={line.productId}><div className="cart-item-info"><h2>{line.name}</h2><p>{line.quantity} × {formatCents(priceToCents(line.price))}</p><p>Estoque informado: {line.stock}</p></div><strong>{formatCents(priceToCents(line.price) * line.quantity)}</strong></article>)}</section>
            <aside className="cart-summary"><h2>Pagamento simulado</h2><label>Método<select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="pix_simulado">PIX simulado</option><option value="cartao_simulado">Cartão simulado</option></select></label><label>Resultado de teste<select value={result} onChange={(event) => setResult(event.target.value as typeof result)}><option value="aprovado">Aprovar</option><option value="recusado">Recusar</option></select></label><p className="cart-total"><span>Total atual</span><strong>{formatCents(intent.reduce((sum, line) => sum + priceToCents(line.price) * line.quantity, 0))}</strong></p><p className="purchase-note">Nenhum dado real de cartão ou banco é solicitado. O estoque só muda ao confirmar o pagamento.</p>{unavailableCartItem && <p role="alert" className="cart-summary-warning">Há itens indisponíveis ou com quantidade acima do estoque. Volte ao carrinho para revisar.</p>}{error && <p role="alert" className="cart-summary-warning">{error}</p>}<button className="primary-action" type="button" disabled={busy || unavailableCartItem || uncertain.current} onClick={() => void pay()}>{busy ? 'Confirmando…' : 'Pagar'}</button>{error && <button className="secondary-action" type="button" disabled={busy} onClick={() => uncertain.current ? void pay(true) : retry()}>{uncertain.current ? 'Verificar novamente' : 'Nova tentativa'}</button>}</aside>
          </div>}
  </main></div>
}
