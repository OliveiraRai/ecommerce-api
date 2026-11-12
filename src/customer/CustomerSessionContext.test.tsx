import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { CUSTOMER_SESSION_KEY } from '../api/customerSession'
import { CustomerSessionProvider, useCustomerSession } from './CustomerSessionContext'

function SessionControls() {
  const { session, isAuthenticated, setSession, clearSession } = useCustomerSession()
  return (
    <section>
      <p>{isAuthenticated ? session?.accessToken : 'Visitante'}</p>
      <button onClick={() => setSession({ access_token: 'client-token', token_type: 'bearer', expires_in: 1800 })}>Entrar cliente</button>
      <button onClick={clearSession}>Sair cliente</button>
    </section>
  )
}

beforeEach(() => {
  window.sessionStorage.clear()
  window.localStorage.clear()
})

describe('CustomerSessionProvider', () => {
  it('updates React state and storage when establishing and clearing a session', async () => {
    const user = userEvent.setup()
    render(<CustomerSessionProvider><SessionControls /></CustomerSessionProvider>)

    expect(screen.getByText('Visitante')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Entrar cliente' }))
    expect(screen.getByText('client-token')).toBeInTheDocument()
    expect(window.sessionStorage.getItem(CUSTOMER_SESSION_KEY)).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Sair cliente' }))
    expect(screen.getByText('Visitante')).toBeInTheDocument()
    expect(window.sessionStorage.getItem(CUSTOMER_SESSION_KEY)).toBeNull()
  })

  it('initializes React state from an existing valid session', () => {
    window.sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify({
      accessToken: 'restored-token', tokenType: 'bearer', expiresAt: Date.now() + 60_000,
    }))

    render(<CustomerSessionProvider><SessionControls /></CustomerSessionProvider>)

    expect(screen.getByText('restored-token')).toBeInTheDocument()
  })

  it('keeps the administrative session untouched when the customer session ends', async () => {
    const user = userEvent.setup()
    window.sessionStorage.setItem('gamer-store.admin-session', 'admin-token')
    render(<CustomerSessionProvider><SessionControls /></CustomerSessionProvider>)

    await user.click(screen.getByRole('button', { name: 'Entrar cliente' }))
    await user.click(screen.getByRole('button', { name: 'Sair cliente' }))

    expect(window.sessionStorage.getItem('gamer-store.admin-session')).toBe('admin-token')
  })
})
