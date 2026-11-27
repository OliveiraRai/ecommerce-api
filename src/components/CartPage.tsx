import { useMemo, useState } from 'react'
import { useCart } from '../cart/CartContext'
import { formatCents, priceToCents } from '../cart/cartStore'
import { ProductImage } from './CatalogPage'
import { StorefrontHeader } from './StorefrontHeader'
import type { Product } from '../api/products'

export function CartPage() {
  const { lines, loading, updateQuantity, removeProduct } = useCart()
  const [feedback, setFeedback] = useState('')
  const summary = useMemo(() => lines.reduce((total, line) => {
    if (line.produto && line.disponivel && line.quantidade <= line.produto.estoque) {
      total.cents += priceToCents(line.produto.preco) * line.quantidade
      total.units += line.quantidade
    }
    return total
  }, { cents: 0, units: 0 }), [lines])
  const hasIssues = lines.some((line) => !line.produto || !line.disponivel || line.quantidade > (line.produto?.estoque ?? 0))

  async function changeQuantity(itemId: number, quantity: number) {
    try { await updateQuantity(itemId, quantity); setFeedback('Quantidade atualizada.') }
    catch (cause) { setFeedback(cause instanceof Error ? cause.message : 'Não foi possível atualizar a quantidade.') }
  }
  async function remove(itemId: number) {
    try { await removeProduct(itemId); setFeedback('Produto removido do carrinho.') }
    catch { setFeedback('Não foi possível remover o produto. Tente novamente.') }
  }

  return <div className="storefront">
    <StorefrontHeader />
    <main className="storefront-main cart-main">
      <a className="storefront-back-link" href="/catalog">← Voltar ao catálogo</a>
      <div className="storefront-heading"><p className="storefront-eyebrow">GAMER STORE</p><h1>Seu carrinho</h1></div>
      {loading ? <p className="catalog-status" role="status">Carregando seu carrinho…</p>
        : lines.length === 0 ? <section className="cart-empty"><h2>Seu carrinho está vazio</h2><p>Explore o catálogo e adicione produtos para continuar.</p><a className="primary-action storefront-action-link" href="/catalog">Ver catálogo</a></section>
          : <div className="cart-layout">
            <section className="cart-items" aria-label="Produtos no carrinho">
              {lines.map((line) => {
                const product = line.produto
                if (!product) return <article className="cart-item cart-item-problem" key={line.id}>
                  <div><h2>Produto indisponível</h2><p role="status">Este produto não existe mais no catálogo.</p></div>
                  <button type="button" className="cart-remove" onClick={() => void remove(line.id)}>Remover</button>
                </article>
                const imageProduct = { ...product, descricao: null, marca_id: null, marca: null, subcategoria_id: null, subcategoria: null } as Product
                const issue = !line.disponivel ? 'Produto sem estoque no momento.' : line.quantidade > product.estoque ? `Estoque reduzido para ${product.estoque}; ajuste a quantidade.` : ''
                return <article className="cart-item" key={line.id}>
                  <div className="cart-item-image"><ProductImage product={imageProduct} /></div>
                  <div className="cart-item-info"><h2>{product.nome}</h2><p className="cart-unit-price">{formatCents(priceToCents(product.preco))} <span>por unidade</span></p>
                    <p className="cart-line-subtotal">Subtotal: <strong>{formatCents(priceToCents(product.preco) * line.quantidade)}</strong></p>
                    {issue && <p className="cart-item-warning" role="status">{issue}</p>}
                    <div className="cart-quantity" aria-label={`Quantidade de ${product.nome}`}>
                      <button type="button" aria-label={`Diminuir quantidade de ${product.nome}`} onClick={() => void changeQuantity(line.id, line.quantidade - 1)}>−</button>
                      <output aria-live="polite">{line.quantidade}</output>
                      <button type="button" aria-label={`Aumentar quantidade de ${product.nome}`} disabled={!line.disponivel || line.quantidade >= product.estoque} onClick={() => void changeQuantity(line.id, line.quantidade + 1)}>+</button>
                    </div>
                  </div>
                  <button type="button" className="cart-remove" onClick={() => void remove(line.id)}>Remover</button>
                </article>
              })}
              {feedback && <p className="cart-feedback" role="status">{feedback}</p>}
            </section>
            <aside className="cart-summary" aria-labelledby="cart-summary-title">
              <h2 id="cart-summary-title">Resumo</h2>
              <p><span>Itens disponíveis</span><strong>{summary.units}</strong></p>
              <p><span>Subtotal disponível</span><strong>{formatCents(summary.cents)}</strong></p>
              <p className="cart-total"><span>Total</span><strong>{formatCents(summary.cents)}</strong></p>
              {hasIssues && <p className="cart-summary-warning" role="alert">Há itens indisponíveis ou que precisam de ajuste. O subtotal é parcial.</p>}
              <a className="primary-action storefront-action-link" href="/checkout?mode=cart" aria-disabled={loading}>Continuar com a compra</a>
            </aside>
          </div>}
    </main>
  </div>
}
