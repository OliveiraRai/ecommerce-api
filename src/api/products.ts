import { apiRequest } from './client'

export type Product = { id: number; nome: string; descricao: string | null; preco: string | number; estoque: number }
export type ProductInput = { nome: string; descricao: string | null; preco: string; estoque: number }

async function readJson<T>(response: Response): Promise<T> { return await response.json() as T }

export async function getProducts(signal?: AbortSignal): Promise<Product[]> { return readJson(await apiRequest('/products', { signal })) }
export async function getProduct(id: number, signal?: AbortSignal): Promise<Product> { return readJson(await apiRequest(`/products/${id}`, { signal })) }
export async function createProduct(input: ProductInput): Promise<Product> { return readJson(await apiRequest('/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })) }
export async function updateProduct(id: number, input: ProductInput): Promise<Product> { return readJson(await apiRequest(`/products/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })) }
export async function deleteProduct(id: number): Promise<void> { await apiRequest(`/products/${id}`, { method: 'DELETE' }) }
