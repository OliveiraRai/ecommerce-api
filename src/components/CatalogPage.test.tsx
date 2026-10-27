import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogPage } from './CatalogPage'

const api = vi.hoisted(() => ({ getCatalogProducts: vi.fn(), getCategories: vi.fn(), getBrands: vi.fn() }))
vi.mock('../api/products', () => ({ getCatalogProducts: api.getCatalogProducts }))
vi.mock('../api/categories', () => ({ getCategories: api.getCategories }))
vi.mock('../api/brands', () => ({ getBrands: api.getBrands }))

const categoryTree = [
  { id: 1, nome: 'Periféricos', subcategorias: [{ id: 10, categoria_id: 1, nome: 'Mouses' }] },
  { id: 2, nome: 'Componentes', subcategorias: [{ id: 20, categoria_id: 2, nome: 'Memórias' }] },
]
const mouse = {
  id: 1, nome: 'Mouse gamer', descricao: 'Óptico', imagem_url: 'https://images.example.com/mouse.png',
  marca_id: 7, marca: { id: 7, nome: 'Logitech' }, preco: '249.90', estoque: 5, subcategoria_id: 10,
  subcategoria: { id: 10, nome: 'Mouses', categoria: { id: 1, nome: 'Periféricos' } },
}
const emptyResult = { items: [], page: 1, page_size: 12, total_items: 0, total_pages: 0 }
const pageResult = { items: [mouse], page: 1, page_size: 12, total_items: 13, total_pages: 2 }

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  api.getCategories.mockResolvedValue(categoryTree)
  api.getBrands.mockResolvedValue([{ id: 7, nome: 'Logitech' }, { id: 8, nome: 'Razer' }])
  api.getCatalogProducts.mockImplementation(async (query) => ({ ...pageResult, page: query.page ?? 1 }))
})

