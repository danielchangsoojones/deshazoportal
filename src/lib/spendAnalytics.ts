import { getCustomerFilterValue, getStoredCustomer, normalizeCustomer } from './customerRouting'
import { getInvoiceSpendLocationSummaries } from './invoiceSpend'
import { getCustomerLocationLookup, getLocationOptionFromLabel } from './portalLocations'
import { supabase } from './supabase'

export type SpendChartItem = {
  label: string
  spend: number
}

export type WorkSpendKind = 'inspection' | 'repair'

export type MonthlySpend = {
  month: string
  spend: number
}

export type ToplineSpend = {
  total_parts_spend: number
  total_service_spend: number
  total_spend: number
  total_invoices: number
  inspection_spend: number
  inspection_invoice_count: number
  repair_spend: number
  repair_invoice_count: number
  repair_parts_spend: number
  repair_service_spend: number
  repair_freight_spend: number
  repair_labor_spend: number
  topline_start_str: string
}

export type SpendAnalytics = {
  topline: ToplineSpend
  serviceTypeSpend: SpendChartItem[]
  workTypeSpend: SpendChartItem[]
  repairCategorySpend: SpendChartItem[]
  monthlySpend: MonthlySpend[]
  monthlyInspectionSpend: MonthlySpend[]
  monthlyRepairSpend: MonthlySpend[]
  monthlyPartsSpend: MonthlySpend[]
  monthlyServiceSpend: MonthlySpend[]
  averageInvoiceSpend: MonthlySpend[]
  locationSpend: SpendChartItem[]
  branchSpend: SpendChartItem[]
  invoiceSizeSpend: SpendChartItem[]
  locationMappedInvoiceCount: number
}

export type LocationComparisonItem = {
  location: string
  total_jobs: number
  total_invoices: number
  finance_invoice_count: number
  uploaded_invoice_count: number
  average_invoice_cost: number
  total_invoice_cost: number
  total_service_cost: number
  total_parts_cost: number
  inspection_invoice_count: number
  repair_invoice_count: number
  total_inspection_cost: number
  total_repair_cost: number
  repair_parts_cost: number
  repair_service_cost: number
  repair_freight_cost: number
  repair_labor_cost: number
  mapped_invoice_count: number
}

export type LocationSpendInvoiceItem = {
  job_no: string
  work_order_id: number | null
  asset_d_number: string
  has_report: boolean
  location: string
  import_period: string
  work_type: string
  spend_kind: WorkSpendKind
  parts_revenue: number
  service_revenue: number
  total_revenue: number
}

export type SpendAnalyticsDateRange = {
  startMonth?: string
  endMonth?: string
}

export type SpendDashboardAnalytics = {
  spendAnalytics: SpendAnalytics
  locationComparison: LocationComparisonItem[]
}

export type LocationSpendPageAnalytics = {
  locationComparison: LocationComparisonItem[]
  invoices: LocationSpendInvoiceItem[]
}

type FinanceInvoiceRow = {
  import_period: string
  customer: string
  job_no: string
  source_sheet_name: string | null
  work_order_id: number | null
  customer_location_name: string | null
  service_location_name: string | null
  location_label: string | null
  parts_revenue: number | string | null
  service_revenue: number | string | null
  total_revenue: number | string | null
  raw_payload: Record<string, unknown> | null
}

type WorkOrderLocationRow = {
  work_order_id: number
  job_no: string | null
  job_type: string | null
  customer_location_name: string | null
  service_location_name: string | null
  bill_to_city: string | null
  bill_to_state: string | null
  raw_payload: Record<string, unknown> | null
}

type ReportCraneDNumberRow = {
  work_order_id: number | null
  contact_code: string | null
}

type ReportPayloadDNumberRow = {
  work_order_id: number
  raw_payload: Record<string, unknown> | null
}

const financeRowsCache = new Map<string, { loadedAt: number; rows: FinanceInvoiceRow[] }>()
const financeRowsCacheTtlMs = 60_000

