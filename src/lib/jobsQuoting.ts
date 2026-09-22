import { supabase } from './supabase'

const defaultInspectionSplitBackendUrl =
  'https://blockstamp-production-2b9f8bfc27a8.herokuapp.com/extend/deshazo-inspection-split'
const defaultInspectionExtractOnlyBackendUrl =
  'https://blockstamp-production-2b9f8bfc27a8.herokuapp.com/extend/deshazo-inspection-extractonly'
const inspectionSplitBackendUrl =
  (import.meta.env.VITE_EXTEND_INSPECTION_SPLIT_UPLOAD_URL as string | undefined)?.trim() ||
  defaultInspectionSplitBackendUrl
const inspectionExtractOnlyBackendUrl =
  (import.meta.env.VITE_EXTEND_INSPECTION_EXTRACTONLY_UPLOAD_URL as string | undefined)?.trim() ||
  defaultInspectionExtractOnlyBackendUrl
const portalParseBaseUrl = (import.meta.env.VITE_PORTAL_PARSE_BASE_URL as string | undefined)?.trim() || ''
const defaultDeshazoExternalApiBaseUrl = 'https://blockstamp-production-2b9f8bfc27a8.herokuapp.com'
const deshazoExternalApiBaseUrl =
  (import.meta.env.VITE_DESHAZO_SYNC_API_BASE_URL as string | undefined)?.trim() ||
  (portalParseBaseUrl ? new URL(portalParseBaseUrl).origin : '') ||
  defaultDeshazoExternalApiBaseUrl
const deshazoExternalApiBaseUrlFallbacks = Array.from(
  new Set([defaultDeshazoExternalApiBaseUrl].filter((url) => url !== deshazoExternalApiBaseUrl)),
)
const deshazoExternalApiKey = (import.meta.env.VITE_DESHAZO_EXTERNAL_API_KEY as string | undefined)?.trim() || ''
export const jobsQuotingPdfBucket = 'jobs-quoting-pdfs'