describe('public catalog', () => {
  it('exposes filters, shortcuts, products, and pagination through accessible semantics', async () => {
    render(<CatalogPage />)
    expect(await screen.findByRole('heading', { name: 'Mouse gamer' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Pesquisar produtos' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Atalhos visuais da loja' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Favoritos' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Subcategoria' })).toBeDisabled()
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Paginação do catálogo' })).toBeInTheDocument()
  })

  it('combines filters, resets page, and clears subcategory when category changes', async () => {
    const user = userEvent.setup()
    render(<CatalogPage />)
    expect(await screen.findByRole('heading', { name: 'Mouse gamer' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Próxima' }))
    await waitFor(() => expect(api.getCatalogProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, page_size: 12 }), expect.any(AbortSignal),
    ))

    await user.selectOptions(screen.getByLabelText('Categoria'), '1')
    await user.selectOptions(screen.getByLabelText('Subcategoria'), '10')
    await user.selectOptions(screen.getByLabelText('Marca'), '7')
    await user.type(screen.getByLabelText('Preço mínimo'), '100')
    await user.type(screen.getByLabelText('Preço máximo'), '300')
    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'price_asc')
    await waitFor(() => expect(api.getCatalogProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({
        category_id: 1, subcategory_id: 10, brand_id: 7, min_price: '100', max_price: '300',
        sort: 'price_asc', page: 1, page_size: 12,
      }), expect.any(AbortSignal),
    ))

    await user.click(screen.getByRole('button', { name: 'Próxima' }))
    await waitFor(() => expect(api.getCatalogProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({
        category_id: 1, subcategory_id: 10, brand_id: 7, min_price: '100', max_price: '300',
        sort: 'price_asc', page: 2, page_size: 12,
      }), expect.any(AbortSignal),
    ))

    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'price_desc')
    await waitFor(() => expect(api.getCatalogProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ category_id: 1, subcategory_id: 10, sort: 'price_desc', page: 1 }),
      expect.any(AbortSignal),
    ))

    await user.selectOptions(screen.getByLabelText('Categoria'), '2')
    expect(screen.getByLabelText('Subcategoria')).toHaveValue('')
    await waitFor(() => expect(api.getCatalogProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ category_id: 2, page: 1 }), expect.any(AbortSignal),
    ))
    expect(api.getCatalogProducts.mock.calls.at(-1)?.[0]).not.toHaveProperty('subcategory_id')
  })

  it('debounces text search and discards an obsolete response', async () => {
    let resolveOld!: (value: typeof pageResult) => void
    let resolveCurrent!: (value: typeof pageResult) => void
    api.getCatalogProducts
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveCurrent = resolve }))

    vi.useFakeTimers()
    render(<CatalogPage />)
    const search = screen.getByRole('searchbox', { name: 'Pesquisar produtos' })
    fireEvent.change(search, { target: { value: 'teclado' } })
    expect(api.getCatalogProducts).toHaveBeenCalledTimes(1)

    await act(async () => { vi.advanceTimersByTime(299) })
    expect(api.getCatalogProducts).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(api.getCatalogProducts).toHaveBeenCalledTimes(2)
    expect(api.getCatalogProducts.mock.calls[0]?.[1]?.aborted).toBe(true)

    const current = { ...pageResult, items: [{ ...mouse, id: 2, nome: 'Teclado atual' }] }
    await act(async () => { resolveCurrent(current); await Promise.resolve() })
    await act(async () => { resolveOld(pageResult); await Promise.resolve() })
    vi.useRealTimers()
    expect(await screen.findByRole('heading', { name: 'Teclado atual' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mouse gamer' })).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('resets pagination when a new search is entered', async () => {
    const user = userEvent.setup()
    render(<CatalogPage />)
    await screen.findByRole('heading', { name: 'Mouse gamer' })
    await user.click(screen.getByRole('button', { name: 'Próxima' }))
    await waitFor(() => expect(api.getCatalogProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }), expect.any(AbortSignal),
    ))

    fireEvent.change(screen.getByRole('searchbox', { name: 'Pesquisar produtos' }), { target: { value: 'teclado' } })
    await waitFor(() => expect(api.getCatalogProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'teclado', page: 1 }), expect.any(AbortSignal),
    ), { timeout: 1500 })
  })

  it('shows image, missing-image and failed-image states accessibly', async () => {
    api.getCatalogProducts.mockResolvedValue({
      ...pageResult,
        items: [mouse, { ...mouse, id: 2, nome: 'Produto sem imagem', imagem_url: null }, { ...mouse, id: 3, nome: 'Imagem quebrada' }],
    })
    render(<CatalogPage />)
    expect(await screen.findByRole('img', { name: 'Mouse gamer' })).toHaveAttribute('src', mouse.imagem_url)
    expect(screen.getByRole('img', { name: 'Imagem indisponível para Produto sem imagem' })).toBeInTheDocument()
    fireEvent.error(screen.getByRole('img', { name: 'Imagem quebrada' }))
    expect(screen.getByRole('img', { name: 'Imagem indisponível para Imagem quebrada' })).toBeInTheDocument()
    expect(screen.getAllByText((content) => content.includes('249,90'))).toHaveLength(3)
  })

  it('shows loading, empty results, API error, and retries', async () => {
    let resolveRequest!: (value: typeof emptyResult) => void
    api.getCatalogProducts.mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve }))
    const { rerender } = render(<CatalogPage />)
    expect(screen.getByRole('status')).toHaveTextContent('Carregando')
    await act(async () => { resolveRequest(emptyResult); await Promise.resolve() })
    expect(await screen.findByText('Nenhum produto encontrado.')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Paginação do catálogo' })).not.toBeInTheDocument()

    api.getCatalogProducts.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(pageResult)
    rerender(<CatalogPage />)
    // Trigger a new query through a filter so the rejected response is consumed.
    fireEvent.change(screen.getByLabelText('Marca'), { target: { value: '7' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Verifique sua conexão')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('heading', { name: 'Mouse gamer' })).toBeInTheDocument()
  })
})