const emptySpendAnalytics: SpendAnalytics = {
  topline: {
    total_parts_spend: 0,
    total_service_spend: 0,
    total_spend: 0,
    total_invoices: 0,
    inspection_spend: 0,
    inspection_invoice_count: 0,
    repair_spend: 0,
    repair_invoice_count: 0,
    repair_parts_spend: 0,
    repair_service_spend: 0,
    repair_freight_spend: 0,
    repair_labor_spend: 0,
    topline_start_str: 'No finance data imported',
  },
  serviceTypeSpend: [
    { label: 'Parts', spend: 0 },
    { label: 'Service', spend: 0 },
  ],
  workTypeSpend: [
    { label: 'Repairs', spend: 0 },
    { label: 'Inspections', spend: 0 },
  ],
  repairCategorySpend: [
    { label: 'Parts', spend: 0 },
    { label: 'Service', spend: 0 },
    { label: 'Freight', spend: 0 },
    { label: 'Labor', spend: 0 },
  ],
  monthlySpend: [],
  monthlyInspectionSpend: [],
  monthlyRepairSpend: [],
  monthlyPartsSpend: [],
  monthlyServiceSpend: [],
  averageInvoiceSpend: [],
  locationSpend: [],
  branchSpend: [],
  invoiceSizeSpend: [],
  locationMappedInvoiceCount: 0,
}

