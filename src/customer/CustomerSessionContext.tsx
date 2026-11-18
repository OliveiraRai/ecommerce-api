import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  clearCustomerSession,
  getCustomerSession,
  saveCustomerSession,
  type CustomerSession,
  type CustomerTokenResponse,
} from '../api/customerSession'

type CustomerSessionContextValue = {
  session: CustomerSession | null
  isAuthenticated: boolean
  setSession: (token: CustomerTokenResponse, rememberMe?: boolean) => CustomerSession
  clearSession: () => void
}

const CustomerSessionContext = createContext<CustomerSessionContextValue | null>(null)

export function CustomerSessionProvider({ children }: { children: ReactNode }) {
  const [session, setCurrentSession] = useState<CustomerSession | null>(() => getCustomerSession())

  useEffect(() => {
    if (!session) return
    const remaining = session.expiresAt - Date.now()
    if (remaining <= 0) {
      clearCustomerSession()
      setCurrentSession(null)
      return
    }
    const timeout = window.setTimeout(() => {
      if (Date.now() >= session.expiresAt) {
        clearCustomerSession()
        setCurrentSession(null)
      }
    }, Math.min(remaining, 2_147_000_000))
    return () => window.clearTimeout(timeout)
  }, [session])

  useEffect(() => {
    const invalidate = () => setCurrentSession(null)
    window.addEventListener('gamer-store:customer-session-invalid', invalidate)
    return () => window.removeEventListener('gamer-store:customer-session-invalid', invalidate)
  }, [])

  const setSession = useCallback((token: CustomerTokenResponse, rememberMe = false): CustomerSession => {
    const nextSession = saveCustomerSession(token, rememberMe)
    setCurrentSession(nextSession)
    return nextSession
  }, [])

  const clearSession = useCallback((): void => {
    clearCustomerSession()
    setCurrentSession(null)
  }, [])
  const value = useMemo(() => ({ session, isAuthenticated: session !== null, setSession, clearSession }), [session, setSession, clearSession])

  return (
    <CustomerSessionContext.Provider value={value}>
      {children}
    </CustomerSessionContext.Provider>
  )
}

export function useCustomerSession(): CustomerSessionContextValue {
  const context = useContext(CustomerSessionContext)
  if (!context) throw new Error('useCustomerSession deve ser usado dentro de CustomerSessionProvider.')
  return context
}
