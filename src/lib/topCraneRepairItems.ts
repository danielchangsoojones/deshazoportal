import { supabase } from './supabase'

export type TopCraneRepairItem = {
  rank: number
  craneId: string
  craneDescription: string
  craneLocation: string
  customer: string
  customerLocation: string
  latestReportDate: string
  latestWorkOrderId: number | null
  repairItemCount: number
  workOrderCount: number
}

type TopCraneRepairItemRow = {
  rank: number | null
  crane_id: string | null
  crane_description: string | null
  crane_location: string | null
  customer: string | null
  customer_location: string | null
  latest_report_date: string | null
  latest_work_order_id: number | string | null
  repair_item_count: number | null
  work_order_count: number | null
}

function normalizeWorkOrderId(value: number | string | null) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeRow(row: TopCraneRepairItemRow): TopCraneRepairItem {
  return {
    rank: row.rank ?? 0,
    craneId: row.crane_id ?? 'Unassigned',
    craneDescription: row.crane_description ?? '',
    craneLocation: row.crane_location ?? '',
    customer: row.customer ?? '',
    customerLocation: row.customer_location ?? '',
    latestReportDate: row.latest_report_date ?? '',
    latestWorkOrderId: normalizeWorkOrderId(row.latest_work_order_id),
    repairItemCount: row.repair_item_count ?? 0,
    workOrderCount: row.work_order_count ?? 0,
  }
}

export async function getTopCraneRepairItems(days = 30, limit = 10, customer?: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase.rpc('get_top_crane_repair_items', {
    p_customer: customer?.trim() || null,
    p_days: days,
    p_limit: limit,
  })

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as TopCraneRepairItemRow[]).map(normalizeRow)
}
