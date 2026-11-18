import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError } from '../api/client'
import { addCustomerCartItem, getCustomerCart, removeCustomerCartItem, updateCustomerCartItem, type CustomerCartItem } from '../api/cart'
import { useCustomerSession } from '../customer/CustomerSessionContext'

type CartContextValue = {
  lines: CustomerCartItem[]
  unitCount: number
  loading: boolean
  refresh: () => Promise<void>
  addProduct: (productId: number, quantity: number) => Promise<void>
  updateQuantity: (itemId: number, quantity: number) => Promise<void>
  removeProduct: (itemId: number) => Promise<void>
}
const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const { session, clearSession } = useCustomerSession()
  const [lines, setLines] = useState<CustomerCartItem[]>([])
  const [loading, setLoading] = useState(false)
  const refresh = useCallback(async () => {
    if (!session) { setLines([]); setLoading(false); return }
    setLoading(true)
    try { setLines((await getCustomerCart()).itens) }
    catch (error) { if (error instanceof ApiError && error.status === 401) clearSession(); else throw error }
    finally { setLoading(false) }
  }, [session, clearSession])
  useEffect(() => { void refresh().catch(() => {}) }, [refresh])

  const addProduct = useCallback(async (productId: number, quantity: number) => {
    const added = await addCustomerCartItem(productId, quantity)
    setLines((current) => {
      const found = current.findIndex((line) => line.id === added.id)
      return found < 0 ? [...current, added] : current.map((line, index) => index === found ? added : line)
    })
  }, [])
  const updateQuantity = useCallback(async (itemId: number, quantity: number) => {
    if (quantity === 0) { await removeCustomerCartItem(itemId); setLines((current) => current.filter((line) => line.id !== itemId)); return }
    const updated = await updateCustomerCartItem(itemId, quantity)
    setLines((current) => current.map((line) => line.id === itemId ? updated : line))
  }, [])
  const removeProduct = useCallback(async (itemId: number) => {
    await removeCustomerCartItem(itemId)
    setLines((current) => current.filter((line) => line.id !== itemId))
  }, [])
  const value = useMemo(() => ({ lines, unitCount: lines.reduce((sum, line) => sum + line.quantidade, 0), loading, refresh, addProduct, updateQuantity, removeProduct }), [lines, loading, refresh, addProduct, updateQuantity, removeProduct])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart deve ser usado dentro de CartProvider.')
  return context
}
