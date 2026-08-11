import { getCustomerFilterValue, getStoredCustomer, normalizeCustomer } from './customerRouting'
import { supabase } from './supabase'

const defaultInvoiceSpendUploadUrl =
  'https://blockstamp-production-2b9f8bfc27a8.herokuapp.com/extend/deshazo-wabash-spend-invoice/pdf'
const invoiceSpendUploadUrl =
  (import.meta.env.VITE_EXTEND_WABASH_SPEND_INVOICE_PDF_UPLOAD_URL as string | undefined)?.trim() ||
  defaultInvoiceSpendUploadUrl
const invoiceSpendSyncUrl =
  (import.meta.env.VITE_EXTEND_WABASH_SPEND_INVOICE_SYNC_URL as string | undefined)?.trim() ||
  defaultInvoiceSpendUploadUrl.replace(/\/pdf$/, '/sync')

export type InvoiceSpendAllocation = {
  id: string
  invoiceId: string
  customer: string
  invoiceNumber: string
  invoiceDate: string
  jobNumber: string
  workOrderId: number | null
  craneRowId: string | null
  dNumber: string
  craneDescription: string
  craneLocation: string
  locationLabel: string
  allocationMethod: string
  allocationCount: number
  invoiceTotal: number
  allocatedAmount: number
  sourceDocumentId: string | null
  sourceDocumentBucket: string
  sourceDocumentFilePath: string
  sourceDocumentName: string
}

export type InvoiceSpendLocationSummary = {
  location: string
  totalSpend: number
  invoiceCount: number
  craneCount: number
  latestInvoiceDate: string
}

export type InvoiceSpendCraneSummary = {
  dNumber: string
  craneDescription: string
  craneLocation: string
  locationLabel: string
  totalSpend: number
  invoiceCount: number
  latestInvoiceDate: string
  allocations: InvoiceSpendAllocation[]
}

export type InvoiceSpendMonthlyPoint = {
  month: string
  spend: number
}

export type CraneInvoiceSpendAnalytics = {
  dNumber: string
  totalSpend: number
  associatedInvoiceSpend: number
  invoiceCount: number
  averageInvoiceSpend: number
  latestInvoiceDate: string
  monthlySpend: InvoiceSpendMonthlyPoint[]
  recentInvoices: InvoiceSpendAllocation[]
}

export type InvoiceSpendUploadResult = {
  invoiceId: string
  uploadedFileId: string
  uploadedFileName: string
  workflowRunId: string
  status: string
  dashboardUrl: string | null
}

export type InvoiceSpendInvoiceRun = {
  id: string
  customer: string
  originalFileName: string
  status: string
  allocationStatus: string
  invoiceNumber: string
  jobNumber: string
  invoiceTotal: number
  extendWorkflowRunId: string
  createdAt: string
  updatedAt: string
}

export type InvoiceSpendSyncResult = {
  invoiceId: string
  processed: boolean
  message?: string
  error?: string
}

type InvoiceSpendInvoiceRow = {
  id: string
  customer: string
  original_file_name: string | null
  status: string | null
  allocation_status: string | null
  invoice_number: string | null
  job_number: string | null
  invoice_total: number | string | null
  extend_workflow_run_id: string | null
  created_at: string
  updated_at: string
}

type InvoiceSpendAllocationRow = {
  id: string
  invoice_id: string
  customer: string
  invoice_number: string | null
  invoice_date: string | null
  job_number: string | null
  work_order_id: number | null
  crane_row_id: string | null
  d_number: string | null
  crane_description: string | null
  crane_location: string | null
  location_label: string | null
  allocation_method: string | null
  allocation_count: number | null
  invoice_total: number | string | null
  allocated_amount: number | string | null
  source_document_id: string | null
  source_document_bucket: string | null
  source_document_file_path: string | null
  source_document_name: string | null
}

const pageSize = 1000

function resolveSelectedCustomer(customer?: string) {
  return getCustomerFilterValue(normalizeCustomer(customer) || getStoredCustomer())
}

