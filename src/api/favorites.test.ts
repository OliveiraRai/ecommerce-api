import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveCustomerSession } from './customerSession'
import { addCustomerFavorite, getCustomerFavorites, removeCustomerFavorite } from './favorites'

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  saveCustomerSession({ access_token: 'customer-token', token_type: 'bearer', expires_in: 1800 })
  vi.stubGlobal('fetch', vi.fn())
})

describe('customer favorites API', () => {
  it('requests a page with the customer session and returns the paginated payload', async () => {
    const payload = { items: [], page: 2, page_size: 12, total_items: 13, total_pages: 2 }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => payload } as Response)
    await expect(getCustomerFavorites(2, 12)).resolves.toEqual(payload)
    expect(fetch).toHaveBeenCalledWith('/api/v1/favorites?page=2&page_size=12', expect.objectContaining({ signal: undefined }))
    expect(new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer customer-token')
  })

  it('parses the 201 response and does not parse JSON from the 204 delete response', async () => {
    const favorite = { id: 8, produto_id: 7, produto: { id: 7, nome: 'Teclado', imagem_url: null, preco: '99.00' } }
    const json = vi.fn(async () => favorite)
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 201, json } as unknown as Response)
    await expect(addCustomerFavorite(7)).resolves.toEqual(favorite)
    expect(fetch).toHaveBeenLastCalledWith('/api/v1/favorites/7', expect.objectContaining({ method: 'POST' }))
    const emptyJson = vi.fn(() => { throw new Error('204 has no JSON body') })
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 204, json: emptyJson } as unknown as Response)
    await expect(removeCustomerFavorite(7)).resolves.toBeUndefined()
    expect(fetch).toHaveBeenLastCalledWith('/api/v1/favorites/7', expect.objectContaining({ method: 'DELETE' }))
    expect(emptyJson).not.toHaveBeenCalled()
  })
})
