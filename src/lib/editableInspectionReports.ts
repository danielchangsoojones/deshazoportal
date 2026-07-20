import { jobsQuotingItemSelect, mapJobsQuotingItem, type JobsQuotingItem, type JobsQuotingItemRow } from './jobsQuoting'
import { supabase } from './supabase'

export type EditableInspectionReportPayload = {
  reportData: Record<string, string>
  repairSections: unknown[]
  costSections: unknown[]
  blockVisibility: Record<string, boolean>
  estimateNoteVisibility: Record<string, boolean>
  estimateCostSectionVisibility: Record<string, boolean>
  repairSectionVisibility: Record<string, boolean>
  pageLayoutVisibility?: {
    blockVisibility: Record<string, boolean>
    estimateNoteVisibility: Record<string, boolean>
    estimateCostSectionVisibility?: Record<string, boolean>
    repairSectionVisibility: Record<string, boolean>
  }
  textBoxes: unknown[]
  equipmentRentalSettings: Record<string, unknown>
}

export type EditableInspectionReport = EditableInspectionReportPayload & {
  id: string
  reportName: string
  sourceDocumentName: string
  jobsQuotingItemId: string | null
  jobNumber: string
  dNumber: string
  createdAt: string
  updatedAt: string
}

export type SaveEditableInspectionReportInput = EditableInspectionReportPayload & {
  id?: string | null
  jobsQuotingItemId?: string | null
  reportName: string
  sourceDocumentName?: string | null
}

export type EditableInspectionReportModifiedTime = {
  jobsQuotingItemId: string
  updatedAt: string
}

type RepairSectionLike = {
  status?: unknown
}

let currentUserIdPromise: Promise<string> | null = null

function getReportJobNumber(reportData: Record<string, string>) {
  const value = reportData.jobNumber ?? ''
  return value.replace(/^job\s*#?\s*:\s*/i, '').replace(/^#\s*/, '').trim()
}

function getReportDNumber(reportData: Record<string, string>) {
  const reportText = [reportData.summary, reportData.description, ...Object.values(reportData)].join(' ')
  const match = reportText.match(/\bD[\s-]*\d[A-Z0-9]{2,}\b/i)
  return match ? match[0].replace(/[\s-]+/g, '').toUpperCase() : ''
}

function getRepairSectionCounts(repairSections: unknown[]) {
  return repairSections.reduce<{ repairCount: number; safetyCount: number }>(
    (counts, section) => {
      const status = String((section as RepairSectionLike | null)?.status ?? '').toLowerCase()
      if (status.includes('monitor') || status.includes('safety')) {
        counts.safetyCount += 1
      } else {
        counts.repairCount += 1
      }
      return counts
    },
    { repairCount: 0, safetyCount: 0 },
  )
}

async function getCurrentUserId() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  if (!currentUserIdPromise) {
    currentUserIdPromise = supabase.auth.getUser()
      .then(({ data, error }) => {
        if (error) throw new Error(error.message)
        if (!data.user) throw new Error('Sign in to save editable reports.')
        return data.user.id
      })
      .catch((error) => {
        currentUserIdPromise = null
        throw error
      })
  }

  return currentUserIdPromise
}

function mapQuoteItemToEditableInspectionReport(item: JobsQuotingItem): EditableInspectionReport {
  return {
    id: item.id,
    reportName: item.reportName ?? item.documentName,
    sourceDocumentName: item.sourceDocumentName ?? item.documentName,
    jobsQuotingItemId: item.id,
    jobNumber: item.jobNumber || getReportJobNumber(item.reportData ?? {}),
    dNumber: item.dNumber,
    reportData: item.reportData ?? {},
    repairSections: item.repairSections ?? [],
    costSections: item.costSections ?? [],
    blockVisibility: item.blockVisibility ?? {},
    estimateNoteVisibility: item.estimateNoteVisibility ?? {},
    estimateCostSectionVisibility: item.estimateCostSectionVisibility ?? {},
    repairSectionVisibility: item.repairSectionVisibility ?? {},
    pageLayoutVisibility: item.pageLayoutVisibility,
    textBoxes: item.textBoxes ?? [],
    equipmentRentalSettings: item.equipmentRentalSettings ?? {},
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

async function getQuoteItemReportById(itemId: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  await getCurrentUserId()
  const { data, error } = await supabase
    .from('jobs_quoting_items')
    .select(jobsQuotingItemSelect)
    .eq('id', itemId)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapQuoteItemToEditableInspectionReport(mapJobsQuotingItem(data as JobsQuotingItemRow))
}

export async function getEditableInspectionReports() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  await getCurrentUserId()
  const { data, error } = await supabase
    .from('jobs_quoting_items')
    .select(jobsQuotingItemSelect)
    .not('report_name', 'is', null)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as JobsQuotingItemRow[]).map((row) => mapQuoteItemToEditableInspectionReport(mapJobsQuotingItem(row)))
}

