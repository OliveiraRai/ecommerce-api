import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'

beforeEach(() => window.history.replaceState({}, '', '/'))

describe('admin login flow', () => {
  it('renders the login elements in the specified order', () => {
    render(<App />)

    const card = screen.getByRole('region', { name: 'ADMINISTRAÇÃO' })
    const orderedElements = [
      within(card).getByLabelText('Gamer Store'),
      within(card).getByRole('heading', { name: 'ADMINISTRAÇÃO' }),
      within(card).getByLabelText('Usuário'),
      within(card).getByLabelText('Senha'),
      within(card).getByLabelText('Lembrar de mim'),
      within(card).getByRole('button', { name: 'Entrar' }),
    ]

    expect(
      orderedElements.slice(0, -1).every((element, index) =>
        Boolean(element.compareDocumentPosition(orderedElements[index + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING),
      ),
    ).toBe(true)
  })

  it('uses required text and password fields and accepts input', async () => {
    const user = userEvent.setup()
    render(<App />)

    const username = screen.getByRole('textbox', { name: 'Usuário' })
    const password = screen.getByLabelText('Senha')

    expect(username).toBeRequired()
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toBeRequired()

    await user.type(username, 'admin')
    await user.type(password, 'segredo')

    expect(username).toHaveValue('admin')
    expect(password).toHaveValue('segredo')
  })

  it('does not navigate while required fields are empty', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(screen.getByRole('heading', { name: 'ADMINISTRAÇÃO' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  it('navigates to the provisional home after a valid submit', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('textbox', { name: 'Usuário' }), 'admin')
    await user.type(screen.getByLabelText('Senha'), 'segredo')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(window.location.pathname).toBe('/home')
    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Vendas recentes' })).toBeInTheDocument()
  })

  it('submits with Enter and keeps remember-me as a non-persistent checkbox', async () => {
    const user = userEvent.setup()
    render(<App />)

    const remember = screen.getByRole('checkbox', { name: 'Lembrar de mim' })
    await user.click(remember)
    expect(remember).toBeChecked()
    await user.click(remember)
    expect(remember).not.toBeChecked()
    expect(window.localStorage.length).toBe(0)

    await user.type(screen.getByRole('textbox', { name: 'Usuário' }), 'admin')
    await user.type(screen.getByLabelText('Senha'), 'segredo{Enter}')

    expect(window.location.pathname).toBe('/home')
    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
    expect(window.localStorage.length).toBe(0)
  })

  it('renders the provisional home when visiting its route directly', () => {
    window.history.replaceState({}, '', '/home')

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Vendas recentes' })).toBeInTheDocument()
  })
})
