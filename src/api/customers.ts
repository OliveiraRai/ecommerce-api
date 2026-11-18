import { customerApiRequest } from './client'
import type { CustomerTokenResponse } from './customerSession'

export type CustomerInput = { nome: string; sobrenome: string; email: string; senha: string; confirmar_senha: string }
export type CustomerPublic = { id: number; nome: string; sobrenome: string; email: string }

export async function registerCustomer(input: CustomerInput): Promise<CustomerPublic> {
  const response = await customerApiRequest('/auth/customers/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  return await response.json() as CustomerPublic
}

export async function loginCustomer(email: string, senha: string, rememberMe: boolean): Promise<CustomerTokenResponse> {
  const response = await customerApiRequest('/auth/customers/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha, remember_me: rememberMe }),
  })
  return await response.json() as CustomerTokenResponse
}

export async function logoutCustomer(): Promise<void> {
  await customerApiRequest('/auth/customers/logout', { method: 'POST' })
}
