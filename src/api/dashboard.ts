export type DashboardSummary = {
  total_products: number
  total_sales: number
  total_revenue: string | number
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export async function getDashboardSummary(signal?: AbortSignal): Promise<DashboardSummary> {
  const response = await fetch(`${apiBaseUrl}/api/v1/admin/dashboard/summary`, { signal })
  if (!response.ok) throw new Error('Dashboard request failed')

  const payload: unknown = await response.json()
  if (
    typeof payload !== 'object' || payload === null ||
    !('total_products' in payload) || typeof payload.total_products !== 'number' ||
    !('total_sales' in payload) || typeof payload.total_sales !== 'number' ||
    !('total_revenue' in payload) ||
      (typeof payload.total_revenue !== 'number' && typeof payload.total_revenue !== 'string')
  ) {
    throw new Error('Invalid dashboard response')
  }

  return payload as DashboardSummary
}
