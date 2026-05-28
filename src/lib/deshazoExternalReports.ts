import { supabase } from './supabase'

export type DeshazoInspectionPhoto = {
  id?: string
  content?: string
  label?: string
  createdAt?: string
}

export type DeshazoInspectionPoint = {
  id?: number | string
  name?: string
  condition?: string
  order?: number
  notes?: string | null
  value?: string | number | boolean | null
  remarks?: Array<{ content?: string; note?: string; createdAt?: string }>
  photos?: DeshazoInspectionPhoto[]
}

export type DeshazoInspectionSection = {
  id?: number | string
  name?: string
  order?: number
  points?: DeshazoInspectionPoint[]
}

export type DeshazoInspection = {
  id?: number | string
  type?: string
  status?: string
  date?: string
  completedAt?: string
  remarks?: Array<{ content?: string; note?: string; createdAt?: string }>
  photos?: DeshazoInspectionPhoto[]
  sections?: DeshazoInspectionSection[]
}

export type DeshazoHoist = {
  type?: string
  withTrolley?: boolean
  manufacturer?: string
  capacity?: string
  model?: string
  serialNumber?: string
}

export type DeshazoCrane = {
  id?: number | string
  contactCode?: string
  description?: string
  location?: string
  serviceStatus?: string
  structure?: {
    type?: string
    manufacturer?: string
    capacity?: string
    model?: string
    serialNumber?: string
  }
  hoists?: DeshazoHoist[]
}

export type DeshazoCraneReport = {
  workOrderCraneId?: number | string
  crane?: DeshazoCrane
  inspections?: DeshazoInspection[]
  serviceNotes?: Array<{ id?: string; note?: string; author?: string; createdAt?: string }>
  materialBatches?: Array<{ materials?: Array<Record<string, unknown>> }>
  materialsOrdered?: Array<Record<string, unknown>>
  serviceAttachments?: DeshazoInspectionPhoto[]
}

export type DeshazoGeneralWorkItem = {
  date?: string
  tripNumber?: number
  technician?: string
  serviceNotes?: Array<{ id?: string; note?: string; author?: string; createdAt?: string }>
  materialBatches?: Array<{ materials?: Array<Record<string, unknown>> }>
  materialsOrdered?: Array<Record<string, unknown>>
  photos?: DeshazoInspectionPhoto[]
}

export type DeshazoInspectionReportPayload = {
  workOrderId: number | string
  jobNo?: string
  jobNumber?: string
  jobType?: string
  inspectionType?: string
  inspectionDate?: string
  status?: string
  generalWork?: DeshazoGeneralWorkItem[]
  cranes?: DeshazoCraneReport[]
  createdAt?: string
  updatedAt?: string
}

type DeshazoInspectionReportRow = {
  work_order_id: number
  job_no: string | null
  job_type: string | null
  raw_payload: DeshazoInspectionReportPayload
  synced_at: string
}

type DeshazoExternalWorkOrderRow = {
  work_order_id: number
  job_no: string | null
  sales_order_no: string | null
  job_type: string | null
  status_name: string | null
  customer_location_name: string | null
  service_location_name: string | null
  bill_to_name: string | null
  bill_to_city: string | null
  bill_to_state: string | null
  bill_to_zip_code: string | null
  customer_po_no: string | null
  comment: string | null
  start_date: string | null
  end_date: string | null
  completed_at: string | null
  raw_payload: Record<string, unknown> | null
}

export type DeshazoSavedWorkOrderSummary = {
  workOrderId: number
  jobNo: string
  salesOrderNo: string
  jobType: string
  statusName: string
  customerName: string
  customerLocationName: string
  serviceLocationName: string
  customerAddress: string
  customerLocationAddress: string
  customerPoNo: string
  comment: string
  startDate: string
  endDate: string
  completedAt: string
  rawPayload: Record<string, unknown> | null
}

export type DeshazoSavedInspectionReport = {
  workOrderId: number
  jobNo: string
  jobType: string
  syncedAt: string
  rawPayload: DeshazoInspectionReportPayload
  summary: DeshazoSavedWorkOrderSummary | null
}

function normalizeSavedReport(
  row: DeshazoInspectionReportRow,
  summary: DeshazoExternalWorkOrderRow | undefined,
): DeshazoSavedInspectionReport {
  return {
    workOrderId: row.work_order_id,
    jobNo: row.job_no ?? row.raw_payload.jobNo ?? row.raw_payload.jobNumber ?? '',
    jobType: row.job_type ?? row.raw_payload.jobType ?? row.raw_payload.inspectionType ?? '',
    syncedAt: row.synced_at,
    rawPayload: row.raw_payload,
    summary: summary ? normalizeSavedWorkOrderSummary(summary) : null,
  }
}