function isMissingTableError(message: string) {
  return /schema cache|could not find|does not exist|pgrst205|relation .* does not exist/i.test(message)
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
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value || 'Unknown'
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`
}

function mapAllocation(row: InvoiceSpendAllocationRow): InvoiceSpendAllocation {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    customer: row.customer,
    invoiceNumber: row.invoice_number ?? '',
    invoiceDate: row.invoice_date ?? '',
    jobNumber: row.job_number ?? '',
    workOrderId: row.work_order_id,
    craneRowId: row.crane_row_id,
    dNumber: (row.d_number ?? '').trim().toUpperCase(),
    craneDescription: row.crane_description ?? '',
    craneLocation: row.crane_location ?? '',
    locationLabel: row.location_label ?? 'Unmapped',
    allocationMethod: row.allocation_method ?? '',
    allocationCount: row.allocation_count ?? 1,
    invoiceTotal: toNumber(row.invoice_total),
    allocatedAmount: toNumber(row.allocated_amount),
    sourceDocumentId: row.source_document_id,
    sourceDocumentBucket: row.source_document_bucket ?? '',
    sourceDocumentFilePath: row.source_document_file_path ?? '',
    sourceDocumentName: row.source_document_name ?? '',
  }
}

function mapInvoiceRun(row: InvoiceSpendInvoiceRow): InvoiceSpendInvoiceRun {
  return {
    id: row.id,
    customer: row.customer,
    originalFileName: row.original_file_name ?? '',
    status: row.status ?? '',
    allocationStatus: row.allocation_status ?? '',
    invoiceNumber: row.invoice_number ?? '',
    jobNumber: row.job_number ?? '',
    invoiceTotal: toNumber(row.invoice_total),
    extendWorkflowRunId: row.extend_workflow_run_id ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function getCurrentUserId() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Sign in to upload invoice spend PDFs.')
  return data.user.id
}

export async function uploadInvoiceSpendPdf(file: File, customer?: string): Promise<InvoiceSpendUploadResult> {
  if (file.type && file.type !== 'application/pdf') {
    throw new Error(`${file.name} is not a PDF.`)
  }

  const userId = await getCurrentUserId()
  const response = await fetch(invoiceSpendUploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/pdf',
      'x-file-name': file.name,
      'x-menu-item-user-id': userId,
      'x-customer': resolveSelectedCustomer(customer),
    },
    body: file,
  })

  const responseText = await response.text()
  let body: unknown = responseText
  try {
    body = responseText ? JSON.parse(responseText) : {}
  } catch {
    // Keep non-JSON backend errors readable.
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
          ? body.message
          : `Invoice spend workflow upload failed with status ${response.status}.`
    throw new Error(message)
  }

  return body as InvoiceSpendUploadResult
}

export async function getPendingInvoiceSpendRuns(customer?: string): Promise<InvoiceSpendInvoiceRun[]> {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const selectedCustomer = resolveSelectedCustomer(customer)
  const { data, error } = await supabase
    .from('deshazo_invoice_spend_invoices')
    .select('id, customer, original_file_name, status, allocation_status, invoice_number, job_number, invoice_total, extend_workflow_run_id, created_at, updated_at')
    .eq('customer', selectedCustomer)
    .eq('allocation_status', 'pending')
    .not('extend_workflow_run_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(25)

  if (error) {
    if (isMissingTableError(error.message)) return []
    throw new Error(error.message)
  }

  return ((data ?? []) as InvoiceSpendInvoiceRow[]).map(mapInvoiceRun)
}

export async function syncInvoiceSpendRuns(invoiceIds: string[]): Promise<InvoiceSpendSyncResult[]> {
  const uniqueInvoiceIds = Array.from(new Set(invoiceIds.filter(Boolean)))
  if (uniqueInvoiceIds.length === 0) return []

  const response = await fetch(invoiceSpendSyncUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ invoiceIds: uniqueInvoiceIds }),
  })

  const responseText = await response.text()
  let body: unknown = responseText
  try {
    body = responseText ? JSON.parse(responseText) : {}
  } catch {
    // Keep non-JSON backend errors readable.
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Invoice spend sync failed with status ${response.status}.`
    throw new Error(message)
  }

  const results = body && typeof body === 'object' && 'results' in body ? body.results : []
  return Array.isArray(results) ? results as InvoiceSpendSyncResult[] : []
}

async function fetchInvoiceSpendAllocations(customer?: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const selectedCustomer = resolveSelectedCustomer(customer)
  const rows: InvoiceSpendAllocationRow[] = []

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('deshazo_invoice_spend_allocations')
      .select(
        'id, invoice_id, customer, invoice_number, invoice_date, job_number, work_order_id, crane_row_id, d_number, crane_description, crane_location, location_label, allocation_method, allocation_count, invoice_total, allocated_amount, source_document_id, source_document_bucket, source_document_file_path, source_document_name',
      )
      .eq('customer', selectedCustomer)
      .order('invoice_date', { ascending: false, nullsFirst: false })
      .range(offset, offset + pageSize - 1)

    if (error) {
      if (isMissingTableError(error.message)) return []
      throw new Error(error.message)
    }

    const pageRows = (data ?? []) as InvoiceSpendAllocationRow[]
    rows.push(...pageRows)
    if (pageRows.length < pageSize) break
  }

  return rows.map(mapAllocation)
}

