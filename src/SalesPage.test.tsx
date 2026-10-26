import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SalesPage } from './components/SalesPage'
import { ApiError } from './api/client'

const api = vi.hoisted(() => ({ getSales: vi.fn(), getSale: vi.fn() }))
vi.mock('./api/sales', () => api)
vi.mock('./api/client', () => ({ ApiError: class ApiError extends Error { constructor(public status: number) { super() } } }))

const sale = { id: 5, cliente_id: 9, data_venda: '2026-10-26T12:30:00Z', itens: [{ id: 1, produto_id: 22, quantidade: 2, preco_unitario: '49.90' }] }
beforeEach(() => { vi.clearAllMocks(); api.getSales.mockResolvedValue([sale]); api.getSale.mockResolvedValue(sale) })

describe('sales page', () => {
  it('lists persisted sales and shows item details with historical subtotals', async () => {
    const user = userEvent.setup()
    render(<SalesPage />)
    expect(await screen.findByText('Cliente #9')).toBeInTheDocument()
    expect(screen.getByText(/26\/10\/2026/)).toBeInTheDocument()
    expect(screen.getByText(/99,80/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver detalhes' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Produto #22')
    expect(screen.getByRole('dialog')).toHaveTextContent('Preço histórico')
    expect(screen.getByRole('dialog')).toHaveTextContent('49,90')
  })

  it('shows an empty list and both communication and forbidden errors', async () => {
    api.getSales.mockResolvedValueOnce([])
    const { unmount } = render(<SalesPage />)
    expect(await screen.findByText('Nenhuma venda registrada.')).toBeInTheDocument()
    unmount()
    api.getSales.mockRejectedValueOnce(new ApiError(403))
    render(<SalesPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('não tem permissão')
  })
})
