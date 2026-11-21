import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { getCustomerFavorites, type Favorite, type FavoritePage as FavoritePageResult } from '../api/favorites'
import { useFavorites } from '../favorites/FavoritesContext'
import { formatCents, priceToCents } from '../cart/cartStore'
import { ProductImage } from './CatalogPage'
import { StorefrontHeader } from './StorefrontHeader'

const pageSize = 12

export function FavoritesPage() {
  const { removeFavorite } = useFavorites()
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<FavoritePageResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [pendingIds, setPendingIds] = useState<Set<number>>(() => new Set())
  const [itemErrors, setItemErrors] = useState<Record<number, string>>({})
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError('')
    getCustomerFavorites(page, pageSize, controller.signal).then((response) => {
      if (active) setResult(response)
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof ApiError && cause.status === 401
        ? 'Sua sessão expirou. Entre novamente para consultar seus favoritos.'
        : 'Não foi possível carregar seus favoritos. Verifique a conexão e tente novamente.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [page, retry])

  async function remove(item: Favorite) {
    setPendingIds((current) => new Set(current).add(item.produto_id))
    setItemErrors((current) => { const next = { ...current }; delete next[item.produto_id]; return next })
    setNotice('')
    try {
      await removeFavorite(item.produto_id)
      setNotice(`${item.produto.nome} foi removido dos favoritos.`)
      if (!result) return
      const remaining = result.total_items - 1
      const remainingOnPage = result.items.length - 1
      if (remainingOnPage === 0 && page > 1) {
        setPage((current) => current - 1)
      } else {
        setResult({
          ...result,
          items: result.items.filter((favorite) => favorite.produto_id !== item.produto_id),
          total_items: remaining,
          total_pages: Math.ceil(remaining / pageSize),
        })
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) return
      setItemErrors((current) => ({ ...current, [item.produto_id]: `Não foi possível remover ${item.produto.nome}. Tente novamente.` }))
    } finally {
      setPendingIds((current) => { const next = new Set(current); next.delete(item.produto_id); return next })
    }
  }

  return <div className="storefront">
    <StorefrontHeader />
    <main className="storefront-main favorites-main">
      <a className="storefront-back-link" href="/catalog">← Voltar ao catálogo</a>
      <div className="storefront-heading"><p className="storefront-eyebrow">GAMER STORE</p><h1>Seus favoritos</h1></div>
      {notice && <p className="favorites-feedback" role="status">{notice}</p>}
      {loading ? <p className="catalog-status" role="status">Carregando seus favoritos…</p>
        : error ? <div className="catalog-error" role="alert"><p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button></div>
          : result && result.items.length === 0 ? <section className="cart-empty"><h2>Você ainda não tem favoritos</h2><p>Explore o catálogo e salve os produtos que deseja encontrar depois.</p><a className="primary-action storefront-action-link" href="/catalog">Ver catálogo</a></section>
            : result && <>
              <section className="favorites-list" aria-label="Produtos favoritos">
                {result.items.map((favorite) => <FavoriteRow
                  key={favorite.id}
                  favorite={favorite}
                  pending={pendingIds.has(favorite.produto_id)}
                  error={itemErrors[favorite.produto_id]}
                  onRemove={() => void remove(favorite)}
                />)}
              </section>
              {result.total_pages > 0 && <nav className="catalog-pagination" aria-label="Paginação dos favoritos">
                <button type="button" disabled={result.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
                <span aria-live="polite">Página {result.page} de {result.total_pages} · {result.total_items} {result.total_items === 1 ? 'favorito' : 'favoritos'}</span>
                <button type="button" disabled={result.page >= result.total_pages} onClick={() => setPage((current) => Math.min(result.total_pages, current + 1))}>Próxima</button>
              </nav>}
            </>}
    </main>
  </div>
}

function FavoriteRow({ favorite, pending, error, onRemove }: { favorite: Favorite; pending: boolean; error?: string; onRemove: () => void }) {
  const product = favorite.produto
  const imageProduct = { ...product, descricao: null, marca_id: null, marca: null, estoque: 0, subcategoria_id: null, subcategoria: null }
  return <article className="favorite-item">
    <a className="favorite-item-link" href={`/catalog/${product.id}`} aria-label={`Ver detalhes de ${product.nome}`}>
      <div className="cart-item-image"><ProductImage product={imageProduct} /></div>
      <div className="cart-item-info"><h2>{product.nome}</h2><p className="cart-unit-price">{formatCents(priceToCents(product.preco))}</p></div>
    </a>
    <div className="favorite-item-actions">
      {error && <p className="favorite-item-error" role="alert">{error}</p>}
      <button type="button" className="cart-remove favorite-remove" aria-label={`Remover ${product.nome} dos favoritos`} disabled={pending} onClick={(event) => { event.stopPropagation(); onRemove() }}>
        {pending ? 'Removendo…' : <><span aria-hidden="true">×</span><span>Remover</span></>}
      </button>
    </div>
  </article>
}