export async function getEditableInspectionReportModifiedTimes() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  await getCurrentUserId()
  const { data, error } = await supabase
    .from('jobs_quoting_items')
    .select('id, updated_at')
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as { id: string; updated_at: string }[]).map((row) => ({
    jobsQuotingItemId: row.id,
    updatedAt: row.updated_at,
  }))
}

export async function getEditableInspectionReport(reportId: string) {
  return getQuoteItemReportById(reportId)
}

export async function getEditableInspectionReportForJobsQuotingItem(jobsQuotingItemId: string) {
  return getQuoteItemReportById(jobsQuotingItemId)
}

export async function getEditableInspectionReportsForJobNumber(jobNumber: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const normalizedJobNumber = jobNumber.trim()
  if (!normalizedJobNumber) return []

  await getCurrentUserId()
  const { data, error } = await supabase
    .from('jobs_quoting_items')
    .select(jobsQuotingItemSelect)
    .eq('job_number', normalizedJobNumber)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as JobsQuotingItemRow[]).map((row) => mapQuoteItemToEditableInspectionReport(mapJobsQuotingItem(row)))
}

export async function saveEditableInspectionReport(input: SaveEditableInspectionReportInput) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  await getCurrentUserId()
  const itemId = input.jobsQuotingItemId || input.id
  if (!itemId) {
    throw new Error('Open a quote item before saving this editable report.')
  }

  const { repairCount, safetyCount } = getRepairSectionCounts(input.repairSections)
  const pageLayoutVisibility = {
    blockVisibility: input.blockVisibility,
    estimateNoteVisibility: input.estimateNoteVisibility,
    estimateCostSectionVisibility: input.estimateCostSectionVisibility,
    repairSectionVisibility: input.repairSectionVisibility,
  }
  const row = {
    report_name: input.reportName.trim(),
    source_document_name: input.sourceDocumentName?.trim() || input.reportName.trim(),
    job_number: getReportJobNumber(input.reportData) || null,
    d_number: getReportDNumber(input.reportData) || null,
    report_data: input.reportData,
    repair_sections: input.repairSections,
    cost_sections: input.costSections,
    block_visibility: input.blockVisibility,
    estimate_note_visibility: input.estimateNoteVisibility,
    repair_section_visibility: input.repairSectionVisibility,
    page_layout_visibility: pageLayoutVisibility,
    equipment_rental_settings: input.equipmentRentalSettings,
    repair_count: repairCount,
    safety_count: safetyCount,
  }

  const { data, error } = await supabase
    .from('jobs_quoting_items')
    .update(row)
    .eq('id', itemId)
    .select(jobsQuotingItemSelect)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapQuoteItemToEditableInspectionReport(mapJobsQuotingItem(data as JobsQuotingItemRow))
}

export async function deleteEditableInspectionReport(reportId: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  await getCurrentUserId()
  const { error } = await supabase
    .from('jobs_quoting_items')
    .update({
      report_name: null,
      source_document_name: null,
      report_data: {},
      repair_sections: [],
      cost_sections: [],
      block_visibility: {},
      estimate_note_visibility: {},
      repair_section_visibility: {},
      page_layout_visibility: {},
      equipment_rental_settings: {},
    })
    .eq('id', reportId)

  if (error) {
    throw new Error(error.message)
  }
}
