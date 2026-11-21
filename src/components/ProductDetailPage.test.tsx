import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CartProvider } from '../cart/CartContext'
import { ApiError } from '../api/client'
import { CustomerSessionProvider } from '../customer/CustomerSessionContext'
import { saveCustomerSession } from '../api/customerSession'
import { FavoritesProvider } from '../favorites/FavoritesContext'
import { ProductDetailPage } from './ProductDetailPage'

const getProduct = vi.hoisted(() => vi.fn())
vi.mock('../api/products', () => ({ getProduct }))
const cartApi = vi.hoisted(() => ({ getCustomerCart: vi.fn(), addCustomerCartItem: vi.fn(), updateCustomerCartItem: vi.fn(), removeCustomerCartItem: vi.fn() }))
const favoritesApi = vi.hoisted(() => ({ getCustomerFavorites: vi.fn(), addCustomerFavorite: vi.fn(), removeCustomerFavorite: vi.fn() }))
vi.mock('../api/cart', () => cartApi)
vi.mock('../api/favorites', () => favoritesApi)

const product = {
  id: 7, nome: 'Teclado mecânico', descricao: 'Descrição do produto', imagem_url: 'https://example.com/keyboard.png',
  marca_id: 1, marca: { id: 1, nome: 'Marca Gamer' }, preco: '199.90', estoque: 3, subcategoria_id: 4,
  subcategoria: { id: 4, nome: 'Teclados', categoria: { id: 2, nome: 'Periféricos' } },
}

function renderPage() { return render(<CustomerSessionProvider><FavoritesProvider><CartProvider><ProductDetailPage productId={7} /></CartProvider></FavoritesProvider></CustomerSessionProvider>) }

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  saveCustomerSession({ access_token: 'client-token', token_type: 'bearer', expires_in: 1800 })
  cartApi.getCustomerCart.mockResolvedValue({ id: 1, itens: [] })
  favoritesApi.getCustomerFavorites.mockResolvedValue({ items: [], page: 1, page_size: 100, total_items: 0, total_pages: 0 })
  favoritesApi.addCustomerFavorite.mockResolvedValue({ id: 1, produto_id: 7, produto: { id: 7, nome: product.nome, imagem_url: product.imagem_url, preco: product.preco } })
  cartApi.addCustomerCartItem.mockResolvedValue({ id: 20, produto_id: 7, produto: { id: 7, nome: product.nome, imagem_url: product.imagem_url, preco: product.preco, estoque: product.estoque }, quantidade: 1, subtotal: product.preco, disponivel: true })
  getProduct.mockResolvedValue(product)
})

describe('product detail page', () => {
  it('loads product data, keeps image proportions, and offers catalog navigation', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: product.nome })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: product.nome })).toHaveAttribute('src', product.imagem_url)
    expect(screen.getByText('Marca Gamer')).toBeInTheDocument()
    expect(screen.getByText('Periféricos · Teclados')).toBeInTheDocument()
    expect(screen.getByText('Em estoque (3 unidades)')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Voltar ao catálogo/ })[0]).toHaveAttribute('href', '/catalog')
  })

  it('distinguishes a missing product from a communication failure and retries', async () => {
    getProduct.mockRejectedValueOnce(new ApiError(404))
    const { unmount } = renderPage()
    expect(await screen.findByRole('heading', { name: 'Produto não encontrado' })).toBeInTheDocument()
    unmount()
    getProduct.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(product)
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar o produto')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('heading', { name: product.nome })).toBeInTheDocument()
  })

  it('uses the image fallback and handles empty and expandable descriptions', async () => {
    getProduct.mockResolvedValueOnce({ ...product, imagem_url: null, descricao: null })
    const { rerender } = renderPage()
    expect(await screen.findByRole('img', { name: 'Imagem indisponível para Teclado mecânico' })).toBeInTheDocument()
    expect(screen.getByText('Descrição não informada.')).toBeInTheDocument()
    const longDescription = 'Texto detalhado. '.repeat(30)
    getProduct.mockResolvedValueOnce({ ...product, descricao: longDescription })
    rerender(<CustomerSessionProvider><FavoritesProvider><CartProvider><ProductDetailPage productId={8} /></CartProvider></FavoritesProvider></CustomerSessionProvider>)
    expect(await screen.findByRole('button', { name: 'Ver descrição completa' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ver descrição completa' }))
    expect(screen.getByRole('button', { name: 'Mostrar menos' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('falls back when the remote product image fails to load', async () => {
    renderPage()
    const image = await screen.findByRole('img', { name: product.nome })
    fireEvent.error(image)
    expect(screen.getByRole('img', { name: `Imagem indisponível para ${product.nome}` })).toBeInTheDocument()
  })

  it('adds an available product and keeps purchase unavailable', async () => {
    renderPage()
    await screen.findByRole('heading', { name: product.nome })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Adicionar ao carrinho' }))
    expect(screen.getByText('Produto adicionado ao carrinho.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Comprar agora' })).toBeDisabled()
    expect(cartApi.addCustomerCartItem).toHaveBeenCalledWith(7, 1)
    expect(window.localStorage.getItem('gamer-store.cart')).toBeNull()
  })

  it('offers the favorite control on product detail', async () => {
    renderPage()
    await screen.findByRole('heading', { name: product.nome })
    expect(screen.getByRole('button', { name: `Adicionar aos favoritos: ${product.nome}` })).toBeInTheDocument()
  })

  it('disables cart addition when the current product has no stock', async () => {
    getProduct.mockResolvedValueOnce({ ...product, estoque: 0 })
    renderPage()
    expect(await screen.findByText('Indisponível — sem estoque')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sem estoque' })).toBeDisabled()
  })
})
