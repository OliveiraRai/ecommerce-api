import { apiRequest } from './client'
import { saveSession, type AdminSession } from './session'

export async function loginAdmin(username: string, password: string, rememberMe: boolean): Promise<AdminSession> {
  const response = await apiRequest('/auth/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, remember_me: rememberMe }),
  })
  const payload: unknown = await response.json()
  if (
    typeof payload !== 'object' || payload === null ||
    !('access_token' in payload) || typeof payload.access_token !== 'string' ||
    !('token_type' in payload) || typeof payload.token_type !== 'string' || payload.token_type.toLowerCase() !== 'bearer' ||
    !('expires_in' in payload) || typeof payload.expires_in !== 'number' || payload.expires_in <= 0
  ) {
    throw new Error('Invalid authentication response')
  }
  return saveSession(payload.access_token, payload.expires_in, rememberMe)
}

export async function logoutAdmin(): Promise<void> {
  await apiRequest('/auth/admin/logout', { method: 'POST' })
}
