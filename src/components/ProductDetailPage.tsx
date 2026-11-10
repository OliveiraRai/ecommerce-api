import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { getProduct, type Product } from '../api/products'
import { useCart } from '../cart/CartContext'
import { formatCents, priceToCents } from '../cart/cartStore'
import { ProductImage } from './CatalogPage'
import { StorefrontHeader } from './StorefrontHeader'

const DESCRIPTION_LIMIT = 280

export function ProductDetailPage({ productId }: { productId: number }) {
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<'missing' | 'network' | ''>('')
  const [retry, setRetry] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [feedback, setFeedback] = useState('')
  const { addProduct } = useCart()

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    getProduct(productId, controller.signal).then((result) => {
      setProduct(result)
      setExpanded(false)
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return
      setProduct(null)
      setError(cause instanceof ApiError && cause.status === 404 ? 'missing' : 'network')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [productId, retry])

  function addToCart() {
    if (!product) return
    try {
      addProduct(product.id, 1, product.estoque, product.preco)
      setFeedback('Produto adicionado ao carrinho.')
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Não foi possível adicionar o produto.')
    }
  }

  const description = product?.descricao?.trim() ?? ''
  const hasLongDescription = description.length > DESCRIPTION_LIMIT

  return <div className="storefront">
    <StorefrontHeader />
    <main className="storefront-main product-detail-main">
      <a className="storefront-back-link" href="/catalog">← Voltar ao catálogo</a>
      {loading ? <p className="catalog-status" role="status">Carregando produto…</p>
        : error === 'missing' ? <section className="catalog-status" role="status"><h1>Produto não encontrado</h1><p>Este produto não está mais disponível no catálogo.</p><a className="secondary-action storefront-action-link" href="/catalog">Ir ao catálogo</a></section>
          : error === 'network' ? <div className="catalog-error" role="alert"><p>Não foi possível consultar o produto. Verifique a conexão e tente novamente.</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button></div>
            : product && <>
              <section className="product-detail-presentation" aria-labelledby="product-title">
                <div className="product-detail-image-frame"><ProductImage product={product} /></div>
                <div className="product-detail-info">
                  {product.marca && <p className="product-detail-brand">{product.marca.nome}</p>}
                  <h1 id="product-title">{product.nome}</h1>
                  {(product.subcategoria || product.subcategoria_id) && <p className="product-detail-category">{product.subcategoria ? `${product.subcategoria.categoria.nome} · ${product.subcategoria.nome}` : 'Categoria indisponível'}</p>}
                  <p className="product-detail-price">{formatCents(priceToCents(product.preco))}</p>
                  <p className={`product-stock ${product.estoque > 0 ? 'is-available' : 'is-unavailable'}`} role="status">
                    {product.estoque > 0 ? `Em estoque (${product.estoque} ${product.estoque === 1 ? 'unidade' : 'unidades'})` : 'Indisponível — sem estoque'}
                  </p>
                </div>
              </section>
              <section className="product-detail-actions" aria-label="Ações do produto">
                <button className="primary-action" type="button" disabled={product.estoque === 0} onClick={addToCart}>
                  {product.estoque === 0 ? 'Sem estoque' : 'Adicionar ao carrinho'}
                </button>
                <button className="secondary-action purchase-unavailable" type="button" disabled aria-describedby="purchase-note">Comprar agora</button>
                <span id="purchase-note" className="purchase-note">Compra ainda não disponível.</span>
                {feedback && <p className="cart-feedback" role="status">{feedback} <a href="/cart">Ver carrinho</a></p>}
              </section>
              <section className="product-description" aria-labelledby="description-title">
                <h2 id="description-title">Descrição</h2>
                {!description ? <p className="product-description-empty">Descrição não informada.</p> : <>
                  <p className={`product-description-text${hasLongDescription && !expanded ? ' is-collapsed' : ''}`}>{description}</p>
                  {hasLongDescription && <button className="text-action" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? 'Mostrar menos' : 'Ver descrição completa'}</button>}
                </>}
              </section>
            </>}
    </main>
  </div>
}