function summarizeByCrane(allocations: InvoiceSpendAllocation[]) {
  const cranes = new Map<string, InvoiceSpendCraneSummary>()

  allocations.forEach((allocation) => {
    const dNumber = allocation.dNumber || 'Unmapped'
    const current = cranes.get(dNumber) ?? {
      dNumber,
      craneDescription: allocation.craneDescription,
      craneLocation: allocation.craneLocation,
      locationLabel: allocation.locationLabel,
      totalSpend: 0,
      invoiceCount: 0,
      latestInvoiceDate: '',
      allocations: [],
    }

    current.totalSpend += allocation.allocatedAmount
    current.allocations.push(allocation)
    if (!current.craneDescription && allocation.craneDescription) current.craneDescription = allocation.craneDescription
    if (!current.craneLocation && allocation.craneLocation) current.craneLocation = allocation.craneLocation
    if (!current.locationLabel && allocation.locationLabel) current.locationLabel = allocation.locationLabel
    if (allocation.invoiceDate && allocation.invoiceDate > current.latestInvoiceDate) {
      current.latestInvoiceDate = allocation.invoiceDate
    }
    cranes.set(dNumber, current)
  })

  return Array.from(cranes.values())
    .map((crane) => ({
      ...crane,
      totalSpend: Math.round(crane.totalSpend),
      invoiceCount: new Set(crane.allocations.map((allocation) => allocation.invoiceId)).size,
      allocations: [...crane.allocations].sort((left, right) => right.invoiceDate.localeCompare(left.invoiceDate)),
    }))
    .sort((left, right) => right.totalSpend - left.totalSpend || left.dNumber.localeCompare(right.dNumber))
}

export async function getInvoiceSpendLocationSummaries(customer?: string): Promise<InvoiceSpendLocationSummary[]> {
  const allocations = await fetchInvoiceSpendAllocations(customer)
  const locations = new Map<string, InvoiceSpendAllocation[]>()

  allocations.forEach((allocation) => {
    const location = allocation.locationLabel || 'Unmapped'
    const group = locations.get(location) ?? []
    group.push(allocation)
    locations.set(location, group)
  })

  return Array.from(locations.entries())
    .map(([location, group]) => ({
      location,
      totalSpend: Math.round(group.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0)),
      invoiceCount: new Set(group.map((allocation) => allocation.invoiceId)).size,
      craneCount: new Set(group.map((allocation) => allocation.dNumber).filter(Boolean)).size,
      latestInvoiceDate: group.reduce(
        (latest, allocation) => allocation.invoiceDate && allocation.invoiceDate > latest ? allocation.invoiceDate : latest,
        '',
      ),
    }))
    .sort((left, right) => right.totalSpend - left.totalSpend || left.location.localeCompare(right.location))
}

export async function getInvoiceSpendCranesForLocation(
  location: string,
  customer?: string,
): Promise<InvoiceSpendCraneSummary[]> {
  const selectedLocation = location.trim().toLowerCase()
  const allocations = await fetchInvoiceSpendAllocations(customer)
  return summarizeByCrane(
    allocations.filter((allocation) => allocation.locationLabel.trim().toLowerCase() === selectedLocation),
  )
}

export async function getCraneInvoiceSpendAnalytics(
  dNumber: string,
  customer?: string,
): Promise<CraneInvoiceSpendAnalytics> {
  const normalizedDNumber = dNumber.trim().toUpperCase()
  const allocations = (await fetchInvoiceSpendAllocations(customer))
    .filter((allocation) => allocation.dNumber === normalizedDNumber)
    .sort((left, right) => right.invoiceDate.localeCompare(left.invoiceDate))
  const invoiceIds = new Set(allocations.map((allocation) => allocation.invoiceId))
  const totalSpend = allocations.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0)
  const invoiceTotals = new Map<string, number>()
  const monthTotals = new Map<string, number>()

  allocations.forEach((allocation) => {
    invoiceTotals.set(allocation.invoiceId, allocation.invoiceTotal)
    const key = monthKey(allocation.invoiceDate)
    monthTotals.set(key, (monthTotals.get(key) ?? 0) + allocation.allocatedAmount)
  })

  return {
    dNumber: normalizedDNumber,
    totalSpend: Math.round(totalSpend),
    associatedInvoiceSpend: Math.round(Array.from(invoiceTotals.values()).reduce((sum, total) => sum + total, 0)),
    invoiceCount: invoiceIds.size,
    averageInvoiceSpend: invoiceIds.size > 0 ? Math.round(totalSpend / invoiceIds.size) : 0,
    latestInvoiceDate: allocations[0]?.invoiceDate ?? '',
    monthlySpend: Array.from(monthTotals.entries())
      .map(([month, spend]) => ({ month, spend: Math.round(spend) }))
      .sort((left, right) => left.month.localeCompare(right.month)),
    recentInvoices: allocations.slice(0, 10),
  }
}
