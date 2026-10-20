import { useEffect, useState, type FormEvent } from 'react'
import './styles.css'

function LoginPage({ onLogin }: { onLogin: () => void }) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // Este fluxo é apenas uma navegação de demonstração, sem autenticação.
    onLogin()
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
            <input
              autoComplete="username"
              id="username"
              name="username"
              placeholder="Digite seu usuário"
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Senha</label>
            <input
              autoComplete="current-password"
              id="password"
              name="password"
              placeholder="Digite sua senha"
              required
              type="password"
            />
          </div>

          <label className="remember-option" htmlFor="remember">
            <input id="remember" name="remember" type="checkbox" />
            <span>Lembrar de mim</span>
          </label>

          <button className="submit-button" type="submit">Entrar</button>
        </form>
      </section>
    </main>
  )
}

function HomePage() {
  return (
    <main className="home-page">
      <section className="home-card" aria-labelledby="home-title">
        <p className="eyebrow">GAMER STORE · ADMINISTRAÇÃO</p>
        <h1 id="home-title">Home</h1>
        <p className="home-note">Página inicial provisória da administração.</p>
      </section>
    </main>
  )
}

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    function handlePopState() {
      setPath(window.location.pathname)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function navigateToHome() {
    window.history.pushState({}, '', '/home')
    setPath('/home')
  }

  return path === '/home' ? <HomePage /> : <LoginPage onLogin={navigateToHome} />
}
