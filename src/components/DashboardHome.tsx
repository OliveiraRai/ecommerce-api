import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { getDashboardSummary, type DashboardSummary } from '../api/dashboard'
import { MetricCard } from './MetricCard'
import { PageHeader } from './PageHeader'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const integer = new Intl.NumberFormat('pt-BR')

export function DashboardHome() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    getDashboardSummary(controller.signal)
      .then((data) => setSummary(data))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof ApiError && cause.status === 403
          ? 'Você não tem permissão para visualizar estes indicadores.'
          : 'Não foi possível carregar os indicadores. Verifique sua conexão e tente novamente.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  return (
    <div className="dashboard-content">
      <PageHeader title="Visão geral" description="Acompanhe os principais números da sua loja." />
      <section className="metrics-grid" aria-label="Indicadores">
        {loading ? <p className="metrics-status" role="status">Carregando indicadores…</p> : error || !summary ?
          <p className="metrics-status error" role="alert">{error || 'Não foi possível carregar os indicadores.'}</p> : <>
            <MetricCard title="Produtos" value={integer.format(summary.total_products)} description="Total cadastrado" icon="products" />
            <MetricCard title="Vendas" value={integer.format(summary.total_sales)} description="Total registrado" icon="sales" />
            <MetricCard title="Receita" value={currency.format(Number(summary.total_revenue))} description="Receita acumulada" icon="revenue" />
          </>}
      </section>
      <section className="latest-sales" aria-labelledby="latest-sales-title">
        <div className="section-heading"><div><h2 id="latest-sales-title">Vendas recentes</h2><p>As últimas movimentações da loja</p></div></div>
        <div className="sales-table-wrap">
          <table>
            <thead><tr><th scope="col">Venda</th><th scope="col">Cliente</th><th scope="col">Data</th><th scope="col">Valor</th></tr></thead>
          </table>
          <p className="sales-status" role="status">A API ainda não disponibiliza uma consulta de vendas recentes.</p>
        </div>
      </section>
    </div>
  )
}
