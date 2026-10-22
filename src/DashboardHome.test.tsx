import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardHome } from './components/DashboardHome'

afterEach(() => vi.unstubAllGlobals())

describe('dashboard home', () => {
  it('shows a loading state before summary data arrives', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<DashboardHome />)

    expect(screen.getByText('Carregando indicadores…')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Vendas recentes' })).toBeInTheDocument()
  })

  it('renders real summary values and formats revenue as Brazilian currency', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ total_products: 128, total_sales: 24, total_revenue: '1234.56' }),
    }))
    render(<DashboardHome />)

    expect(await screen.findByText(/R\$\s*1\.234,56/)).toBeInTheDocument()
    expect(screen.getByText('128')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/v1/admin/dashboard/summary', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('shows an indicator error without misrepresenting the sales list as empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unauthorized')))
    render(<DashboardHome />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os indicadores.')
    expect(screen.getByRole('status')).toHaveTextContent('A API ainda não disponibiliza uma consulta de vendas recentes.')
  })

  it('shows a friendly error for an unsuccessful HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    render(<DashboardHome />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})
