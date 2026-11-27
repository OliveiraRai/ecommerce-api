import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CartProvider } from '../cart/CartContext'
import { CustomerSessionProvider } from '../customer/CustomerSessionContext'
import { saveCustomerSession } from '../api/customerSession'
import { CartPage } from './CartPage'

const cartApi = vi.hoisted(() => ({ getCustomerCart: vi.fn(), addCustomerCartItem: vi.fn(), updateCustomerCartItem: vi.fn(), removeCustomerCartItem: vi.fn() }))
vi.mock('../api/cart', () => cartApi)

const product = { id: 2, nome: 'Mouse', imagem_url: null, preco: '19.99', estoque: 5 }
const line = { id: 10, produto_id: 2, produto: product, quantidade: 3, subtotal: '59.97', disponivel: true }
function renderCart(items?: typeof line[]) {
  if (items !== undefined) cartApi.getCustomerCart.mockResolvedValue({ id: 1, itens: items })
  return render(<CustomerSessionProvider><CartProvider><CartPage /></CartProvider></CustomerSessionProvider>)
}

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  saveCustomerSession({ access_token: 'client-token', token_type: 'bearer', expires_in: 1800 })
  cartApi.getCustomerCart.mockResolvedValue({ id: 1, itens: [] })
  cartApi.updateCustomerCartItem.mockImplementation(async (id, quantity) => ({ ...line, id, quantidade: quantity }))
  cartApi.removeCustomerCartItem.mockResolvedValue(undefined)
})

describe('customer cart page', () => {
  it('shows the server cart empty state', async () => {
    renderCart([])
    expect(await screen.findByRole('heading', { name: 'Seu carrinho está vazio' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver catálogo' })).toHaveAttribute('href', '/catalog')
  })

  it('renders current server prices and totals', async () => {
    cartApi.getCustomerCart.mockResolvedValue({ id: 1, itens: [line] })
    renderCart()
    expect(await screen.findByText(/Subtotal:/)).toHaveTextContent('R$ 59,97')
    expect(screen.getByText('Subtotal disponível').parentElement).toHaveTextContent('R$ 59,97')
    expect(screen.getByRole('link', { name: 'Continuar com a compra' })).toHaveAttribute('href', '/checkout?mode=cart')
  })

  it('updates and removes persisted cart items through the authenticated API', async () => {
    cartApi.getCustomerCart.mockResolvedValue({ id: 1, itens: [{ ...line, quantidade: 1, subtotal: '19.99' }] })
    renderCart()
    await screen.findByRole('heading', { name: 'Mouse' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Aumentar quantidade de Mouse' }))
    await waitFor(() => expect(cartApi.updateCustomerCartItem).toHaveBeenCalledWith(10, 2))
    await user.click(screen.getByRole('button', { name: 'Remover' }))
    await waitFor(() => expect(cartApi.removeCustomerCartItem).toHaveBeenCalledWith(10))
  })

  it('shows server-marked unavailable and missing products without local cart storage', async () => {
    cartApi.getCustomerCart.mockResolvedValue({ id: 1, itens: [
      { ...line, produto: null, disponivel: false },
      { ...line, id: 11, disponivel: false },
    ] })
    renderCart()
    expect(await screen.findByText('Este produto não existe mais no catálogo.')).toBeInTheDocument()
    expect(screen.getByText('Produto sem estoque no momento.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('subtotal é parcial')
    expect(window.localStorage.getItem('gamer-store.cart')).toBeNull()
  })
})
