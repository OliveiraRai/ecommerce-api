type MetricCardProps = {
  title: string
  value: string
  description?: string
  icon: 'products' | 'sales' | 'revenue'
}

function MetricIcon({ name }: { name: MetricCardProps['icon'] }) {
  const paths = {
    products: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.3 7.6 7.7 4.5 7.7-4.5M12 21v-9" /></>,
    sales: <><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5M8 16h3" /></>,
    revenue: <><path d="M12 3v18M17 7.5c0-1.4-1.8-2.5-4.5-2.5S8 6.1 8 7.5 9.8 10 12.5 10s4.5 1.1 4.5 2.5-1.8 2.5-4.5 2.5S8 13.9 8 12.5" /></>,
  }
  return <svg aria-hidden="true" className="metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

export function MetricCard({ title, value, description, icon }: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-heading"><MetricIcon name={icon} /><h2>{title}</h2></div>
      <p className="metric-value">{value}</p>
      {description && <p className="metric-description">{description}</p>}
    </article>
  )
}
