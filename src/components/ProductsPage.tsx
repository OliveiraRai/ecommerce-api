import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { createProduct, deleteProduct, getProduct, getProducts, updateProduct, type Product, type ProductInput } from '../api/products'
import { PageHeader } from './PageHeader'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
function failure(cause: unknown, action: string) {
  if (cause instanceof ApiError) {
    if (cause.status === 403) return 'Você não tem permissão para esta operação.'
    if (cause.status === 404) return 'O produto não foi encontrado. Atualize a lista e tente novamente.'
    if (cause.status === 409) return 'Este produto está associado a vendas e não pode ser excluído.'
    if (cause.status === 422) return 'Confira os campos: nome, preço e estoque precisam ser válidos.'
  }
  return `Não foi possível ${action}. Verifique a conexão e tente novamente.`
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<Product | null>(null)
  const [editing, setEditing] = useState<Product | null | false>(false)
  const [busy, setBusy] = useState(false)

  async function refresh(signal?: AbortSignal) {
    setProducts(await getProducts(signal))
  }
  useEffect(() => {
    const controller = new AbortController()
    refresh(controller.signal).catch((cause: unknown) => { if (!controller.signal.aborted) setError(failure(cause, 'carregar os produtos')) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  async function openEdit(product: Product) {
    setError('')
    try { setEditing(await getProduct(product.id)) }
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
    const input: ProductInput = { nome: String(data.get('nome')).trim(), descricao: String(data.get('descricao')).trim() || null, preco: String(data.get('preco')), estoque: Number(data.get('estoque')) }
    try {
      const result = editing ? await updateProduct(editing.id, input) : await createProduct(input)
      await refresh()
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

  return <div className="dashboard-content">
    <PageHeader title="Produtos" description="Consulte e mantenha o catálogo da sua loja atualizado." />
    <div className="page-actions"><button className="primary-action" onClick={() => { setError(''); setEditing(null) }}>Cadastrar produto</button></div>
    {notice && <p className="feedback success" role="status">{notice}</p>}{error && <p className="feedback error" role="alert">{error}</p>}
    <section className="data-panel" aria-label="Lista de produtos">
      {loading ? <p className="panel-status" role="status">Carregando produtos…</p> : error && products.length === 0 ? null : products.length === 0 ? <p className="panel-status">Nenhum produto cadastrado.</p> : <div className="responsive-table"><table><thead><tr><th>Produto</th><th>Preço</th><th>Estoque</th><th>Ações</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><strong>{product.nome}</strong></td><td>{money.format(Number(product.preco))}</td><td>{product.estoque}</td><td className="row-actions"><button onClick={() => void openDetails(product)}>Ver</button><button onClick={() => void openEdit(product)}>Editar</button><button className="danger-action" onClick={() => void remove(product)}>Excluir</button></td></tr>)}</tbody></table></div>}
    </section>
    {editing !== false && <div className="modal-backdrop" role="presentation"><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="product-form-title"><div className="section-heading"><h2 id="product-form-title">{editing ? 'Editar produto' : 'Cadastrar produto'}</h2><button className="icon-button" onClick={() => setEditing(false)} aria-label="Fechar">×</button></div>
      <form className="product-form" onSubmit={submit}>
        <label>Nome<input name="nome" required maxLength={200} defaultValue={editing?.nome ?? ''} /></label>
        <label>Descrição<textarea name="descricao" rows={3} defaultValue={editing?.descricao ?? ''} /></label>
        <div className="form-row"><label>Preço (R$)<input name="preco" type="number" min="0" step="0.01" required defaultValue={editing ? Number(editing.preco).toFixed(2) : ''} /></label><label>Estoque<input name="estoque" type="number" min="0" step="1" required defaultValue={editing?.estoque ?? 0} /></label></div>
        <div className="dialog-actions"><button type="button" className="secondary-action" onClick={() => setEditing(false)}>Cancelar</button><button className="primary-action" disabled={busy}>{busy ? 'Salvando…' : 'Salvar produto'}</button></div>
      </form>
    </section></div>}
    {selected && <div className="modal-backdrop" role="presentation"><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="product-detail-title"><div className="section-heading"><h2 id="product-detail-title">Detalhes do produto</h2><button className="icon-button" onClick={() => setSelected(null)} aria-label="Fechar">×</button></div><dl className="detail-list"><dt>Nome</dt><dd>{selected.nome}</dd><dt>Descrição</dt><dd>{selected.descricao || 'Sem descrição'}</dd><dt>Preço</dt><dd>{money.format(Number(selected.preco))}</dd><dt>Estoque</dt><dd>{selected.estoque}</dd></dl></section></div>}
  </div>
}
