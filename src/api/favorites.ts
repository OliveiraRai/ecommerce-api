import { customerApiRequest } from './client'

export type FavoriteProduct = { id: number; nome: string; imagem_url: string | null; preco: string | number }
export type Favorite = { id: number; produto_id: number; produto: FavoriteProduct }
export type FavoritePage = { items: Favorite[]; page: number; page_size: number; total_items: number; total_pages: number }

async function readJson<T>(response: Response): Promise<T> { return await response.json() as T }

export async function getCustomerFavorites(page = 1, pageSize = 12, signal?: AbortSignal): Promise<FavoritePage> {
  const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  return readJson(await customerApiRequest(`/favorites?${query}`, { signal }))
}

export async function addCustomerFavorite(productId: number): Promise<Favorite> {
  return readJson(await customerApiRequest(`/favorites/${productId}`, { method: 'POST' }))
}

export async function removeCustomerFavorite(productId: number): Promise<void> {
  await customerApiRequest(`/favorites/${productId}`, { method: 'DELETE' })
}
