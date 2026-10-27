import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { getCategories, type Category } from '../api/categories'
import { getBrands, type Brand } from '../api/brands'
import { getCatalogProducts, type CatalogProductQuery, type Product, type ProductPage } from '../api/products'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const pageSize = 12

function StoreIcon({ name }: { name: 'heart' | 'cart' | 'account' }) {
  const paths = {
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    cart: <><path d="M3 3h2l2.4 12.2a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 8H6" /><circle cx="10" cy="21" r="1" /><circle cx="18" cy="21" r="1" /></>,
    account: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function ProductImage({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false)
  if (!product.imagem_url || failed) {
    return <div className="catalog-image-fallback" role="img" aria-label={`Imagem indisponível para ${product.nome}`}>
      <span aria-hidden="true">◇</span><small>Imagem indisponível</small>
    </div>
  }
  return <img className="catalog-product-image" src={product.imagem_url} alt={product.nome} loading="lazy" onError={() => setFailed(true)} />
}

function ProductCard({ product }: { product: Product }) {
  return <li className="catalog-card">
    <div className="catalog-image-frame"><ProductImage product={product} /></div>
    <div className="catalog-card-content">
      <p className="catalog-card-category">{product.subcategoria ? `${product.subcategoria.categoria.nome} · ${product.subcategoria.nome}` : 'Sem categoria'}</p>
      <h2>{product.nome}</h2>
      {product.marca && <p className="catalog-card-brand">{product.marca.nome}</p>}
      <p className="catalog-card-price">{money.format(Number(product.preco))}</p>
    </div>
  </li>
}

function requestError(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 422) return 'Confira os filtros informados e tente novamente.'
  return 'Não foi possível carregar os produtos. Verifique sua conexão e tente novamente.'
}

export function CatalogPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [searchText, setSearchText] = useState('')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')
  const [brandId, setBrandId] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState<CatalogProductQuery['sort']>('name_asc')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<ProductPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    getCategories(controller.signal).then(setCategories).catch(() => {
      if (!controller.signal.aborted) setCategories([])
    })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    getBrands(controller.signal).then(setBrands).catch(() => {
      if (!controller.signal.aborted) setBrands([])
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchText.trim()), 300)
    return () => window.clearTimeout(timeout)
  }, [searchText])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const query: CatalogProductQuery = { page, page_size: pageSize, sort }
    if (search) query.q = search
    if (categoryId) query.category_id = Number(categoryId)
    if (subcategoryId) query.subcategory_id = Number(subcategoryId)
    if (brandId) query.brand_id = Number(brandId)
    if (minPrice !== '') query.min_price = minPrice
    if (maxPrice !== '') query.max_price = maxPrice

    setLoading(true)
    setError('')
    getCatalogProducts(query, controller.signal).then((response) => {
      if (active) setResult(response)
    }).catch((cause: unknown) => {
      if (active) setError(requestError(cause))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [search, categoryId, subcategoryId, brandId, minPrice, maxPrice, sort, page, retry])

  const availableSubcategories = categories.find((category) => String(category.id) === categoryId)?.subcategorias ?? []
  const products = result?.items ?? []

  return <div className="storefront">
    <header className="storefront-topbar">
      <a className="storefront-brand" href="/catalog" aria-label="Gamer Store — catálogo">
        <span className="storefront-brand-mark" aria-hidden="true">G</span><span>GAMER STORE</span>
      </a>
      <label className="storefront-search">
        <span className="visually-hidden">Pesquisar produtos</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
        <input type="search" value={searchText} onChange={(event) => { setSearchText(event.target.value); setPage(1) }} placeholder="Buscar produtos" />
      </label>
      <div className="storefront-shortcuts" role="group" aria-label="Atalhos visuais da loja">
        <span className="storefront-shortcut" role="img" aria-label="Favoritos"><StoreIcon name="heart" /><span>Favoritos</span></span>
        <span className="storefront-shortcut" role="img" aria-label="Carrinho"><StoreIcon name="cart" /><span>Carrinho</span></span>
        <span className="storefront-shortcut" role="img" aria-label="Conta"><StoreIcon name="account" /><span>Conta</span></span>
      </div>
    </header>

    <main className="storefront-main">
      <section className="catalog-toolbar" aria-label="Filtros do catálogo">
        <label>Categoria
          <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setSubcategoryId(''); setPage(1) }}>
            <option value="">Todas</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}
          </select>
        </label>
        <label>Subcategoria
          <select value={subcategoryId} disabled={!categoryId} onChange={(event) => { setSubcategoryId(event.target.value); setPage(1) }}>
            <option value="">Todas</option>{availableSubcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.id}>{subcategory.nome}</option>)}
          </select>
        </label>
        <label>Marca<select value={brandId} onChange={(event) => { setBrandId(event.target.value); setPage(1) }}>
          <option value="">Todas</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.nome}</option>)}
        </select></label>
        <label>Preço mínimo<input type="number" min="0" step="0.01" value={minPrice} onChange={(event) => { setMinPrice(event.target.value); setPage(1) }} /></label>
        <label>Preço máximo<input type="number" min="0" step="0.01" value={maxPrice} onChange={(event) => { setMaxPrice(event.target.value); setPage(1) }} /></label>
        <label>Ordenar por
          <select value={sort} onChange={(event) => { setSort(event.target.value as CatalogProductQuery['sort']); setPage(1) }}>
            <option value="name_asc">Nome: A–Z</option><option value="name_desc">Nome: Z–A</option>
            <option value="price_asc">Menor preço</option><option value="price_desc">Maior preço</option>
          </select>
        </label>
      </section>

      <div className="catalog-results-heading"><h2>Produtos</h2>{result && <span>{result.total_items} {result.total_items === 1 ? 'produto' : 'produtos'}</span>}</div>
      {loading ? <p className="catalog-status" role="status">Carregando produtos…</p>
        : error ? <div className="catalog-error" role="alert"><p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button></div>
          : products.length === 0 ? <p className="catalog-status" role="status">Nenhum produto encontrado.</p>
            : <ul className="catalog-grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</ul>}

      {!loading && !error && result && result.total_pages > 0 && <nav className="catalog-pagination" aria-label="Paginação do catálogo">
        <button type="button" disabled={result.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
        <span aria-live="polite">Página {result.page} de {result.total_pages}</span>
        <button type="button" disabled={result.page >= result.total_pages} onClick={() => setPage((current) => Math.min(result.total_pages, current + 1))}>Próxima</button>
      </nav>}
    </main>
  </div>
}
