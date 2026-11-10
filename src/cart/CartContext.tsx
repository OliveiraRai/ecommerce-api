import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { addCartProduct, priceToCents, readCart, removeCartProduct, setCartQuantity, sumCartUnits, writeCart, type CartLine } from './cartStore'

type CartContextValue = {
  lines: CartLine[]
  unitCount: number
  initialPrices: Record<number, number>
  addProduct: (productId: number, quantity: number, stock: number, price: string | number) => void
  updateQuantity: (productId: number, quantity: number, stock: number) => void
  removeProduct: (productId: number) => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(readCart)
  const [initialPrices, setInitialPrices] = useState<Record<number, number>>({})
  useEffect(() => { writeCart(lines) }, [lines])

  const addProduct = useCallback((productId: number, quantity: number, stock: number, price: string | number) => {
    const cents = priceToCents(price)
    setLines(addCartProduct(lines, productId, quantity, stock))
    setInitialPrices((current) => current[productId] === undefined ? { ...current, [productId]: cents } : current)
  }, [lines])
  const updateQuantity = useCallback((productId: number, quantity: number, stock: number) => {
    setLines(setCartQuantity(lines, productId, quantity, stock))
    if (quantity === 0) setInitialPrices((current) => { const next = { ...current }; delete next[productId]; return next })
  }, [lines])
  const removeProduct = useCallback((productId: number) => {
    setLines((current) => removeCartProduct(current, productId))
    setInitialPrices((current) => { const next = { ...current }; delete next[productId]; return next })
  }, [])
  const value = useMemo(() => ({ lines, unitCount: sumCartUnits(lines), initialPrices, addProduct, updateQuantity, removeProduct }), [lines, initialPrices, addProduct, updateQuantity, removeProduct])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart deve ser usado dentro de CartProvider.')
  return context
}
