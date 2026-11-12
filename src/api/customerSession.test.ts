import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCustomerSession, CUSTOMER_SESSION_KEY, getCustomerSession, saveCustomerSession } from './customerSession'

const tokenResponse = { access_token: 'customer-token', token_type: 'bearer', expires_in: 1800 }

beforeEach(() => {
  window.sessionStorage.clear()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('customer session storage', () => {
  it('stores a session in sessionStorage using the backend expiration', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)

    const session = saveCustomerSession(tokenResponse)

    expect(session).toEqual({ accessToken: 'customer-token', tokenType: 'bearer', expiresAt: 2_800_000 })
    expect(JSON.parse(window.sessionStorage.getItem(CUSTOMER_SESSION_KEY) ?? 'null')).toEqual(session)
    expect(window.localStorage.length).toBe(0)
  })

  it('recovers a valid session after initialization', () => {
    const saved = saveCustomerSession(tokenResponse)
    expect(getCustomerSession()).toEqual(saved)
  })

  it('removes an expired session instead of restoring it', () => {
    window.sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify({ accessToken: 'old', tokenType: 'bearer', expiresAt: Date.now() - 1 }))

    expect(getCustomerSession()).toBeNull()
    expect(window.sessionStorage.getItem(CUSTOMER_SESSION_KEY)).toBeNull()
  })

  it.each(['{broken', JSON.stringify({ accessToken: 3, tokenType: 'bearer', expiresAt: Date.now() + 10_000 }), JSON.stringify({ accessToken: 'x', tokenType: 'basic', expiresAt: Date.now() + 10_000 })])(
    'clears invalid stored data: %s', (value) => {
      window.sessionStorage.setItem(CUSTOMER_SESSION_KEY, value)

      expect(getCustomerSession()).toBeNull()
      expect(window.sessionStorage.getItem(CUSTOMER_SESSION_KEY)).toBeNull()
    },
  )

  it('clears only customer session data', () => {
    window.sessionStorage.setItem('gamer-store.admin-session', 'admin-session')
    saveCustomerSession(tokenResponse)

    clearCustomerSession()

    expect(window.sessionStorage.getItem(CUSTOMER_SESSION_KEY)).toBeNull()
    expect(window.sessionStorage.getItem('gamer-store.admin-session')).toBe('admin-session')
  })

  it('rejects invalid token responses', () => {
    expect(() => saveCustomerSession({ ...tokenResponse, token_type: 'mac' })).toThrow('Invalid customer authentication response')
    expect(() => saveCustomerSession({ ...tokenResponse, expires_in: 0 })).toThrow('Invalid customer authentication response')
  })
})
