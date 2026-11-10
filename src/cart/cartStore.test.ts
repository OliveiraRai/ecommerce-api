import { beforeEach, describe, expect, it } from 'vitest'
import { addCartProduct, formatCents, parseCart, priceToCents, readCart, removeCartProduct, setCartQuantity, writeCart } from './cartStore'

describe('cart store helpers', () => {
  beforeEach(() => window.localStorage.clear())

  it('validates and recovers persisted cart data while ignoring malformed lines', () => {
    expect(parseCart('{')).toEqual([])
    expect(parseCart(JSON.stringify({ productId: 1, quantity: 1 }))).toEqual([])
    expect(parseCart(JSON.stringify([
      { productId: 3, quantity: 2 }, { productId: 3, quantity: 1 }, { productId: -1, quantity: 4 },
      { productId: 2, quantity: 0 }, { productId: '4', quantity: 1 },
    ]))).toEqual([{ productId: 3, quantity: 3 }])
    writeCart([{ productId: 8, quantity: 2 }])
    expect(readCart()).toEqual([{ productId: 8, quantity: 2 }])
  })

  it('adds existing products as one line and enforces stock and positive integer quantities', () => {
    const one = addCartProduct([], 5, 1, 3)
    expect(addCartProduct(one, 5, 2, 3)).toEqual([{ productId: 5, quantity: 3 }])
    expect(() => addCartProduct(one, 5, 3, 3)).toThrow(/estoque/)
    expect(() => addCartProduct([], 5, 0, 3)).toThrow(/inteiro positivo/)
    expect(() => addCartProduct([], 5, 1, 0)).toThrow(/indisponível/)
  })

  it('updates and removes lines including removal at zero units', () => {
    const lines = [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }]
    expect(setCartQuantity(lines, 1, 3, 5)[0]?.quantity).toBe(3)
    expect(() => setCartQuantity(lines, 1, 4, 3)).toThrow(/estoque/)
    expect(setCartQuantity(lines, 1, 0, 0)).toEqual([{ productId: 2, quantity: 1 }])
    expect(removeCartProduct(lines, 2)).toEqual([{ productId: 1, quantity: 2 }])
  })

  it('calculates monetary amounts as integer cents', () => {
    expect(priceToCents('249.90')).toBe(24990)
    expect(priceToCents(0.1)).toBe(10)
    expect(priceToCents('19.99') * 3).toBe(5997)
    expect(formatCents(5997)).toContain('59,97')
    expect(() => priceToCents('1.999')).toThrow(/inválido/)
  })
})
