import { deshazoAppFetch } from './deshazoAppAuth'

export type DeshazoPayCorBucket = {
  reg?: number | string
  ot?: number | string
}

export type DeshazoPayCorRow = {
  employeeId?: number | string | null
  employeeName?: string | null
  date: string
  department?: string | null
  departments?: Record<string, string>
  jobNumber?: Array<string | number>
  PTO?: DeshazoPayCorBucket
  BER?: DeshazoPayCorBucket
  JURY?: DeshazoPayCorBucket
  TRAINING?: DeshazoPayCorBucket
  LUNCH?: DeshazoPayCorBucket
  IS_CALIFORNIA_PAYROLL?: boolean
}

export async function getDeshazoPayCor(params: { weekStart: string; serviceLocationId?: number | null }) {
  const query = new URLSearchParams({ weekStart: params.weekStart })
  if (params.serviceLocationId) query.set('serviceLocationId', String(params.serviceLocationId))
  const response = await deshazoAppFetch(`/reports/pay-cor?${query.toString()}`, { method: 'GET' })
  if (response.status === 401) throw new Error('Your DeShazo session has expired. Please sign in again.')
  if (!response.ok) throw new Error(`PayCor report failed (${response.status}).`)
  const body: unknown = await response.json()
  return (Array.isArray(body) ? body : []) as DeshazoPayCorRow[]
}
