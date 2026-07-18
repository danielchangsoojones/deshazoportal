import { deshazoAppFetch } from './deshazoAppAuth'

export type DeshazoRecoveryEmployee = {
  employeeName: string
  job: number
  shop: number
  warranty: number
  total: number
  weekOrder: number
}

export type DeshazoRecoveryTotals = {
  headCount: number
  jobTime: number
  idleTime: number
  warrantyTime: number
  total: number
  hrsWeek: number
}

export type DeshazoRecoveryLocation = {
  locationName: string
  employees: DeshazoRecoveryEmployee[]
  totals: DeshazoRecoveryTotals
}

export type DeshazoRecoveryRegion = {
  regionName?: string | null
  locations: DeshazoRecoveryLocation[]
}

export async function getDeshazoRecovery(params: { startDate: string; endDate: string; serviceLocationId?: number | null }) {
  const query = new URLSearchParams({ monthStart: params.startDate, endDate: params.endDate })
  if (params.serviceLocationId) query.set('serviceLocationId', String(params.serviceLocationId))
  const response = await deshazoAppFetch(`/reports/recovery?${query.toString()}`, { method: 'GET' })
  if (response.status === 401) throw new Error('Your DeShazo session has expired. Please sign in again.')
  if (!response.ok) throw new Error(`Recovery report failed (${response.status}).`)
  const body = await response.json()
  return (Array.isArray(body) ? body : []) as DeshazoRecoveryRegion[]
}
