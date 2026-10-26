import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AdminLayout } from './components/AdminLayout'

describe('administrative layout', () => {
  it('marks the current page and closes the mobile drawer with Escape', async () => {
    const user = userEvent.setup()
    render(<AdminLayout currentPath="/home" onLogout={() => {}}><h1>Visão geral</h1></AdminLayout>)

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Produtos' })).not.toHaveAttribute('aria-disabled', 'true')

    await user.click(screen.getByRole('button', { name: 'Abrir navegação' }))
    expect(screen.getByRole('button', { name: 'Abrir navegação' })).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Abrir navegação' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the drawer after selecting a navigation item', async () => {
    const user = userEvent.setup()
    render(<AdminLayout currentPath="/home" onLogout={() => {}}><h1>Visão geral</h1></AdminLayout>)

    await user.click(screen.getByRole('button', { name: 'Abrir navegação' }))
    await user.click(screen.getByRole('link', { name: 'Home' }))
    expect(screen.getByRole('button', { name: 'Abrir navegação' })).toHaveAttribute('aria-expanded', 'false')
  })
})
