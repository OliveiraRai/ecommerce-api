import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from './api/client'
import { loginAdmin, logoutAdmin } from './api/auth'
import { clearSession, getSession, SESSION_INVALID_EVENT, type AdminSession } from './api/session'
import { DashboardHome } from './components/DashboardHome'
import { ProductsPage } from './components/ProductsPage'
import { BrandsPage } from './components/BrandsPage'
import { CategoriesPage } from './components/CategoriesPage'
import { SalesPage } from './components/SalesPage'
import { AdminLayout } from './components/AdminLayout'
import { CatalogPage } from './components/CatalogPage'
import { ProductDetailPage } from './components/ProductDetailPage'
import { CartPage } from './components/CartPage'
import { FavoritesPage } from './components/FavoritesPage'
import { CartProvider } from './cart/CartContext'
import { FavoritesProvider } from './favorites/FavoritesContext'
import { CustomerSessionProvider } from './customer/CustomerSessionContext'
import { useCustomerSession } from './customer/CustomerSessionContext'
import { CustomerAuthPage } from './components/CustomerAuthPage'
import './styles.css'

function LoginPage({ onLogin }: { onLogin: (username: string, password: string, rememberMe: boolean) => Promise<void> }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      await onLogin(String(form.get('username') ?? ''), String(form.get('password') ?? ''), form.get('remember') === 'on')
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setError('Usuário ou senha inválidos.')
      } else {
        setError('Não foi possível entrar. Verifique sua conexão e tente novamente.')
      }
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="admin-title">
        <div className="brand" aria-label="Gamer Store">
          <span className="brand-mark" aria-hidden="true">G</span>
          <span className="brand-name">GAMER STORE</span>
        </div>
        <h1 id="admin-title" className="login-heading">ADMINISTRAÇÃO</h1>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="username">Usuário</label>
            <input autoComplete="username" id="username" name="username" placeholder="Digite seu usuário" required />
          </div>
          <div className="form-field">
            <label htmlFor="password">Senha</label>
            <input autoComplete="current-password" id="password" name="password" placeholder="Digite sua senha" required type="password" />
          </div>
          <label className="remember-option" htmlFor="remember">
            <input id="remember" name="remember" type="checkbox" />
            <span>Lembrar de mim</span>
          </label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="submit-button" type="submit" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
        </form>
      </section>
    </main>
  )
}

