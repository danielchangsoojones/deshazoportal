// Read-only clients for DeShazo application reports, mirroring the endpoints the
// production app at deshazo.belovedrobot.com calls. Auth is the HttpOnly session
// cookie established by deshazoAppAuth.ts, so every request is same-origin + credentialed
// (see the `/deshazo-api` dev proxy in vite.config.ts).

import { deshazoAppFetch } from './deshazoAppAuth'

export type DeshazoServiceLocation = {
  id: number
  name: string
  regionId?: number
}

// One employee/day record. Hours are keyed by job number; `jobNumber` lists the jobs
// the employee booked time against that day.
export type JobCostReportRow = {
  date: string
  employeeId: string | null
  employeeName: string
  jobNumber: string[]
  jobIds?: Record<string, number>
  departments?: Record<string, string>
  serviceLocationEmployee?: Array<{
    serviceLocationId?: number
    serviceLocation?: { name?: string }
  }>
  regHours: Record<string, number>
  otHours: Record<string, number>
  dtHours: Record<string, number>
  isCaliforniaPayroll: boolean
}

// GET /api/service-locations — the location filter options for the report.
export async function getDeshazoServiceLocations(): Promise<DeshazoServiceLocation[]> {
  const response = await deshazoAppFetch('/service-locations?pageSize=999', { method: 'GET' })
  if (!response.ok) throw new Error(`Service locations failed (${response.status}).`)
  const body = await response.json()
  const data = Array.isArray(body) ? body : body?.data ?? []
  return data as DeshazoServiceLocation[]
}

// GET /api/reports/job-cost?weekStart=YYYY-MM-DD[&serviceLocationId=N]
export async function getJobCostReport(params: {
  weekStart: string
  serviceLocationId?: number | null
}): Promise<JobCostReportRow[]> {
  const search = new URLSearchParams({ weekStart: params.weekStart })
  if (params.serviceLocationId) search.set('serviceLocationId', String(params.serviceLocationId))

  const response = await deshazoAppFetch(`/reports/job-cost?${search.toString()}`, { method: 'GET' })
  if (!response.ok) {
    let message = `Job cost report failed (${response.status}).`
    try {
      const body = await response.json()
      if (Array.isArray(body) && body[0]?.msg) message = body[0].msg
    } catch {
      // keep default message
    }
    throw new Error(message)
  }
  return (await response.json()) as JobCostReportRow[]
}

export type JobCostReportLine = {
  employeeId: string
  employeeName: string
  date: string
  department: string
  jobNumber: string
  regularHours: number
  overtimeHours: number
  doubleHours: number
}

export function hasCaliforniaPayroll(rows: JobCostReportRow[]): boolean {
  return rows.some((row) => row.isCaliforniaPayroll)
}

// Flatten each employee/day record into one line per job number, applying the same
// overtime/double-time rules the production report uses:
//  - Non-California payroll folds double-time into overtime.
//  - Double-time is only reported for California payroll.
export function flattenJobCostRows(rows: JobCostReportRow[]): JobCostReportLine[] {
  const lines: JobCostReportLine[] = []
  for (const row of rows) {
    const department = row.serviceLocationEmployee?.[0]?.serviceLocation?.name ?? ''
    for (const job of row.jobNumber) {
      const reg = row.regHours[job] ?? 0
      const ot = row.otHours[job] ?? 0
      const dt = row.dtHours[job] ?? 0
      const overtime = !row.isCaliforniaPayroll && dt > 0 ? ot + dt : ot
      lines.push({
        employeeId: row.employeeId || '-',
        employeeName: row.employeeName,
        date: row.date,
        department,
        jobNumber: job,
        regularHours: reg,
        overtimeHours: overtime,
        doubleHours: row.isCaliforniaPayroll ? dt : 0,
      })
    }
  }
  return lines
}
