import { apiRequest } from './client'

export type Subcategory = { id: number; categoria_id: number; nome: string }
export type BrandSummary = { id: number; nome: string }
export type Product = {
  id: number
  nome: string
  descricao: string | null
  imagem_url: string | null
  marca_id: number | null
  marca: BrandSummary | null
  preco: string | number
  estoque: number
  subcategoria_id: number | null
  subcategoria: (Subcategory & { categoria: { id: number; nome: string } }) | null
}
export type ProductPage = { items: Product[]; page: number; page_size: number; total_items: number; total_pages: number }
export type CatalogProductQuery = {
  q?: string
  category_id?: number
  subcategory_id?: number
  brand_id?: number
  min_price?: string
  max_price?: string
  page?: number
  page_size?: number
  sort?: 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc'
}
export type ProductInput = { nome: string; descricao: string | null; imagem_url: string | null; marca_id: number | null; preco: string; estoque: number; subcategoria_id: number | null }

async function readJson<T>(response: Response): Promise<T> { return await response.json() as T }

export async function getProducts(page = 1, pageSize = 20, signal?: AbortSignal): Promise<ProductPage> {
  const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  return readJson(await apiRequest(`/products?${query}`, { signal }))
}
export async function getCatalogProducts(query: CatalogProductQuery, signal?: AbortSignal): Promise<ProductPage> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    const normalized = typeof value === 'string' ? value.trim() : String(value)
    if (normalized) params.set(key, normalized)
  }
  return readJson(await apiRequest(`/products?${params}`, { signal }))
}
export async function getProduct(id: number, signal?: AbortSignal): Promise<Product> { return readJson(await apiRequest(`/products/${id}`, { signal })) }
export async function createProduct(input: ProductInput): Promise<Product> { return readJson(await apiRequest('/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })) }
export async function updateProduct(id: number, input: ProductInput): Promise<Product> { return readJson(await apiRequest(`/products/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })) }
export async function deleteProduct(id: number): Promise<void> { await apiRequest(`/products/${id}`, { method: 'DELETE' }) }
