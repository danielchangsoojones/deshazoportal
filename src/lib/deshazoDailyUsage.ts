import { deshazoAppFetch } from './deshazoAppAuth'

export type DeshazoDailyUsagePoint = {
  active?: number
  total?: number
}

export type DeshazoDailyUsageResponse = {
  'Total Techs'?: number
  'Total Work Orders'?: number
  'Active App Users'?: number | unknown[]
  'Inactive App Users'?: number | unknown[]
  'Techs with a Closed Work Day'?: number | unknown[]
  'Techs with Work Time'?: number | unknown[]
  'Techs with Non-Job time'?: number | unknown[]
  'Opened Work Orders'?: number | unknown[]
  'Closed Work Orders'?: number | unknown[]
  'Active Work Orders'?: number | unknown[]
  'Active App Users Per Date'?: Record<string, DeshazoDailyUsagePoint>
  [key: string]: unknown
}

export async function getDeshazoDailyUsage(params: { startDate: string; endDate: string; serviceLocationId?: number | null }) {
  const query = new URLSearchParams({ startDate: params.startDate, endDate: params.endDate })
  if (params.serviceLocationId) query.set('serviceLocationId', String(params.serviceLocationId))
  const response = await deshazoAppFetch(`/reports/daily-usage?${query.toString()}`, { method: 'GET' })
  if (response.status === 401) throw new Error('Your DeShazo session has expired. Please sign in again.')
  if (!response.ok) throw new Error(`Daily usage report failed (${response.status}).`)
  const body: unknown = await response.json()
  return (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as DeshazoDailyUsageResponse
}
