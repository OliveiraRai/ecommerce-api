import { clearSession, getSession } from './session'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(public readonly status: number, message = 'API request failed') {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${apiBaseUrl}/api/v1${path}`
  const headers = new Headers(init.headers)
  const session = getSession()

  if (session) {
    headers.set('Authorization', `Bearer ${session.accessToken}`)
  }

  let response: Response
  try {
    response = await fetch(url, { ...init, headers })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('Network request failed')
  }

  if (response.status === 401 && session) {
    clearSession(true)
  }

  if (!response.ok) throw new ApiError(response.status)
  return response
}
