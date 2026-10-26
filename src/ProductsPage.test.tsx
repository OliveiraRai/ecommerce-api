import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductsPage } from './components/ProductsPage'
import { ApiError } from './api/client'

const api = vi.hoisted(() => ({ getProducts: vi.fn(), getProduct: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), deleteProduct: vi.fn() }))
vi.mock('./api/products', () => api)
vi.mock('./api/client', () => ({ ApiError: class ApiError extends Error { constructor(public status: number) { super() } } }))

const product = { id: 1, nome: 'Mouse gamer', descricao: 'Sem fio', preco: '125.50', estoque: 4 }
beforeEach(() => {
  vi.clearAllMocks()
  api.getProducts.mockResolvedValue([product])
  api.getProduct.mockResolvedValue(product); api.createProduct.mockResolvedValue({ ...product, id: 2 })
  api.updateProduct.mockResolvedValue({ ...product, nome: 'Mouse novo' }); api.deleteProduct.mockResolvedValue(undefined)
  vi.stubGlobal('confirm', vi.fn(() => true))
})

describe('products page', () => {
  it('loads real products, shows details and handles an empty list', async () => {
    const user = userEvent.setup()
    render(<ProductsPage />)
    expect(await screen.findByText('Mouse gamer')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('125,50')
    api.getProducts.mockResolvedValueOnce([])
    const { unmount } = render(<ProductsPage />)
    expect(await screen.findByText('Nenhum produto cadastrado.')).toBeInTheDocument()
    unmount()
  })

  it('creates and edits through the API, keeping a rejected form open', async () => {
    const user = userEvent.setup()
    render(<ProductsPage />)
    await screen.findByText('Mouse gamer')
    await user.click(screen.getByRole('button', { name: 'Cadastrar produto' }))
    await user.type(screen.getByLabelText('Nome'), 'Controle')
    await user.type(screen.getByLabelText('Preço (R$)'), '99.90')
    await user.clear(screen.getByLabelText('Estoque'))
    await user.type(screen.getByLabelText('Estoque'), '3')
    api.createProduct.mockRejectedValueOnce(new ApiError(422))
    await user.click(screen.getByRole('button', { name: 'Salvar produto' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Confira os campos')
    expect(screen.getByLabelText('Nome')).toHaveValue('Controle')
    api.createProduct.mockResolvedValueOnce({ ...product, nome: 'Controle' })
    await user.click(screen.getByRole('button', { name: 'Salvar produto' }))
    await waitFor(() => expect(api.createProduct).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('status')).toHaveTextContent('cadastrado com sucesso')

    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await screen.findByRole('dialog')
    await user.clear(screen.getByLabelText('Nome'))
    await user.type(screen.getByLabelText('Nome'), 'Mouse revisado')
    await user.click(screen.getByRole('button', { name: 'Salvar produto' }))
    await waitFor(() => expect(api.updateProduct).toHaveBeenCalledWith(1, expect.objectContaining({ nome: 'Mouse revisado' })))
  })

  it('confirms deletion, supports cancel and presents delete errors', async () => {
    const user = userEvent.setup()
    render(<ProductsPage />)
    await screen.findByText('Mouse gamer')
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(api.deleteProduct).not.toHaveBeenCalled()
    vi.mocked(window.confirm).mockReturnValueOnce(true)
    api.deleteProduct.mockRejectedValueOnce(new ApiError(409))
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('associado a vendas')
    expect(api.deleteProduct).toHaveBeenCalledWith(1)
  })

  it('shows load errors and forbidden feedback', async () => {
    api.getProducts.mockRejectedValueOnce(new ApiError(403))
    render(<ProductsPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('não tem permissão')
  })
})
