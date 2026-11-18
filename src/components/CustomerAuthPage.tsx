import { useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { loginCustomer, registerCustomer } from '../api/customers'
import { useCustomerSession } from '../customer/CustomerSessionContext'

function safeReturnTo(): string {
  const destination = new URLSearchParams(window.location.search).get('returnTo')
  if (destination?.startsWith('/') && !destination.startsWith('//')) return destination
  return window.location.pathname === '/cart' ? '/cart' : '/catalog'
}

export function CustomerAuthPage({ mode, navigate }: { mode: 'login' | 'register'; navigate: (path: string) => void }) {
  const { setSession } = useCustomerSession()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isLogin = mode === 'login'
  const registered = new URLSearchParams(window.location.search).get('registered') === '1'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      if (isLogin) {
        const token = await loginCustomer(String(form.get('email') ?? ''), String(form.get('senha') ?? ''), form.get('remember') === 'on')
        setSession(token, form.get('remember') === 'on')
        navigate(safeReturnTo())
      } else {
        const senha = String(form.get('senha') ?? '')
        const confirmar_senha = String(form.get('confirmar_senha') ?? '')
        if (senha.length < 12 || !/[A-Z]/.test(senha) || !/[a-z]/.test(senha) || !/[^A-Za-z0-9]/.test(senha)) {
          setError('Use ao menos 12 caracteres, com maiúscula, minúscula e caractere especial.')
          return
        }
        if (senha !== confirmar_senha) { setError('A confirmação de senha não corresponde.'); return }
        await registerCustomer({ nome: String(form.get('nome') ?? '').trim(), sobrenome: String(form.get('sobrenome') ?? '').trim(), email: String(form.get('email') ?? ''), senha, confirmar_senha })
        navigate('/login?registered=1')
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) setError('E-mail ou senha inválidos.')
      else if (cause instanceof ApiError && cause.status === 409) setError('Este e-mail já está cadastrado.')
      else if (cause instanceof ApiError && cause.status === 422) setError('Confira os dados. A senha deve ter 12 caracteres, maiúscula, minúscula e caractere especial.')
      else setError(isLogin ? 'Não foi possível entrar. Verifique sua conexão e tente novamente.' : 'Não foi possível criar a conta. Verifique sua conexão e tente novamente.')
    } finally { setLoading(false) }
  }

  return <main className="login-page">
    <section className="login-card customer-auth-card" aria-labelledby="customer-auth-title">
      <a className="brand customer-auth-brand" href="/catalog" aria-label="Gamer Store">
        <span className="brand-mark" aria-hidden="true">G</span><span className="brand-name">GAMER STORE</span>
      </a>
      <h1 id="customer-auth-title" className="login-heading">{isLogin ? 'ENTRAR NA CONTA' : 'CRIAR CONTA'}</h1>
      {registered && isLogin && <p className="customer-auth-success" role="status">Cadastro concluído. Entre com seu e-mail e senha.</p>}
      <form className="login-form" onSubmit={(event) => void submit(event)}>
        {!isLogin && <>
          <div className="form-field"><label htmlFor="customer-first-name">Nome</label><input id="customer-first-name" name="nome" autoComplete="given-name" required maxLength={150} /></div>
          <div className="form-field"><label htmlFor="customer-last-name">Sobrenome</label><input id="customer-last-name" name="sobrenome" autoComplete="family-name" required maxLength={150} /></div>
        </>}
        <div className="form-field"><label htmlFor="customer-email">E-mail</label><input id="customer-email" name="email" type="email" autoComplete="email" required maxLength={320} /></div>
        <div className="form-field"><label htmlFor="customer-password">Senha</label><input id="customer-password" name="senha" type="password" autoComplete={isLogin ? 'current-password' : 'new-password'} required minLength={isLogin ? 1 : 12} maxLength={1024} /></div>
        {!isLogin && <div className="form-field"><label htmlFor="customer-password-confirm">Confirmar senha</label><input id="customer-password-confirm" name="confirmar_senha" type="password" autoComplete="new-password" required minLength={12} maxLength={1024} /></div>}
        {isLogin && <label className="remember-option" htmlFor="customer-remember"><input id="customer-remember" name="remember" type="checkbox" /><span>Lembrar de mim</span></label>}
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="submit-button" type="submit" disabled={loading}>{loading ? (isLogin ? 'Entrando…' : 'Criando conta…') : (isLogin ? 'Entrar' : 'Criar conta')}</button>
      </form>
      <p className="customer-auth-switch">{isLogin ? 'Ainda não tem conta?' : 'Já tem uma conta?'}{' '}
        <a href={isLogin ? '/register' : '/login'}>{isLogin ? 'Cadastre-se' : 'Entrar'}</a>
      </p>
    </section>
  </main>
}
