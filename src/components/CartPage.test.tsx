import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CartProvider } from '../cart/CartContext'
import { ApiError } from '../api/client'
import { CartPage } from './CartPage'

const getProduct = vi.hoisted(() => vi.fn())
vi.mock('../api/products', () => ({ getProduct }))

const product = {
  id: 2, nome: 'Mouse', descricao: null, imagem_url: null, marca_id: null, marca: null,
  preco: '19.99', estoque: 5, subcategoria_id: null, subcategoria: null,
}

function renderCart(lines: Array<{ productId: number; quantity: number }>) {
  window.localStorage.setItem('gamer-store.cart', JSON.stringify(lines))
  return render(<CartProvider><CartPage /></CartProvider>)
}

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  getProduct.mockResolvedValue(product)
})

describe('cart page', () => {
  it('shows empty state with catalog access', () => {
    renderCart([])
    expect(screen.getByRole('heading', { name: 'Seu carrinho está vazio' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver catálogo' })).toHaveAttribute('href', '/catalog')
  })

  it('validates current product prices and computes line and total in cents', async () => {
    getProduct.mockResolvedValue({ ...product, preco: '19.99' })
    renderCart([{ productId: 2, quantity: 3 }])
    expect(await screen.findByText(/Subtotal:/)).toHaveTextContent('R$ 59,97')
    expect(screen.getAllByText('R$ 59,97')).toHaveLength(3)
    expect(screen.getByText('3', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prosseguir para compra' })).toBeDisabled()
  })

  it('allows quantity changes and removal while keeping storage synchronized', async () => {
    renderCart([{ productId: 2, quantity: 1 }])
    await screen.findByRole('heading', { name: 'Mouse' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Aumentar quantidade de Mouse' }))
    await waitFor(() => expect(window.localStorage.getItem('gamer-store.cart')).toContain('"quantity":2'))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Diminuir quantidade de Mouse' }))
    await waitFor(() => expect(window.localStorage.getItem('gamer-store.cart')).toContain('"quantity":1'))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Diminuir quantidade de Mouse' }))
    expect(await screen.findByRole('heading', { name: 'Seu carrinho está vazio' })).toBeInTheDocument()
  })

  it('keeps missing products visible and allows removing them', async () => {
    getProduct.mockRejectedValue(new ApiError(404))
    renderCart([{ productId: 44, quantity: 1 }])
    expect(await screen.findByText('Este produto não existe mais no catálogo e está indisponível.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('subtotal exibido é parcial')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remover' }))
    expect(await screen.findByRole('heading', { name: 'Seu carrinho está vazio' })).toBeInTheDocument()
  })

  it('distinguishes temporary API errors and offers a retry without showing old prices', async () => {
    getProduct.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(product)
    renderCart([{ productId: 2, quantity: 1 }])
    expect(await screen.findByText('Não foi possível validar este produto agora. Os dados anteriores não são exibidos como atuais.')).toBeInTheDocument()
    expect(screen.queryByText('R$ 19,99')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar validar novamente' }))
    expect(await screen.findByRole('heading', { name: 'Mouse' })).toBeInTheDocument()
  })

  it('flags reduced or zero stock and prevents increasing quantity beyond current stock', async () => {
    getProduct.mockResolvedValue({ ...product, estoque: 1 })
    renderCart([{ productId: 2, quantity: 3 }])
    expect(await screen.findByText(/Estoque reduzido para 1/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aumentar quantidade de Mouse' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('subtotal exibido é parcial')
  })

  it('marks zero-stock products unavailable and excludes them from the valid subtotal', async () => {
    getProduct.mockResolvedValue({ ...product, estoque: 0 })
    renderCart([{ productId: 2, quantity: 1 }])
    expect(await screen.findByText('Sem estoque; este item não pode ser comprado.')).toBeInTheDocument()
    expect(screen.getByText('Subtotal válido').parentElement).toHaveTextContent('R$ 0,00')
    expect(screen.getByRole('alert')).toHaveTextContent('subtotal exibido é parcial')
  })
})
