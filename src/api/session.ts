export type AdminSession = { accessToken: string; expiresAt: number }

const SESSION_KEY = 'gamer-store.admin-session'
export const SESSION_INVALID_EVENT = 'gamer-store:session-invalid'
let sessionInvalidNotified = false

export function getSession(): AdminSession | null {
  const raw = window.localStorage.getItem(SESSION_KEY) ?? window.sessionStorage.getItem(SESSION_KEY)
  if (!raw) return null

  try {
    const value: unknown = JSON.parse(raw)
    if (
      typeof value !== 'object' || value === null ||
      !('accessToken' in value) || typeof value.accessToken !== 'string' ||
      !('expiresAt' in value) || typeof value.expiresAt !== 'number' ||
      value.expiresAt <= Date.now()
    ) {
      clearSession()
      return null
    }
    return value as AdminSession
  } catch {
    clearSession()
    return null
  }
}

export function saveSession(accessToken: string, expiresIn: number, rememberMe: boolean): AdminSession {
  const session = { accessToken, expiresAt: Date.now() + expiresIn * 1000 }
  clearSession()
  const storage = rememberMe ? window.localStorage : window.sessionStorage
  storage.setItem(SESSION_KEY, JSON.stringify(session))
  sessionInvalidNotified = false
  return session
}

export function clearSession(notify = false): void {
  window.localStorage.removeItem(SESSION_KEY)
  window.sessionStorage.removeItem(SESSION_KEY)
  if (notify && !sessionInvalidNotified) {
    sessionInvalidNotified = true
    window.dispatchEvent(new Event(SESSION_INVALID_EVENT))
  }
}
