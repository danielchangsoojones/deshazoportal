import { deshazoAppFetch } from './deshazoAppAuth'

export type DeshazoScheduleResource = {
  id: string | number
  title?: string
  group?: string
  backgroundColor?: string
  color?: string
  serviceLocationName?: string
  order?: number
}

export type DeshazoScheduleTooltipData = {
  isDayOff?: boolean
  employeeName?: string
  reason?: string
  startDate?: string
  endDate?: string
  customerName?: string
  location?: string
  workOrderTrip?: {
    id?: number
    tripNumber?: number
    startDate?: string
    endDate?: string
    workOrderId?: number
    workOrder?: {
      id?: number
      jobNo?: string
      jobType?: string
      svcCommentText?: string
      comment?: string
      status?: { name?: string }
    }
  }
}

export type DeshazoScheduleEvent = {
  id: string | number
  resourceId?: string | number
  resourceIds?: Array<string | number>
  title?: string
  start?: string
  end?: string
  backgroundColor?: string
  borderColor?: string
  textColor?: string
  color?: string
  extendedProps?: { tooltipData?: DeshazoScheduleTooltipData }
  tooltipData?: DeshazoScheduleTooltipData
}

export type DeshazoScheduleResponse = {
  resources: DeshazoScheduleResource[]
  events: DeshazoScheduleEvent[]
}

export type DeshazoScheduleParams = {
  startDate: string
  endDate: string
  serviceLocationId?: number | null
  jobType?: string | null
  statusId?: number | null
}

export async function getDeshazoSchedule(params: DeshazoScheduleParams): Promise<DeshazoScheduleResponse> {
  const search = new URLSearchParams({ startDate: params.startDate, endDate: params.endDate })
  if (params.serviceLocationId) search.set('serviceLocationId', String(params.serviceLocationId))
  if (params.jobType) search.set('jobType', params.jobType)
  if (params.statusId) search.set('statusId', String(params.statusId))

  const response = await deshazoAppFetch(`/schedules?${search.toString()}`, { method: 'GET' })
  if (!response.ok) {
    if (response.status === 401) throw new Error('Your DeShazo session has expired. Please sign in again.')
    throw new Error(`Schedule request failed (${response.status}).`)
  }

  const body = (await response.json()) as Partial<DeshazoScheduleResponse>
  return {
    resources: Array.isArray(body.resources) ? body.resources : [],
    events: Array.isArray(body.events) ? body.events : [],
  }
}
