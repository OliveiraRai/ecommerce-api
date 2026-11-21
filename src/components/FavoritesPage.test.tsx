import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveCustomerSession } from '../api/customerSession'
import { CustomerSessionProvider } from '../customer/CustomerSessionContext'
import { FavoritesProvider } from '../favorites/FavoritesContext'
import { CartProvider } from '../cart/CartContext'
import type { Favorite, FavoritePage } from '../api/favorites'
import { FavoritesPage } from './FavoritesPage'

const api = vi.hoisted(() => ({ getCustomerFavorites: vi.fn(), addCustomerFavorite: vi.fn(), removeCustomerFavorite: vi.fn() }))
const cartApi = vi.hoisted(() => ({ getCustomerCart: vi.fn(), addCustomerCartItem: vi.fn(), updateCustomerCartItem: vi.fn(), removeCustomerCartItem: vi.fn() }))
vi.mock('../api/favorites', () => api)
vi.mock('../api/cart', () => cartApi)

const mouse: Favorite = { id: 10, produto_id: 2, produto: { id: 2, nome: 'Mouse', imagem_url: 'https://example.com/mouse.png', preco: '19.99' } }
const headset: Favorite = { id: 11, produto_id: 3, produto: { id: 3, nome: 'Headset', imagem_url: null, preco: '89.90' } }
const page = (items: Favorite[], currentPage = 1, totalItems = items.length): FavoritePage => ({ items, page: currentPage, page_size: 12, total_items: totalItems, total_pages: Math.ceil(totalItems / 12) })

function renderPage() {
  return render(<CustomerSessionProvider><FavoritesProvider><CartProvider><FavoritesPage /></CartProvider></FavoritesProvider></CustomerSessionProvider>)
}

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  saveCustomerSession({ access_token: 'customer-token', token_type: 'bearer', expires_in: 1800 })
  api.getCustomerFavorites.mockResolvedValue(page([]))
  cartApi.getCustomerCart.mockResolvedValue({ id: 1, itens: [] })
  api.removeCustomerFavorite.mockResolvedValue(undefined)
})

describe('customer favorites page', () => {
  it('shows the empty state and a catalog link', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Você ainda não tem favoritos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver catálogo' })).toHaveAttribute('href', '/catalog')
  })

  it('shows loading, exposes retry after a load error, and retries the request', async () => {
    let resolveRequest!: (value: FavoritePage) => void
    api.getCustomerFavorites.mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve }))
    const view = renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Carregando')
    await act(async () => { resolveRequest(page([])); await Promise.resolve() })
    await screen.findByRole('heading', { name: 'Você ainda não tem favoritos' })
    view.unmount()
    api.getCustomerFavorites.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page([mouse])).mockResolvedValueOnce(page([mouse]))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar seus favoritos')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('heading', { name: 'Mouse' })).toBeInTheDocument()
  })

  it('renders a server page and removes only the selected favorite after 204 success', async () => {
    api.getCustomerFavorites.mockResolvedValue(page([mouse, headset], 1, 2))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Mouse' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Headset' })).toBeInTheDocument()
    expect(screen.getByText('R$ 19,99')).toBeInTheDocument()
    const removeButton = screen.getByRole('button', { name: 'Remover Mouse dos favoritos' })
    await userEvent.setup().click(removeButton)
    await waitFor(() => expect(api.removeCustomerFavorite).toHaveBeenCalledWith(2))
    expect(screen.queryByRole('heading', { name: 'Mouse' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Headset' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Mouse foi removido')
  })

  it('keeps the failed card and reports a per-item error', async () => {
    api.getCustomerFavorites.mockResolvedValue(page([mouse, headset], 1, 2))
    api.removeCustomerFavorite.mockRejectedValueOnce(new Error('offline'))
    renderPage()
    await screen.findByRole('heading', { name: 'Mouse' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remover Mouse dos favoritos' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível remover Mouse')
    expect(screen.getByRole('heading', { name: 'Mouse' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Headset' })).toBeInTheDocument()
  })

  it('shows loading only on the card being removed', async () => {
    api.getCustomerFavorites.mockResolvedValue(page([mouse, headset], 1, 2))
    let resolveDelete!: () => void
    api.removeCustomerFavorite.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveDelete = resolve }))
    renderPage()
    await screen.findByRole('heading', { name: 'Mouse' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remover Mouse dos favoritos' }))
    expect(screen.getByText('Removendo…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remover Mouse dos favoritos' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remover Headset dos favoritos' })).toBeEnabled()
    await act(async () => { resolveDelete(); await Promise.resolve() })
    await waitFor(() => expect(screen.queryByText('Removendo…')).not.toBeInTheDocument())
  })

  it('requests the next server page with accessible pagination controls', async () => {
    api.getCustomerFavorites.mockImplementation(async (requestedPage: number) => requestedPage === 1 ? page([mouse], 1, 13) : page([headset], 2, 13))
    renderPage()
    await screen.findByRole('heading', { name: 'Mouse' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Próxima' }))
    expect(await screen.findByRole('heading', { name: 'Headset' })).toBeInTheDocument()
    expect(api.getCustomerFavorites).toHaveBeenCalledWith(2, 12, expect.any(AbortSignal))
  })

  it('moves back a page after removing its final item', async () => {
    api.getCustomerFavorites.mockImplementation(async (requestedPage: number) => requestedPage === 2 ? page([headset], 2, 13) : page([mouse], 1, 13))
    renderPage()
    await screen.findByRole('heading', { name: 'Mouse' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Próxima' }))
    await screen.findByRole('heading', { name: 'Headset' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remover Headset dos favoritos' }))
    expect(await screen.findByRole('heading', { name: 'Mouse' })).toBeInTheDocument()
    expect(api.getCustomerFavorites).toHaveBeenLastCalledWith(1, 12, expect.any(AbortSignal))
  })
})
