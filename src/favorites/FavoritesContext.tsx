import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError } from '../api/client'
import { addCustomerFavorite, getCustomerFavorites, removeCustomerFavorite } from '../api/favorites'
import { useCustomerSession } from '../customer/CustomerSessionContext'

type FavoritesContextValue = {
  productIds: ReadonlySet<number>
  loading: boolean
  toggleFavorite: (productId: number) => Promise<'added' | 'removed' | 'login' | 'conflict'>
  removeFavorite: (productId: number) => Promise<void>
  refresh: () => Promise<void>
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

async function fetchAllFavoriteIds(): Promise<Set<number>> {
  const firstPage = await getCustomerFavorites(1, 100)
  const favorites = [...firstPage.items]
  for (let page = 2; page <= firstPage.total_pages; page += 1) {
    favorites.push(...(await getCustomerFavorites(page, 100)).items)
  }
  return new Set(favorites.map((item) => item.produto_id))
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { session, isAuthenticated } = useCustomerSession()
  const [productIds, setProductIds] = useState<Set<number>>(() => new Set())
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!isAuthenticated) { setProductIds(new Set()); setLoading(false); return }
    setLoading(true)
    try {
      setProductIds(await fetchAllFavoriteIds())
    } finally { setLoading(false) }
  }, [isAuthenticated])

  useEffect(() => {
    let active = true
    if (!session) { setProductIds(new Set()); setLoading(false); return }
    setLoading(true)
    fetchAllFavoriteIds().then((ids) => {
      if (active) setProductIds(ids)
    }).catch(() => {
      if (active) setProductIds(new Set())
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session])

  const removeFavorite = useCallback(async (productId: number) => {
    await removeCustomerFavorite(productId)
    setProductIds((current) => { const next = new Set(current); next.delete(productId); return next })
  }, [])

  const toggleFavorite = useCallback(async (productId: number): Promise<'added' | 'removed' | 'login' | 'conflict'> => {
    if (!isAuthenticated) {
      const returnTo = `${window.location.pathname}${window.location.search}`
      window.dispatchEvent(new CustomEvent('gamer-store:customer-auth-required', { detail: { returnTo } }))
      return 'login'
    }
    if (productIds.has(productId)) {
      await removeFavorite(productId)
      return 'removed'
    }
    try {
      await addCustomerFavorite(productId)
      setProductIds((current) => new Set(current).add(productId))
      return 'added'
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        void refresh().catch(() => undefined)
        return 'conflict'
      }
      throw cause
    }
  }, [isAuthenticated, productIds, refresh, removeFavorite])

  const value = useMemo(() => ({ productIds, loading, toggleFavorite, removeFavorite, refresh }), [productIds, loading, toggleFavorite, removeFavorite, refresh])
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

export function useFavorites(): FavoritesContextValue {
  const context = useContext(FavoritesContext)
  if (!context) throw new Error('useFavorites deve ser usado dentro de FavoritesProvider.')
  return context
}
