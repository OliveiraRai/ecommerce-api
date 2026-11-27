import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CheckoutPage } from './CheckoutPage'
import { CustomerSessionProvider } from '../customer/CustomerSessionContext'
import { CartProvider } from '../cart/CartContext'
import { saveCustomerSession } from '../api/customerSession'

const api = vi.hoisted(() => ({ submitCheckout: vi.fn(), getProduct: vi.fn(), getCustomerCart: vi.fn(), refresh: vi.fn() }))
vi.mock('../api/checkout', () => ({ submitCheckout: api.submitCheckout }))
vi.mock('../api/products', () => ({ getProduct: api.getProduct }))
vi.mock('../api/cart', () => ({ getCustomerCart: api.getCustomerCart, addCustomerCartItem: vi.fn(), updateCustomerCartItem: vi.fn(), removeCustomerCartItem: vi.fn() }))

const confirmation = { id: 8, data_venda: '2026-11-26T12:00:00Z', estado: 'confirmed' as const, itens: [], total: '120.50' }
function renderCheckout(search = '?mode=product&id=7') {
  window.history.replaceState({}, '', `/checkout${search}`)
  return render(<CustomerSessionProvider><CartProvider><CheckoutPage /></CartProvider></CustomerSessionProvider>)
}

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear(); window.sessionStorage.clear()
  saveCustomerSession({ access_token: 'client-token', token_type: 'bearer', expires_in: 1800 })
  api.getCustomerCart.mockResolvedValue({ id: null, itens: [] })
  api.getProduct.mockResolvedValue({ id: 7, nome: 'GPU', preco: '120.50', estoque: 3 })
  api.submitCheckout.mockResolvedValue(confirmation)
  vi.stubGlobal('crypto', { ...crypto, randomUUID: () => 'attempt-key' })
})

describe('checkout page', () => {
  it('reviews a direct product without submitting until Pay and shows confirmation', async () => {
    renderCheckout()
    expect(await screen.findByRole('heading', { name: 'GPU' })).toBeInTheDocument()
    expect(api.submitCheckout).not.toHaveBeenCalled()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Pagar' }))
    await screen.findByRole('heading', { name: 'Compra confirmada' })
    expect(api.submitCheckout).toHaveBeenCalledWith(expect.objectContaining({ modo: 'produto', produto_id: 7, itens: [{ produto_id: 7, quantidade: 1, preco_unitario: '120.50' }] }), 'attempt-key')
  })

  it('reviews the persisted cart and submits its current lines only after Pay', async () => {
    api.getCustomerCart.mockResolvedValue({ id: 2, itens: [{ id: 4, produto_id: 9, produto: { id: 9, nome: 'Mouse', imagem_url: null, preco: '25.00', estoque: 4 }, quantidade: 2, subtotal: '50.00', disponivel: true }] })
    renderCheckout('?mode=cart')
    expect(await screen.findByRole('heading', { name: 'Mouse' })).toBeInTheDocument()
    expect(api.submitCheckout).not.toHaveBeenCalled()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Pagar' }))
    await screen.findByRole('heading', { name: 'Compra confirmada' })
    expect(api.submitCheckout).toHaveBeenCalledWith(expect.objectContaining({ modo: 'carrinho', itens: [{ produto_id: 9, quantidade: 2, preco_unitario: '25.00' }] }), 'attempt-key')
  })

  it('retries an uncertain request with its original idempotency key and payload', async () => {
    api.submitCheckout.mockRejectedValueOnce(new Error('Network request failed')).mockResolvedValueOnce(confirmation)
    renderCheckout()
    await screen.findByRole('heading', { name: 'GPU' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Pagar' }))
    await screen.findByRole('button', { name: 'Verificar novamente' })
    await user.click(screen.getByRole('button', { name: 'Verificar novamente' }))
    await screen.findByRole('heading', { name: 'Compra confirmada' })
    expect(api.submitCheckout).toHaveBeenNthCalledWith(2, expect.anything(), 'attempt-key')
    expect(api.submitCheckout.mock.calls[0]?.[0]).toEqual(api.submitCheckout.mock.calls[1]?.[0])
  })
})
