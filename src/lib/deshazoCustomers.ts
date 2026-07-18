import { deshazoAppFetch } from './deshazoAppAuth'

export type DeshazoCustomer = {
  id: number
  customerName?: string | null
  customerNo?: string | null
  locations?: Array<{ id?: number }>
  craneCustomer?: Array<{ id?: number }>
  workOrders?: Array<{ id?: number; serviceLocationId?: number | null }>
}

export type DeshazoCustomersResponse = {
  data: DeshazoCustomer[]
  count: number
  totalPages: number
}

export async function getDeshazoCustomers(params: {
  search?: string
  page?: number
  pageSize?: number
  sortBy?: string | null
  direction?: 'asc' | 'desc' | null
}): Promise<DeshazoCustomersResponse> {
  const query = new URLSearchParams()
  if (params.search?.trim()) query.set('search', params.search.trim())
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))
  if (params.sortBy) query.set('sortBy', params.sortBy)
  if (params.direction) query.set('direction', params.direction)

  const response = await deshazoAppFetch(`/customers?${query.toString()}`, { method: 'GET' })
  if (response.status === 401) throw new Error('Your DeShazo session has expired. Please sign in again.')
  if (!response.ok) throw new Error(`Customers failed (${response.status}).`)

  const body = (await response.json()) as Partial<DeshazoCustomersResponse>
  return {
    data: Array.isArray(body.data) ? body.data : [],
    count: Number(body.count) || 0,
    totalPages: Math.max(1, Number(body.totalPages) || 1),
  }
}
