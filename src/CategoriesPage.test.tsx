import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api/client'
import { CategoriesPage } from './components/CategoriesPage'

const api = vi.hoisted(() => ({
  getCategories: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn(),
  createSubcategory: vi.fn(), updateSubcategory: vi.fn(), deleteSubcategory: vi.fn(),
}))
vi.mock('./api/categories', () => api)
vi.mock('./api/client', () => ({ ApiError: class ApiError extends Error { constructor(public status: number) { super() } } }))

const categoryTree = [{
  id: 1, nome: 'Periféricos', subcategorias: [{ id: 10, categoria_id: 1, nome: 'Mouses' }],
}]

beforeEach(() => {
  vi.clearAllMocks()
  api.getCategories.mockResolvedValue(categoryTree)
  api.createCategory.mockResolvedValue({ id: 2, nome: 'Componentes', subcategorias: [] })
  api.updateCategory.mockResolvedValue({ id: 1, nome: 'Acessórios', subcategorias: [] })
  api.deleteCategory.mockResolvedValue(undefined)
  api.createSubcategory.mockResolvedValue({ id: 11, categoria_id: 1, nome: 'Teclados' })
  api.updateSubcategory.mockResolvedValue({ id: 10, categoria_id: 1, nome: 'Mouses gamer' })
  api.deleteSubcategory.mockResolvedValue(undefined)
  vi.stubGlobal('confirm', vi.fn(() => true))
})

describe('categories management page', () => {
  it('lists and performs create, edit and delete for categories and subcategories', async () => {
    const user = userEvent.setup()
    render(<CategoriesPage />)
    expect(await screen.findByRole('heading', { name: 'Periféricos' })).toBeInTheDocument()
    expect(screen.getByText('Mouses')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nome da categoria'), 'Componentes')
    await user.click(screen.getByRole('button', { name: 'Cadastrar categoria' }))
    await waitFor(() => expect(api.createCategory).toHaveBeenCalledWith('Componentes'))

    const categorySection = screen.getByRole('article')
    await user.click(within(categorySection).getByRole('button', { name: 'Editar categoria Periféricos' }))
    const categoryEdit = screen.getByRole('dialog').querySelector('input[name="name"]')!
    await user.clear(categoryEdit)
    await user.type(categoryEdit, 'Acessórios')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.updateCategory).toHaveBeenCalledWith(1, 'Acessórios'))

    await user.type(screen.getByLabelText('Nova subcategoria'), 'Teclados')
    await user.click(screen.getByRole('button', { name: 'Cadastrar subcategoria' }))
    await waitFor(() => expect(api.createSubcategory).toHaveBeenCalledWith(1, 'Teclados'))

    await user.click(within(categorySection).getByRole('button', { name: 'Editar subcategoria Mouses' }))
    const subcategoryEdit = screen.getByRole('dialog').querySelector('input[name="name"]')!
    await user.clear(subcategoryEdit)
    await user.type(subcategoryEdit, 'Mouses gamer')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.updateSubcategory).toHaveBeenCalledWith(10, 'Mouses gamer'))

    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await user.click(within(categorySection).getByRole('button', { name: 'Excluir categoria Periféricos' }))
    expect(api.deleteCategory).not.toHaveBeenCalled()
    await user.click(within(categorySection).getByRole('button', { name: 'Excluir categoria Periféricos' }))
    await waitFor(() => expect(api.deleteCategory).toHaveBeenCalledWith(1))

    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await user.click(within(categorySection).getByRole('button', { name: 'Excluir categoria Periféricos' }))
    expect(api.deleteSubcategory).not.toHaveBeenCalled()
    await user.click(within(categorySection).getByRole('button', { name: 'Excluir subcategoria Mouses' }))
    await waitFor(() => expect(api.deleteSubcategory).toHaveBeenCalledWith(10))
  })

  it('shows specific referential integrity messages for blocked deletes', async () => {
    const user = userEvent.setup()
    render(<CategoriesPage />)
    const categorySection = await screen.findByRole('article')
    api.deleteCategory.mockRejectedValueOnce(new ApiError(409))
    await user.click(within(categorySection).getByRole('button', { name: 'Excluir categoria Periféricos' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ainda possui subcategorias')

    api.deleteSubcategory.mockRejectedValueOnce(new ApiError(409))
    await user.click(within(categorySection).getByRole('button', { name: 'Excluir subcategoria Mouses' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('associada a produtos')
  })

  it('reports authorization errors without hiding the categories', async () => {
    const user = userEvent.setup()
    render(<CategoriesPage />)
    await screen.findByRole('heading', { name: 'Periféricos' })
    api.createCategory.mockRejectedValueOnce(new ApiError(403))
    await user.type(screen.getByLabelText('Nome da categoria'), 'Nova')
    await user.click(screen.getByRole('button', { name: 'Cadastrar categoria' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('não tem permissão')
    expect(screen.getByText('Mouses')).toBeInTheDocument()
  })
})
