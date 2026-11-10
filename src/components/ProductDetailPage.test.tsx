import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CartProvider } from '../cart/CartContext'
import { ApiError } from '../api/client'
import { ProductDetailPage } from './ProductDetailPage'

const getProduct = vi.hoisted(() => vi.fn())
vi.mock('../api/products', () => ({ getProduct }))

const product = {
  id: 7, nome: 'Teclado mecânico', descricao: 'Descrição do produto', imagem_url: 'https://example.com/keyboard.png',
  marca_id: 1, marca: { id: 1, nome: 'Marca Gamer' }, preco: '199.90', estoque: 3, subcategoria_id: 4,
  subcategoria: { id: 4, nome: 'Teclados', categoria: { id: 2, nome: 'Periféricos' } },
}

function renderPage() { return render(<CartProvider><ProductDetailPage productId={7} /></CartProvider>) }

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
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
    rerender(<CartProvider><ProductDetailPage productId={8} /></CartProvider>)
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
    expect(window.localStorage.getItem('gamer-store.cart')).toContain('"quantity":1')
  })

  it('disables cart addition when the current product has no stock', async () => {
    getProduct.mockResolvedValueOnce({ ...product, estoque: 0 })
    render(<CartProvider><ProductDetailPage productId={7} /></CartProvider>)
    expect(await screen.findByText('Indisponível — sem estoque')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sem estoque' })).toBeDisabled()
  })
})
