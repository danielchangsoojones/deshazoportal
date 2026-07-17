import { deshazoAppFetch } from './deshazoAppAuth'
import type { DeshazoWorkOrder } from './deshazoWorkOrders'

export type DeshazoRecurringWorkOrderAssignment = {
  id: number
  month?: number | null
  quarter?: number | null
  workOrderId?: number | null
  workOrder?: DeshazoWorkOrder | null
}

export type DeshazoRecurringWorkOrder = {
  id: number
  type: 'MONTHLY' | 'QUARTERLY' | string
  customer?: { customerName?: string | null } | null
  customerLocation?: { shipToAddress1?: string | null } | null
  serviceLocation?: { id?: number; name?: string | null } | null
  recurringWorkOrders?: DeshazoRecurringWorkOrderAssignment[]
}

export type DeshazoRecurringWorkOrdersResponse = {
  data: DeshazoRecurringWorkOrder[]
  count: number
  totalPages: number
}

export async function getDeshazoRecurringWorkOrders(params: {
  serviceLocationId?: number | null
  search?: string
  page?: number
  pageSize?: number
}): Promise<DeshazoRecurringWorkOrdersResponse> {
  const query = new URLSearchParams()
  if (params.serviceLocationId) query.set('serviceLocationId', String(params.serviceLocationId))
  if (params.search?.trim()) query.set('search', params.search.trim())
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))

  const response = await deshazoAppFetch(`/recurring-work-orders?${query.toString()}`, { method: 'GET' })
  if (response.status === 401) throw new Error('Your DeShazo session has expired. Please sign in again.')
  if (!response.ok) throw new Error(`Recurring work orders failed (${response.status}).`)

  const body = (await response.json()) as Partial<DeshazoRecurringWorkOrdersResponse>
  return {
    data: Array.isArray(body.data) ? body.data : [],
    count: Number(body.count) || 0,
    totalPages: Math.max(1, Number(body.totalPages) || 1),
  }
}
