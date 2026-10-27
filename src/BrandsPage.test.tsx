import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api/client'
import { BrandsPage } from './components/BrandsPage'

const api = vi.hoisted(() => ({ getBrands: vi.fn(), createBrand: vi.fn(), updateBrand: vi.fn(), deleteBrand: vi.fn() }))
vi.mock('./api/brands', () => api)

beforeEach(() => {
  vi.clearAllMocks()
  api.getBrands.mockResolvedValue([{ id: 1, nome: 'Logitech' }])
  api.createBrand.mockResolvedValue({ id: 2, nome: 'Razer' })
  api.updateBrand.mockResolvedValue({ id: 1, nome: 'Logitech G' })
  api.deleteBrand.mockResolvedValue(undefined)
  vi.stubGlobal('confirm', vi.fn(() => true))
})

describe('brands management page', () => {
  it('lists, creates, renames, and handles deletion conflicts', async () => {
    const user = userEvent.setup()
    render(<BrandsPage />)
    expect(await screen.findByText('Logitech')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nome da marca'), 'Razer')
    await user.click(screen.getByRole('button', { name: 'Cadastrar marca' }))
    await waitFor(() => expect(api.createBrand).toHaveBeenCalledWith('Razer'))
    expect(await screen.findByRole('status')).toHaveTextContent('cadastrada com sucesso')

    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const editName = screen.getByRole('dialog').querySelector('input[name="brand_name"]')!
    await user.clear(editName)
    await user.type(editName, 'Logitech G')
    await user.click(screen.getByRole('button', { name: 'Salvar marca' }))
    await waitFor(() => expect(api.updateBrand).toHaveBeenCalledWith(1, 'Logitech G'))

    api.deleteBrand.mockRejectedValueOnce(new ApiError(409))
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('associada a produtos')
    expect(api.deleteBrand).toHaveBeenCalledWith(1)
  })
})
