import { useCart } from '../cart/CartContext'
import { useCustomerSession } from '../customer/CustomerSessionContext'
import { logoutCustomer } from '../api/customers'

function StoreIcon({ name }: { name: 'heart' | 'cart' | 'account' }) {
  const paths = {
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    cart: <><path d="M3 3h2l2.4 12.2a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 8H6" /><circle cx="10" cy="21" r="1" /><circle cx="18" cy="21" r="1" /></>,
    account: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

export function StorefrontHeader() {
  const { unitCount } = useCart()
  const { isAuthenticated, clearSession } = useCustomerSession()
  async function signOut() {
    try { await logoutCustomer() } catch { /* The local token is cleared even if logout cannot reach the API. */ }
    clearSession()
    window.history.pushState({}, '', '/catalog')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
  return <header className="storefront-topbar">
    <a className="storefront-brand" href="/catalog" aria-label="Gamer Store — catálogo">
      <span className="storefront-brand-mark" aria-hidden="true">G</span><span>GAMER STORE</span>
    </a>
    <a className="storefront-header-search" href="/catalog" aria-label="Voltar ao catálogo">Catálogo</a>
    <nav className="storefront-shortcuts" aria-label="Atalhos da loja">
      <a className="storefront-shortcut" href="/cart" aria-label={`Carrinho, ${unitCount} ${unitCount === 1 ? 'item' : 'itens'}`}>
        <span className="storefront-cart-icon"><StoreIcon name="cart" />{unitCount > 0 && <span className="storefront-cart-count" aria-hidden="true">{unitCount}</span>}</span>
        <span>Carrinho</span>
      </a>
      <a className="storefront-shortcut" href="/favorites" aria-label="Favoritos"><StoreIcon name="heart" /><span>Favoritos</span></a>
      {isAuthenticated ? <button type="button" className="storefront-shortcut storefront-account-button" onClick={() => void signOut()} aria-label="Sair da conta"><StoreIcon name="account" /><span>Sair</span></button>
        : <a className="storefront-shortcut" href="/login" aria-label="Entrar na conta"><StoreIcon name="account" /><span>Entrar</span></a>}
    </nav>
  </header>
}
