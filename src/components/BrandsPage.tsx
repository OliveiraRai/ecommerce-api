import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { createBrand, deleteBrand, getBrands, updateBrand, type Brand } from '../api/brands'
import { PageHeader } from './PageHeader'

function message(cause: unknown, action: string) {
  if (cause instanceof ApiError) {
    if (cause.status === 401 || cause.status === 403) return 'Você não tem permissão para esta operação.'
    if (cause.status === 404) return 'A marca não foi encontrada. Atualize a lista e tente novamente.'
    if (cause.status === 409) return 'Já existe uma marca com esse nome ou ela está associada a produtos.'
    if (cause.status === 422) return 'Informe um nome de marca válido, com até 120 caracteres.'
  }
  return `Não foi possível ${action}. Verifique a conexão e tente novamente.`
}

export function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<Brand | null>(null)
  const [busy, setBusy] = useState(false)

  async function refresh(signal?: AbortSignal) {
    const response = await getBrands(signal)
    setBrands(response)
  }

  useEffect(() => {
    const controller = new AbortController()
    refresh(controller.signal).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(message(cause, 'carregar as marcas'))
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [])

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const created = await createBrand(name.trim())
      await refresh()
      setName('')
      setNotice(`Marca “${created.nome}” cadastrada com sucesso.`)
    } catch (cause) { setError(message(cause, 'cadastrar a marca')) }
    finally { setBusy(false) }
  }

  async function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || busy) return
    const form = new FormData(event.currentTarget)
    setBusy(true); setError(''); setNotice('')
    try {
      const updated = await updateBrand(editing.id, String(form.get('brand_name') ?? '').trim())
      await refresh()
      setEditing(null)
      setNotice(`Marca “${updated.nome}” atualizada com sucesso.`)
    } catch (cause) { setError(message(cause, 'atualizar a marca')) }
    finally { setBusy(false) }
  }

  async function remove(brand: Brand) {
    if (!window.confirm(`Excluir a marca “${brand.nome}”?`)) return
    setError(''); setNotice('')
    try {
      await deleteBrand(brand.id)
      await refresh()
      setNotice(`Marca “${brand.nome}” excluída com sucesso.`)
    } catch (cause) { setError(message(cause, 'excluir a marca')) }
  }

  return <div className="dashboard-content">
    <PageHeader title="Marcas" description="Cadastre e organize as marcas disponíveis no catálogo." />
    {notice && <p className="feedback success" role="status">{notice}</p>}
    {error && <p className="feedback error" role="alert">{error}</p>}
    <section className="data-panel brand-create-panel" aria-label="Cadastrar marca">
      <form className="product-form" onSubmit={(event) => void submitCreate(event)}>
        <label>Nome da marca<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} /></label>
        <button className="primary-action" disabled={busy}>{busy ? 'Salvando…' : 'Cadastrar marca'}</button>
      </form>
    </section>
    <section className="data-panel" aria-label="Marcas cadastradas">
      {loading ? <p className="panel-status" role="status">Carregando marcas…</p>
        : brands.length === 0 ? <p className="panel-status">Nenhuma marca cadastrada.</p>
          : <div className="responsive-table"><table><thead><tr><th>Marca</th><th>Ações</th></tr></thead><tbody>
            {brands.map((brand) => <tr key={brand.id}><td><strong>{brand.nome}</strong></td><td className="row-actions">
              <button type="button" onClick={() => { setError(''); setEditing(brand) }}>Editar</button>
              <button type="button" className="danger-action" onClick={() => void remove(brand)}>Excluir</button>
            </td></tr>)}
          </tbody></table></div>}
    </section>
    {editing && <div className="modal-backdrop" role="presentation"><section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="brand-edit-title">
      <div className="section-heading"><h2 id="brand-edit-title">Editar marca</h2><button type="button" className="icon-button" onClick={() => setEditing(null)} aria-label="Fechar">×</button></div>
      <form className="product-form" onSubmit={(event) => void submitUpdate(event)}>
        <label>Nome da marca<input name="brand_name" required maxLength={120} defaultValue={editing.nome} /></label>
        <div className="dialog-actions"><button type="button" className="secondary-action" onClick={() => setEditing(null)}>Cancelar</button><button className="primary-action" disabled={busy}>{busy ? 'Salvando…' : 'Salvar marca'}</button></div>
      </form>
    </section></div>}
  </div>
}
