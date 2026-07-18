import { deshazoAppFetch } from './deshazoAppAuth'

export type DeshazoCrane = {
  id: number
  ContactCode?: string | null
  customer?: { customerName?: string | null } | null
  customerLocation?: {
    shipToAddress1?: string | null
    shipToAddress2?: string | null
    shipToAddress3?: string | null
    shipToCity?: string | null
    shipToState?: string | null
    shipToZipCode?: string | null
  } | null
  UDF_EQ_DESCR?: string | null
  UDF_EQ_LOC?: string | null
  craneAttachments?: Array<{ id?: number; contentUrl?: string | null }>
  serviceStatus?: 'IN_SERVICE' | 'OUT_OF_SERVICE' | string | null
  workOrderCranes?: Array<{ id?: number }>
}

export type DeshazoCranesResponse = {
  data: DeshazoCrane[]
  count: number
  totalPages: number
}

export async function getDeshazoCranes(params: {
  search?: string
  page?: number
  pageSize?: number
  sortBy?: string | null
  direction?: 'asc' | 'desc' | null
}): Promise<DeshazoCranesResponse> {
  const query = new URLSearchParams()
  if (params.search?.trim()) query.set('search', params.search.trim())
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))
  if (params.sortBy) query.set('sortBy', params.sortBy)
  if (params.direction) query.set('direction', params.direction)

  const response = await deshazoAppFetch(`/cranes?${query.toString()}`, { method: 'GET' })
  if (response.status === 401) throw new Error('Your DeShazo session has expired. Please sign in again.')
  if (!response.ok) throw new Error(`Cranes failed (${response.status}).`)

  const body = (await response.json()) as Partial<DeshazoCranesResponse>
  return {
    data: Array.isArray(body.data) ? body.data : [],
    count: Number(body.count) || 0,
    totalPages: Math.max(1, Number(body.totalPages) || 1),
  }
}
