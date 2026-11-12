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

function isCustomerSession(value: unknown): value is CustomerSession {
  if (typeof value !== 'object' || value === null) return false
  if (!('accessToken' in value) || typeof value.accessToken !== 'string' || !value.accessToken.trim()) return false
  if (!('tokenType' in value) || value.tokenType !== 'bearer') return false
  return 'expiresAt' in value && typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt)
}

export function getCustomerSession(): CustomerSession | null {
  const raw = window.sessionStorage.getItem(CUSTOMER_SESSION_KEY)
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

export function saveCustomerSession(token: CustomerTokenResponse): CustomerSession {
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
  window.sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(session))
  return session
}

export function clearCustomerSession(): void {
  window.sessionStorage.removeItem(CUSTOMER_SESSION_KEY)
}
