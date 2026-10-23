import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from './api/client'
import { loginAdmin, logoutAdmin } from './api/auth'
import { clearSession, getSession, SESSION_INVALID_EVENT, type AdminSession } from './api/session'
import { DashboardHome } from './components/DashboardHome'
import { AdminLayout } from './components/AdminLayout'
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

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname)
  const [session, setSession] = useState<AdminSession | null>(() => getSession())

  function navigate(nextPath: string) {
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
  }

  useEffect(() => {
    function handlePopState() {
      setPath(window.location.pathname)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const invalidateSession = () => {
      clearSession()
      setSession(null)
      navigate('/')
    }
    window.addEventListener(SESSION_INVALID_EVENT, invalidateSession)
    return () => window.removeEventListener(SESSION_INVALID_EVENT, invalidateSession)
  }, [])

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
      navigate('/')
    }, Math.min(Math.max(0, remaining), 2_147_000_000))
    return () => window.clearTimeout(timeout)
  }, [session])

  useEffect(() => {
    if (session && path !== '/home' && path !== '/admin' && path !== '/admin/') navigate('/home')
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

  if (path === '/home' || path === '/admin' || path === '/admin/') {
    if (!session) return <LoginPage onLogin={authenticate} />
    return <AdminLayout currentPath={path} onLogout={logout}><DashboardHome /></AdminLayout>
  }

  if (session) return <AdminLayout currentPath="/home" onLogout={logout}><DashboardHome /></AdminLayout>
  return <LoginPage onLogin={authenticate} />
}
