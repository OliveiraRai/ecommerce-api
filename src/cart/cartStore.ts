export type CartLine = { productId: number; quantity: number }

const STORAGE_KEY = 'gamer-store.cart'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseCart(raw: string | null): CartLine[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const quantities = new Map<number, number>()
    for (const entry of parsed) {
      if (!isRecord(entry)) continue
      const productId = entry.productId
      const quantity = entry.quantity
      if (!Number.isSafeInteger(productId) || (productId as number) < 1) continue
      if (!Number.isSafeInteger(quantity) || (quantity as number) < 1) continue
      const id = productId as number
      const next = (quantities.get(id) ?? 0) + (quantity as number)
      if (Number.isSafeInteger(next)) quantities.set(id, next)
    }
    return [...quantities].map(([productId, quantity]) => ({ productId, quantity }))
  } catch {
    return []
  }
}

export function readCart(): CartLine[] {
  try { return parseCart(window.localStorage.getItem(STORAGE_KEY)) } catch { return [] }
}

export function writeCart(lines: CartLine[]): void {
  try {
    if (lines.length === 0) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
  } catch { /* Storage may be unavailable. */ }
}

export function addCartProduct(lines: CartLine[], productId: number, quantity: number, stock: number): CartLine[] {
  if (!Number.isSafeInteger(productId) || productId < 1) throw new Error('Produto inválido.')
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('A quantidade deve ser um inteiro positivo.')
  if (!Number.isSafeInteger(stock) || stock < 0 || stock === 0) throw new Error('Produto indisponível.')
  const existing = lines.find((line) => line.productId === productId)?.quantity ?? 0
  if (existing + quantity > stock) throw new Error('A quantidade solicitada excede o estoque disponível.')
  if (existing) return lines.map((line) => line.productId === productId ? { ...line, quantity: existing + quantity } : line)
  return [...lines, { productId, quantity }]
}

export function setCartQuantity(lines: CartLine[], productId: number, quantity: number, stock: number): CartLine[] {
  if (quantity === 0) return removeCartProduct(lines, productId)
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('A quantidade deve ser um inteiro positivo.')
  const current = lines.find((line) => line.productId === productId)?.quantity ?? 0
  if (!Number.isSafeInteger(stock) || (quantity > current && quantity > stock)) throw new Error('A quantidade solicitada excede o estoque disponível.')
  return lines.map((line) => line.productId === productId ? { ...line, quantity } : line)
}

export function removeCartProduct(lines: CartLine[], productId: number): CartLine[] {
  return lines.filter((line) => line.productId !== productId)
}

export function priceToCents(price: string | number): number {
  let normalized = typeof price === 'number' ? price.toFixed(2) : price.trim()
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Preço inválido recebido da API.')
  const [whole, fraction = ''] = normalized.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) throw new Error('Preço fora do limite suportado.')
  return cents
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

export function sumCartUnits(lines: CartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0)
}
