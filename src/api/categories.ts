import { apiRequest } from './client'

export type Subcategory = { id: number; categoria_id: number; nome: string }
export type Category = { id: number; nome: string; subcategorias: Subcategory[] }

async function readJson<T>(response: Response): Promise<T> { return await response.json() as T }

export async function getCategories(signal?: AbortSignal): Promise<Category[]> {
  return readJson(await apiRequest('/categories', { signal }))
}

export async function createCategory(nome: string): Promise<Category> {
  return readJson(await apiRequest('/categories', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }),
  }))
}

export async function updateCategory(id: number, nome: string): Promise<Category> {
  return readJson(await apiRequest(`/categories/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }),
  }))
}

export async function deleteCategory(id: number): Promise<void> {
  await apiRequest(`/categories/${id}`, { method: 'DELETE' })
}

export async function createSubcategory(categoryId: number, nome: string): Promise<Subcategory> {
  return readJson(await apiRequest(`/categories/${categoryId}/subcategories`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }),
  }))
}

export async function updateSubcategory(id: number, nome: string): Promise<Subcategory> {
  return readJson(await apiRequest(`/categories/subcategories/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }),
  }))
}

export async function deleteSubcategory(id: number): Promise<void> {
  await apiRequest(`/categories/subcategories/${id}`, { method: 'DELETE' })
}