function AppContent() {
  const { session: customerSession, clearSession: clearCustomer } = useCustomerSession()
  const [path, setPath] = useState(() => window.location.pathname)
  const [session, setSession] = useState<AdminSession | null>(() => getSession())

  function navigate(nextPath: string) {
    window.history.pushState({}, '', nextPath)
    setPath(new URL(nextPath, window.location.href).pathname)
  }

  useEffect(() => {
    function handlePopState() {
      setPath(window.location.pathname)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    function handleInternalLink(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target || anchor.hasAttribute('download')) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname && url.search === window.location.search) return
      event.preventDefault()
      window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
      setPath(url.pathname)
    }
    document.addEventListener('click', handleInternalLink)
    return () => document.removeEventListener('click', handleInternalLink)
  }, [])

  useLayoutEffect(() => {
    const invalidateSession = () => {
      clearSession()
      setSession(null)
      navigate('/')
    }
    window.addEventListener(SESSION_INVALID_EVENT, invalidateSession)
    return () => window.removeEventListener(SESSION_INVALID_EVENT, invalidateSession)
  }, [])

  useEffect(() => {
    const requireCustomer = (event: Event) => {
      const returnTo = (event as CustomEvent<{ returnTo?: string }>).detail?.returnTo ?? `${window.location.pathname}${window.location.search}`
      navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`)
    }
    const invalidateCustomer = () => {
      clearCustomer()
      if (window.location.pathname === '/cart' || window.location.pathname === '/favorites') {
        const returnTo = `${window.location.pathname}${window.location.search}`
        navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`)
      }
    }
    window.addEventListener('gamer-store:customer-auth-required', requireCustomer)
    window.addEventListener('gamer-store:customer-session-invalid', invalidateCustomer)
    return () => {
      window.removeEventListener('gamer-store:customer-auth-required', requireCustomer)
      window.removeEventListener('gamer-store:customer-session-invalid', invalidateCustomer)
    }
  }, [clearCustomer])

  useEffect(() => {
    if ((path === '/cart' || path === '/favorites') && !customerSession) {
      navigate(`/login?returnTo=${encodeURIComponent(path)}`)
    }
    if ((path === '/login' || path === '/register') && customerSession) navigate(safeCustomerReturn())
  }, [path, customerSession])

  useEffect(() => {
    if (!session) return
    const remaining = session.expiresAt - Date.now()
    const timeout = window.setTimeout(() => {
      if (Date.now() < session.expiresAt) {
        setSession({ ...session })
        return
      }
      clearSession()
      setSession(null)
      if (path !== '/catalog' && path !== '/cart' && path !== '/favorites' && !/^\/catalog\/\d+$/.test(path)) navigate('/')
    }, Math.min(Math.max(0, remaining), 2_147_000_000))
    return () => window.clearTimeout(timeout)
  }, [session, path])

  useEffect(() => {
    const publicStorefrontPath = path === '/catalog' || path === '/cart' || path === '/favorites' || path === '/login' || path === '/register' || /^\/catalog\/\d+$/.test(path)
    if (session && !publicStorefrontPath && !['/home', '/admin', '/admin/', '/products', '/categories', '/brands', '/sales'].includes(path)) navigate('/home')
  }, [path, session])

  async function authenticate(username: string, password: string, rememberMe: boolean) {
    const authenticated = await loginAdmin(username, password, rememberMe)
    setSession(authenticated)
    navigate('/home')
  }

  async function logout() {
    try {
      await logoutAdmin()
    } catch {
      // Clear the local session even when the API cannot be reached.
    } finally {
      clearSession()
      setSession(null)
      navigate('/')
    }
  }

  if (path === '/login' || path === '/register') return <CustomerAuthPage mode={path === '/register' ? 'register' : 'login'} navigate={navigate} />
  if (path === '/catalog') return <CatalogPage />
  if (path === '/cart') return customerSession ? <CartPage /> : <CustomerAuthPage mode="login" navigate={navigate} />
  if (path === '/favorites') return customerSession ? <FavoritesPage /> : <CustomerAuthPage mode="login" navigate={navigate} />
  const productDetailMatch = path.match(/^\/catalog\/(\d+)$/)
  if (productDetailMatch) {
    const productId = Number(productDetailMatch[1])
    if (Number.isSafeInteger(productId) && productId > 0) return <ProductDetailPage productId={productId} resumeAdd={new URLSearchParams(window.location.search).get('addToCart') === '1'} />
    return <ProductDetailPage productId={0} />
  }

  if (path === '/home' || path === '/admin' || path === '/admin/' || path === '/products' || path === '/categories' || path === '/brands' || path === '/sales') {
    if (!session) return <LoginPage onLogin={authenticate} />
    const page = path === '/products' ? <ProductsPage /> : path === '/categories' ? <CategoriesPage /> : path === '/brands' ? <BrandsPage /> : path === '/sales' ? <SalesPage /> : <DashboardHome />
    return <AdminLayout currentPath={path} onLogout={logout} onNavigate={navigate}>{page}</AdminLayout>
  }

  if (session) return <AdminLayout currentPath="/home" onLogout={logout}><DashboardHome /></AdminLayout>
  return <LoginPage onLogin={authenticate} />
}

function safeCustomerReturn(): string {
  const destination = new URLSearchParams(window.location.search).get('returnTo')
  return destination?.startsWith('/') && !destination.startsWith('//') ? destination : '/catalog'
}

export default function App() {
  return <CustomerSessionProvider><FavoritesProvider><CartProvider><AppContent /></CartProvider></FavoritesProvider></CustomerSessionProvider>
}