function resolveSelectedCustomer(customer?: string) {
  return getCustomerFilterValue(normalizeCustomer(customer) || getStoredCustomer())
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  return supabase
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]+/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function monthKey(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function normalizeMonthInput(value?: string) {
  const trimmed = (value ?? '').trim()
  return /^\d{4}-\d{2}$/.test(trimmed) ? trimmed : ''
}

function filterFinanceRowsByDateRange(rows: FinanceInvoiceRow[], dateRange?: SpendAnalyticsDateRange) {
  const startMonth = normalizeMonthInput(dateRange?.startMonth)
  const endMonth = normalizeMonthInput(dateRange?.endMonth)
  const normalizedStart = startMonth && endMonth && startMonth > endMonth ? endMonth : startMonth
  const normalizedEnd = startMonth && endMonth && startMonth > endMonth ? startMonth : endMonth

  if (!normalizedStart && !normalizedEnd) return rows

  return rows.filter((row) => {
    const rowMonth = monthKey(row.import_period)
    if (normalizedStart && rowMonth < normalizedStart) return false
    if (normalizedEnd && rowMonth > normalizedEnd) return false
    return true
  })
}

function monthLabel(value: string) {
  const date = new Date(`${value}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(date)
}

function rangeLabel(months: string[]) {
  if (months.length === 0) return 'No finance data imported'
  const first = monthLabel(months[0])
  const last = monthLabel(months[months.length - 1])
  return first === last ? first : `${first} - ${last}`
}

function normalizeLocationFromRawPayload(rawPayload: Record<string, unknown> | null) {
  const customerLocation =
    rawPayload?.customerLocation && typeof rawPayload.customerLocation === 'object'
      ? rawPayload.customerLocation as Record<string, unknown>
      : null
  const city = typeof customerLocation?.shipToCity === 'string' ? customerLocation.shipToCity.trim() : ''
  const state = typeof customerLocation?.shipToState === 'string' ? customerLocation.shipToState.trim() : ''
  return [city, state].filter(Boolean).join(', ')
}

function getWorkOrderLocation(row?: WorkOrderLocationRow) {
  if (!row) return ''
  return (
    normalizeLocationFromRawPayload(row.raw_payload) ||
    [row.bill_to_city, row.bill_to_state].filter(Boolean).join(', ') ||
    row.customer_location_name ||
    row.service_location_name ||
    ''
  ).trim()
}

function normalizeLocationComparable(value?: string | null) {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function getFinanceWorkbookCustomer(row: FinanceInvoiceRow) {
  return typeof row.raw_payload?.workbookCustomer === 'string' ? row.raw_payload.workbookCustomer.trim() : ''
}

function isFinanceRowForSelectedCustomer(row: FinanceInvoiceRow, selectedCustomer: string) {
  const workbookCustomer = getFinanceWorkbookCustomer(row)
  if (!workbookCustomer) return true

  return normalizeLocationComparable(workbookCustomer) === normalizeLocationComparable(selectedCustomer)
}

function getFinanceWorkbookLocation(row: FinanceInvoiceRow) {
  const workbookCustomer = getFinanceWorkbookCustomer(row)
  if (!workbookCustomer) return ''

  return normalizeLocationComparable(workbookCustomer) === normalizeLocationComparable(row.customer)
    ? ''
    : workbookCustomer
}

function getFinanceWorkOrderType(row: FinanceInvoiceRow, workOrder?: WorkOrderLocationRow) {
  const rawType = row.raw_payload?.workOrderJobType
  return (typeof rawType === 'string' ? rawType : workOrder?.job_type ?? '').trim()
}

export function getWorkSpendKind(jobType: string): WorkSpendKind {
  const normalizedType = jobType.trim().toLowerCase()
  const isRepairType =
    normalizedType.includes('repair') ||
    normalizedType.includes('service call') ||
    normalizedType.includes('retail parts') ||
    normalizedType.includes('installation') ||
    normalizedType.includes('modification') ||
    normalizedType.includes('emergency') ||
    normalizedType.includes('labor') ||
    normalizedType.includes('freight')

  if (isRepairType) return 'repair'
  return normalizedType.includes('inspection') ? 'inspection' : 'repair'
}

export function getWorkSpendKindLabel(kind: WorkSpendKind) {
  return kind === 'inspection' ? 'Inspection' : 'Repair'
}

async function fetchAllFinanceRows(customer: string) {
  const cachedRows = financeRowsCache.get(customer)
  if (cachedRows && Date.now() - cachedRows.loadedAt < financeRowsCacheTtlMs) {
    return cachedRows.rows
  }

  const client = requireSupabase()
  const rows: FinanceInvoiceRow[] = []
  const pageSize = 1000

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from('deshazo_jpa_finance_invoices')
      .select(
        'import_period, customer, job_no, source_sheet_name, work_order_id, customer_location_name, service_location_name, location_label, parts_revenue, service_revenue, total_revenue, raw_payload',
      )
      .eq('customer', customer)
      .order('import_period', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) {
      const missingTable = /schema cache|Could not find|does not exist|PGRST205/i.test(error.message)
      if (missingTable) return []
      throw new Error(error.message)
    }

    const pageRows = (data ?? []) as FinanceInvoiceRow[]
    rows.push(...pageRows)
    if (pageRows.length < pageSize) break
  }

  financeRowsCache.set(customer, { loadedAt: Date.now(), rows })
  return rows
}

export function clearSpendAnalyticsCache(customer?: string) {
  if (customer) {
    financeRowsCache.delete(resolveSelectedCustomer(customer))
    return
  }

  financeRowsCache.clear()
}

async function loadWorkOrderLocations(customer: string, financeRows: FinanceInvoiceRow[]) {
  const client = requireSupabase()
  const workOrderIds = Array.from(new Set(
    financeRows.map((row) => row.work_order_id).filter((value): value is number => typeof value === 'number'),
  ))
  const jobNos = Array.from(new Set(
    financeRows.filter((row) => typeof row.work_order_id !== 'number').map((row) => row.job_no.trim()).filter(Boolean),
  ))
  const rows: WorkOrderLocationRow[] = []

  if (workOrderIds.length > 0) {
    const { data, error } = await client
      .from('deshazo_external_work_orders')
      .select('work_order_id, job_no, job_type, customer_location_name, service_location_name, bill_to_city, bill_to_state, raw_payload')
      .eq('customer', customer)
      .in('work_order_id', workOrderIds)

    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as WorkOrderLocationRow[]))
  }

  for (let index = 0; index < jobNos.length; index += 200) {
    const chunk = jobNos.slice(index, index + 200)
    const { data, error } = await client
      .from('deshazo_external_work_orders')
      .select('work_order_id, job_no, job_type, customer_location_name, service_location_name, bill_to_city, bill_to_state, raw_payload')
      .eq('customer', customer)
      .in('job_no', chunk)

    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as WorkOrderLocationRow[]))
  }

  return rows
}

function buildSpendAnalytics(
  financeRows: FinanceInvoiceRow[],
  workOrderRows: WorkOrderLocationRow[],
  locationLookup: Awaited<ReturnType<typeof getCustomerLocationLookup>>,
): SpendAnalytics {
  if (financeRows.length === 0) return emptySpendAnalytics

  const workOrderById = new Map(workOrderRows.map((row) => [String(row.work_order_id), row]))
  const workOrderByJobNo = new Map(workOrderRows.filter((row) => row.job_no).map((row) => [row.job_no ?? '', row]))
  const monthTotals = new Map<string, { total: number; inspection: number; repair: number; parts: number; service: number; count: number }>()
  const locationTotals = new Map<string, number>()
  const branchTotals = new Map<string, number>()
  const invoiceSizeTotals = new Map<string, number>()

  let partsTotal = 0
  let serviceTotal = 0
  let totalSpend = 0
  let inspectionSpend = 0
  let inspectionInvoiceCount = 0
  let repairSpend = 0
  let repairInvoiceCount = 0
  let repairPartsSpend = 0
  let repairServiceSpend = 0
  let locationMappedInvoiceCount = 0

  financeRows.forEach((row) => {
    const partsSpend = toNumber(row.parts_revenue)
    const serviceSpend = toNumber(row.service_revenue)
    const invoiceTotal = toNumber(row.total_revenue) || partsSpend + serviceSpend
    const workOrder = row.work_order_id ? workOrderById.get(String(row.work_order_id)) : workOrderByJobNo.get(row.job_no)
    const spendKind = getWorkSpendKind(getFinanceWorkOrderType(row, workOrder))
    const key = monthKey(row.import_period)
    const month = monthTotals.get(key) ?? { total: 0, inspection: 0, repair: 0, parts: 0, service: 0, count: 0 }
    month.total += invoiceTotal
    month.parts += partsSpend
    month.service += serviceSpend
    month[spendKind] += invoiceTotal
    month.count += 1
    monthTotals.set(key, month)

    partsTotal += partsSpend
    serviceTotal += serviceSpend
    totalSpend += invoiceTotal
    if (spendKind === 'inspection') {
      inspectionSpend += invoiceTotal
      inspectionInvoiceCount += 1
    } else {
      repairSpend += invoiceTotal
      repairInvoiceCount += 1
      repairPartsSpend += partsSpend
      repairServiceSpend += serviceSpend
    }
    const branchLabel = row.source_sheet_name?.trim() || 'Unknown branch'
    branchTotals.set(branchLabel, (branchTotals.get(branchLabel) ?? 0) + invoiceTotal)
    const invoiceSizeLabel =
      invoiceTotal < 1000 ? 'Under $1k' : invoiceTotal < 5000 ? '$1k - $5k' : '$5k+'
    invoiceSizeTotals.set(invoiceSizeLabel, (invoiceSizeTotals.get(invoiceSizeLabel) ?? 0) + invoiceTotal)

    const mappedLocation =
      row.location_label ||
      getWorkOrderLocation(workOrder) ||
      row.customer_location_name ||
      row.service_location_name ||
      getFinanceWorkbookLocation(row)
    if (mappedLocation) {
      locationMappedInvoiceCount += 1
    }
    const rawLocation = mappedLocation || 'Unmapped'
    const location = locationLookup.aliases.get(getLocationOptionFromLabel(rawLocation)?.value ?? '')?.label || rawLocation
    locationTotals.set(location, (locationTotals.get(location) ?? 0) + invoiceTotal)
  })

  const months = Array.from(monthTotals.keys()).sort()
  const monthlySpend = months.map((month) => ({
    month,
    spend: Math.round(monthTotals.get(month)?.total ?? 0),
  }))
  const monthlyInspectionSpend = months.map((month) => ({
    month,
    spend: Math.round(monthTotals.get(month)?.inspection ?? 0),
  }))
  const monthlyRepairSpend = months.map((month) => ({
    month,
    spend: Math.round(monthTotals.get(month)?.repair ?? 0),
  }))
  const monthlyPartsSpend = months.map((month) => ({
    month,
    spend: Math.round(monthTotals.get(month)?.parts ?? 0),
  }))
  const monthlyServiceSpend = months.map((month) => ({
    month,
    spend: Math.round(monthTotals.get(month)?.service ?? 0),
  }))
  const averageInvoiceSpend = months.map((month) => {
    const value = monthTotals.get(month) ?? { total: 0, count: 0 }
    return {
      month,
      spend: value.count > 0 ? Math.round(value.total / value.count) : 0,
    }
  })

  const locationSpend = Array.from(locationTotals.entries())
    .map(([label, spend]) => ({ label, spend: Math.round(spend) }))
    .sort((left, right) => right.spend - left.spend)
  const branchSpend = Array.from(branchTotals.entries())
    .map(([label, spend]) => ({ label, spend: Math.round(spend) }))
    .sort((left, right) => right.spend - left.spend)
  const invoiceSizeSpend = Array.from(invoiceSizeTotals.entries())
    .map(([label, spend]) => ({ label, spend: Math.round(spend) }))
    .sort((left, right) => right.spend - left.spend)

  return {
    topline: {
      total_parts_spend: Math.round(partsTotal),
      total_service_spend: Math.round(serviceTotal),
      total_spend: Math.round(totalSpend),
      total_invoices: financeRows.length,
      inspection_spend: Math.round(inspectionSpend),
      inspection_invoice_count: inspectionInvoiceCount,
      repair_spend: Math.round(repairSpend),
      repair_invoice_count: repairInvoiceCount,
      repair_parts_spend: Math.round(repairPartsSpend),
      repair_service_spend: Math.round(repairServiceSpend),
      repair_freight_spend: 0,
      repair_labor_spend: 0,
      topline_start_str: rangeLabel(months),
    },
    serviceTypeSpend: [
      { label: 'Parts', spend: Math.round(partsTotal) },
      { label: 'Service', spend: Math.round(serviceTotal) },
    ],
    workTypeSpend: [
      { label: 'Repairs', spend: Math.round(repairSpend) },
      { label: 'Inspections', spend: Math.round(inspectionSpend) },
    ],
    repairCategorySpend: [
      { label: 'Parts', spend: Math.round(repairPartsSpend) },
      { label: 'Service', spend: Math.round(repairServiceSpend) },
      { label: 'Freight', spend: 0 },
      { label: 'Labor', spend: 0 },
    ],
    monthlySpend,
    monthlyInspectionSpend,
    monthlyRepairSpend,
    monthlyPartsSpend,
    monthlyServiceSpend,
    averageInvoiceSpend,
    locationSpend,
    branchSpend,
    invoiceSizeSpend,
    locationMappedInvoiceCount,
  }
}

function buildLocationComparisonAnalytics(
  financeRows: FinanceInvoiceRow[],
  workOrderRows: WorkOrderLocationRow[],
  locationLookup: Awaited<ReturnType<typeof getCustomerLocationLookup>>,
  uploadedLocationSummaries: Awaited<ReturnType<typeof getInvoiceSpendLocationSummaries>>,
): LocationComparisonItem[] {
  if (financeRows.length === 0) return []

  const uploadedInvoicesByLocation = new Map(
    uploadedLocationSummaries.map((summary) => [
      locationLookup.aliases.get(getLocationOptionFromLabel(summary.location)?.value ?? '')?.label || summary.location,
      summary.invoiceCount,
    ]),
  )
  const workOrderById = new Map(workOrderRows.map((row) => [String(row.work_order_id), row]))
  const workOrderByJobNo = new Map(workOrderRows.filter((row) => row.job_no).map((row) => [row.job_no ?? '', row]))
  const locations = new Map<string, {
    jobNos: Set<string>
    totalInvoices: number
    totalInvoiceCost: number
    totalServiceCost: number
    totalPartsCost: number
    inspectionInvoiceCount: number
    repairInvoiceCount: number
    totalInspectionCost: number
    totalRepairCost: number
    repairPartsCost: number
    repairServiceCost: number
    repairFreightCost: number
    repairLaborCost: number
    mappedInvoiceCount: number
  }>()

  financeRows.forEach((row) => {
    const partsSpend = toNumber(row.parts_revenue)
    const serviceSpend = toNumber(row.service_revenue)
    const invoiceTotal = toNumber(row.total_revenue) || partsSpend + serviceSpend
    const workOrder = row.work_order_id ? workOrderById.get(String(row.work_order_id)) : workOrderByJobNo.get(row.job_no)
    const spendKind = getWorkSpendKind(getFinanceWorkOrderType(row, workOrder))
    const mappedLocation =
      row.location_label ||
      getWorkOrderLocation(workOrder) ||
      row.customer_location_name ||
      row.service_location_name ||
      getFinanceWorkbookLocation(row)
    const rawLocation = mappedLocation || 'Unmapped'
    const location = locationLookup.aliases.get(getLocationOptionFromLabel(rawLocation)?.value ?? '')?.label || rawLocation
    const group = locations.get(location) ?? {
      jobNos: new Set<string>(),
      totalInvoices: 0,
      totalInvoiceCost: 0,
      totalServiceCost: 0,
      totalPartsCost: 0,
      inspectionInvoiceCount: 0,
      repairInvoiceCount: 0,
      totalInspectionCost: 0,
      totalRepairCost: 0,
      repairPartsCost: 0,
      repairServiceCost: 0,
      repairFreightCost: 0,
      repairLaborCost: 0,
      mappedInvoiceCount: 0,
    }

    group.jobNos.add(row.job_no)
    group.totalInvoices += 1
    group.totalInvoiceCost += invoiceTotal
    group.totalServiceCost += serviceSpend
    group.totalPartsCost += partsSpend
    if (spendKind === 'inspection') {
      group.inspectionInvoiceCount += 1
      group.totalInspectionCost += invoiceTotal
    } else {
      group.repairInvoiceCount += 1
      group.totalRepairCost += invoiceTotal
      group.repairPartsCost += partsSpend
      group.repairServiceCost += serviceSpend
    }
    if (mappedLocation) group.mappedInvoiceCount += 1
    locations.set(location, group)
  })

  return Array.from(locations.entries())
    .map(([location, group]) => ({
      location,
      total_jobs: group.jobNos.size,
      total_invoices: uploadedInvoicesByLocation.get(location) ?? 0,
      finance_invoice_count: group.totalInvoices,
      uploaded_invoice_count: uploadedInvoicesByLocation.get(location) ?? 0,
      average_invoice_cost: group.totalInvoices > 0 ? Math.round(group.totalInvoiceCost / group.totalInvoices) : 0,
      total_invoice_cost: Math.round(group.totalInvoiceCost),
      total_service_cost: Math.round(group.totalServiceCost),
      total_parts_cost: Math.round(group.totalPartsCost),
      inspection_invoice_count: group.inspectionInvoiceCount,
      repair_invoice_count: group.repairInvoiceCount,
      total_inspection_cost: Math.round(group.totalInspectionCost),
      total_repair_cost: Math.round(group.totalRepairCost),
      repair_parts_cost: Math.round(group.repairPartsCost),
      repair_service_cost: Math.round(group.repairServiceCost),
      repair_freight_cost: Math.round(group.repairFreightCost),
      repair_labor_cost: Math.round(group.repairLaborCost),
      mapped_invoice_count: group.mappedInvoiceCount,
    }))
    .sort((left, right) => right.total_invoice_cost - left.total_invoice_cost)
}

function extractDNumberFromUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value.match(/\bD\d+\b/i)?.[0]?.toUpperCase() ?? ''
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = extractDNumberFromUnknown(item)
      if (match) return match
    }
    return ''
  }

  if (value && typeof value === 'object') {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      const match = extractDNumberFromUnknown(nestedValue)
      if (match) return match
    }
  }

  return ''
}

async function loadWorkOrderDNumbers(customer: string, workOrderIds: number[]) {
  if (!supabase || workOrderIds.length === 0) return new Map<number, string>()

  const selectedCustomer = resolveSelectedCustomer(customer)
  const dNumbers = new Map<number, string>()

  const { data: craneRows } = await supabase
    .from('deshazo_external_report_cranes')
    .select('work_order_id, contact_code')
    .in('work_order_id', workOrderIds)

  ;((craneRows ?? []) as ReportCraneDNumberRow[]).forEach((row) => {
    const workOrderId = row.work_order_id
    const dNumber = extractDNumberFromUnknown(row.contact_code)
    if (typeof workOrderId === 'number' && dNumber && !dNumbers.has(workOrderId)) {
      dNumbers.set(workOrderId, dNumber)
    }
  })

  const missingWorkOrderIds = workOrderIds.filter((workOrderId) => !dNumbers.has(workOrderId))
  if (missingWorkOrderIds.length === 0) return dNumbers

  const { data: reportRows } = await supabase
    .from('deshazo_external_inspection_reports')
    .select('work_order_id, raw_payload')
    .eq('customer', selectedCustomer)
    .in('work_order_id', missingWorkOrderIds)

  ;((reportRows ?? []) as ReportPayloadDNumberRow[]).forEach((row) => {
    const dNumber = extractDNumberFromUnknown(row.raw_payload)
    if (dNumber && !dNumbers.has(row.work_order_id)) {
      dNumbers.set(row.work_order_id, dNumber)
    }
  })

  return dNumbers
}

async function loadWorkOrderReportIds(customer: string, workOrderIds: number[]) {
  if (!supabase || workOrderIds.length === 0) return new Set<number>()

  const selectedCustomer = resolveSelectedCustomer(customer)
  const { data } = await supabase
    .from('deshazo_external_inspection_reports')
    .select('work_order_id')
    .eq('customer', selectedCustomer)
    .in('work_order_id', workOrderIds)

  return new Set(((data ?? []) as Array<{ work_order_id: number }>).map((row) => row.work_order_id))
}

function buildLocationSpendInvoices(
  location: string,
  financeRows: FinanceInvoiceRow[],
  workOrderRows: WorkOrderLocationRow[],
  locationLookup: Awaited<ReturnType<typeof getCustomerLocationLookup>>,
  workOrderDNumbers = new Map<number, string>(),
): LocationSpendInvoiceItem[] {
  const selectedLocation = normalizeLocationComparable(location)
  const workOrderById = new Map(workOrderRows.map((row) => [String(row.work_order_id), row]))
  const workOrderByJobNo = new Map(workOrderRows.filter((row) => row.job_no).map((row) => [row.job_no ?? '', row]))

  return financeRows
    .map((row) => {
      const partsSpend = toNumber(row.parts_revenue)
      const serviceSpend = toNumber(row.service_revenue)
      const invoiceTotal = toNumber(row.total_revenue) || partsSpend + serviceSpend
      const workOrder = row.work_order_id ? workOrderById.get(String(row.work_order_id)) : workOrderByJobNo.get(row.job_no)
      const workType = getFinanceWorkOrderType(row, workOrder)
      const mappedLocation =
        row.location_label ||
        getWorkOrderLocation(workOrder) ||
        row.customer_location_name ||
        row.service_location_name ||
        getFinanceWorkbookLocation(row)
      const rawLocation = mappedLocation || 'Unmapped'
      const resolvedLocation = locationLookup.aliases.get(getLocationOptionFromLabel(rawLocation)?.value ?? '')?.label || rawLocation

      return {
        job_no: row.job_no,
        work_order_id: row.work_order_id,
        asset_d_number: row.work_order_id ? workOrderDNumbers.get(row.work_order_id) ?? '' : '',
        has_report: false,
        location: resolvedLocation,
        import_period: row.import_period,
        work_type: workType || 'Unclassified',
        spend_kind: getWorkSpendKind(workType),
        parts_revenue: Math.round(partsSpend),
        service_revenue: Math.round(serviceSpend),
        total_revenue: Math.round(invoiceTotal),
      }
    })
    .filter((row) => location === 'all' || normalizeLocationComparable(row.location) === selectedLocation)
    .sort((left, right) =>
      left.spend_kind.localeCompare(right.spend_kind) ||
      right.total_revenue - left.total_revenue ||
      right.import_period.localeCompare(left.import_period),
    )
}

async function loadSpendAnalyticsContext(customer?: string, dateRange?: SpendAnalyticsDateRange) {
  const selectedCustomer = resolveSelectedCustomer(customer)
  const financeRows = filterFinanceRowsByDateRange(
    (await fetchAllFinanceRows(selectedCustomer)).filter((row) => isFinanceRowForSelectedCustomer(row, selectedCustomer)),
    dateRange,
  )

  if (financeRows.length === 0) {
    return {
      selectedCustomer,
      financeRows,
      workOrderRows: [] as WorkOrderLocationRow[],
      locationLookup: await getCustomerLocationLookup(selectedCustomer),
    }
  }

  const [workOrderRows, locationLookup] = await Promise.all([
    loadWorkOrderLocations(selectedCustomer, financeRows),
    getCustomerLocationLookup(selectedCustomer),
  ])

  return { selectedCustomer, financeRows, workOrderRows, locationLookup }
}

export async function getSpendAnalytics(customer?: string, dateRange?: SpendAnalyticsDateRange): Promise<SpendAnalytics> {
  const { financeRows, workOrderRows, locationLookup } = await loadSpendAnalyticsContext(customer, dateRange)
  return buildSpendAnalytics(financeRows, workOrderRows, locationLookup)
}

export async function getLocationComparisonAnalytics(customer?: string, dateRange?: SpendAnalyticsDateRange): Promise<LocationComparisonItem[]> {
  const { selectedCustomer, financeRows, workOrderRows, locationLookup } = await loadSpendAnalyticsContext(customer, dateRange)
  const uploadedLocationSummaries = await getInvoiceSpendLocationSummaries(selectedCustomer)
  return buildLocationComparisonAnalytics(financeRows, workOrderRows, locationLookup, uploadedLocationSummaries)
}

export async function getLocationSpendInvoices(
  location: string,
  customer?: string,
  dateRange?: SpendAnalyticsDateRange,
): Promise<LocationSpendInvoiceItem[]> {
  const { selectedCustomer, financeRows, workOrderRows, locationLookup } = await loadSpendAnalyticsContext(customer, dateRange)
  const invoices = buildLocationSpendInvoices(location, financeRows, workOrderRows, locationLookup)
  const workOrderIds = Array.from(new Set(
    invoices
      .filter((invoice) => invoice.spend_kind === 'repair')
      .map((invoice) => invoice.work_order_id)
      .filter((value): value is number => typeof value === 'number'),
  ))
  const workOrderDNumbers = await loadWorkOrderDNumbers(selectedCustomer, workOrderIds)
  const reportWorkOrderIds = await loadWorkOrderReportIds(selectedCustomer, workOrderIds)
  return invoices.map((invoice) => ({
    ...invoice,
    asset_d_number: invoice.work_order_id ? workOrderDNumbers.get(invoice.work_order_id) ?? '' : '',
    has_report: invoice.work_order_id ? reportWorkOrderIds.has(invoice.work_order_id) : false,
  }))
}

export async function getLocationSpendPageAnalytics(
  location: string,
  customer?: string,
  dateRange?: SpendAnalyticsDateRange,
): Promise<LocationSpendPageAnalytics> {
  const { selectedCustomer, financeRows, workOrderRows, locationLookup } = await loadSpendAnalyticsContext(customer, dateRange)
  const uploadedLocationSummaries = await getInvoiceSpendLocationSummaries(selectedCustomer)
  const invoices = buildLocationSpendInvoices(location, financeRows, workOrderRows, locationLookup)
  const workOrderIds = Array.from(new Set(
    invoices
      .filter((invoice) => invoice.spend_kind === 'repair')
      .map((invoice) => invoice.work_order_id)
      .filter((value): value is number => typeof value === 'number'),
  ))
  const workOrderDNumbers = await loadWorkOrderDNumbers(selectedCustomer, workOrderIds)
  const reportWorkOrderIds = await loadWorkOrderReportIds(selectedCustomer, workOrderIds)

  return {
    locationComparison: buildLocationComparisonAnalytics(financeRows, workOrderRows, locationLookup, uploadedLocationSummaries),
    invoices: invoices.map((invoice) => ({
      ...invoice,
      asset_d_number: invoice.work_order_id ? workOrderDNumbers.get(invoice.work_order_id) ?? '' : '',
      has_report: invoice.work_order_id ? reportWorkOrderIds.has(invoice.work_order_id) : false,
    })),
  }
}

export async function getSpendDashboardAnalytics(
  customer?: string,
  dateRange?: SpendAnalyticsDateRange,
): Promise<SpendDashboardAnalytics> {
  const { selectedCustomer, financeRows, workOrderRows, locationLookup } = await loadSpendAnalyticsContext(customer, dateRange)
  const uploadedLocationSummaries = await getInvoiceSpendLocationSummaries(selectedCustomer)

  return {
    spendAnalytics: buildSpendAnalytics(financeRows, workOrderRows, locationLookup),
    locationComparison: buildLocationComparisonAnalytics(financeRows, workOrderRows, locationLookup, uploadedLocationSummaries),
  }
}
