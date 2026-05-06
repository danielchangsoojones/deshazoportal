import { supabase } from './supabase'

const BUCKET_NAME = 'repair-reports'
const SIGNED_URL_TTL_SECONDS = 60 * 60

type RepairReportType = 'repair' | 'service_call' | 'quoted_repair' | 'inspection_repair'

type RepairReportRow = {
  id: string
  work_order_number: string
  report_type: RepairReportType
  customer: string
  customer_location: string
  service_location: string
  city_key: string
  comment: string
  date_start: string | null
  date_end: string | null
  display_name: string
  storage_path: string
  uploaded_at: string
  is_active: boolean
}

export type RepairReportRecord = {
  id: string
  workOrderNumber: string
  reportType: RepairReportType
  customer: string
  customerLocation: string
  serviceLocation: string
  cityKey: string
  comment: string
  dateStart: string | null
  dateEnd: string | null
  displayName: string
  storagePath: string
  uploadedAt: string
  signedUrl: string
}

export function normalizeCityKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\d+\s+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const mapRepairReport = async (row: RepairReportRow): Promise<RepairReportRecord> => {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Unable to create signed URL for repair report.')
  }

  return {
    id: row.id,
    workOrderNumber: row.work_order_number,
    reportType: row.report_type,
    customer: row.customer,
    customerLocation: row.customer_location,
    serviceLocation: row.service_location,
    cityKey: row.city_key,
    comment: row.comment,
    dateStart: row.date_start,
    dateEnd: row.date_end,
    displayName: row.display_name,
    storagePath: row.storage_path,
    uploadedAt: row.uploaded_at,
    signedUrl: data.signedUrl,
  }
}

export async function listRepairReportsByCity(city: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const cityKey = normalizeCityKey(city)

  if (!cityKey) {
    return []
  }

  const { data, error } = await supabase
    .from('repair_reports')
    .select(
      'id, work_order_number, report_type, customer, customer_location, service_location, city_key, comment, date_start, date_end, display_name, storage_path, uploaded_at, is_active',
    )
    .eq('city_key', cityKey)
    .eq('is_active', true)
    .order('date_start', { ascending: false, nullsFirst: false })
    .order('uploaded_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return Promise.all((data as RepairReportRow[] | null ?? []).map(mapRepairReport))
}
