import { apiRequest } from './client'

export type Brand = { id: number; nome: string }

async function readJson<T>(response: Response): Promise<T> { return await response.json() as T }

export async function getBrands(signal?: AbortSignal): Promise<Brand[]> {
  return readJson(await apiRequest('/brands', { signal }))
}

export async function createBrand(nome: string): Promise<Brand> {
  return readJson(await apiRequest('/brands', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }),
  }))
}

export async function updateBrand(id: number, nome: string): Promise<Brand> {
  return readJson(await apiRequest(`/brands/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }),
  }))
}

export async function deleteBrand(id: number): Promise<void> {
  await apiRequest(`/brands/${id}`, { method: 'DELETE' })
}
