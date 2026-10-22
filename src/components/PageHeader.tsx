type PageHeaderProps = { title: string; description: string }

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">GAMER STORE · ADMINISTRAÇÃO</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
    </header>
  )
}
