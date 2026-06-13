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
const deshazoExternalApiBaseUrl =
  (import.meta.env.VITE_DESHAZO_SYNC_API_BASE_URL as string | undefined)?.trim() ||
  (portalParseBaseUrl ? new URL(portalParseBaseUrl).origin : '') ||
  'https://blockstamp-production-2b9f8bfc27a8.herokuapp.com'
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
  editableDocumentId: string | null
  documentName: string
  jobNumber: string
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
  editable_document_id: string | null
  document_name: string
  job_number: string | null
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
    dNumbers?: string[]
    purchaseOrders?: string[]
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

const supabasePageSize = 1000
const runIdFilterChunkSize = 100

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
    editableDocumentId: row.editable_document_id,
    documentName: row.document_name,
    jobNumber: row.job_number ?? '',
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

export const jobsQuotingItemSelect = `
  id,
  run_id,
  editable_document_id,
  document_name,
  job_number,
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
  const { data, error } = await client.auth.getUser()

  if (error) {
    throw new Error(error.message)
  }

  if (!data.user) {
    throw new Error('Sign in to use job quoting.')
  }

  return data.user.id
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
  const lookupJobNumbers = getJobNumberLookupValues(normalizedJobNumbers)
  if (normalizedJobNumbers.length === 0) {
    throw new Error('Enter at least one job number.')
  }

  if (!deshazoExternalApiKey) {
    throw new Error('External sync API key is not configured. Add VITE_DESHAZO_EXTERNAL_API_KEY to the frontend environment.')
  }

  const url = new URL('/api/external/jobs-quoting/from-inspection-reports', deshazoExternalApiBaseUrl)
  url.searchParams.set('jobNumbers', lookupJobNumbers.join(','))
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-API-Key': deshazoExternalApiKey,
    },
    body: JSON.stringify({ jobNumbers: lookupJobNumbers }),
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
        : `External report import failed with status ${response.status}.`
    throw new Error(message)
  }

  return body as ExternalInspectionReportQuoteImportResult
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
