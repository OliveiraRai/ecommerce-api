import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductsPage } from './components/ProductsPage'
import { ApiError } from './api/client'

const api = vi.hoisted(() => ({ getProducts: vi.fn(), getProduct: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), deleteProduct: vi.fn() }))
const brandApi = vi.hoisted(() => ({ getBrands: vi.fn() }))
vi.mock('./api/products', () => api)
vi.mock('./api/brands', () => brandApi)
const categoryApi = vi.hoisted(() => ({ getCategories: vi.fn() }))
vi.mock('./api/categories', () => categoryApi)
vi.mock('./api/client', () => ({ ApiError: class ApiError extends Error { constructor(public status: number) { super() } } }))

const product = {
  id: 1, nome: 'Mouse gamer', descricao: 'Sem fio', imagem_url: 'https://images.example.com/mouse.png',
  marca_id: 7, marca: { id: 7, nome: 'Logitech' }, preco: '125.50', estoque: 4,
  subcategoria_id: 10, subcategoria: { id: 10, categoria_id: 1, nome: 'Mouses', categoria: { id: 1, nome: 'Periféricos' } },
}
beforeEach(() => {
  vi.clearAllMocks()
  api.getProducts.mockResolvedValue([product])
  api.getProduct.mockResolvedValue(product); api.createProduct.mockResolvedValue({ ...product, id: 2 })
  api.updateProduct.mockResolvedValue({ ...product, nome: 'Mouse novo' }); api.deleteProduct.mockResolvedValue(undefined)
  categoryApi.getCategories.mockResolvedValue([
    { id: 1, nome: 'Periféricos', subcategorias: [{ id: 10, categoria_id: 1, nome: 'Mouses' }, { id: 11, categoria_id: 1, nome: 'Teclados' }] },
    { id: 2, nome: 'Componentes', subcategorias: [{ id: 20, categoria_id: 2, nome: 'Memórias' }] },
  ])
  brandApi.getBrands.mockResolvedValue([{ id: 7, nome: 'Logitech' }])
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
    await user.type(screen.getByLabelText('URL da imagem'), 'https://images.example.com/control.png')
    await user.selectOptions(screen.getByLabelText('Marca'), '7')
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
    expect(api.createProduct).toHaveBeenLastCalledWith(expect.objectContaining({
      imagem_url: 'https://images.example.com/control.png', marca_id: 7, subcategoria_id: null,
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('cadastrado com sucesso')

    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await screen.findByRole('dialog')
    expect(screen.getByLabelText('URL da imagem')).toHaveValue('https://images.example.com/mouse.png')
    expect(screen.getByLabelText('Marca')).toHaveValue('7')
    await user.clear(screen.getByLabelText('Nome'))
    await user.type(screen.getByLabelText('Nome'), 'Mouse revisado')
    await user.click(screen.getByRole('button', { name: 'Salvar produto' }))
    await waitFor(() => expect(api.updateProduct).toHaveBeenCalledWith(1, expect.objectContaining({
      nome: 'Mouse revisado', imagem_url: 'https://images.example.com/mouse.png', marca_id: 7,
    })))
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

  it('filters subcategories by selected category, clears incompatible choices and initializes edit fields', async () => {
    const user = userEvent.setup()
    render(<ProductsPage />)
    await screen.findByText('Mouse gamer')
    await user.click(screen.getByRole('button', { name: 'Cadastrar produto' }))

    const category = screen.getByLabelText('Categoria')
    const subcategory = screen.getByLabelText('Subcategoria')
    expect(subcategory).toBeDisabled()
    await user.selectOptions(category, '1')
    expect(within(subcategory).getByRole('option', { name: 'Mouses' })).toBeInTheDocument()
    expect(within(subcategory).queryByRole('option', { name: 'Memórias' })).not.toBeInTheDocument()
    await user.selectOptions(subcategory, '10')
    await user.selectOptions(category, '2')
    expect(subcategory).toHaveValue('')
    expect(within(subcategory).queryByRole('option', { name: 'Mouses' })).not.toBeInTheDocument()
    expect(within(subcategory).getByRole('option', { name: 'Memórias' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await screen.findByRole('dialog')
    expect(screen.getByLabelText('Categoria')).toHaveValue('1')
    expect(screen.getByLabelText('Subcategoria')).toHaveValue('10')
  })

  it('shows load errors and forbidden feedback', async () => {
    api.getProducts.mockRejectedValueOnce(new ApiError(403))
    render(<ProductsPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('não tem permissão')
  })
})
