import { apiRequest } from './client'

export type SaleItem = { id: number; produto_id: number; quantidade: number; preco_unitario: string | number }
export type Sale = { id: number; cliente_id: number; itens: SaleItem[]; data_venda: string | null }

export async function getSales(signal?: AbortSignal): Promise<Sale[]> {
  const response = await apiRequest('/admin/sales', { signal })
  return await response.json() as Sale[]
}

export async function getSale(id: number, signal?: AbortSignal): Promise<Sale> {
  const response = await apiRequest(`/admin/sales/${id}`, { signal })
  return await response.json() as Sale
}
