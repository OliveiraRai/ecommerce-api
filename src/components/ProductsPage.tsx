import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { getBrands, type Brand } from '../api/brands'
import { getCategories, type Category } from '../api/categories'
import {
  createProduct, deleteProduct, getProduct, getProducts, updateProduct, type Product, type ProductInput, type ProductPage,
} from '../api/products'
import { PageHeader } from './PageHeader'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
function failure(cause: unknown, action: string) {
  if (cause instanceof ApiError) {
    if (cause.status === 403) return 'Você não tem permissão para esta operação.'
    if (cause.status === 404) return 'O produto não foi encontrado. Atualize a lista e tente novamente.'
    if (cause.status === 409) return action === 'excluir o produto' ? 'Este produto está associado a vendas e não pode ser excluído.' : 'A alteração conflita com um vínculo existente ou com um nome já cadastrado.'
    if (cause.status === 422) return action.includes('produto') ? 'Confira os campos do produto e a subcategoria selecionada.' : 'Confira o nome e os dados informados.'
  }
  return `Não foi possível ${action}. Verifique a conexão e tente novamente.`
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [page, setPage] = useState(1)
  const [pageInfo, setPageInfo] = useState({ page: 1, page_size: 20, total_items: 0, total_pages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<Product | null>(null)
  const [editing, setEditing] = useState<Product | null | false>(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh(signal?: AbortSignal, requestedPage = page) {
    const result = await getProducts(requestedPage, 20, signal)
    // Accept the legacy array shape while callers transition to the paginated contract.
    if (Array.isArray(result)) {
      setProducts(result)
      setPageInfo({ page: requestedPage, page_size: 20, total_items: result.length, total_pages: result.length ? 1 : 0 })
    } else {
      const catalog = result as ProductPage
      setProducts(catalog.items)
      setPageInfo({ page: catalog.page, page_size: catalog.page_size, total_items: catalog.total_items, total_pages: catalog.total_pages })
    }
  }
  useEffect(() => {
    const controller = new AbortController()
    refresh(controller.signal, page).catch((cause: unknown) => { if (!controller.signal.aborted) setError(failure(cause, 'carregar os produtos')) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [page])
  useEffect(() => {
    if (typeof getCategories !== 'function') return
    const controller = new AbortController()
    getCategories(controller.signal).then(setCategories).catch(() => {
      if (!controller.signal.aborted) setCategories([])
    })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    getBrands(controller.signal).then(setBrands).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(failure(cause, 'carregar as marcas'))
    })
    return () => controller.abort()
  }, [])

  async function openEdit(product: Product) {
    setError('')
    try {
      const fullProduct = await getProduct(product.id)
      setSelectedCategoryId(fullProduct.subcategoria ? String(fullProduct.subcategoria.categoria_id) : '')
      setSelectedSubcategoryId(fullProduct.subcategoria_id ? String(fullProduct.subcategoria_id) : '')
      setEditing(fullProduct)
    }
    catch (cause) { setError(failure(cause, 'consultar o produto')) }
  }
  async function openDetails(product: Product) {
    setError('')
    try { setSelected(await getProduct(product.id)) }
    catch (cause) { setError(failure(cause, 'consultar o produto')) }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    const data = new FormData(event.currentTarget)
    const input: ProductInput = {
      nome: String(data.get('nome')).trim(),
      descricao: String(data.get('descricao')).trim() || null,
      imagem_url: String(data.get('imagem_url')).trim() || null,
      marca_id: String(data.get('marca_id') ?? '') ? Number(data.get('marca_id')) : null,
      preco: String(data.get('preco')),
      estoque: Number(data.get('estoque')),
      subcategoria_id: selectedSubcategoryId ? Number(selectedSubcategoryId) : null,
    }
    try {
      const result = editing ? await updateProduct(editing.id, input) : await createProduct(input)
      setPage(1)
      await refresh(undefined, 1)
      setEditing(false); setNotice(`Produto “${result.nome}” ${editing ? 'atualizado' : 'cadastrado'} com sucesso.`)
    } catch (cause) { setError(failure(cause, editing ? 'salvar as alterações' : 'cadastrar o produto')) }
    finally { setBusy(false) }
  }
  async function remove(product: Product) {
    if (!window.confirm(`Excluir o produto “${product.nome}”? Esta ação não pode ser desfeita.`)) return
    setError(''); setNotice('')
    try { await deleteProduct(product.id); await refresh(); setNotice('Produto excluído com sucesso.') }
    catch (cause) { setError(failure(cause, 'excluir o produto')) }
  }

  function openCreate() {
    setError('')
    setSelectedCategoryId('')
    setSelectedSubcategoryId('')
    setEditing(null)
  }

  function closeProductForm() {
    setEditing(false)
    setSelectedCategoryId('')
    setSelectedSubcategoryId('')
  }

  const availableSubcategories = categories.find((category) => String(category.id) === selectedCategoryId)?.subcategorias ?? []

  return <div className="dashboard-content">
    <PageHeader title="Produtos" description="Consulte e mantenha o catálogo da sua loja atualizado." />
    <div className="page-actions"><button className="primary-action" onClick={openCreate}>Cadastrar produto</button></div>
    {notice && <p className="feedback success" role="status">{notice}</p>}{error && <p className="feedback error" role="alert">{error}</p>}
    <section className="data-panel" aria-label="Lista de produtos">
      {loading ? <p className="panel-status" role="status">Carregando produtos…</p> : error && products.length === 0 ? null : products.length === 0 ? <p className="panel-status">Nenhum produto cadastrado.</p> : <div className="responsive-table"><table><thead><tr><th>Produto</th><th>Categoria</th><th>Marca</th><th>Preço</th><th>Estoque</th><th>Ações</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><strong>{product.nome}</strong></td><td>{product.subcategoria ? `${product.subcategoria.categoria.nome} / ${product.subcategoria.nome}` : 'Sem categoria'}</td><td>{product.marca?.nome || '—'}</td><td>{money.format(Number(product.preco))}</td><td>{product.estoque}</td><td className="row-actions"><button onClick={() => void openDetails(product)}>Ver</button><button onClick={() => void openEdit(product)}>Editar</button><button className="danger-action" onClick={() => void remove(product)}>Excluir</button></td></tr>)}</tbody></table></div>}
      {!loading && pageInfo.total_pages > 0 && <nav className="page-actions" aria-label="Paginação de produtos"><button className="secondary-action" disabled={pageInfo.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button><span>Página {pageInfo.page} de {pageInfo.total_pages} · {pageInfo.total_items} produtos</span><button className="secondary-action" disabled={pageInfo.page >= pageInfo.total_pages} onClick={() => setPage((current) => Math.min(pageInfo.total_pages, current + 1))}>Próxima</button></nav>}
    </section>
    {editing !== false && <div className="modal-backdrop" role="presentation"><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="product-form-title"><div className="section-heading"><h2 id="product-form-title">{editing ? 'Editar produto' : 'Cadastrar produto'}</h2><button type="button" className="icon-button" onClick={closeProductForm} aria-label="Fechar">×</button></div>
      <form className="product-form" onSubmit={submit}>
        <label>Nome<input name="nome" required maxLength={200} defaultValue={editing?.nome ?? ''} /></label>
        <label>Descrição<textarea name="descricao" rows={3} defaultValue={editing?.descricao ?? ''} /></label>
        <label>URL da imagem<input name="imagem_url" type="url" defaultValue={editing?.imagem_url ?? ''} /></label>
        <label>Marca<select name="marca_id" defaultValue={editing?.marca_id?.toString() ?? ''}><option value="">Sem marca</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.nome}</option>)}</select></label>
        <label>Categoria<select aria-label="Categoria" value={selectedCategoryId} onChange={(event) => { setSelectedCategoryId(event.target.value); setSelectedSubcategoryId('') }}><option value="">Sem categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}</select></label>
        <label>Subcategoria<select name="subcategoria_id" value={selectedSubcategoryId} disabled={!selectedCategoryId} onChange={(event) => setSelectedSubcategoryId(event.target.value)}><option value="">Sem subcategoria</option>{availableSubcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.id}>{subcategory.nome}</option>)}</select></label>
        <div className="form-row"><label>Preço (R$)<input name="preco" type="number" min="0" step="0.01" required defaultValue={editing ? Number(editing.preco).toFixed(2) : ''} /></label><label>Estoque<input name="estoque" type="number" min="0" step="1" required defaultValue={editing?.estoque ?? 0} /></label></div>
        <div className="dialog-actions"><button type="button" className="secondary-action" onClick={closeProductForm}>Cancelar</button><button className="primary-action" disabled={busy}>{busy ? 'Salvando…' : 'Salvar produto'}</button></div>
      </form>
    </section></div>}
    {selected && <div className="modal-backdrop" role="presentation"><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="product-detail-title"><div className="section-heading"><h2 id="product-detail-title">Detalhes do produto</h2><button className="icon-button" onClick={() => setSelected(null)} aria-label="Fechar">×</button></div><dl className="detail-list"><dt>Nome</dt><dd>{selected.nome}</dd><dt>Descrição</dt><dd>{selected.descricao || 'Sem descrição'}</dd><dt>URL da imagem</dt><dd>{selected.imagem_url || 'Sem imagem'}</dd><dt>Categoria</dt><dd>{selected.subcategoria ? `${selected.subcategoria.categoria.nome} / ${selected.subcategoria.nome}` : 'Sem categoria'}</dd><dt>Marca</dt><dd>{selected.marca?.nome || 'Sem marca'}</dd><dt>Preço</dt><dd>{money.format(Number(selected.preco))}</dd><dt>Estoque</dt><dd>{selected.estoque}</dd></dl></section></div>}
  </div>
}
