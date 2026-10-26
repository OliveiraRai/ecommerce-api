import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { getDashboardSummary, getRecentSales, type DashboardSummary } from '../api/dashboard'
import type { Sale } from '../api/sales'
import { MetricCard } from './MetricCard'
import { PageHeader } from './PageHeader'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const integer = new Intl.NumberFormat('pt-BR')
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function saleTotal(sale: Sale) {
  return sale.itens.reduce((total, item) => total + item.quantidade * Number(item.preco_unitario), 0)
}

export function DashboardHome() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [recentSales, setRecentSales] = useState<Sale[]>([])
  const [salesLoading, setSalesLoading] = useState(true)
  const [salesError, setSalesError] = useState('')

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

  useEffect(() => {
    const controller = new AbortController()
    getRecentSales(controller.signal)
      .then(setRecentSales)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setSalesError(cause instanceof ApiError && cause.status === 403
          ? 'Você não tem permissão para visualizar as vendas recentes.'
          : 'Não foi possível carregar as vendas recentes. Verifique sua conexão e tente novamente.')
      })
      .finally(() => { if (!controller.signal.aborted) setSalesLoading(false) })
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
            <tbody>
              {recentSales.map((sale) => <tr key={sale.id}>
                <td>#{sale.id}</td>
                <td>Cliente #{sale.cliente_id}</td>
                <td>{sale.data_venda ? dateTime.format(new Date(sale.data_venda)) : 'Data não registrada'}</td>
                <td>{currency.format(saleTotal(sale))}</td>
              </tr>)}
            </tbody>
          </table>
          {salesLoading ? <p className="sales-status" role="status">Carregando vendas recentes…</p> :
            salesError ? <p className="sales-status" role="alert">{salesError}</p> :
              recentSales.length === 0 ? <p className="sales-status" role="status">Nenhuma venda registrada.</p> : null}
        </div>
      </section>
    </div>
  )
}
