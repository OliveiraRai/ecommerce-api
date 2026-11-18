import { customerApiRequest } from './client'

export type CustomerCartItem = {
  id: number
  produto_id: number | null
  produto: { id: number; nome: string; imagem_url: string | null; preco: string | number; estoque: number } | null
  quantidade: number
  subtotal: string | number | null
  disponivel: boolean
}
export type CustomerCart = { id: number | null; itens: CustomerCartItem[] }

async function read<T>(response: Response): Promise<T> { return await response.json() as T }
export async function getCustomerCart(signal?: AbortSignal): Promise<CustomerCart> {
  return read(await customerApiRequest('/cart', { signal }))
}
export async function addCustomerCartItem(productId: number, quantity = 1): Promise<CustomerCartItem> {
  return read(await customerApiRequest('/cart/items', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ produto_id: productId, quantidade: quantity }),
  }))
}
export async function updateCustomerCartItem(itemId: number, quantity: number): Promise<CustomerCartItem> {
  return read(await customerApiRequest(`/cart/items/${itemId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantidade: quantity }),
  }))
}
export async function removeCustomerCartItem(itemId: number): Promise<void> {
  await customerApiRequest(`/cart/items/${itemId}`, { method: 'DELETE' })
}