export type JobsQuotingRun = {
  id: string
  userId: string | null
  sourceFileName: string
  status: string
  extendWorkflowRunId: string | null
  extendWorkflowUrl: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export type JobsQuotingItem = {
  id: string
  runId: string
  uploadedByUserId: string | null
  editableDocumentId: string | null
  documentName: string
  jobNumber: string
  jobType: string
  dNumber: string
  deshazoExternalInspectionReportWorkOrderId: number | null
  splitType: string
  splitIdentifier: string
  repairCount: number
  safetyCount: number
  priorityCount: number
  extendFileId: string | null
  pdfUrl: string | null
  pdfBucket: string
  pdfStoragePath: string | null
  pdfFileName: string | null
  pdfFileSize: number | null
  pdfContentType: string
  extractionData: Record<string, unknown>
  reportName: string | null
  sourceDocumentName: string | null
  reportData: Record<string, string>
  repairSections: unknown[]
  costSections: unknown[]
  blockVisibility: Record<string, boolean>
  estimateNoteVisibility: Record<string, boolean>
  estimateCostSectionVisibility: Record<string, boolean>
  repairSectionVisibility: Record<string, boolean>
  pageLayoutVisibility: JobsQuotingPageLayoutVisibility
  textBoxes: unknown[]
  equipmentRentalSettings: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type JobsQuotingItemResultStatus = 'won' | 'lost' | 'pending'

export type JobsQuotingItemResult = {
  id: string
  jobQuoteItemId: string
  userId: string | null
  quoteTotalAmount: number
  winStatus: JobsQuotingItemResultStatus
  amountWon: number | null
  createdAt: string
  updatedAt: string
}

export type JobsQuotingPageLayoutVisibility = {
  blockVisibility: Record<string, boolean>
  estimateNoteVisibility: Record<string, boolean>
  estimateCostSectionVisibility?: Record<string, boolean>
  repairSectionVisibility: Record<string, boolean>
}

type JobsQuotingRunRow = {
  id: string
  user_id: string | null
  source_file_name: string
  status: string
  extend_workflow_run_id: string | null
  extend_workflow_url: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export type JobsQuotingItemRow = {
  id: string
  run_id: string
  uploaded_by_user_id?: string | null
  editable_document_id: string | null
  document_name: string
  job_number: string | null
  job_type?: string | null
  d_number: string | null
  deshazo_external_inspection_report_work_order_id: number | null
  split_type: string | null
  split_identifier: string | null
  repair_count: number | null
  safety_count: number | null
  extend_file_id: string | null
  pdf_url: string | null
  pdf_bucket: string | null
  pdf_storage_path: string | null
  pdf_file_name: string | null
  pdf_file_size: number | null
  pdf_content_type: string | null
  extraction_data: Record<string, unknown> | null
  report_name: string | null
  source_document_name: string | null
  report_data: Record<string, string> | null
  repair_sections: unknown[] | null
  cost_sections: unknown[] | null
  block_visibility: Record<string, boolean> | null
  estimate_note_visibility: Record<string, boolean> | null
  repair_section_visibility: Record<string, boolean> | null
  page_layout_visibility: JobsQuotingPageLayoutVisibility | null
  equipment_rental_settings: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type JobsQuotingItemResultRow = {
  id: string
  job_quote_item_id: string
  user_id: string | null
  quote_total_amount: number | string | null
  win_status: JobsQuotingItemResultStatus | null
  amount_won: number | string | null
  created_at: string
  updated_at: string
}

export type JobsQuotingUploadResult = {
  run: JobsQuotingRun
  runs?: JobsQuotingRun[]
  items: JobsQuotingItem[]
  message?: string
}

export type JobsQuotingRunDetails = JobsQuotingUploadResult

export type ExternalInspectionReportQuoteImportResult = {
  requestedJobNumbers: string[]
  processedReports: number
  results: Array<{
    workOrderId?: number | string
    jobNumber?: string | null
    hasCreatedJobQuotingItem?: boolean
    createdOrUpdated?: number
    sourceReportCount?: number
    quoteableReportCount?: number
    skippedNoQuoteItemsCount?: number
    dNumbers?: string[]
    purchaseOrders?: string[]
    refreshedIncompleteReport?: boolean
    refreshReason?: string | null
    existingQuoteItems?: Array<{
      id?: string
      dNumber?: string | null
      jobNumber?: string | null
    }>
    markedCreated?: boolean
    warning?: string
    error?: string
  }>
}

type ExternalInspectionPointLike = {
  condition?: unknown
  status?: unknown
  value?: unknown
  name?: unknown
  title?: unknown
  notes?: unknown
  remarks?: unknown
  photos?: unknown
}

type ExternalInspectionSectionLike = {
  name?: unknown
  points?: unknown
}

type ExternalInspectionLike = {
  type?: unknown
  sections?: unknown
}

type ExternalCraneReportLike = {
  crane?: {
    contactCode?: unknown
    contact_code?: unknown
    description?: unknown
    name?: unknown
    structure?: { type?: unknown }
    structureType?: unknown
  }
  inspections?: unknown
}

type ExternalInspectionReportRow = {
  work_order_id: number
  raw_payload: {
    cranes?: ExternalCraneReportLike[]
  } | null
}

type QuoteSafetyReconcileUpdate = {
  id: string
  safety_count: number
  extraction_data: Record<string, unknown>
  repair_sections: unknown[]
}

export type ExternalCraneDNumberQuoteCreateResult = {
  dNumber: string
  runId: string
  itemId: string
  jobNumber: string | null
  documentName: string
}

export type BlankQuoteCreateResult = {
  runId: string
  itemId: string
  documentName: string
}

export type InspectionQuoteCreateResult = {
  runId: string
  itemId: string
  documentName: string
  selectedSectionIds: string[]
}

export type ExternalWorkOrderSyncResult = {
  saved?: boolean
  customersProcessed?: number
  pagesProcessed?: number
  partial?: boolean
  stopReason?: string | null
  pageSize?: number
  totalCount?: number | null
  totalPages?: number | null
  workOrdersSeen?: number
  reportsSeen?: number
  failures?: unknown[]
}

export type ExternalWorkOrderSyncOptions = {
  pageSize: number
  maxPages?: number
  page?: number
  latestByDate?: boolean
  nextMissingByDate?: boolean
  incremental?: boolean
  maxCustomers?: number
  customerOffset?: number
  maxRunMillis?: number
}

const supabasePageSize = 1000
const runIdFilterChunkSize = 100
let currentUserIdPromise: Promise<string> | null = null

function mapRun(row: JobsQuotingRunRow): JobsQuotingRun {
  return {
    id: row.id,
    userId: row.user_id,
    sourceFileName: row.source_file_name,
    status: row.status,
    extendWorkflowRunId: row.extend_workflow_run_id,
    extendWorkflowUrl: row.extend_workflow_url,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function getExtractedJobType(extractionData: Record<string, unknown> | null): string | null {
  const candidates = [
    extractionData?.job_type,
    extractionData?.inspection_type,
    extractionData?.jobType,
    extractionData?.inspectionType,
    extractionData?.type,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    if (candidate && typeof candidate === 'object' && 'value' in candidate) {
      const value = (candidate as { value?: unknown }).value
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }

  return null
}

export function mapJobsQuotingItem(row: JobsQuotingItemRow): JobsQuotingItem {
  const repairCount = row.repair_count ?? 0
  const safetyCount = row.safety_count ?? 0
  const blockVisibility = row.page_layout_visibility?.blockVisibility ?? row.block_visibility ?? {}
  const estimateNoteVisibility = row.page_layout_visibility?.estimateNoteVisibility ?? row.estimate_note_visibility ?? {}
  const estimateCostSectionVisibility = row.page_layout_visibility?.estimateCostSectionVisibility ?? {}
  const repairSectionVisibility = row.page_layout_visibility?.repairSectionVisibility ?? row.repair_section_visibility ?? {}

  return {
    id: row.id,
    runId: row.run_id,
    uploadedByUserId: row.uploaded_by_user_id ?? null,
    editableDocumentId: row.editable_document_id,
    documentName: row.document_name,
    jobNumber: row.job_number ?? '',
    jobType: row.job_type ?? getExtractedJobType(row.extraction_data) ?? '',
    dNumber: row.d_number ?? '',
    deshazoExternalInspectionReportWorkOrderId: row.deshazo_external_inspection_report_work_order_id,
    splitType: row.split_type ?? '',
    splitIdentifier: row.split_identifier ?? '',
    repairCount,
    safetyCount,
    priorityCount: repairCount + safetyCount,
    extendFileId: row.extend_file_id,
    pdfUrl: row.pdf_url,
    pdfBucket: row.pdf_bucket ?? jobsQuotingPdfBucket,
    pdfStoragePath: row.pdf_storage_path,
    pdfFileName: row.pdf_file_name,
    pdfFileSize: row.pdf_file_size,
    pdfContentType: row.pdf_content_type ?? 'application/pdf',
    extractionData: row.extraction_data ?? {},
    reportName: row.report_name,
    sourceDocumentName: row.source_document_name,
    reportData: row.report_data ?? {},
    repairSections: row.repair_sections ?? [],
    costSections: row.cost_sections ?? [],
    blockVisibility,
    estimateNoteVisibility,
    estimateCostSectionVisibility,
    repairSectionVisibility,
    pageLayoutVisibility: {
      blockVisibility,
      estimateNoteVisibility,
      estimateCostSectionVisibility,
      repairSectionVisibility,
    },
    textBoxes: [],
    equipmentRentalSettings: row.equipment_rental_settings ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapJobsQuotingItemResult(row: JobsQuotingItemResultRow): JobsQuotingItemResult {
  const quoteTotalAmount = Number(row.quote_total_amount ?? 0)
  const amountWon = row.amount_won == null ? null : Number(row.amount_won)

  return {
    id: row.id,
    jobQuoteItemId: row.job_quote_item_id,
    userId: row.user_id,
    quoteTotalAmount: Number.isFinite(quoteTotalAmount) ? quoteTotalAmount : 0,
    winStatus: row.win_status ?? 'pending',
    amountWon: amountWon == null || !Number.isFinite(amountWon) ? null : amountWon,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const jobsQuotingItemSelect = `
  id,
  run_id,
  uploaded_by_user_id,
  editable_document_id,
  document_name,
  job_number,
  job_type,
  d_number,
  deshazo_external_inspection_report_work_order_id,
  split_type,
  split_identifier,
  repair_count,
  safety_count,
  extend_file_id,
  pdf_url,
  pdf_bucket,
  pdf_storage_path,
  pdf_file_name,
  pdf_file_size,
  pdf_content_type,
  extraction_data,
  report_name,
  source_document_name,
  report_data,
  repair_sections,
  cost_sections,
  block_visibility,
  estimate_note_visibility,
  repair_section_visibility,
  page_layout_visibility,
  equipment_rental_settings,
  created_at,
  updated_at
`

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  return supabase
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = []

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }

  return chunks
}

const ensureArray = <T = unknown>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : [])

function getPlainText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanInspectionLabel(value: unknown, structureType?: unknown) {
  const structure = getPlainText(structureType) || 'Structure'

  return getPlainText(value)
    .replace(/\{\{\s*(?:Trolley\s+)?Hoist\s*<\s*index\s*>\s*\}\}/gi, 'Trolley Hoist')
    .replace(/\{\{\s*craneStructureType\.name\s*\}\}/gi, structure)
    .replace(/\bcraneStructureType\.name\b/gi, structure)
    .replace(/\{\{\s*([^{}<>]+?)\s*\}\}/g, '$1')
    .replace(/\s*:\s*/g, ': ')
    .replace(/\s+/g, ' ')
    .trim()
}

function classifyQuoteCondition(condition: unknown) {
  const normalized = String(condition || '').trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes('repair')) return 'repair'
  if (
    normalized.includes('safety') ||
    normalized.includes('monitor') ||
    normalized.includes('do not operate') ||
    normalized.includes('unsafe')
  ) {
    return 'safety'
  }
  return null
}

function getSafetyMonitorStatus(condition: unknown) {
  const normalized = String(condition || '').trim().toLowerCase()
  return normalized.includes('monitor') ? 'Monitor' : 'Safety'
}

function getPointNote(point: ExternalInspectionPointLike) {
  const directNotes = getPlainText(point.notes)
  if (directNotes) return directNotes

  return ensureArray<Record<string, unknown>>(point.remarks)
    .map((remark) => getPlainText(remark.content) || getPlainText(remark.note) || getPlainText(remark.text))
    .filter(Boolean)
    .join(' ')
}

function normalizeSectionMergeText(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function getSectionStatusBucket(status: unknown) {
  const normalized = normalizeSectionMergeText(status)
  if (normalized.includes('repair')) return 'repair'
  if (
    normalized.includes('monitor') ||
    normalized.includes('safety') ||
    normalized.includes('do not operate') ||
    normalized.includes('unsafe')
  ) {
    return 'safety'
  }
  return normalized
}

function getRepairSectionMergeKey(section: { title?: unknown; status?: unknown } | null | undefined) {
  return [normalizeSectionMergeText(section?.title), getSectionStatusBucket(section?.status)]
    .filter(Boolean)
    .join(':')
}

function getSourceSafetyItemsByDNumber(rawPayload: ExternalInspectionReportRow['raw_payload']) {
  const itemsByDNumber = new Map<string, Array<Record<string, unknown>>>()

  ensureArray<ExternalCraneReportLike>(rawPayload?.cranes).forEach((craneReport) => {
    const crane = craneReport.crane ?? {}
    const dNumber = getPlainText(crane.contactCode || crane.contact_code).toUpperCase()
    if (!dNumber) return

    const structureType = crane.structure?.type || crane.structureType
    const safetyItems: Array<Record<string, unknown>> = []

    ensureArray<ExternalInspectionLike>(craneReport.inspections).forEach((inspection) => {
      ensureArray<ExternalInspectionSectionLike>(inspection.sections).forEach((section) => {
        const sectionName = cleanInspectionLabel(section.name || inspection.type || dNumber, structureType)

        ensureArray<ExternalInspectionPointLike>(section.points).forEach((point) => {
          const condition = point.condition ?? point.status ?? point.value ?? null
          if (classifyQuoteCondition(condition) !== 'safety') return

          safetyItems.push({
            section_name: sectionName,
            component_name: cleanInspectionLabel(point.name || point.title, structureType),
            condition: String(condition || ''),
            status: getSafetyMonitorStatus(condition),
            note: cleanInspectionLabel(getPointNote(point), structureType),
            photos: ensureArray(point.photos),
          })
        })
      })
    })

    itemsByDNumber.set(dNumber, safetyItems)
  })

  return itemsByDNumber
}

function buildSafetyRepairSections(
  item: JobsQuotingItemRow,
  workOrderId: number,
  safetyItems: Array<Record<string, unknown>>,
) {
  const existingSections = Array.isArray(item.repair_sections) ? item.repair_sections : []
  const existingKeys = new Set(
    existingSections
      .map((section) => getRepairSectionMergeKey(section as { title?: unknown; status?: unknown }))
      .filter(Boolean),
  )
  const dNumber = String(item.d_number || '').trim().toLowerCase()
  const additions = safetyItems
    .map((safetyItem, index) => {
      const sectionName = getPlainText(safetyItem.section_name)
      const componentName = getPlainText(safetyItem.component_name)
      return {
        id: `external-work-order-${workOrderId}-d-number-${dNumber}-safety-${index}`,
        title: [sectionName, componentName].filter(Boolean).join(': ') || `Inspection Item ${existingSections.length + index + 1}`,
        description: getPlainText(safetyItem.note),
        status: getPlainText(safetyItem.status) || 'Safety',
        lineItems: [],
      }
    })
    .filter((section) => {
      const key = getRepairSectionMergeKey(section)
      if (!key || existingKeys.has(key)) return false
      existingKeys.add(key)
      return true
    })

  return additions.length > 0 ? [...existingSections, ...additions] : existingSections
}

async function reconcileExternalQuoteImportResult(result: ExternalInspectionReportQuoteImportResult) {
  const client = requireSupabase()
  const workOrderIds = Array.from(
    new Set(
      result.results
        .map((row) => Number(row.workOrderId))
        .filter((workOrderId) => Number.isFinite(workOrderId) && workOrderId > 0),
    ),
  )

  if (workOrderIds.length === 0) return

  const { data: reportRows, error: reportError } = await client
    .from('deshazo_external_inspection_reports')
    .select('work_order_id, raw_payload')
    .in('work_order_id', workOrderIds)

  if (reportError) throw new Error(reportError.message)

  const sourceItemsByWorkOrderId = new Map<number, Map<string, Array<Record<string, unknown>>>>()
  ;((reportRows ?? []) as ExternalInspectionReportRow[]).forEach((row) => {
    sourceItemsByWorkOrderId.set(Number(row.work_order_id), getSourceSafetyItemsByDNumber(row.raw_payload))
  })

  const { data: quoteRows, error: quoteError } = await client
    .from('jobs_quoting_items')
    .select(jobsQuotingItemSelect)
    .in('deshazo_external_inspection_report_work_order_id', workOrderIds)

  if (quoteError) throw new Error(quoteError.message)

  const updates = ((quoteRows ?? []) as JobsQuotingItemRow[]).reduce<QuoteSafetyReconcileUpdate[]>(
    (nextUpdates, item) => {
      const workOrderId = Number(item.deshazo_external_inspection_report_work_order_id)
      const dNumber = String(item.d_number || '').trim().toUpperCase()
      const safetyItems = sourceItemsByWorkOrderId.get(workOrderId)?.get(dNumber) ?? []
      if ((item.safety_count ?? 0) === safetyItems.length) return nextUpdates

      const nextExtractionData = {
        ...(item.extraction_data ?? {}),
        safety_count: safetyItems.length,
        safety_and_monitor_items: safetyItems,
      }

      nextUpdates.push({
        id: item.id,
        safety_count: safetyItems.length,
        extraction_data: nextExtractionData,
        repair_sections: buildSafetyRepairSections(item, workOrderId, safetyItems),
      })
      return nextUpdates
    },
    [],
  )

  for (const update of updates) {
    const { error } = await client
      .from('jobs_quoting_items')
      .update({
        safety_count: update.safety_count,
        extraction_data: update.extraction_data,
        repair_sections: update.repair_sections,
      })
      .eq('id', update.id)

    if (error) throw new Error(error.message)
  }
}

async function fetchAllPages<Row>(buildQuery: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>) {
  const rows: Row[] = []
  let from = 0

  while (true) {
    const { data, error } = await buildQuery(from, from + supabasePageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

    const pageRows = data ?? []
    rows.push(...pageRows)

    if (pageRows.length < supabasePageSize) {
      break
    }

    from += supabasePageSize
  }

  return rows
}

async function getCurrentUserId() {
  const client = requireSupabase()

  if (!currentUserIdPromise) {
    currentUserIdPromise = client.auth.getUser()
      .then(({ data, error }) => {
        if (error) throw new Error(error.message)
        if (!data.user) throw new Error('Sign in to use job quoting.')
        return data.user.id
      })
      .catch((error) => {
        currentUserIdPromise = null
        throw error
      })
  }

  return currentUserIdPromise
}

async function getAccessToken() {
  const client = requireSupabase()
  const { data, error } = await client.auth.getSession()

  if (error) {
    throw new Error(error.message)
  }

  const token = data.session?.access_token
  if (!token) {
    throw new Error('Sign in to use job quoting.')
  }

  return token
}

function getExternalApiUrl(baseUrl: string, path: string, searchParams?: Record<string, string>) {
  const url = new URL(path, baseUrl)
  Object.entries(searchParams || {}).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })
  return url
}

async function fetchDeshazoExternalApi(
  path: string,
  init: RequestInit,
  searchParams?: Record<string, string>,
) {
  const baseUrls = [deshazoExternalApiBaseUrl, ...deshazoExternalApiBaseUrlFallbacks]
  let lastError: unknown = null

  for (const [index, baseUrl] of baseUrls.entries()) {
    try {
      const response = await fetch(getExternalApiUrl(baseUrl, path, searchParams).toString(), init)
      if (response.status === 404 && index < baseUrls.length - 1) {
        const text = await response.clone().text().catch(() => '')
        if (text.toLowerCase().includes('cannot post /api/external')) {
          continue
        }
      }
      return response
    } catch (error) {
      lastError = error
      if (index >= baseUrls.length - 1) {
        throw error
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('External API request failed.')
}

export async function getJobsQuotingRuns(): Promise<JobsQuotingRun[]> {
  const client = requireSupabase()
  await getCurrentUserId()

  const rows = await fetchAllPages<JobsQuotingRunRow>((from, to) =>
    client
      .from('jobs_quoting_runs')
      .select('id, user_id, source_file_name, status, extend_workflow_run_id, extend_workflow_url, error_message, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to),
  )

  return rows.map(mapRun)
}

export async function getJobsQuotingItems(runId?: string): Promise<JobsQuotingItem[]> {
  const client = requireSupabase()
  await getCurrentUserId()
  const rows = await fetchAllPages<JobsQuotingItemRow>((from, to) => {
    let query = client
      .from('jobs_quoting_items')
      .select(jobsQuotingItemSelect)
      .order('repair_count', { ascending: false })
      .order('safety_count', { ascending: false })
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (runId) {
      query = query.eq('run_id', runId)
    }

    return query
  })

  return rows.map(mapJobsQuotingItem)
}

export async function getJobsQuotingItemsForRuns(runIds: string[]): Promise<JobsQuotingItem[]> {
  const uniqueRunIds = Array.from(new Set(runIds.filter(Boolean)))
  if (uniqueRunIds.length === 0) return []

  const client = requireSupabase()
  await getCurrentUserId()

  const rows: JobsQuotingItemRow[] = []

  for (const runIdChunk of chunkValues(uniqueRunIds, runIdFilterChunkSize)) {
    const chunkRows = await fetchAllPages<JobsQuotingItemRow>((from, to) =>
      client
        .from('jobs_quoting_items')
        .select(jobsQuotingItemSelect)
        .in('run_id', runIdChunk)
        .order('repair_count', { ascending: false })
        .order('safety_count', { ascending: false })
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to),
    )

    rows.push(...chunkRows)
  }

  return rows.map(mapJobsQuotingItem)
}

export async function getJobsQuotingItemsForJobNumbers(jobNumbers: string[]): Promise<JobsQuotingItem[]> {
  const lookupJobNumbers = getJobNumberLookupValues(jobNumbers.map((jobNumber) => jobNumber.trim()).filter(Boolean))
  if (lookupJobNumbers.length === 0) return []

  const client = requireSupabase()
  await getCurrentUserId()

  const rows: JobsQuotingItemRow[] = []
  for (const jobNumberChunk of chunkValues(lookupJobNumbers, runIdFilterChunkSize)) {
    const chunkRows = await fetchAllPages<JobsQuotingItemRow>((from, to) =>
      client
        .from('jobs_quoting_items')
        .select(jobsQuotingItemSelect)
        .in('job_number', jobNumberChunk)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to),
    )
    rows.push(...chunkRows)
  }

  const itemsById = new Map(rows.map((row) => [row.id, row]))
  return Array.from(itemsById.values()).map(mapJobsQuotingItem)
}

export async function getJobsQuotingItem(itemId: string): Promise<JobsQuotingItem> {
  const client = requireSupabase()
  await getCurrentUserId()
  const { data, error } = await client
    .from('jobs_quoting_items')
    .select(jobsQuotingItemSelect)
    .eq('id', itemId)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapJobsQuotingItem(data as JobsQuotingItemRow)
}

export async function deleteJobsQuotingItem(itemId: string) {
  const client = requireSupabase()
  await getCurrentUserId()
  const { data, error } = await client
    .from('jobs_quoting_items')
    .delete()
    .eq('id', itemId)
    .select('id')

  if (error) {
    throw new Error(error.message)
  }

  if (!data || data.length === 0) {
    throw new Error('Quote item was not deleted. Supabase delete permissions may not be enabled for jobs quoting items.')
  }
}

export async function getJobsQuotingItemResults(itemIds: string[]): Promise<JobsQuotingItemResult[]> {
  const uniqueItemIds = Array.from(new Set(itemIds.filter(Boolean)))
  if (uniqueItemIds.length === 0) return []

  const client = requireSupabase()
  await getCurrentUserId()

  const rows: JobsQuotingItemResultRow[] = []

  for (const itemIdChunk of chunkValues(uniqueItemIds, runIdFilterChunkSize)) {
    const chunkRows = await fetchAllPages<JobsQuotingItemResultRow>((from, to) =>
      client
        .from('jobs_quoting_item_results')
        .select('id, job_quote_item_id, user_id, quote_total_amount, win_status, amount_won, created_at, updated_at')
        .in('job_quote_item_id', itemIdChunk)
        .range(from, to),
    )

    rows.push(...chunkRows)
  }

  return rows.map(mapJobsQuotingItemResult)
}

export async function saveJobsQuotingItemResult(input: {
  jobQuoteItemId: string
  quoteTotalAmount: number
  winStatus: JobsQuotingItemResultStatus
  amountWon: number | null
}): Promise<JobsQuotingItemResult> {
  const client = requireSupabase()
  const userId = await getCurrentUserId()
  const { data, error } = await client
    .from('jobs_quoting_item_results')
    .upsert(
      {
        job_quote_item_id: input.jobQuoteItemId,
        user_id: userId,
        quote_total_amount: input.quoteTotalAmount,
        win_status: input.winStatus,
        amount_won: input.amountWon,
      },
      { onConflict: 'job_quote_item_id' },
    )
    .select('id, job_quote_item_id, user_id, quote_total_amount, win_status, amount_won, created_at, updated_at')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapJobsQuotingItemResult(data as JobsQuotingItemResultRow)
}

export async function getJobsQuotingItemPdfUrl(item: JobsQuotingItem): Promise<string | null> {
  const client = requireSupabase()

  if (item.pdfStoragePath) {
    const { data, error } = await client.storage
      .from(item.pdfBucket || jobsQuotingPdfBucket)
      .createSignedUrl(item.pdfStoragePath, 60 * 60)

    if (error) {
      throw new Error(error.message)
    }

    return data.signedUrl
  }

  return item.pdfUrl
}

async function sendToJobsQuotingBackend(url: string, body: FormData | Record<string, unknown>) {
  const accessToken = await getAccessToken()
  const isFormData = body instanceof FormData
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    },
    body: isFormData ? body : JSON.stringify(body),
  })

  const responseText = await response.text()
  let data: unknown = null

  if (responseText) {
    try {
      data = JSON.parse(responseText)
    } catch {
      data = { message: responseText }
    }
  }

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
          ? data.message
          : `Inspection split backend failed with status ${response.status}.`

    throw new Error(message)
  }

  return data as JobsQuotingUploadResult
}

export async function uploadInspectionForQuoting(file: File, sourceFileName?: string): Promise<JobsQuotingUploadResult> {
  if (file.type && file.type !== 'application/pdf') {
    throw new Error(`${file.name} is not a PDF.`)
  }

  const formData = new FormData()
  formData.append('action', 'upload')
  formData.append('file', file)
  if (sourceFileName) {
    formData.append('sourceFileName', sourceFileName)
  }

  return sendToJobsQuotingBackend(inspectionSplitBackendUrl, formData)
}

export async function uploadExtractOnlyInspectionForQuoting(files: File[], sourceFileName?: string): Promise<JobsQuotingUploadResult> {
  const pdfFiles = files.filter((file) => file.name.toLowerCase().endsWith('.pdf'))
  if (pdfFiles.length === 0) {
    throw new Error('Choose at least one PDF inspection report to upload.')
  }

  const invalidFile = pdfFiles.find((file) => file.type && file.type !== 'application/pdf')
  if (invalidFile) {
    throw new Error(`${invalidFile.name} is not a PDF.`)
  }

  const formData = new FormData()
  formData.append('action', 'upload')
  pdfFiles.forEach((file) => formData.append('files', file))
  formData.append('sourceFileName', sourceFileName || (pdfFiles.length === 1 ? pdfFiles[0].name : `${pdfFiles.length} inspection reports`))

  return sendToJobsQuotingBackend(inspectionExtractOnlyBackendUrl, formData)
}

export async function syncJobsQuotingRun(runId: string): Promise<JobsQuotingRunDetails> {
  return sendToJobsQuotingBackend(inspectionSplitBackendUrl, { action: 'sync', runId })
}

export async function createJobQuotingItemsFromExternalInspectionReports(
  jobNumbers: string[],
): Promise<ExternalInspectionReportQuoteImportResult> {
  const normalizedJobNumbers = jobNumbers.map((jobNumber) => jobNumber.trim()).filter(Boolean)
  if (normalizedJobNumbers.length === 0) {
    throw new Error('Enter at least one job number.')
  }

  if (!deshazoExternalApiKey) {
    throw new Error('External sync API key is not configured. Add VITE_DESHAZO_EXTERNAL_API_KEY to the frontend environment.')
  }

  const accessToken = await getAccessToken()
  const response = await fetchDeshazoExternalApi('/api/external/jobs-quoting/from-inspection-reports', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-API-Key': deshazoExternalApiKey,
      'X-Supabase-Access-Token': accessToken,
    },
    body: JSON.stringify({ jobNumbers: normalizedJobNumbers }),
  }, { jobNumbers: normalizedJobNumbers.join(',') })

  const responseText = await response.text()
  let body: unknown = responseText
  try {
    body = JSON.parse(responseText)
  } catch {
    // Keep non-JSON backend errors readable.
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `External report import failed with status ${response.status}.`
    throw new Error(message)
  }

  const result = body as ExternalInspectionReportQuoteImportResult
  await reconcileExternalQuoteImportResult(result)
  return result
}

export async function createJobQuotingItemFromExternalCraneDNumber(dNumber: string): Promise<ExternalCraneDNumberQuoteCreateResult> {
  const normalizedDNumber = dNumber.trim().toUpperCase().replace(/\s+/g, '')
  if (!/^D[0-9]{6}$/.test(normalizedDNumber)) {
    throw new Error('Enter a D number in the format D123456.')
  }

  if (!deshazoExternalApiKey) {
    throw new Error('External sync API key is not configured. Add VITE_DESHAZO_EXTERNAL_API_KEY to the frontend environment.')
  }

  const accessToken = await getAccessToken()
  const response = await fetchDeshazoExternalApi('/api/external/jobs-quoting/from-d-number', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-API-Key': deshazoExternalApiKey,
      'X-Supabase-Access-Token': accessToken,
    },
    body: JSON.stringify({ dNumber: normalizedDNumber }),
  }, { dNumber: normalizedDNumber })

  const responseText = await response.text()
  let body: unknown = responseText
  try {
    body = JSON.parse(responseText)
  } catch {
    // Keep non-JSON backend errors readable.
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `D-number quote creation failed with status ${response.status}.`
    throw new Error(message)
  }

  return body as ExternalCraneDNumberQuoteCreateResult
}

export async function createBlankJobQuotingItem(): Promise<BlankQuoteCreateResult> {
  if (!deshazoExternalApiKey) {
    throw new Error('External sync API key is not configured. Add VITE_DESHAZO_EXTERNAL_API_KEY to the frontend environment.')
  }

  const accessToken = await getAccessToken()
  const response = await fetchDeshazoExternalApi('/api/external/jobs-quoting/from-blank', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-API-Key': deshazoExternalApiKey,
      'X-Supabase-Access-Token': accessToken,
    },
    body: JSON.stringify({}),
  })

  const responseText = await response.text()
  let body: unknown = responseText
  try {
    body = JSON.parse(responseText)
  } catch {
    // Keep non-JSON backend errors readable.
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Blank quote creation failed with status ${response.status}.`
    throw new Error(message)
  }

  return body as BlankQuoteCreateResult
}

export async function createInspectionQuoteItem(selectedSectionIds: string[]): Promise<InspectionQuoteCreateResult> {
  if (!deshazoExternalApiKey) {
    throw new Error('External sync API key is not configured. Add VITE_DESHAZO_EXTERNAL_API_KEY to the frontend environment.')
  }

  const accessToken = await getAccessToken()
  const searchParams = new URLSearchParams()
  selectedSectionIds.forEach((sectionId) => searchParams.append('selectedSectionId', sectionId))
  const query = searchParams.toString()
  const response = await fetchDeshazoExternalApi(`/api/external/jobs-quoting/from-inspection-quote${query ? `?${query}` : ''}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'X-API-Key': deshazoExternalApiKey,
      'X-Supabase-Access-Token': accessToken,
    },
  })

  const responseText = await response.text()
  let body: unknown = responseText
  try {
    body = JSON.parse(responseText)
  } catch {
    // Keep non-JSON backend errors readable.
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Inspection quote creation failed with status ${response.status}.`
    throw new Error(message)
  }

  return body as InspectionQuoteCreateResult
}

export async function syncExternalWorkOrdersForQuoting(options: ExternalWorkOrderSyncOptions): Promise<ExternalWorkOrderSyncResult> {
  if (!deshazoExternalApiKey) {
    throw new Error('External sync API key is not configured. Add VITE_DESHAZO_EXTERNAL_API_KEY to the frontend environment.')
  }

  const searchParams: Record<string, string> = {
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize),
  }
  if (options.maxPages) searchParams.maxPages = String(options.maxPages)
  if (options.latestByDate) searchParams.latestByDate = 'true'
  if (options.nextMissingByDate) searchParams.nextMissingByDate = 'true'
  if (options.maxCustomers) searchParams.maxCustomers = String(options.maxCustomers)
  if (options.customerOffset) searchParams.customerOffset = String(options.customerOffset)
  if (options.maxRunMillis) searchParams.maxRunMillis = String(options.maxRunMillis)

  const response = await fetchDeshazoExternalApi(
    options.incremental ? '/api/external/work-orders/sync/incremental' : '/api/external/work-orders/sync',
    {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'X-API-Key': deshazoExternalApiKey,
    },
    },
    searchParams,
  )

  const responseText = await response.text()
  let body: unknown = responseText
  try {
    body = JSON.parse(responseText)
  } catch {
    // Keep non-JSON backend errors readable.
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `External sync failed with status ${response.status}.`
    throw new Error(message)
  }

  return body as ExternalWorkOrderSyncResult
}

function getJobNumberLookupValues(jobNumbers: string[]) {
  const seen = new Set<string>()
  const values: string[] = []

  jobNumbers.forEach((jobNumber) => {
    const normalizedJobNumber = jobNumber.trim()
    const withoutLeadingZeroes = normalizedJobNumber.replace(/^0+(?=\d)/, '')
    const variants = [normalizedJobNumber, withoutLeadingZeroes]

    if (/^\d+$/.test(withoutLeadingZeroes) && !withoutLeadingZeroes.startsWith('0')) {
      variants.push(`0${withoutLeadingZeroes}`)
    }

    variants.forEach((variant) => {
      if (variant && !seen.has(variant)) {
        seen.add(variant)
        values.push(variant)
      }
    })
  })

  return values
}