function normalizeSavedWorkOrderSummary(row: DeshazoExternalWorkOrderRow): DeshazoSavedWorkOrderSummary {
  return {
    workOrderId: row.work_order_id,
    jobNo: row.job_no ?? '',
    salesOrderNo: row.sales_order_no ?? '',
    jobType: row.job_type ?? '',
    statusName: row.status_name ?? '',
    customerName: row.bill_to_name ?? '',
    customerLocationName: row.customer_location_name ?? '',
    serviceLocationName: row.service_location_name ?? '',
    customerAddress: [row.bill_to_city, row.bill_to_state, row.bill_to_zip_code].filter(Boolean).join(' '),
    customerLocationAddress: getCustomerLocationAddress(row.raw_payload),
    customerPoNo: row.customer_po_no ?? '',
    comment: row.comment ?? '',
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? '',
    completedAt: row.completed_at ?? '',
    rawPayload: row.raw_payload ?? null,
  }
}

function getCustomerLocationAddress(rawPayload: Record<string, unknown> | null) {
  if (!rawPayload || typeof rawPayload !== 'object') return ''
  const customerLocation =
    'customerLocation' in rawPayload && rawPayload.customerLocation && typeof rawPayload.customerLocation === 'object'
      ? (rawPayload.customerLocation as Record<string, unknown>)
      : null

  if (!customerLocation) return ''

  return [
    customerLocation.shipToAddress1,
    customerLocation.shipToAddress2,
    customerLocation.shipToAddress3,
    customerLocation.shipToCity,
    customerLocation.shipToState,
    customerLocation.shipToZipCode,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(', ')
    .replace(', ,', ',')
}

export async function getSavedDeshazoInspectionReports(limit = 20) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase
    .from('deshazo_external_inspection_reports')
    .select('work_order_id, job_no, job_type, raw_payload, synced_at')
    .order('synced_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  const reportRows = (data ?? []) as DeshazoInspectionReportRow[]
  const workOrderIds = reportRows.map((row) => row.work_order_id)
  const summariesById = new Map<number, DeshazoExternalWorkOrderRow>()

  if (workOrderIds.length > 0) {
    const { data: summaryData, error: summaryError } = await supabase
      .from('deshazo_external_work_orders')
      .select(
        'work_order_id, job_no, sales_order_no, job_type, status_name, customer_location_name, service_location_name, bill_to_name, bill_to_city, bill_to_state, bill_to_zip_code, customer_po_no, comment, start_date, end_date, completed_at, raw_payload',
      )
      .in('work_order_id', workOrderIds)

    if (summaryError) {
      throw new Error(summaryError.message)
    }

    ;((summaryData ?? []) as DeshazoExternalWorkOrderRow[]).forEach((row) => {
      summariesById.set(row.work_order_id, row)
    })
  }

  return reportRows.map((row) => normalizeSavedReport(row, summariesById.get(row.work_order_id)))
}

export function getInspectionStats(report: DeshazoInspectionReportPayload) {
  const cranes = report.cranes ?? []
  let inspections = 0
  let sections = 0
  let points = 0
  let satisfactoryPoints = 0
  let flaggedPoints = 0
  let naPoints = 0
  let photos = 0

  cranes.forEach((craneReport) => {
    ;(craneReport.inspections ?? []).forEach((inspection) => {
      inspections += 1
      photos += inspection.photos?.length ?? 0
      ;(inspection.sections ?? []).forEach((section) => {
        sections += 1
        ;(section.points ?? []).forEach((point) => {
          points += 1
          photos += point.photos?.length ?? 0
          const condition = point.condition?.toUpperCase() ?? ''
          if (condition === 'SATISFACTORY') {
            satisfactoryPoints += 1
          } else if (condition === 'N/A') {
            naPoints += 1
          } else if (condition) {
            flaggedPoints += 1
          }
        })
      })
    })
  })

  return {
    craneCount: cranes.length,
    inspectionCount: inspections,
    sectionCount: sections,
    pointCount: points,
    satisfactoryPointCount: satisfactoryPoints,
    flaggedPointCount: flaggedPoints,
    naPointCount: naPoints,
    photoCount: photos,
  }
}
