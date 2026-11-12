import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
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
  setSession: (token: CustomerTokenResponse) => CustomerSession
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

  function setSession(token: CustomerTokenResponse): CustomerSession {
    const nextSession = saveCustomerSession(token)
    setCurrentSession(nextSession)
    return nextSession
  }

  function clearSession(): void {
    clearCustomerSession()
    setCurrentSession(null)
  }

  return (
    <CustomerSessionContext.Provider value={{ session, isAuthenticated: session !== null, setSession, clearSession }}>
      {children}
    </CustomerSessionContext.Provider>
  )
}

export function useCustomerSession(): CustomerSessionContextValue {
  const context = useContext(CustomerSessionContext)
  if (!context) throw new Error('useCustomerSession deve ser usado dentro de CustomerSessionProvider.')
  return context
}
