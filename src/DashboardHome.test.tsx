import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardHome } from './components/DashboardHome'

afterEach(() => vi.unstubAllGlobals())
beforeEach(() => window.sessionStorage.clear())

describe('dashboard home', () => {
  const summary = { total_products: 128, total_sales: 24, total_revenue: '1234.56' }
  const sales = [{ id: 17, cliente_id: 9, data_venda: '2026-10-20T12:30:00Z', itens: [
    { id: 1, produto_id: 4, quantidade: 2, preco_unitario: '12.50' },
  ] }]
  const successfulFetch = vi.fn((input: RequestInfo | URL) => Promise.resolve({
    ok: true,
    json: async () => String(input).includes('recent-sales') ? sales : summary,
  }))

  it('shows a loading state before summary data arrives', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<DashboardHome />)

    expect(screen.getByText('Carregando indicadores…')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Vendas recentes' })).toBeInTheDocument()
  })

  it('renders real summary values and formats revenue as Brazilian currency', async () => {
    vi.stubGlobal('fetch', successfulFetch)
    render(<DashboardHome />)

    expect(await screen.findByText(/R\$\s*1\.234,56/)).toBeInTheDocument()
    expect(screen.getByText('128')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    expect(await screen.findByText('Cliente #9')).toBeInTheDocument()
    expect(screen.getByText(/25,00/)).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/v1/admin/dashboard/summary', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(fetch).toHaveBeenCalledWith('/api/v1/admin/dashboard/recent-sales', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('shows an indicator error without misrepresenting the sales list as empty', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => String(input).includes('recent-sales')
      ? Promise.resolve({ ok: true, json: async () => [] })
      : Promise.reject(new Error('unauthorized'))))
    render(<DashboardHome />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os indicadores.')
    expect(await screen.findByRole('status')).toHaveTextContent('Nenhuma venda registrada.')
  })

  it('shows a friendly error for an unsuccessful HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(
      String(input).includes('recent-sales') ? { ok: true, json: async () => [] } : { ok: false },
    )))
    render(<DashboardHome />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('reports forbidden access separately from connectivity failures', async () => {
    window.sessionStorage.setItem('gamer-store.admin-session', JSON.stringify({ accessToken: 'valid-token', expiresAt: Date.now() + 60_000 }))
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(
      String(input).includes('recent-sales') ? { ok: true, json: async () => [] } : { ok: false, status: 403 },
    )))
    render(<DashboardHome />)

    expect(await screen.findByRole('alert')).toHaveTextContent('não tem permissão')
    expect(new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer valid-token')
  })

  it('shows a connectivity message when the dashboard request cannot reach the API', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => String(input).includes('recent-sales')
      ? Promise.resolve({ ok: true, json: async () => [] })
      : Promise.reject(new Error('offline'))))
    render(<DashboardHome />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Verifique sua conexão')
    expect(screen.getByRole('alert')).not.toHaveTextContent('permissão')
  })
})
