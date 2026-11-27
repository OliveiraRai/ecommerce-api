import { customerApiRequest } from './client'

export type CheckoutIntentLine = { produto_id: number; quantidade: number; preco_unitario: string | number }
export type CheckoutRequest = {
  modo: 'produto' | 'carrinho'
  produto_id?: number
  itens: CheckoutIntentLine[]
  metodo_pagamento: 'pix_simulado' | 'cartao_simulado'
  resultado_pagamento: 'aprovado' | 'recusado'
}
export type CheckoutConfirmation = {
  id: number
  data_venda: string | null
  estado: 'confirmed'
  itens: Array<{ produto_id: number; nome_produto: string; quantidade: number; preco_unitario: string | number; subtotal: string | number }>
  total: string | number
}

export async function submitCheckout(payload: CheckoutRequest, key: string): Promise<CheckoutConfirmation> {
  const response = await customerApiRequest('/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(payload),
  })
  return await response.json() as CheckoutConfirmation
}
