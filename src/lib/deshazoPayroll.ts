import { deshazoAppFetch } from './deshazoAppAuth'

export type DeshazoPayrollBucket = { reg?: number; ot?: number }

export type DeshazoPayrollDay = {
  date: string
  REG?: number
  OT?: number
  DOUBLE?: number
  PTO?: DeshazoPayrollBucket
  SHOP?: DeshazoPayrollBucket
  JURY?: DeshazoPayrollBucket
  BER?: DeshazoPayrollBucket
  TRAINING?: DeshazoPayrollBucket
  LUNCH?: DeshazoPayrollBucket
  IS_CALIFORNIA_PAYROLL?: boolean
}

export type DeshazoWeeklyPayroll = {
  REG?: number
  OT?: number
  DOUBLE?: number
  PTO?: DeshazoPayrollBucket
  SHOP?: DeshazoPayrollBucket
  JURY?: DeshazoPayrollBucket
  BER?: DeshazoPayrollBucket
  TRAINING?: DeshazoPayrollBucket
  LUNCH?: DeshazoPayrollBucket
  REG_APPROVAL?: number
  OT_APPROVAL?: number
  PTO_APPROVAL?: number
  TRAINING_APPROVAL?: number
  SHOP_APPROVAL?: number
  JURY_APPROVAL?: number
  BER_APPROVAL?: number
  DOUBLE_APPROVAL?: number
  LUNCH_APPROVAL?: number
}

export type DeshazoPayrollEmployee = {
  id: number
  firstName?: string | null
  lastName?: string | null
  approvedBy?: string | null
  payRoll?: DeshazoPayrollDay[]
  weeklyPayroll?: DeshazoWeeklyPayroll
}

export async function getDeshazoPayroll(params: { weekStart: string; serviceLocationId?: number | null }) {
  const query = new URLSearchParams({ weekStart: params.weekStart })
  if (params.serviceLocationId) query.set('serviceLocationId', String(params.serviceLocationId))
  const response = await deshazoAppFetch(`/reports/payroll?${query.toString()}`, { method: 'GET' })
  if (response.status === 401) throw new Error('Your DeShazo session has expired. Please sign in again.')
  if (!response.ok) throw new Error(`Payroll report failed (${response.status}).`)
  const body = await response.json()
  return (Array.isArray(body) ? body : []) as DeshazoPayrollEmployee[]
}
