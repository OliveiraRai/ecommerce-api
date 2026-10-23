import { useEffect, useState, type ReactNode } from 'react'

type AdminLayoutProps = { children: ReactNode; currentPath: string; onLogout: () => void }

const items = [
  { label: 'Home', href: '/home', icon: 'home', active: (path: string) => path === '/home' || path === '/admin' || path === '/admin/' },
  { label: 'Produtos', href: '/products', icon: 'products', active: () => false },
  { label: 'Vendas', href: '/sales', icon: 'sales', active: () => false },
]

function NavigationIcon({ name }: { name: string }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    products: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.3 7.6 7.7 4.5 7.7-4.5M12 21v-9" /></>,
    sales: <><path d="M5 3h14v18H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  }
  return <svg aria-hidden="true" className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name as keyof typeof paths]}</svg>
}

export function AdminLayout({ children, currentPath, onLogout }: AdminLayoutProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <div className="admin-shell">
      <button className="mobile-menu-button" type="button" aria-label="Abrir navegação" aria-expanded={open} aria-controls="admin-sidebar" onClick={() => setOpen(true)}>
        <span aria-hidden="true">☰</span>
      </button>
      <aside id="admin-sidebar" className={`admin-sidebar${open ? ' is-open' : ''}`} aria-label="Navegação administrativa">
        <div className="sidebar-brand">
          <button className="sidebar-close" type="button" aria-label="Fechar navegação" onClick={() => setOpen(false)}>×</button>
          <div className="sidebar-brand-name"><span className="sidebar-logo" aria-hidden="true">G</span><span>Gamer Store</span></div>
          <p>Administração</p>
        </div>
        <nav className="sidebar-nav" aria-label="Principal">
          {items.map((item) => {
            const active = item.active(currentPath)
            return <a key={item.label} href={item.href} aria-current={active ? 'page' : undefined} aria-disabled={!active ? 'true' : undefined} className={`nav-link${active ? ' active' : ''}`} onClick={(event) => { event.preventDefault(); setOpen(false) }}>
              <NavigationIcon name={item.icon} /><span>{item.label}</span>
            </a>
          })}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-divider" /><button className="logout-link" type="button" onClick={() => { setOpen(false); onLogout() }}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></svg>Sair</button></div>
      </aside>
      {open && <button className="sidebar-backdrop" type="button" aria-label="Fechar navegação" onClick={() => setOpen(false)} />}
      <main className="admin-main">{children}</main>
    </div>
  )
}
