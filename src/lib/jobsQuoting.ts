import { supabase } from './supabase'

const defaultInspectionSplitBackendUrl =
  'https://blockstamp-production-2b9f8bfc27a8.herokuapp.com/extend/deshazo-inspection-split'
const inspectionSplitBackendUrl =
  (import.meta.env.VITE_EXTEND_INSPECTION_SPLIT_UPLOAD_URL as string | undefined)?.trim() ||
  defaultInspectionSplitBackendUrl
export const jobsQuotingPdfBucket = 'jobs-quoting-pdfs'

export type JobsQuotingRun = {
  id: string
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
  createdAt: string
}

type JobsQuotingRunRow = {
  id: string
  source_file_name: string
  status: string
  extend_workflow_run_id: string | null
  extend_workflow_url: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

type JobsQuotingItemRow = {
  id: string
  run_id: string
  editable_document_id: string | null
  document_name: string
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
  created_at: string
}

export type JobsQuotingUploadResult = {
  run: JobsQuotingRun
  items: JobsQuotingItem[]
  message?: string
}

export type JobsQuotingRunDetails = JobsQuotingUploadResult

function mapRun(row: JobsQuotingRunRow): JobsQuotingRun {
  return {
    id: row.id,
    sourceFileName: row.source_file_name,
    status: row.status,
    extendWorkflowRunId: row.extend_workflow_run_id,
    extendWorkflowUrl: row.extend_workflow_url,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapItem(row: JobsQuotingItemRow): JobsQuotingItem {
  const repairCount = row.repair_count ?? 0
  const safetyCount = row.safety_count ?? 0

  return {
    id: row.id,
    runId: row.run_id,
    editableDocumentId: row.editable_document_id,
    documentName: row.document_name,
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
    createdAt: row.created_at,
  }
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  return supabase
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
  const userId = await getCurrentUserId()

  const { data, error } = await client
    .from('jobs_quoting_runs')
    .select('id, source_file_name, status, extend_workflow_run_id, extend_workflow_url, error_message, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as JobsQuotingRunRow[]).map(mapRun)
}

export async function getJobsQuotingItems(runId?: string): Promise<JobsQuotingItem[]> {
  const client = requireSupabase()
  const userId = await getCurrentUserId()
  let query = client
    .from('jobs_quoting_items')
    .select(
      'id, run_id, editable_document_id, document_name, split_type, split_identifier, repair_count, safety_count, extend_file_id, pdf_url, pdf_bucket, pdf_storage_path, pdf_file_name, pdf_file_size, pdf_content_type, extraction_data, created_at',
    )
    .eq('user_id', userId)
    .order('repair_count', { ascending: false })
    .order('safety_count', { ascending: false })
    .order('created_at', { ascending: false })

  if (runId) {
    query = query.eq('run_id', runId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as JobsQuotingItemRow[]).map(mapItem)
}

async function sendToJobsQuotingBackend(body: FormData | Record<string, unknown>) {
  const accessToken = await getAccessToken()
  const isFormData = body instanceof FormData
  const response = await fetch(inspectionSplitBackendUrl, {
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

export async function uploadInspectionForQuoting(file: File): Promise<JobsQuotingUploadResult> {
  if (file.type && file.type !== 'application/pdf') {
    throw new Error(`${file.name} is not a PDF.`)
  }

  const formData = new FormData()
  formData.append('action', 'upload')
  formData.append('file', file)

  return sendToJobsQuotingBackend(formData)
}

export async function syncJobsQuotingRun(runId: string): Promise<JobsQuotingRunDetails> {
  return sendToJobsQuotingBackend({ action: 'sync', runId })
}
