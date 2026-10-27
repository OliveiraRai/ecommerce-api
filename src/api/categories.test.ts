import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCategory, createSubcategory, deleteCategory, deleteSubcategory, getCategories, updateCategory, updateSubcategory } from './categories'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, json: async () => ({ id: 4, nome: 'Hardware', subcategorias: [] }),
  }) as Response))
})

describe('category API client', () => {
  it('uses existing category and subcategory endpoints for CRUD', async () => {
    await getCategories()
    await createCategory('Hardware')
    await updateCategory(4, 'Componentes')
    await deleteCategory(4)
    await createSubcategory(4, 'Memórias')
    await updateSubcategory(8, 'Memórias DDR5')
    await deleteSubcategory(8)

    const calls = vi.mocked(fetch).mock.calls
    expect(String(calls[0]?.[0])).toBe('/api/v1/categories')
    expect(calls[1]?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ nome: 'Hardware' }) })
    expect(String(calls[2]?.[0])).toBe('/api/v1/categories/4')
    expect(calls[2]?.[1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ nome: 'Componentes' }) })
    expect(calls[3]).toMatchObject(['/api/v1/categories/4', expect.objectContaining({ method: 'DELETE' })])
    expect(String(calls[4]?.[0])).toBe('/api/v1/categories/4/subcategories')
    expect(String(calls[5]?.[0])).toBe('/api/v1/categories/subcategories/8')
    expect(calls[5]?.[1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ nome: 'Memórias DDR5' }) })
    expect(calls[6]).toMatchObject(['/api/v1/categories/subcategories/8', expect.objectContaining({ method: 'DELETE' })])
  })
})
