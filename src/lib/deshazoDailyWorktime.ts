import { deshazoAppFetch } from './deshazoAppAuth'

export type DeshazoDailyWorktimeEntry = {
  employeeId?: number | string
  workOrderId?: number | null
  type?: string | null
  regHours?: number
  otHours?: number
  startTime?: string | null
  endTime?: string | null
}

export type DeshazoDailyWorktimeResponse = {
  employeeNames: Record<string, string>
  employeesData: Record<string, DeshazoDailyWorktimeEntry[]>
  employeeData?: Record<string, DeshazoDailyWorktimeEntry[]>
  workOrderLabels: Record<string, string>
  rawOtherTimes?: unknown[]
}

export async function getDeshazoDailyWorktime(params: { date: string; serviceLocationId?: number | null }) {
  const query = new URLSearchParams({ date: params.date })
  if (params.serviceLocationId) query.set('serviceLocationId', String(params.serviceLocationId))
  const response = await deshazoAppFetch(`/reports/daily-worktime?${query.toString()}`, { method: 'GET' })
  if (response.status === 401) throw new Error('Your DeShazo session has expired. Please sign in again.')
  if (!response.ok) throw new Error(`Technician daily report failed (${response.status}).`)
  const body = (await response.json()) as Partial<DeshazoDailyWorktimeResponse>
  return {
    employeeNames: body.employeeNames || {},
    employeesData: body.employeesData || body.employeeData || {},
    workOrderLabels: body.workOrderLabels || {},
    rawOtherTimes: Array.isArray(body.rawOtherTimes) ? body.rawOtherTimes : [],
  } as DeshazoDailyWorktimeResponse
}
