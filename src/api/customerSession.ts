export type CustomerSession = {
  accessToken: string
  tokenType: 'bearer'
  expiresAt: number
}

export type CustomerTokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
}

export const CUSTOMER_SESSION_KEY = 'gamer-store.customer-session'
export const CUSTOMER_SESSION_INVALID_EVENT = 'gamer-store:customer-session-invalid'
let invalidNotified = false

function isCustomerSession(value: unknown): value is CustomerSession {
  if (typeof value !== 'object' || value === null) return false
  if (!('accessToken' in value) || typeof value.accessToken !== 'string' || !value.accessToken.trim()) return false
  if (!('tokenType' in value) || value.tokenType !== 'bearer') return false
  return 'expiresAt' in value && typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt)
}

export function getCustomerSession(): CustomerSession | null {
  const raw = window.localStorage.getItem(CUSTOMER_SESSION_KEY) ?? window.sessionStorage.getItem(CUSTOMER_SESSION_KEY)
  if (raw === null) return null

  try {
    const value: unknown = JSON.parse(raw)
    if (!isCustomerSession(value) || value.expiresAt <= Date.now()) {
      clearCustomerSession()
      return null
    }
    return value
  } catch {
    clearCustomerSession()
    return null
  }
}

export function saveCustomerSession(token: CustomerTokenResponse, rememberMe = false): CustomerSession {
  if (
    typeof token.access_token !== 'string' || !token.access_token.trim() ||
    typeof token.token_type !== 'string' || token.token_type.toLowerCase() !== 'bearer' ||
    typeof token.expires_in !== 'number' || !Number.isFinite(token.expires_in) || token.expires_in <= 0
  ) {
    throw new Error('Invalid customer authentication response')
  }

  const expiresAt = Date.now() + token.expires_in * 1000
  if (!Number.isFinite(expiresAt)) throw new Error('Invalid customer authentication response')
  const session: CustomerSession = {
    accessToken: token.access_token,
    tokenType: 'bearer',
    expiresAt,
  }
  clearCustomerSession()
  ;(rememberMe ? window.localStorage : window.sessionStorage).setItem(CUSTOMER_SESSION_KEY, JSON.stringify(session))
  invalidNotified = false
  return session
}

export function clearCustomerSession(notify = false): void {
  window.localStorage.removeItem(CUSTOMER_SESSION_KEY)
  window.sessionStorage.removeItem(CUSTOMER_SESSION_KEY)
  if (notify && !invalidNotified) {
    invalidNotified = true
    window.dispatchEvent(new Event(CUSTOMER_SESSION_INVALID_EVENT))
  }
}
