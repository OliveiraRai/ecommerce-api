import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { saveSession } from './api/session'

const summary = { total_products: 128, total_sales: 24, total_revenue: '1234.56' }

function ok(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  window.sessionStorage.clear()
  window.localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/auth/admin/login')) {
      const credentials = JSON.parse(String(init?.body)) as { remember_me: boolean }
      return ok({ access_token: 'opaque-token', token_type: 'bearer', expires_in: credentials.remember_me ? 30 * 24 * 60 * 60 : 30 * 60 })
    }
    if (url.endsWith('/auth/admin/logout')) return new Response(null, { status: 204 })
    return ok(summary)
  }))
})

describe('admin authentication flow', () => {
  it('preserves the existing login layout and required fields', () => {
    render(<App />)

    const card = screen.getByRole('region', { name: 'ADMINISTRAÇÃO' })
    expect(withinOrder(card, ['Gamer Store', 'ADMINISTRAÇÃO', 'Usuário', 'Senha', 'Lembrar de mim', 'Entrar'])).toBe(true)
    expect(screen.getByRole('textbox', { name: 'Usuário' })).toBeRequired()
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password')
  })

  it('authenticates, stores a tab session and loads real dashboard values with Bearer', async () => {
    window.localStorage.setItem('gamer-store.admin-session', 'old persistent session')
    window.sessionStorage.setItem('gamer-store.admin-session', 'old tab session')
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByRole('textbox', { name: 'Usuário' }), 'admin')
    await user.type(screen.getByLabelText('Senha'), 'password')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
    expect(await screen.findByText('128')).toBeInTheDocument()
    expect(window.sessionStorage.getItem('gamer-store.admin-session')).toContain('opaque-token')
    expect(window.localStorage.length).toBe(0)
    const calls = vi.mocked(fetch).mock.calls
    expect(calls[0]?.[0]).toBe('/api/v1/auth/admin/login')
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({ username: 'admin', password: 'password', remember_me: false })
    expect(new Headers(calls[1]?.[1]?.headers).get('Authorization')).toBe('Bearer opaque-token')
  })

  it('sends the remember choice and stores the 30-day session in localStorage', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByRole('textbox', { name: 'Usuário' }), 'admin')
    await user.type(screen.getByLabelText('Senha'), 'password')
    await user.click(screen.getByRole('checkbox', { name: 'Lembrar de mim' }))
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
    const calls = vi.mocked(fetch).mock.calls
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({ username: 'admin', password: 'password', remember_me: true })
    const stored = JSON.parse(window.localStorage.getItem('gamer-store.admin-session')!) as { accessToken: string; expiresAt: number }
    expect(stored.accessToken).toBe('opaque-token')
    expect(stored.expiresAt - Date.now()).toBeGreaterThan(30 * 24 * 60 * 60 * 1000 - 1000)
    expect(stored.expiresAt - Date.now()).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('shows a safe message for invalid credentials and stays on the login screen', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ok({ detail: 'Invalid username or password' }, 401))
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByRole('textbox', { name: 'Usuário' }), 'admin')
    await user.type(screen.getByLabelText('Senha'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuário ou senha inválidos.')
    expect(window.location.pathname).toBe('/')
  })

  it('shows a connection error without treating it as invalid credentials', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByRole('textbox', { name: 'Usuário' }), 'admin')
    await user.type(screen.getByLabelText('Senha'), 'password')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Verifique sua conexão')
    expect(screen.getByRole('alert')).not.toHaveTextContent('inválidos')
  })

  it('prevents duplicate login submissions while the request is pending', async () => {
    let resolveRequest!: (value: Response) => void
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve }))
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByRole('textbox', { name: 'Usuário' }), 'admin')
    await user.type(screen.getByLabelText('Senha'), 'password')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    await user.click(screen.getByRole('button', { name: 'Entrando…' }))
    expect(fetch).toHaveBeenCalledTimes(1)
    resolveRequest(ok({ access_token: 'opaque-token', token_type: 'bearer', expires_in: 1800 }))
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
  })

  it('protects direct administrative URLs and redirects an existing session to Home', async () => {
    window.history.replaceState({}, '', '/home')
    const { unmount } = render(<App />)
    expect(screen.getByRole('heading', { name: 'ADMINISTRAÇÃO' })).toBeInTheDocument()
    unmount()
    window.sessionStorage.setItem('gamer-store.admin-session', JSON.stringify({ accessToken: 'saved-token', expiresAt: Date.now() + 60_000 }))
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
  })

  it('restores an unexpired session after page initialization and logs out locally and on the API', async () => {
    window.sessionStorage.setItem('gamer-store.admin-session', JSON.stringify({ accessToken: 'saved-token', expiresAt: Date.now() + 60_000 }))
    window.history.replaceState({}, '', '/home')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Sair' }))
    expect(await screen.findByRole('heading', { name: 'ADMINISTRAÇÃO' })).toBeInTheDocument()
    expect(window.sessionStorage.length).toBe(0)
    expect(window.localStorage.length).toBe(0)
    expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toBe('/api/v1/auth/admin/logout')
  })

  it('restores a persistent session after page initialization', async () => {
    window.localStorage.setItem('gamer-store.admin-session', JSON.stringify({ accessToken: 'persistent-token', expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 }))
    window.history.replaceState({}, '', '/home')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
    expect(new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer persistent-token')
  })

  it('does not accept a locally expired session', () => {
    window.sessionStorage.setItem('gamer-store.admin-session', JSON.stringify({ accessToken: 'old-token', expiresAt: Date.now() - 1000 }))
    window.history.replaceState({}, '', '/home')
    render(<App />)

    expect(screen.getByRole('heading', { name: 'ADMINISTRAÇÃO' })).toBeInTheDocument()
    expect(window.sessionStorage.length).toBe(0)
  })

  it('clears the session and returns to login after a protected request receives 401', async () => {
    window.sessionStorage.setItem('gamer-store.admin-session', JSON.stringify({ accessToken: 'bad-token', expiresAt: Date.now() + 60_000 }))
    window.history.replaceState({}, '', '/home')
    vi.mocked(fetch).mockResolvedValueOnce(ok({ detail: 'Invalid or expired credentials' }, 401))
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'ADMINISTRAÇÃO' })).toBeInTheDocument()
    expect(window.sessionStorage.length).toBe(0)
  })

  it('loads products through authenticated API requests and returns to login after 401', async () => {
    saveSession('products-token', 60, false)
    window.history.replaceState({}, '', '/products')
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/products')) return ok({ detail: 'Invalid or expired credentials' }, 401)
      return ok(summary, 401)
    })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'ADMINISTRAÇÃO' })).toBeInTheDocument()
    expect(window.sessionStorage.length).toBe(0)
    const calls = vi.mocked(fetch).mock.calls
    expect(calls.every((call) => new Headers(call[1]?.headers).get('Authorization') === 'Bearer products-token')).toBe(true)
  })
})

function withinOrder(container: HTMLElement, labels: string[]): boolean {
  const elements = labels.map((label) => {
    if (label === 'Gamer Store') return container.querySelector('[aria-label="Gamer Store"]')!
    if (label === 'Usuário' || label === 'Senha') return container.querySelector(`label[for="${label === 'Usuário' ? 'username' : 'password'}"]`)!
    if (label === 'Lembrar de mim') return container.querySelector('.remember-option')!
    return Array.from(container.querySelectorAll('h1, button')).find((element) => element.textContent?.includes(label))!
  })
  return elements.slice(0, -1).every((element, index) => Boolean(element.compareDocumentPosition(elements[index + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING))
}
