import { supabase } from './supabase'

export type EditableInspectionReportPayload = {
  reportData: Record<string, string>
  repairSections: unknown[]
  costSections: unknown[]
  blockVisibility: Record<string, boolean>
  estimateNoteVisibility: Record<string, boolean>
  repairSectionVisibility: Record<string, boolean>
  textBoxes: unknown[]
  equipmentRentalSettings: Record<string, unknown>
}

export type EditableInspectionReport = EditableInspectionReportPayload & {
  id: string
  reportName: string
  sourceDocumentName: string
  jobsQuotingItemId: string | null
  createdAt: string
  updatedAt: string
}

export type SaveEditableInspectionReportInput = EditableInspectionReportPayload & {
  id?: string | null
  jobsQuotingItemId?: string | null
  reportName: string
  sourceDocumentName?: string | null
}

type EditableInspectionReportRow = {
  id: string
  report_name: string
  source_document_name: string | null
  jobs_quoting_item_id: string | null
  report_data: Record<string, string>
  repair_sections: unknown[]
  cost_sections: unknown[]
  block_visibility: Record<string, boolean>
  estimate_note_visibility: Record<string, boolean>
  repair_section_visibility: Record<string, boolean>
  text_boxes: unknown[]
  equipment_rental_settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

const editableInspectionReportsSelect = `
  id,
  report_name,
  source_document_name,
  jobs_quoting_item_id,
  report_data,
  repair_sections,
  cost_sections,
  block_visibility,
  estimate_note_visibility,
  repair_section_visibility,
  text_boxes,
  equipment_rental_settings,
  created_at,
  updated_at
`

async function getCurrentUserId() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase.auth.getUser()

  if (error) {
    throw new Error(error.message)
  }

  if (!data.user) {
    throw new Error('Sign in to save editable reports.')
  }

  return data.user.id
}

function mapEditableInspectionReportRow(row: EditableInspectionReportRow): EditableInspectionReport {
  return {
    id: row.id,
    reportName: row.report_name,
    sourceDocumentName: row.source_document_name ?? row.report_name,
    jobsQuotingItemId: row.jobs_quoting_item_id,
    reportData: row.report_data ?? {},
    repairSections: row.repair_sections ?? [],
    costSections: row.cost_sections ?? [],
    blockVisibility: row.block_visibility ?? {},
    estimateNoteVisibility: row.estimate_note_visibility ?? {},
    repairSectionVisibility: row.repair_section_visibility ?? {},
    textBoxes: row.text_boxes ?? [],
    equipmentRentalSettings: row.equipment_rental_settings ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getEditableInspectionReports() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  await getCurrentUserId()
  const { data, error } = await supabase
    .from('editable_inspection_reports')
    .select(editableInspectionReportsSelect)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as EditableInspectionReportRow[]).map(mapEditableInspectionReportRow)
}

export async function getEditableInspectionReport(reportId: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  await getCurrentUserId()
  const { data, error } = await supabase
    .from('editable_inspection_reports')
    .select(editableInspectionReportsSelect)
    .eq('id', reportId)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapEditableInspectionReportRow(data as EditableInspectionReportRow)
}

export async function getEditableInspectionReportForJobsQuotingItem(jobsQuotingItemId: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  await getCurrentUserId()
  const { data, error } = await supabase
    .from('editable_inspection_reports')
    .select(editableInspectionReportsSelect)
    .eq('jobs_quoting_item_id', jobsQuotingItemId)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) {
    throw new Error(error.message)
  }

  const [row] = (data ?? []) as EditableInspectionReportRow[]
  return row ? mapEditableInspectionReportRow(row) : null
}

export async function saveEditableInspectionReport(input: SaveEditableInspectionReportInput) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const userId = await getCurrentUserId()
  const row = {
    ...(input.id ? { id: input.id } : {}),
    user_id: userId,
    jobs_quoting_item_id: input.jobsQuotingItemId ?? null,
    report_name: input.reportName.trim(),
    source_document_name: input.sourceDocumentName?.trim() || input.reportName.trim(),
    report_data: input.reportData,
    repair_sections: input.repairSections,
    cost_sections: input.costSections,
    block_visibility: input.blockVisibility,
    estimate_note_visibility: input.estimateNoteVisibility,
    repair_section_visibility: input.repairSectionVisibility,
    text_boxes: input.textBoxes,
    equipment_rental_settings: input.equipmentRentalSettings,
  }

  const { data, error } = await supabase
    .from('editable_inspection_reports')
    .upsert(row, { onConflict: 'id' })
    .select(editableInspectionReportsSelect)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapEditableInspectionReportRow(data as EditableInspectionReportRow)
}

export async function deleteEditableInspectionReport(reportId: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const userId = await getCurrentUserId()
  const { error } = await supabase
    .from('editable_inspection_reports')
    .delete()
    .eq('id', reportId)
    .eq('user_id', userId)

  if (error) {
    throw new Error(error.message)
  }
}
