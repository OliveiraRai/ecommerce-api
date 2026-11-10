import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/client'
import { getProduct, type Product } from '../api/products'
import { useCart } from '../cart/CartContext'
import { formatCents, priceToCents } from '../cart/cartStore'
import { ProductImage } from './CatalogPage'
import { StorefrontHeader } from './StorefrontHeader'

type ItemStatus = { kind: 'valid'; product: Product } | { kind: 'missing' } | { kind: 'error' }

export function CartPage() {
  const { lines, initialPrices, updateQuantity, removeProduct } = useCart()
  const [items, setItems] = useState<Record<number, ItemStatus>>({})
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  const [feedback, setFeedback] = useState('')

  const validate = useCallback(async (signal: AbortSignal) => {
    if (lines.length === 0) { setItems({}); setLoading(false); return }
    setLoading(true)
    setItems({})
    const results = await Promise.all(lines.map(async (line): Promise<[number, ItemStatus]> => {
      try { return [line.productId, { kind: 'valid', product: await getProduct(line.productId, signal) }] }
      catch (cause) {
        if (signal.aborted) return [line.productId, { kind: 'error' }]
        return [line.productId, { kind: cause instanceof ApiError && cause.status === 404 ? 'missing' : 'error' }]
      }
    }))
    if (!signal.aborted) setItems(Object.fromEntries(results))
    if (!signal.aborted) setLoading(false)
  }, [lines])

  useEffect(() => {
    const controller = new AbortController()
    void validate(controller.signal)
    return () => controller.abort()
  }, [validate, retry])

  const validRows = lines.flatMap((line) => {
    const status = items[line.productId]
    return status?.kind === 'valid' ? [{ line, product: status.product }] : []
  })
  const purchasableRows = validRows.filter(({ line, product }) => product.estoque > 0 && line.quantity <= product.estoque)
  const hasUnvalidated = lines.some((line) => !items[line.productId] || items[line.productId]?.kind === 'error')
  const hasMissing = lines.some((line) => items[line.productId]?.kind === 'missing')
  const hasStockIssue = validRows.some(({ line, product }) => product.estoque === 0 || line.quantity > product.estoque)
  const summary = useMemo(() => purchasableRows.reduce((total, { line, product }) => {
    const cents = priceToCents(product.preco)
    total.cents += cents * line.quantity
    total.units += line.quantity
    return total
  }, { cents: 0, units: 0 }), [purchasableRows])
  const hasIssues = hasUnvalidated || hasMissing || hasStockIssue

  function changeQuantity(product: Product, quantity: number) {
    try {
      updateQuantity(product.id, quantity, product.estoque)
      setFeedback('Quantidade atualizada.')
    } catch (cause) { setFeedback(cause instanceof Error ? cause.message : 'Não foi possível atualizar a quantidade.') }
  }

  return <div className="storefront">
    <StorefrontHeader />
    <main className="storefront-main cart-main">
      <a className="storefront-back-link" href="/catalog">← Voltar ao catálogo</a>
      <div className="storefront-heading"><p className="storefront-eyebrow">GAMER STORE</p><h1>Seu carrinho</h1></div>
      {lines.length === 0 ? <section className="cart-empty"><h2>Seu carrinho está vazio</h2><p>Explore o catálogo e adicione produtos para continuar.</p><a className="primary-action storefront-action-link" href="/catalog">Ver catálogo</a></section>
        : <div className="cart-layout">
          <section className="cart-items" aria-label="Produtos no carrinho">
            {loading ? <p className="catalog-status" role="status">Validando produtos e preços atuais…</p> : <>
              {lines.map((line) => {
                const status = items[line.productId]
                if (status?.kind === 'error' || !status) return <article className="cart-item cart-item-problem" key={line.productId}>
                  <div><h2>Produto #{line.productId}</h2><p role="alert">Não foi possível validar este produto agora. Os dados anteriores não são exibidos como atuais.</p></div>
                  <div className="cart-item-actions"><button type="button" className="secondary-action" onClick={() => removeProduct(line.productId)}>Remover</button></div>
                </article>
                if (status.kind === 'missing') return <article className="cart-item cart-item-problem" key={line.productId}>
                  <div><h2>Produto #{line.productId}</h2><p role="status">Este produto não existe mais no catálogo e está indisponível.</p></div>
                  <div className="cart-item-actions"><button type="button" className="secondary-action" onClick={() => removeProduct(line.productId)}>Remover</button></div>
                </article>
                const product = status.product
                const issue = product.estoque === 0 ? 'Sem estoque; este item não pode ser comprado.' : line.quantity > product.estoque ? `Estoque reduzido para ${product.estoque}; ajuste a quantidade para continuar.` : ''
                return <article className="cart-item" key={line.productId}>
                  <div className="cart-item-image"><ProductImage product={product} /></div>
                  <div className="cart-item-info"><h2>{product.nome}</h2><p className="cart-unit-price">{formatCents(priceToCents(product.preco))} <span>por unidade</span></p>
                    <p className="cart-line-subtotal">Subtotal: <strong>{formatCents(priceToCents(product.preco) * line.quantity)}</strong></p>
                    {issue && <p className="cart-item-warning" role="status">{issue}</p>}
                    <div className="cart-quantity" aria-label={`Quantidade de ${product.nome}`}>
                      <button type="button" aria-label={`Diminuir quantidade de ${product.nome}`} onClick={() => changeQuantity(product, line.quantity - 1)}>−</button>
                      <output aria-live="polite">{line.quantity}</output>
                      <button type="button" aria-label={`Aumentar quantidade de ${product.nome}`} disabled={product.estoque === 0 || line.quantity >= product.estoque} onClick={() => changeQuantity(product, line.quantity + 1)}>+</button>
                    </div>
                    {initialPrices[product.id] !== undefined && initialPrices[product.id] !== priceToCents(product.preco) && <p className="cart-price-changed" role="status">O preço mudou desde que você adicionou este produto. O valor atual da API está aplicado.</p>}
                  </div>
                  <button type="button" className="cart-remove" onClick={() => removeProduct(product.id)}>Remover</button>
                </article>
              })}
            </>}
            {feedback && <p className="cart-feedback" role="status">{feedback}</p>}
          </section>
          <aside className="cart-summary" aria-labelledby="cart-summary-title">
            <h2 id="cart-summary-title">Resumo</h2>
            <p><span>Itens válidos</span><strong>{summary.units}</strong></p>
            <p><span>Subtotal válido</span><strong>{formatCents(summary.cents)}</strong></p>
            <p className="cart-total"><span>Total</span><strong>{formatCents(summary.cents)}</strong></p>
            {hasIssues && <p className="cart-summary-warning" role="alert">Há itens que precisam ser validados ou ajustados. O subtotal exibido é parcial e não representa um total final.</p>}
            <button type="button" className="primary-action cart-checkout-disabled" disabled aria-describedby="checkout-note">Prosseguir para compra</button>
            <p id="checkout-note" className="purchase-note">A compra ainda não está disponível nesta versão.</p>
            {hasUnvalidated && <button type="button" className="secondary-action cart-retry" onClick={() => setRetry((value) => value + 1)}>Tentar validar novamente</button>}
          </aside>
        </div>}
    </main>
  </div>
}
