import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCatalogProducts } from './products'

const response = {
  items: [{
    id: 9, nome: 'Mouse gamer', descricao: null, imagem_url: null, marca_id: 7,
    marca: { id: 7, nome: 'Logitech' }, preco: '249.90', estoque: 4,
    subcategoria_id: 3,
    subcategoria: { id: 3, nome: 'Mouses', categoria: { id: 1, nome: 'Periféricos' } },
  }],
  page: 2, page_size: 12, total_items: 13, total_pages: 2,
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => response }) as Response))
})

describe('catalog API client', () => {
  it('serializes the supported query parameters and returns the paginated contract', async () => {
    const result = await getCatalogProducts({
      q: 'mouse gamer', category_id: 1, subcategory_id: 3, brand_id: 7,
      min_price: '100.00', max_price: '300.00', sort: 'price_asc', page: 2, page_size: 12,
    })

    const [requestUrl, requestInit] = vi.mocked(fetch).mock.calls[0]!
    const parameters = new URL(String(requestUrl), 'http://localhost').searchParams
    expect(String(requestUrl).split('?')[0]).toBe('/api/v1/products')
    expect(Object.fromEntries(parameters)).toEqual({
      q: 'mouse gamer', category_id: '1', subcategory_id: '3', brand_id: '7',
      min_price: '100.00', max_price: '300.00', sort: 'price_asc', page: '2', page_size: '12',
    })
    expect(requestInit?.headers).toBeInstanceOf(Headers)
    expect(result).toEqual(response)
    expect(result.items[0]?.imagem_url).toBeNull()
    expect(result.items[0]?.preco).toBe('249.90')
    expect(result.total_pages).toBe(2)
  })

  it('omits blank optional filters while retaining pagination defaults supplied by caller', async () => {
    await getCatalogProducts({ q: '  ', page: 1, page_size: 12, sort: 'name_asc' })
    const requestUrl = String(vi.mocked(fetch).mock.calls[0]?.[0])
    expect(new URL(requestUrl, 'http://localhost').searchParams.toString()).toBe('page=1&page_size=12&sort=name_asc')
  })
})
