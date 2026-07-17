import { deshazoAppFetch } from './deshazoAppAuth'

export type DeshazoWorkOrderEmployee = {
  id?: number
  isLead?: boolean
  disabledAt?: string | null
  employee?: {
    id?: number
    firstName?: string
    lastName?: string
    preferredName?: string
    isActive?: boolean
  }
}

export type DeshazoWorkOrderTrip = {
  id?: number
  tripNumber?: number
  startDate?: string | null
  endDate?: string | null
  workOrderEmployees?: DeshazoWorkOrderEmployee[]
}

export type DeshazoWorkOrder = {
  id: number
  jobNo?: string | null
  jobType?: string | null
  customerWorkOrder?: { customerName?: string | null } | null
  customerLocation?: {
    shipToAddress1?: string | null
    shipToAddress2?: string | null
    shipToAddress3?: string | null
    shipToCity?: string | null
    shipToState?: string | null
    shipToZipCode?: string | null
  } | null
  svcCommentText?: string | null
  comment?: string | null
  serviceLocation?: { id?: number; name?: string | null } | null
  startDate?: string | null
  endDate?: string | null
  workOrderTrips?: DeshazoWorkOrderTrip[]
  customerPONo?: string | null
  quotedJob?: boolean
  createdAt?: string | null
  status?: { id?: number; name?: string | null } | null
  statusLog?: Array<{
    status?: { id?: number; name?: string | null } | null
    createdAt?: string | null
    isManualUpdate?: string | null
    author?: { firstName?: string; lastName?: string } | null
    updateAuthor?: { firstName?: string; lastName?: string } | null
  }>
  workOrderCranes?: Array<{
    id?: number
    crane?: {
      id?: number
      ContactCode?: string | null
      contactCode?: string | null
      description?: string | null
    } | null
  }>
  customerContacts?: Array<{
    id?: number
    name?: string | null
    email?: string | null
    phone?: string | null
  }>
}

export type DeshazoWorkOrdersResponse = {
  data: DeshazoWorkOrder[]
  count: number
  totalPages: number
}

export type DeshazoWorkOrderKpis = {
  pending?: number
  scheduled?: number
  waitingOnParts?: number
  inProgress?: number
}

export type DeshazoWorkOrderStatus = {
  id: number
  name: string
}

export type DeshazoWorkOrderListParams = {
  search?: string
  page?: number
  pageSize?: number
  sortBy?: string | null
  direction?: 'asc' | 'desc' | null
  statusId?: number | null
  recent?: boolean
  serviceLocationId?: number | null
}

function buildProductionQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    // The production frontend omits all falsy values, including its zero-based first page.
    if (value) search.set(key, String(value))
  })
  return search.toString()
}

async function getOnlyJson<T>(path: string): Promise<T> {
  const response = await deshazoAppFetch(path, { method: 'GET' })
  if (!response.ok) {
    if (response.status === 401) throw new Error('Your DeShazo session has expired. Please sign in again.')
    throw new Error(`DeShazo read request failed (${response.status}).`)
  }
  return (await response.json()) as T
}

export async function getDeshazoWorkOrders(
  params: DeshazoWorkOrderListParams,
): Promise<DeshazoWorkOrdersResponse> {
  const query = buildProductionQuery({
    search: params.search?.trim(),
    page: params.page,
    pageSize: params.pageSize,
    sortBy: params.sortBy,
    direction: params.direction,
    statusId: params.statusId,
    recent: params.recent,
    serviceLocationId: params.serviceLocationId,
  })
  const body = await getOnlyJson<Partial<DeshazoWorkOrdersResponse>>(`/work-orders${query ? `?${query}` : ''}`)
  return {
    data: Array.isArray(body.data) ? body.data : [],
    count: Number(body.count) || 0,
    totalPages: Math.max(1, Number(body.totalPages) || 1),
  }
}

export async function getDeshazoWorkOrderKpis(serviceLocationId?: number | null) {
  const query = buildProductionQuery({ serviceLocationId })
  return getOnlyJson<DeshazoWorkOrderKpis>(`/work-orders/count${query ? `?${query}` : ''}`)
}

export async function getDeshazoWorkOrderStatuses() {
  const body = await getOnlyJson<DeshazoWorkOrderStatus[] | { data?: DeshazoWorkOrderStatus[] }>(
    '/work-order-status',
  )
  return Array.isArray(body) ? body : Array.isArray(body.data) ? body.data : []
}

export async function getDeshazoWorkOrderById(id: number): Promise<DeshazoWorkOrder> {
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid work order ID.')
  return getOnlyJson<DeshazoWorkOrder>(`/work-orders/${id}?id=${id}`)
}
