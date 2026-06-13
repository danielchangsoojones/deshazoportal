import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { isConfigured } from '../lib/supabase'
import {
  deleteInspectionMenuItem,
  getInspectionMenuItems,
  getInspectionMenuItemBranches,
  normalizeDNumbers,
  searchInspectionMenuItems,
  upsertInspectionMenuItems,
  type InspectionMenuItem,
  type InspectionMenuItemSection,
} from '../lib/inspectionMenuItems'
import {
  deleteEditableInspectionDocument,
  getEditableInspectionDocuments,
  getEditableInspectionDocumentSignedUrl,
  uploadEditableInspectionDocument,
  type EditableInspectionDocument,
} from '../lib/editableInspectionDocuments'
import {
  getJobsQuotingItem,
  getJobsQuotingItemPdfUrl,
  type JobsQuotingItem,
} from '../lib/jobsQuoting'
import {
  getEditableInspectionReportsForJobNumber,
  saveEditableInspectionReport,
  type EditableInspectionReport,
  type EditableInspectionReportPayload,
} from '../lib/editableInspectionReports'
import { getUserDisplayNames } from '../lib/userTags'

type ReportData = Record<string, string>

type RepairLineItem = {
  id: string
  description: string
  internalCost?: string
  quantity: string
  customerPrice?: string
  rate: string
  margin: string
  source?: 'manual' | 'menu'
}

type CostSection = {
  id: string
  title: string
  lineItems: RepairLineItem[]
}

type RepairSection = {
  id: string
  title: string
  description?: string
  status: string
  lineItems: RepairLineItem[]
  costSections: CostSection[]
}

type RepairSectionTone = {
  sectionBackground: string
  sectionBorder: string
  statusBackground: string
  statusText: string
  statusIcon: string
}

type MenuItem = InspectionMenuItem

type MenuItemSection = InspectionMenuItemSection

type EditingMenuItem = {
  itemId: string
  userId?: string
  label: string
  description: string
  internalCost: string
  customerPrice: string
  dNumbers?: string[]
}

type PendingAddMenuLineItem = {
  collection: 'repair' | 'cost'
  sectionId: string
  lineItemId: string
}

type RelatedDocument = EditableInspectionDocument

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ')

type QuoteBlockVisibility = {
  contact: boolean
  scopeOfWork: boolean
  repairItems: boolean
  estimateSummary: boolean
  grandTotal: boolean
  notes: boolean
}

type EstimateNoteVisibility = {
  topNote: boolean
  bottomNote: boolean
}

type EstimateCostSectionVisibility = Record<string, boolean>

const storageKey = 'deshazo-editable-inspection-report'
const repairStorageKey = 'deshazo-editable-inspection-report-repairs'
const costStorageKey = 'deshazo-editable-inspection-report-costs'
const menuStorageKey = 'deshazo-editable-inspection-report-menu-items'
const blockVisibilityStorageKey = 'deshazo-editable-inspection-report-block-visibility'
const menuCollapsedStorageKey = 'deshazo-editable-inspection-report-menu-collapsed'
const estimateNoteVisibilityStorageKey = 'deshazo-editable-inspection-report-estimate-note-visibility'
const estimateCostSectionVisibilityStorageKey = 'deshazo-editable-inspection-report-estimate-cost-section-visibility'
const repairSectionVisibilityStorageKey = 'deshazo-editable-inspection-report-repair-section-visibility'
const equipmentRentalSettingsStorageKey = 'deshazo-editable-inspection-report-equipment-rental-settings'
const equipmentRentalDefaultMargin = 15
const printedPageWidthIn = 8.5
const printedPageHeightIn = 11
const printedPageMarginIn = 0.45
const runtimePageGapPx = 28
const databaseSyncIdleDelayMs = 650
const menuItemsUploadRefreshDurationMs = 60 * 1000
const menuItemsUploadRefreshIntervalMs = 5 * 1000
const menuSearchDebounceMs = 300
const defaultCraneIdentifier = 'D200235'
const masterServiceAgreementStableKey = 'built-in:master-service-agreement'
const estimateSummaryRuntimePageBreakIds = new Set([
  'estimate-summary-header',
  'estimate-top-note',
  'estimate-bottom-note',
  'notes',
])

const shouldSuppressRuntimePageBreak = (blockId: string) =>
  estimateSummaryRuntimePageBreakIds.has(blockId) || blockId.startsWith('repair-section-')

type EquipmentRentalSettings = {
  applyMarginToAll: boolean
  margin: string
}

type MenuItemsRefreshProgress = {
  active: boolean
  percent: number
}

const defaultEquipmentRentalSettings: EquipmentRentalSettings = {
  applyMarginToAll: false,
  margin: String(equipmentRentalDefaultMargin),
}

const defaultBlockVisibility: QuoteBlockVisibility = {
  contact: true,
  scopeOfWork: true,
  repairItems: true,
  estimateSummary: true,
  grandTotal: true,
  notes: true,
}

const defaultEstimateNoteVisibility: EstimateNoteVisibility = {
  topNote: false,
  bottomNote: false,
}

const legacyScopeOfWorkSample =
  'Remove 2 old Budgit 2 ton hoists and install (2) new 2 ton Harrington chain hoist model: NER2M020LD-LD specs are listed below for hoists.'

const additionalNotesFooter = `Jeffrey R. Melton
Assistant Service Manager
513-903-6405-C
DESHAZO
CRANES / SERVICE / AUTOMATION`

const defaultAdditionalNotesBody = `1. Quote is subject to DeSHAZO General Terms and Conditions, available at http://www.deshazo.com/terms.
2. Unless specified in Scope of Work, all work is to be performed during normal working hours, Monday- Friday.
3. Any additional work beyond scope provided will be billed on a time and material basis.
4. Quote assumes free & clear access to crane, runway, and all components to be serviced.
5. Quote does not include tax and freight.
6. If a man-lift or equipment is required, Customer to provide, or DeShazo can provide at cost plus 20%.
7. Quote is valid for 30 days.
8. Payment Terms: Net 30 days.
9. Field work schedule subject to availability and delivery of parts, if applicable.

DeSHAZO appreciates the opportunity to provide you with this quotation. If you have any questions, please feel free to email me at jmelton@deshazo.com`

const defaultAdditionalNotes = `${defaultAdditionalNotesBody}

${additionalNotesFooter}`

const defaultReport: ReportData = {
  logoName: 'DESHAZO',
  logoTagline: 'CRANES / SERVICE / AUTOMATION',
  branch: 'DESHAZO Branch: 018 Dallas',
  phone: 'Branch Contact Phone: ---',
  title: 'QUOTE PROPOSAL',
  summary: 'D200235 performed by: Calvin Waller',
  type: 'Type: Frequent',
  date: 'Date: Mar 24, 2026',
  structure: 'Structure: Gantry',
  description: 'Description: Portable Gantry',
  customer: 'Customer: Wabash',
  purchaseOrder: 'Purchase Order: S2P1215028',
  jobNumber: 'Job #: 0270357',
  location: 'Location: Building 2',
  customerAddress: 'Customer Address: 500 Commerce Blvd',
  manufacturerLabel: 'Manufacturer:',
  serialLabel: 'Serial Number:',
  capacityLabel: 'Capacity:',
  modelLabel: 'Model #:',
  manufacturerCrane: 'Crane: superior crane corporation',
  serialCrane: 'Crane: 02716',
  capacityCrane: 'Crane: 2 Ton',
  modelCrane: 'Crane: Na',
  manufacturerHoist: 'Hoist 1: Coffing',
  serialHoist: 'Hoist 1: 8PA596L',
  capacityHoist: 'Hoist 1: 1 Ton',
  modelHoist: 'Hoist 1: ELC2016.3',
  manufacturerHoist2: 'Hoist 2: ---',
  serialHoist2: 'Hoist 2: ---',
  capacityHoist2: 'Hoist 2: ---',
  modelHoist2: 'Hoist 2: ---',
  manufacturerHoist3: 'Hoist 3: ---',
  serialHoist3: 'Hoist 3: ---',
  capacityHoist3: 'Hoist 3: ---',
  modelHoist3: 'Hoist 3: ---',
  manufacturerHoist4: 'Hoist 4: ---',
  serialHoist4: 'Hoist 4: ---',
  capacityHoist4: 'Hoist 4: ---',
  modelHoist4: 'Hoist 4: ---',
  scopeOfWorkHeader: 'Scope of Work',
  scopeOfWork: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  sectionHeader: 'Repair Items',
  estimateTopNote: 'Top note: Add estimate context here.',
  estimateBottomNote: 'Bottom note: Add estimate terms here.',
  notesHeader: 'Additional Notes',
  notes: defaultAdditionalNotes,
}

const createDefaultRepairCostSections = (repairId: string): CostSection[] => [
  {
    id: `${repairId}-parts`,
    title: 'Parts',
    lineItems: [],
  },
  {
    id: `${repairId}-labor`,
    title: 'Labor',
    lineItems: [],
  },
]

const defaultRepairSections: RepairSection[] = [
  {
    id: 'under-running-bridge-wheels',
    title: 'Under Running Bridge: Wheels',
    description: 'Inspect wheel tread wear and flange condition. Confirm wheel bearings rotate freely under load.',
    status: 'Repair',
    lineItems: [],
    costSections: createDefaultRepairCostSections('under-running-bridge-wheels'),
  },
  {
    id: 'under-running-bridge-conductors',
    title: 'Under Running Bridge: Conductors/Festoon System',
    description: 'Replace damaged festoon cable carrier hardware. Verify conductor alignment through full bridge travel.',
    status: 'Repair',
    lineItems: [],
    costSections: createDefaultRepairCostSections('under-running-bridge-conductors'),
  },
  {
    id: 'hoist-1-festoons',
    title: 'Hoist 1: Festoons',
    description: 'Repair loose festoon trolley and check cable strain relief.',
    status: 'Repair',
    lineItems: [],
    costSections: createDefaultRepairCostSections('hoist-1-festoons'),
  },
]

const repairSectionTones: Record<'repair' | 'monitor', RepairSectionTone> = {
  repair: {
    sectionBackground: 'bg-[#f4e3e3]',
    sectionBorder: 'border-[#e1caca]',
    statusBackground: 'bg-[#efc9c9]',
    statusText: 'text-[#7d1515]',
    statusIcon: 'bg-[#af0f0f]',
  },
  monitor: {
    sectionBackground: 'bg-[#f6edbf]',
    sectionBorder: 'border-[#d8c56f]',
    statusBackground: 'bg-[#efe09a]',
    statusText: 'text-[#6f5a00]',
    statusIcon: 'bg-[#a88a00]',
  },
}

const getRepairSectionTone = (status: string) =>
  status.toLowerCase().includes('monitor') ? repairSectionTones.monitor : repairSectionTones.repair

const defaultCostSections: CostSection[] = [
  {
    id: 'equipment-rental',
    title: 'Equipment Rental',
    lineItems: [],
  },
  {
    id: 'freight',
    title: 'Freight',
    lineItems: [],
  },
]

const defaultEstimateCostSectionVisibility: EstimateCostSectionVisibility = defaultCostSections.reduce(
  (visibility, section) => ({ ...visibility, [section.id]: true }),
  {},
)

const cells = [
  ['purchaseOrder', 'jobNumber', 'location', 'customerAddress'],
  ['manufacturerLabel', 'serialLabel', 'capacityLabel', 'modelLabel'],
  ['manufacturerCrane', 'serialCrane', 'capacityCrane', 'modelCrane'],
  ['manufacturerHoist', 'serialHoist', 'capacityHoist', 'modelHoist'],
  ['manufacturerHoist2', 'serialHoist2', 'capacityHoist2', 'modelHoist2'],
  ['manufacturerHoist3', 'serialHoist3', 'capacityHoist3', 'modelHoist3'],
  ['manufacturerHoist4', 'serialHoist4', 'capacityHoist4', 'modelHoist4'],
]

const hasReportCellValue = (value: string | undefined) => {
  const trimmedValue = value?.trim() ?? ''
  if (!trimmedValue) return false

  const valueWithoutLabel = trimmedValue.includes(':')
    ? trimmedValue.split(':').slice(1).join(':').trim()
    : trimmedValue

  return Boolean(valueWithoutLabel && !/^[-–—]+$/.test(valueWithoutLabel))
}

const shouldShowReportTableRow = (row: string[], rowIndex: number, report: ReportData) => {
  if (rowIndex <= 3) return true
  return row.some((fieldId) => hasReportCellValue(report[fieldId]))
}

const menuItemsSectionTitle = 'Menu Items'
const defaultMenuItemSections: MenuItemSection[] = [{ title: menuItemsSectionTitle, items: [] }]

const createManualLineItem = (id: string, description: string): RepairLineItem => ({
  id,
  description,
  internalCost: '0.00',
  quantity: '1',
  customerPrice: '0.00',
  rate: '0.00',
  margin: '0',
  source: 'manual',
})

const createMenuLineItem = (id: string, item: MenuItem): RepairLineItem => {
  const internalCost = item.internalCost ?? item.rate
  const customerPrice = item.customerPrice ?? item.rate

  return {
    id,
    description: item.description,
    internalCost,
    quantity: '1',
    customerPrice,
    rate: internalCost,
    margin: getUnitMargin(parseMoney(internalCost), parseMoney(customerPrice)).toFixed(2),
    source: 'menu',
  }
}

const shouldShowAddMenuItemTag = (lineItem: RepairLineItem) =>
  lineItem.source === 'manual'
  && Boolean(lineItem.description.trim())
  && parseMoney(lineItem.customerPrice ?? lineItem.rate) > 0

const shouldClearPlaceholderDescription = (description: string) =>
  ['Add repair detail here.', 'Add line item here.'].includes(description.trim())

const createMenuItemId = () => globalThis.crypto?.randomUUID?.() ?? `menu-${Date.now()}-${Math.random()}`

const getCraneIdentifierFromReport = (report: ReportData) => {
  const reportText = [
    report.summary,
    report.description,
    report.manufacturerCrane,
    report.serialCrane,
    report.modelCrane,
    ...Object.values(report),
  ].join(' ')
  const match = reportText.match(/\bD[\s-]*\d{3,}\b/i)
  return match ? match[0].replace(/[\s-]+/g, '').toUpperCase() : defaultCraneIdentifier
}

const normalizeDataKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

const unwrapExtractionValue = (value: unknown): unknown => {
  if (value && typeof value === 'object' && 'value' in value) {
    return (value as { value?: unknown }).value
  }

  return value
}

const getExtractedValue = (value: unknown, keys: string[]): unknown => {
  const normalizedKeys = new Set(keys.map(normalizeDataKey))

  const visit = (currentValue: unknown): unknown => {
    if (Array.isArray(currentValue)) {
      for (const item of currentValue) {
        const match = visit(item)
        if (match !== undefined) return match
      }
      return undefined
    }

    if (currentValue && typeof currentValue === 'object') {
      for (const [key, nextValue] of Object.entries(currentValue)) {
        if (normalizedKeys.has(normalizeDataKey(key))) return unwrapExtractionValue(nextValue)
      }

      for (const nextValue of Object.values(currentValue)) {
        const match = visit(nextValue)
        if (match !== undefined) return match
      }
    }

    return undefined
  }

  return visit(value)
}

const getExtractedText = (value: unknown, keys: string[]) => {
  const extractedValue = getExtractedValue(value, keys)
  if (typeof extractedValue === 'string') return extractedValue.trim()
  if (typeof extractedValue === 'number') return String(extractedValue)
  return ''
}

const getTopLevelExtractedText = (value: unknown, keys: string[]) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''

  const normalizedKeys = new Set(keys.map(normalizeDataKey))
  for (const [key, nextValue] of Object.entries(value)) {
    if (!normalizedKeys.has(normalizeDataKey(key))) continue

    const extractedValue = unwrapExtractionValue(nextValue)
    if (typeof extractedValue === 'string') return extractedValue.trim()
    if (typeof extractedValue === 'number') return String(extractedValue)
    return ''
  }

  return ''
}

const getExtractedArray = (value: unknown, keys: string[]) => {
  const extractedValue = getExtractedValue(value, keys)
  return Array.isArray(extractedValue) ? extractedValue : []
}

const removeReportValueLabel = (value: string) =>
  value.includes(':') ? value.split(':').slice(1).join(':').trim() : value.trim()

const ensureDNumberPrefix = (value: string) => {
  const trimmedValue = value.trimStart()
  if (!trimmedValue) return 'D'
  if (/^d/i.test(trimmedValue)) return `D${trimmedValue.slice(1)}`
  return `D${trimmedValue}`
}

const ensureJobNumberPrefix = (value: string) => {
  const normalizedValue = value.trim()
  const withoutLabel = normalizedValue
    .replace(/^job\s*#\s*:?\s*/i, '')
    .replace(/^#\s*:?\s*/i, '')

  return `Job #: ${withoutLabel}`
}

const normalizeProtectedReportField = (id: string, value: string) => {
  if (id === 'summary') return ensureDNumberPrefix(value)
  if (id === 'jobNumber') return ensureJobNumberPrefix(value)
  return value
}

const getDNumberFromReport = (reportData: ReportData | Record<string, string>) => {
  const reportText = [reportData.summary, reportData.description, ...Object.values(reportData)].join(' ')
  const match = reportText.match(/\bD[\s-]*\d[A-Z0-9]{2,}\b/i)
  return match ? match[0].replace(/[\s-]+/g, '').toUpperCase() : ''
}

const getJobNumberDisplayFromReport = (reportData: ReportData | Record<string, string>) =>
  removeReportValueLabel(reportData.jobNumber ?? '').replace(/^#\s*/, '').trim() || '---'

const formatBranchLabel = (branch: string) =>
  branch
    .trim()
    .replace(/^branch[_\s-]*/i, 'Branch ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')

const getNormalizedColumnDNumber = (value: string) => {
  const withoutLabel = removeReportValueLabel(value)
  return withoutLabel ? ensureDNumberPrefix(withoutLabel).replace(/[\s-]+/g, '').toUpperCase() : ''
}

const replaceReportSummaryDNumber = (summary: string, dNumber: string) => {
  const normalizedDNumber = getNormalizedColumnDNumber(dNumber)
  if (!normalizedDNumber) return summary

  const normalizedSummary = summary.trim()
  if (!normalizedSummary) return normalizedDNumber
  if (/\bD[\s-]*\d[A-Z0-9]{2,}\b/i.test(normalizedSummary)) {
    return normalizedSummary.replace(/\bD[\s-]*\d[A-Z0-9]{2,}\b/i, normalizedDNumber)
  }

  return `${normalizedDNumber} ${normalizedSummary}`
}

const applyQuoteItemColumnIdentifiersToReport = (reportData: ReportData, item: JobsQuotingItem) => ({
  ...reportData,
  summary: item.dNumber ? replaceReportSummaryDNumber(reportData.summary, item.dNumber) : reportData.summary,
  jobNumber: item.jobNumber ? ensureJobNumberPrefix(item.jobNumber) : reportData.jobNumber,
})

const getEditableReportDisplayName = (
  reportData: ReportData | Record<string, string>,
  fallbackName: string,
) => {
  const dNumber = getDNumberFromReport(reportData)
  const jobNumber = removeReportValueLabel(reportData.jobNumber ?? '')
  const nameParts = [dNumber, jobNumber ? `Job #${jobNumber.replace(/^#\s*/, '')}` : '']
    .filter(Boolean)

  return nameParts.length > 0 ? nameParts.join(' - ') : fallbackName
}

const formatReportValue = (label: string, value: string, fallback = '---') =>
  `${label}: ${value.trim() || fallback}`

const formatInspectionDate = (value: string) => {
  if (!value.trim()) return ''
  const parsedDate = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsedDate.getTime())) return value

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsedDate)
}

const formatMenuItemCreatedDate = (value?: string) => {
  if (!value?.trim()) return ''
  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return ''

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsedDate)
}

const getMenuItemCreatedDateLabel = (item: MenuItem) =>
  formatMenuItemCreatedDate(item.createdAt ?? item.updatedAt)

const isMenuItemDecayed = (item: MenuItem) => {
  const dateValue = item.createdAt ?? item.updatedAt
  if (!dateValue?.trim()) return false

  const createdDate = new Date(dateValue)
  if (Number.isNaN(createdDate.getTime())) return false

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  return createdDate < sixMonthsAgo
}

const buildReportFromJobsQuotingItem = (item: JobsQuotingItem): ReportData => {
  const data = item.extractionData
  const dNumber = getTopLevelExtractedText(data, ['d_number', 'dNumber', 'D Number', 'D-Number', 'D Number identifier'])
  const branch = getTopLevelExtractedText(data, ['branch', 'deshazo_branch', 'deshazoBranch'])
  const branchContactPhone = getTopLevelExtractedText(data, ['branch_contact_phone', 'branchContactPhone', 'Branch Contact Phone'])
  const jobNumber = getTopLevelExtractedText(data, ['job_number', 'jobNumber', 'Job Number', 'Job #'])
  const performedBy = getTopLevelExtractedText(data, ['performed_by', 'performedBy', 'inspector', 'technician'])
  const inspectionType = getTopLevelExtractedText(data, ['inspection_type', 'inspectionType', 'type'])
  const inspectionDate = getTopLevelExtractedText(data, ['inspection_date', 'inspectionDate', 'date'])
  const structure = getTopLevelExtractedText(data, ['structure', 'Structure'])
  const description = getTopLevelExtractedText(data, ['description', 'Description'])
  const customer = getTopLevelExtractedText(data, ['customer', 'Customer'])
  const purchaseOrder = getTopLevelExtractedText(data, ['purchase_order', 'purchaseOrder', 'Purchase Order'])
  const location = getTopLevelExtractedText(data, ['location', 'Location', 'service_location', 'serviceLocation', 'Service Location'])
  const customerAddress = getTopLevelExtractedText(data, ['customer_address', 'customerAddress', 'Customer Address'])
  const customerContactName = getTopLevelExtractedText(data, ['customer_contact_name', 'customerContactName', 'contact_name', 'contactName', 'Customer Contact Name'])
  const customerContactEmail = getTopLevelExtractedText(data, ['customer_contact_email', 'customerContactEmail', 'contact_email', 'contactEmail', 'Customer Contact Email'])
  const customerContactPhone = getTopLevelExtractedText(data, ['customer_contact_phone', 'customerContactPhone', 'contact_phone', 'contactPhone', 'Customer Contact Phone'])
  const manufacturerCrane = getTopLevelExtractedText(data, ['manufacturer_crane', 'manufacturerCrane', 'manufacturer', 'Manufacturer'])
  const serialCrane = getTopLevelExtractedText(data, ['serial_crane', 'serialCrane', 'serial_number', 'serialNumber', 'Serial Number'])
  const capacityCrane = getTopLevelExtractedText(data, ['capacity_crane', 'capacityCrane', 'capacity', 'Capacity'])
  const modelCrane = getTopLevelExtractedText(data, ['model_crane', 'modelCrane', 'model', 'model_number', 'modelNumber', 'Model #'])
  const manufacturerHoist1 = getTopLevelExtractedText(data, ['manufacturer_hoist_1', 'manufacturerHoist1', 'hoist', 'hoist_1', 'hoist1', 'Hoist 1'])
  const serialHoist1 = getTopLevelExtractedText(data, ['serial_hoist_1', 'serialHoist1'])
  const capacityHoist1 = getTopLevelExtractedText(data, ['capacity_hoist_1', 'capacityHoist1'])
  const modelHoist1 = getTopLevelExtractedText(data, ['model_hoist_1', 'modelHoist1'])
  const manufacturerHoist2 = getTopLevelExtractedText(data, ['manufacturer_hoist_2', 'manufacturerHoist2'])
  const serialHoist2 = getTopLevelExtractedText(data, ['serial_hoist_2', 'serialHoist2'])
  const capacityHoist2 = getTopLevelExtractedText(data, ['capacity_hoist_2', 'capacityHoist2'])
  const modelHoist2 = getTopLevelExtractedText(data, ['model_hoist_2', 'modelHoist2'])
  const manufacturerHoist3 = getTopLevelExtractedText(data, ['manufacturer_hoist_3', 'manufacturerHoist3'])
  const serialHoist3 = getTopLevelExtractedText(data, ['serial_hoist_3', 'serialHoist3'])
  const capacityHoist3 = getTopLevelExtractedText(data, ['capacity_hoist_3', 'capacityHoist3'])
  const modelHoist3 = getTopLevelExtractedText(data, ['model_hoist_3', 'modelHoist3'])
  const manufacturerHoist4 = getTopLevelExtractedText(data, ['manufacturer_hoist_4', 'manufacturerHoist4'])
  const serialHoist4 = getTopLevelExtractedText(data, ['serial_hoist_4', 'serialHoist4'])
  const capacityHoist4 = getTopLevelExtractedText(data, ['capacity_hoist_4', 'capacityHoist4'])
  const modelHoist4 = getTopLevelExtractedText(data, ['model_hoist_4', 'modelHoist4'])
  return {
    ...defaultReport,
    branch: formatReportValue('DESHAZO Branch', branch, '---'),
    phone: formatReportValue('Branch Contact Phone', branchContactPhone, '---'),
    summary: [dNumber || '---', performedBy ? `performed by: ${performedBy}` : ''].filter(Boolean).join(' '),
    type: formatReportValue('Type', inspectionType, '---'),
    date: formatReportValue('Date', formatInspectionDate(inspectionDate), '---'),
    structure: formatReportValue('Structure', structure, '---'),
    description: formatReportValue('Description', description, '---'),
    customer: formatReportValue('Customer', customer, '---'),
    purchaseOrder: formatReportValue('Purchase Order', purchaseOrder, '---'),
    jobNumber: formatReportValue('Job #', jobNumber, '---'),
    location: formatReportValue('Location', location, '---'),
    customerAddress: formatReportValue('Customer Address', customerAddress, '---'),
    manufacturerCrane: formatReportValue('Crane', manufacturerCrane, '---'),
    serialCrane: formatReportValue('Crane', serialCrane, '---'),
    capacityCrane: formatReportValue('Crane', capacityCrane, '---'),
    modelCrane: formatReportValue('Crane', modelCrane, '---'),
    manufacturerHoist: formatReportValue('Hoist 1', manufacturerHoist1, '---'),
    serialHoist: formatReportValue('Hoist 1', serialHoist1, '---'),
    capacityHoist: formatReportValue('Hoist 1', capacityHoist1, '---'),
    modelHoist: formatReportValue('Hoist 1', modelHoist1, '---'),
    manufacturerHoist2: formatReportValue('Hoist 2', manufacturerHoist2, '---'),
    serialHoist2: formatReportValue('Hoist 2', serialHoist2, '---'),
    capacityHoist2: formatReportValue('Hoist 2', capacityHoist2, '---'),
    modelHoist2: formatReportValue('Hoist 2', modelHoist2, '---'),
    manufacturerHoist3: formatReportValue('Hoist 3', manufacturerHoist3, '---'),
    serialHoist3: formatReportValue('Hoist 3', serialHoist3, '---'),
    capacityHoist3: formatReportValue('Hoist 3', capacityHoist3, '---'),
    modelHoist3: formatReportValue('Hoist 3', modelHoist3, '---'),
    manufacturerHoist4: formatReportValue('Hoist 4', manufacturerHoist4, '---'),
    serialHoist4: formatReportValue('Hoist 4', serialHoist4, '---'),
    capacityHoist4: formatReportValue('Hoist 4', capacityHoist4, '---'),
    modelHoist4: formatReportValue('Hoist 4', modelHoist4, '---'),
    contactName: customerContactName,
    contactEmail: customerContactEmail,
    contactPhone: customerContactPhone,
    scopeOfWork: '',
    notes: defaultAdditionalNotes,
  }
}

const getTextFromRecord = (value: unknown, keys: string[]) =>
  value && typeof value === 'object' ? getExtractedText(value, keys) : ''

const getDisplayValueFromLabeledReportValue = (value: string) =>
  value.includes(':') ? value.split(':').slice(1).join(':').trim() : value.trim()

const cleanInspectionLabel = (value: string, reportData?: Record<string, unknown>) => {
  const structureValue = reportData?.structure
  const structureText = typeof structureValue === 'string' ? structureValue : ''
  const structure = getDisplayValueFromLabeledReportValue(structureText) || 'Structure'

  return value
    .replace(/\{\{\s*(?:Trolley\s+)?Hoist\s*<\s*index\s*>\s*\}\}/gi, 'Trolley Hoist')
    .replace(/\{\{\s*craneStructureType\.name\s*\}\}/gi, structure)
    .replace(/\bcraneStructureType\.name\b/gi, structure)
    .replace(/\{\{\s*([^{}<>]+?)\s*\}\}/g, '$1')
    .replace(/\s*:\s*/g, ': ')
    .replace(/\s+/g, ' ')
    .trim()
}

const cleanRepairSectionTitle = (title: string, reportData?: Record<string, unknown>) =>
  cleanInspectionLabel(title, reportData) || title

const buildRepairSectionsFromJobsQuotingItem = (item: JobsQuotingItem): RepairSection[] => {
  const data = item.extractionData
  const extractedItems = [
    ...getExtractedArray(data, ['repair_items', 'repairItems', 'action_items', 'actionItems']).map((extractedItem) => ({
      extractedItem,
      defaultStatus: 'Repair',
    })),
    ...getExtractedArray(data, [
      'safety_and_monitor_items',
      'safetyMonitorItems',
      'safety_monitor_items',
      'safety_items',
      'safetyItems',
    ]).map((extractedItem) => ({
      extractedItem,
      defaultStatus: 'Monitor',
    })),
  ]

  const sections = extractedItems
    .map(({ extractedItem, defaultStatus }, index): RepairSection | null => {
      if (!extractedItem || typeof extractedItem !== 'object') return null

      const sectionName = getTextFromRecord(extractedItem, ['section_name', 'sectionName', 'section'])
      const componentName = getTextFromRecord(extractedItem, [
        'component_name',
        'componentName',
        'component',
        'title',
        'area',
        'category',
        'item',
        'name',
      ])
      const title =
        cleanRepairSectionTitle(
          [sectionName, componentName].filter(Boolean).join(': '),
          Object.keys(item.reportData).length > 0 ? item.reportData : item.extractionData,
        ) ||
        `Inspection Item ${index + 1}`
      const status = getTextFromRecord(extractedItem, ['severity', 'status', 'type', 'condition']) || defaultStatus
      const note =
        getTextFromRecord(extractedItem, ['note', 'notes', 'description', 'comment', 'recommended_corrective_action', 'recommendedCorrectiveAction']) ||
        title

      return {
        id: `jobs-quoting-${item.id}-${index}`,
        title,
        description: note === title ? '' : note,
        status,
        lineItems: [],
        costSections: createDefaultRepairCostSections(`jobs-quoting-${item.id}-${index}`),
      }
    })
    .filter((section): section is RepairSection => Boolean(section))

  if (sections.length > 0) return sections

  return [
    {
      id: `jobs-quoting-${item.id}-review`,
      title: item.documentName,
      description: 'Review the saved split inspection PDF and add quote line items for the listed repair/safety scope.',
      status: item.safetyCount > item.repairCount ? 'Monitor' : 'Repair',
      lineItems: [],
      costSections: createDefaultRepairCostSections(`jobs-quoting-${item.id}-review`),
    },
  ]
}

const getDocumentNameFromFile = (fileName: string) =>
  fileName.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim() || 'PDF document'

const getUploadDescription = (source: string, relativePath?: string) =>
  relativePath
    ? `Uploaded from ${source}: ${relativePath}`
    : `Uploaded from ${source}.`

const escapePdfText = (text: string) => text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

const createSimplePdfFile = (fileName: string, title: string, lines: string[]) => {
  const contentLines = [
    'BT',
    '/F1 18 Tf',
    '72 760 Td',
    `(${escapePdfText(title)}) Tj`,
    '/F1 11 Tf',
    '0 -34 Td',
    ...lines.flatMap((line) => [`(${escapePdfText(line)}) Tj`, '0 -18 Td']),
    'ET',
  ]
  const content = contentLines.join('\n')
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]

  objects.forEach((object) => {
    offsets.push(pdf.length)
    pdf += object
  })

  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return new File([new Blob([pdf], { type: 'application/pdf' })], fileName, { type: 'application/pdf' })
}

type CombinedReportPdfSource = {
  dNumber: string
  reportName: string
  payload: EditableInspectionReportPayload
}

const getRepairCostSectionVisibilityKey = (repairSectionId: string, costSectionId: string) =>
  `repair-cost-section:${repairSectionId}:${costSectionId}`

const isRepairCostSectionVisible = (
  repairSectionVisibility: Record<string, boolean>,
  repairSectionId: string,
  costSectionId: string,
) => repairSectionVisibility[getRepairCostSectionVisibilityKey(repairSectionId, costSectionId)] !== false

const getEstimateCostSectionVisibilityFromSections = (costSections: CostSection[]) => {
  const sectionIds = new Set(costSections.map((section) => section.id))

  return defaultCostSections.reduce<EstimateCostSectionVisibility>(
    (visibility, section) => ({
      ...visibility,
      [section.id]: sectionIds.has(section.id),
    }),
    {},
  )
}

const getVisibleRepairSections = (
  repairSections: RepairSection[],
  repairSectionVisibility: Record<string, boolean>,
) =>
  repairSections
    .filter((section) => repairSectionVisibility[section.id] !== false)
    .map((section) => ({
      ...section,
      costSections: section.costSections.filter((costSection) =>
        isRepairCostSectionVisible(repairSectionVisibility, section.id, costSection.id),
      ),
    }))

const hasLineItems = (lineItems: RepairLineItem[] | undefined) =>
  Array.isArray(lineItems) && lineItems.length > 0

const hasPrintableRepairSectionLineItems = (section: RepairSection) =>
  section.costSections.some((costSection) => hasLineItems(costSection.lineItems))

const getPrintableRepairSections = (repairSections: RepairSection[]) =>
  repairSections
    .map((section) => ({
      ...section,
      costSections: section.costSections.filter((costSection) => hasLineItems(costSection.lineItems)),
    }))
    .filter(hasPrintableRepairSectionLineItems)

const getPrintableCostSections = (costSections: CostSection[]) =>
  costSections.filter((section) => hasLineItems(section.lineItems))

const getVisibleEstimateCostSections = (
  costSections: CostSection[],
  estimateCostSectionVisibility: EstimateCostSectionVisibility,
) => costSections.filter((section) => estimateCostSectionVisibility[section.id] !== false)

const getPayloadEstimateCostSectionVisibility = (
  payload: EditableInspectionReportPayload,
  costSections: CostSection[],
) => ({
  ...defaultEstimateCostSectionVisibility,
  ...getEstimateCostSectionVisibilityFromSections(costSections),
  ...payload.estimateCostSectionVisibility,
  ...payload.pageLayoutVisibility?.estimateCostSectionVisibility,
})

const escapeHtml = (value: string | number) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const splitAdditionalNotesFooter = (value: string) => {
  const normalizedValue = value.trimEnd()
  if (!normalizedValue.endsWith(additionalNotesFooter)) {
    return { body: value, hasFooter: false }
  }

  return {
    body: normalizedValue.slice(0, -additionalNotesFooter.length).trimEnd(),
    hasFooter: true,
  }
}

const renderAdditionalNotesHtml = (value: string) => {
  const { body, hasFooter } = splitAdditionalNotesFooter(value || '---')

  return `
    ${body ? `<p>${escapeHtml(body)}</p>` : ''}
    ${hasFooter ? `
      <div class="notes-footer">
        <div class="notes-footer-name">Jeffrey R. Melton</div>
        <div class="notes-footer-title">Assistant Service Manager</div>
        <div class="notes-footer-phone">513-903-6405-C</div>
        <img class="notes-footer-logo" src="/deshazo-logo.png" alt="DESHAZO" />
        <div class="notes-footer-tagline">
          <span>CRANES</span><strong>/</strong><span>SERVICE</span><strong>/</strong><span>AUTOMATION</span>
        </div>
      </div>
    ` : ''}
  `
}

const sanitizePdfText = (text: string) =>
  text
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, '')

const wrapPdfLine = (line: string, maxLength = 92) => {
  const words = sanitizePdfText(line).split(/\s+/)
  const wrappedLines: string[] = []
  let currentLine = ''

  words.forEach((word) => {
    if (!word) return
    if (!currentLine) {
      currentLine = word
      return
    }
    if (`${currentLine} ${word}`.length <= maxLength) {
      currentLine = `${currentLine} ${word}`
      return
    }
    wrappedLines.push(currentLine)
    currentLine = word
  })

  if (currentLine) wrappedLines.push(currentLine)
  return wrappedLines.length > 0 ? wrappedLines : ['']
}

const chunkPdfLines = (lines: string[], maxLinesPerPage = 48) => {
  const pages: string[][] = []
  let currentPage: string[] = []

  lines.forEach((line) => {
    const wrappedLines = line ? wrapPdfLine(line) : ['']
    wrappedLines.forEach((wrappedLine) => {
      if (currentPage.length >= maxLinesPerPage) {
        pages.push(currentPage)
        currentPage = []
      }
      currentPage.push(wrappedLine)
    })
  })

  if (currentPage.length > 0) pages.push(currentPage)
  return pages
}

const getPdfLineItemSummary = (lineItem: RepairLineItem, sectionId?: string, settings = defaultEquipmentRentalSettings) => {
  const customerAmount = sectionId
    ? getCostCustomerLineAmount(sectionId, lineItem, settings)
    : getCustomerLineAmount(lineItem)
  return [
    lineItem.description,
    `Qty ${lineItem.quantity || '1'}`,
    `Customer ${formatMoney(customerAmount)}`,
  ].join(' | ')
}

const getReportPdfLines = (source: CombinedReportPdfSource) => {
  const { payload } = source
  const reportData = payload.reportData
  const repairSections = getPrintableRepairSections(getVisibleRepairSections(
    normalizeRepairSections(payload.repairSections as RepairSection[]),
    payload.repairSectionVisibility,
  ))
  const normalizedCostSections = normalizeEstimateCostSections(payload.costSections as CostSection[])
  const costSections = getPrintableCostSections(getVisibleEstimateCostSections(
    normalizedCostSections,
    getPayloadEstimateCostSectionVisibility(payload, normalizedCostSections),
  ))
  const equipmentSettings = {
    ...defaultEquipmentRentalSettings,
    ...payload.equipmentRentalSettings,
  } as EquipmentRentalSettings
  const lines = [
    `D Number: ${source.dNumber}`,
    `Report: ${source.reportName}`,
    `Job Number: ${getJobNumberDisplayFromReport(reportData)}`,
    '',
    reportData.customer,
    reportData.date,
    reportData.summary,
    reportData.type,
    reportData.structure,
    reportData.description,
    reportData.location,
    reportData.customerAddress,
    reportData.purchaseOrder,
    '',
    `Contact Name: ${reportData.contactName || '---'}`,
    `Email: ${reportData.contactEmail || '---'}`,
    `Phone: ${reportData.contactPhone || '---'}`,
    '',
    reportData.scopeOfWorkHeader || 'Scope of Work',
    reportData.scopeOfWork || '---',
    '',
    'Repair Items',
  ]

  repairSections.forEach((section) => {
    const repairLabel = [section.title, section.description].filter((value) => value?.trim()).join(' - ')
    lines.push('', `${repairLabel} (${section.status || 'Repair'})`)
    section.costSections.forEach((costSection) => {
      lines.push(costSection.title)
      costSection.lineItems.forEach((lineItem) => {
        lines.push(getPdfLineItemSummary(lineItem))
      })
    })
  })

  lines.push('', 'Estimate Summary')
  costSections.forEach((section) => {
    lines.push('', section.title)
    section.lineItems.forEach((lineItem) => {
      lines.push(getPdfLineItemSummary(lineItem, section.id, equipmentSettings))
    })
  })

  const repairTotal = repairSections.reduce(
    (total, section) => total + getRepairSectionCustomerTotal(section),
    0,
  )
  const costTotal = costSections.reduce(
    (total, section) =>
      total + section.lineItems.reduce(
        (sectionTotal, lineItem) => sectionTotal + getCostCustomerLineAmount(section.id, lineItem, equipmentSettings),
        0,
      ),
    0,
  )

  lines.push('', `Grand Total: ${formatMoney(repairTotal + costTotal)}`, '', reportData.notesHeader || 'Additional Notes', reportData.notes || '---')
  return lines
}

const createCombinedReportsPdfBlob = (sources: CombinedReportPdfSource[]) => {
  const pageLineSets = sources.flatMap((source) =>
    chunkPdfLines(getReportPdfLines(source)).map((lines, pageIndex) => ({
      title: `${source.dNumber} - ${source.reportName}${pageIndex > 0 ? ` (continued ${pageIndex + 1})` : ''}`,
      lines,
    })),
  )

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Kids [${pageLineSets.map((_, index) => `${3 + index} 0 R`).join(' ')}] /Count ${pageLineSets.length} >>\nendobj\n`,
  ]
  const contentObjects: string[] = []
  const fontObjectId = 3 + pageLineSets.length * 2

  pageLineSets.forEach((page, index) => {
    const pageObjectId = 3 + index
    const contentObjectId = 3 + pageLineSets.length + index
    const contentLines = [
      'BT',
      '/F1 13 Tf',
      '54 760 Td',
      `(${escapePdfText(sanitizePdfText(page.title))}) Tj`,
      '/F1 9 Tf',
      '0 -22 Td',
      ...page.lines.flatMap((line) => [`(${escapePdfText(sanitizePdfText(line))}) Tj`, '0 -12 Td']),
      'ET',
    ]
    const content = contentLines.join('\n')

    objects.push(`${pageObjectId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>\nendobj\n`)
    contentObjects.push(`${contentObjectId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`)
  })

  objects.push(...contentObjects)
  objects.push(`${fontObjectId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`)

  let pdf = '%PDF-1.4\n'
  const offsets = [0]

  objects.forEach((object) => {
    offsets.push(pdf.length)
    pdf += object
  })

  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return new Blob([pdf], { type: 'application/pdf' })
}

const getTemplateValue = (value: string | undefined) => escapeHtml(value?.trim() || '---')

const getTemplateReportCell = (label: string, value: string | undefined) => `
  <div class="info-cell">
    <div class="cell-label">${escapeHtml(label)}</div>
    <div class="cell-value">${getTemplateValue(removeReportValueLabel(value ?? ''))}</div>
  </div>
`

const getTemplateLineItemRows = (
  lineItems: RepairLineItem[],
  getCustomerAmount: (lineItem: RepairLineItem) => number,
) =>
  lineItems
    .map((lineItem) => `
      <tr>
        <td>${escapeHtml(lineItem.description || '---')}</td>
        <td class="qty">${escapeHtml(lineItem.quantity || '1')}</td>
        <td class="money">${formatMoney(getCustomerUnitPrice(lineItem))}</td>
        <td class="money">${formatMoney(getCustomerAmount(lineItem))}</td>
      </tr>
    `)
    .join('')

const getCombinedReportTemplateHtml = (sources: CombinedReportPdfSource[]) => {
  const reportMarkup = sources.map((source) => {
    const reportData = normalizeReport(source.payload.reportData)
    const repairSections = getPrintableRepairSections(getVisibleRepairSections(
      normalizeRepairSections(source.payload.repairSections as RepairSection[]),
      source.payload.repairSectionVisibility,
    ))
    const normalizedCostSections = normalizeEstimateCostSections(source.payload.costSections as CostSection[])
    const costSections = getPrintableCostSections(getVisibleEstimateCostSections(
      normalizedCostSections,
      getPayloadEstimateCostSectionVisibility(source.payload, normalizedCostSections),
    ))
    const equipmentSettings = {
      ...defaultEquipmentRentalSettings,
      ...source.payload.equipmentRentalSettings,
    } as EquipmentRentalSettings
    const repairTotal = repairSections.reduce(
      (total, section) => total + getRepairSectionCustomerTotal(section),
      0,
    )
    const costTotal = costSections.reduce(
      (total, section) =>
        total + section.lineItems.reduce(
          (sectionTotal, lineItem) =>
            sectionTotal + getCostCustomerLineAmount(section.id, lineItem, equipmentSettings),
          0,
        ),
      0,
    )
    const repairMarkup = repairSections
      .map((section) => {
        const repairCostMarkup = section.costSections
          .map((costSection) => `
            <div class="nested-title">${escapeHtml(costSection.title)}</div>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Customer Price</th>
                  <th>Total Customer Price</th>
                </tr>
              </thead>
              <tbody>
                ${getTemplateLineItemRows(costSection.lineItems, getCustomerLineAmount)}
                <tr class="subtotal">
                  <td colspan="3">${escapeHtml(costSection.title)} Subtotal</td>
                  <td class="money">${formatMoney(costSection.lineItems.reduce((total, lineItem) => total + getCustomerLineAmount(lineItem), 0))}</td>
                </tr>
              </tbody>
            </table>
          `)
          .join('')

        return `
          <section class="quote-section repair-section">
          <div class="section-title">
            <span>${escapeHtml([section.title, section.description].filter((value) => value?.trim()).join(' - '))}</span>
            <span class="status">${escapeHtml(section.status || 'Repair')}</span>
          </div>
          ${repairCostMarkup}
          <table>
            <tbody>
              <tr class="subtotal repair-total">
                <td colspan="3">Repair Item Total</td>
                <td class="money">${formatMoney(getRepairSectionCustomerTotal(section))}</td>
              </tr>
            </tbody>
          </table>
        </section>
        `
      })
      .join('')

    const costMarkup = costSections
      .map((section) => `
        <section class="quote-section">
          <div class="section-title estimate-title">${escapeHtml(section.title)}</div>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Customer Price</th>
                <th>Total Customer Price</th>
              </tr>
            </thead>
            <tbody>
              ${getTemplateLineItemRows(section.lineItems, (lineItem) =>
                getCostCustomerLineAmount(section.id, lineItem, equipmentSettings)
              )}
              <tr class="subtotal">
                <td colspan="3">Subtotal</td>
                <td class="money">${formatMoney(section.lineItems.reduce(
                  (total, lineItem) => total + getCostCustomerLineAmount(section.id, lineItem, equipmentSettings),
                  0,
                ))}</td>
              </tr>
            </tbody>
          </table>
        </section>
      `)
      .join('')

    return `
      <article class="report-page">
        <header class="report-header">
          <div class="brand-block">
            <div class="brand">${escapeHtml(reportData.logoName || 'DESHAZO')}</div>
            <div class="tagline">${escapeHtml(reportData.logoTagline || 'CRANES / SERVICE / AUTOMATION')}</div>
          </div>
          <div class="branch">
            <div>${escapeHtml(reportData.branch || '')}</div>
            <div>${escapeHtml(reportData.phone || '')}</div>
          </div>
          <h1>${escapeHtml(reportData.title || 'QUOTE PROPOSAL')}</h1>
        </header>

        <div class="summary-row">
          <div class="crane-mark" aria-hidden="true"></div>
          <div>${escapeHtml(reportData.summary || source.dNumber)}</div>
          <div>${escapeHtml(reportData.type || '')}</div>
          <div>${escapeHtml(reportData.date || '')}</div>
        </div>

        <div class="details-grid">
          ${getTemplateReportCell('Structure', reportData.structure)}
          ${getTemplateReportCell('Description', reportData.description)}
          ${getTemplateReportCell('Customer', reportData.customer)}
          ${getTemplateReportCell('Purchase Order', reportData.purchaseOrder)}
          ${getTemplateReportCell('Job #', reportData.jobNumber)}
          ${getTemplateReportCell('Location', reportData.location)}
          ${getTemplateReportCell('Customer Address', reportData.customerAddress)}
        </div>

        <div class="equipment-grid">
          ${getTemplateReportCell('Manufacturer', reportData.manufacturerCrane)}
          ${getTemplateReportCell('Serial Number', reportData.serialCrane)}
          ${getTemplateReportCell('Capacity', reportData.capacityCrane)}
          ${getTemplateReportCell('Model #', reportData.modelCrane)}
          ${getTemplateReportCell('Hoist 1 Manufacturer', reportData.manufacturerHoist)}
          ${getTemplateReportCell('Hoist 1 Serial', reportData.serialHoist)}
          ${getTemplateReportCell('Hoist 1 Capacity', reportData.capacityHoist)}
          ${getTemplateReportCell('Hoist 1 Model', reportData.modelHoist)}
        </div>

        <section class="contact-row">
          <div>Contact Name: ${getTemplateValue(reportData.contactName)}</div>
          <div>Email: ${getTemplateValue(reportData.contactEmail)}</div>
          <div>Phone: ${getTemplateValue(reportData.contactPhone)}</div>
        </section>

        <section class="scope">
          <h2>${escapeHtml(reportData.scopeOfWorkHeader || 'Scope of Work')}</h2>
          <p>${escapeHtml(reportData.scopeOfWork || '---')}</p>
        </section>

        <h2 class="band">Repair Items</h2>
        ${repairMarkup}

        <h2 class="band">Estimate Summary</h2>
        ${costMarkup}

        <section class="grand-total">
          <div>
            <span>Total</span>
            <strong>${formatMoney(repairTotal + costTotal)}</strong>
          </div>
        </section>

        <section class="notes">
          <h2>${escapeHtml(reportData.notesHeader || 'Additional Notes')}</h2>
          <div class="notes-body">${renderAdditionalNotesHtml(reportData.notes || '---')}</div>
        </section>
      </article>
    `
  }).join('')

  return `<!doctype html>
    <html>
      <head>
        <title>Combined Editable Inspection Reports</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.45in; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #e8eaef;
            color: #111;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
          }
          .report-page {
            width: 7.6in;
            min-height: 10.1in;
            margin: 0 auto 28px;
            background: #fff;
            padding: 0.08in 0.22in 0.18in;
            page-break-after: always;
            break-after: page;
          }
          .report-page:last-child { page-break-after: auto; break-after: auto; }
          .report-header {
            display: grid;
            grid-template-columns: 1.25fr 1fr 1fr;
            align-items: center;
            gap: 12px;
            min-height: 0.54in;
            background: #f5bd00;
            padding: 8px 14px;
          }
          .brand { color: #001a33; font-size: 24px; font-weight: 900; line-height: 0.9; }
          .tagline { margin-top: 3px; color: #111; font-size: 7px; font-weight: 900; text-transform: uppercase; }
          .branch { color: #111; font-size: 8px; font-weight: 900; line-height: 1.35; }
          h1 { margin: 0; color: #111; font-size: 15px; font-weight: 900; text-align: right; text-transform: uppercase; }
          .summary-row {
            display: grid;
            grid-template-columns: 34px 1fr 1fr 1fr;
            align-items: center;
            gap: 8px;
            min-height: 36px;
            border-bottom: 1px solid #d4d4d4;
            padding: 6px 0;
            font-size: 9px;
            font-weight: 900;
          }
          .crane-mark {
            position: relative;
            width: 24px;
            height: 24px;
            border-top: 2px solid #111;
            border-left: 2px solid #111;
            border-right: 2px solid #111;
          }
          .crane-mark::before {
            content: "";
            position: absolute;
            left: 10px;
            top: 0;
            height: 22px;
            border-left: 2px solid #111;
          }
          .crane-mark::after {
            content: "";
            position: absolute;
            left: 7px;
            top: 15px;
            width: 8px;
            height: 8px;
            border: 1px solid #111;
          }
          .details-grid, .equipment-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            border-top: 1px solid #d4d4d4;
            border-left: 1px solid #d4d4d4;
          }
          .details-grid { grid-template-columns: repeat(4, 1fr); }
          .info-cell {
            min-height: 25px;
            border-right: 1px solid #d4d4d4;
            border-bottom: 1px solid #d4d4d4;
            padding: 3px 6px;
          }
          .cell-label { color: #111; font-size: 7px; font-weight: 900; }
          .cell-value { margin-top: 2px; color: #111; font-size: 8px; font-weight: 900; overflow-wrap: anywhere; }
          .contact-row {
            display: grid;
            grid-template-columns: 1fr 1.25fr 1fr;
            margin-top: 12px;
            border: 1px solid #d4d4d4;
            background: #fafafa;
          }
          .contact-row div { min-height: 28px; padding: 6px; border-right: 1px solid #d4d4d4; color: #555b66; font-size: 8px; font-weight: 900; text-transform: uppercase; }
          .contact-row div:last-child { border-right: 0; }
          .scope {
            margin-top: 12px;
            border: 1px solid #d4d4d4;
          }
          .scope h2, .notes h2, .band {
            margin: 0;
            background: #f2f2f2;
            border-bottom: 1px solid #d4d4d4;
            padding: 8px 10px;
            font-size: 14px;
            font-weight: 900;
          }
          .scope p, .notes p {
            margin: 0;
            min-height: 0.56in;
            padding: 9px 10px;
            white-space: pre-wrap;
            line-height: 1.38;
          }
          .notes-body {
            min-height: 0.56in;
            padding: 9px 10px 12px;
          }
          .notes-body p {
            min-height: 0;
            padding: 0;
          }
          .notes-footer {
            margin-top: 14px;
            color: #222;
            line-height: 1.2;
            break-inside: avoid;
          }
          .notes-footer-name {
            font-size: 16px;
            font-weight: 900;
          }
          .notes-footer-title {
            margin-top: 5px;
            font-size: 14px;
            font-weight: 500;
          }
          .notes-footer-phone {
            margin-top: 6px;
            color: #000;
            font-size: 16px;
            font-weight: 900;
          }
          .notes-footer-logo {
            display: block;
            width: 1.25in;
            height: auto;
            margin-top: 16px;
          }
          .notes-footer-tagline {
            display: flex;
            align-items: center;
            gap: 5px;
            margin-top: 5px;
            color: #777;
            font-size: 14px;
            font-weight: 500;
            letter-spacing: 0;
          }
          .notes-footer-tagline strong {
            color: #f5a400;
            font-weight: 900;
          }
          .band {
            margin-top: 12px;
            border: 1px solid #d4d4d4;
          }
          .quote-section {
            border-right: 1px solid #d4d4d4;
            border-bottom: 1px solid #d4d4d4;
            border-left: 1px solid #d4d4d4;
            break-inside: avoid;
          }
          .section-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            border-bottom: 1px solid #d8d8d8;
            background: #f7f7f7;
            padding: 5px 8px;
            color: #111;
            font-size: 10px;
            font-weight: 900;
          }
          .estimate-title { color: #273f7a; text-transform: uppercase; }
          .repair-section { background: #f4e3e3; }
          .repair-section table { background: #fff; }
          .nested-title {
            border-top: 1px solid #d8d8d8;
            border-bottom: 1px solid #d8d8d8;
            background: #f7f7f7;
            padding: 5px 8px;
            color: #273f7a;
            font-size: 10px;
            font-weight: 900;
            text-transform: uppercase;
          }
          .status {
            min-width: 95px;
            background: #efc9c9;
            color: #7d1515;
            padding: 3px 7px;
            font-size: 9px;
            text-align: left;
          }
          .status::before { content: "!"; display: inline-flex; align-items: center; justify-content: center; width: 12px; height: 12px; margin-right: 4px; border-radius: 50%; background: #af0f0f; color: #fff; font-size: 8px; font-weight: 900; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th {
            background: #fbfbfb;
            color: #555b66;
            border-bottom: 1px solid #d8d8d8;
            border-right: 1px solid #d8d8d8;
            padding: 5px 6px;
            font-size: 7px;
            font-weight: 900;
            text-align: left;
            text-transform: uppercase;
          }
          td {
            border-bottom: 1px solid #e5e5e5;
            border-right: 1px solid #e5e5e5;
            padding: 6px;
            font-size: 9px;
            font-weight: 900;
            vertical-align: top;
            overflow-wrap: anywhere;
          }
          th:first-child, td:first-child { width: 56%; }
          .money, .qty { text-align: right; white-space: nowrap; }
          .subtotal td { background: #fbfbfb; font-weight: 900; text-transform: uppercase; }
          .repair-total td { background: #f0f4fb; color: #111; }
          .grand-total {
            display: grid;
            grid-template-columns: 1fr;
            margin-top: 12px;
            margin-left: auto;
            width: 2.2in;
            border: 2px solid #111;
          }
          .grand-total div {
            padding: 9px;
            color: #111;
          }
          .grand-total span { display: block; font-size: 9px; font-weight: 900; text-transform: uppercase; }
          .grand-total strong { display: block; margin-top: 4px; color: #111; font-size: 15px; font-weight: 900; }
          .notes { margin-top: 12px; border: 1px solid #d4d4d4; break-inside: avoid; }
          @media print {
            body { background: #fff; }
            .report-page { width: auto; min-height: auto; margin: 0; }
          }
        </style>
      </head>
      <body>${reportMarkup}</body>
    </html>`
}

const createMasterServiceAgreementFile = (craneIdentifier = defaultCraneIdentifier) =>
  createSimplePdfFile('master-service-agreement.pdf', 'Master Service Agreement', [
    'DESHAZO service pricing reference for quote proposal preparation.',
    'Customer: Wabash',
    `Covered Equipment: Crane ${craneIdentifier}`,
    'Regular technician labor: $145.00/hr',
    'Overtime technician labor: $217.50/hr',
    'Double-time emergency labor: $290.00/hr',
    'Project manager / engineering support: $185.00/hr',
    'Helper / apprentice labor: $95.00/hr',
    'Service truck: $85.00 per visit',
    'Scissor lift rental: $275.00 per day',
    'Freight: $85.00 standard delivery charge',
  ])

const normalizeMenuItemSections = (sections: MenuItemSection[]) => {
  const usedItemIds = new Set<string>()

  const items = sections.flatMap((section) =>
    section.items.map((item) => {
      const itemId = item.id && !usedItemIds.has(item.id) ? item.id : createMenuItemId()
      usedItemIds.add(itemId)

      return {
        ...item,
        id: itemId,
      }
    }),
  )

  return [{ title: menuItemsSectionTitle, items }]
}

const getMenuItemCount = (sections: MenuItemSection[]) =>
  sections.reduce((total, section) => total + section.items.length, 0)

const parseMoney = (value: string) => {
  const numericValue = Number(value.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(numericValue) ? numericValue : 0
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)

const getLegacyCustomerUnitPrice = (lineItem: RepairLineItem) =>
  parseMoney(lineItem.rate) * (1 + parseMoney(lineItem.margin) / 100)

const getInternalUnitCost = (lineItem: RepairLineItem) =>
  parseMoney(lineItem.internalCost ?? lineItem.rate)

const getCustomerUnitPrice = (lineItem: RepairLineItem) =>
  parseMoney(lineItem.customerPrice ?? String(getLegacyCustomerUnitPrice(lineItem)))

const getInternalLineAmount = (lineItem: RepairLineItem) =>
  parseMoney(lineItem.quantity) * getInternalUnitCost(lineItem)

const getCustomerLineAmount = (lineItem: RepairLineItem) =>
  parseMoney(lineItem.quantity) * getCustomerUnitPrice(lineItem)

const getLineProfit = (internalLineAmount: number, customerLineAmount: number) =>
  customerLineAmount - internalLineAmount

const getUnitProfit = (internalUnitCost: number, customerUnitPrice: number) =>
  customerUnitPrice - internalUnitCost

const getUnitMargin = (internalUnitCost: number, customerUnitPrice: number) =>
  internalUnitCost > 0 ? ((customerUnitPrice - internalUnitCost) / internalUnitCost) * 100 : 0

const getLineItemMargin = (lineItem: RepairLineItem) => {
  if (lineItem.margin !== undefined && lineItem.margin !== null && lineItem.margin !== '') {
    return lineItem.margin
  }

  return getUnitMargin(getInternalUnitCost(lineItem), getCustomerUnitPrice(lineItem)).toFixed(2)
}

const getMarginCellClassName = (margin: string) =>
  parseMoney(margin) < 30
    ? 'bg-[#fbe3e3] text-[#8a1a1a] hover:bg-[#f7d4d4]'
    : 'bg-[#e2f5e7] text-[#17652b] hover:bg-[#d0edda]'

const getCostCustomerUnitPrice = (
  sectionId: string,
  lineItem: RepairLineItem,
  settings: EquipmentRentalSettings,
) => {
  void sectionId
  void settings
  return getCustomerUnitPrice(lineItem)
}

const getCostCustomerLineAmount = (
  sectionId: string,
  lineItem: RepairLineItem,
  settings: EquipmentRentalSettings,
) =>
  parseMoney(lineItem.quantity) * getCostCustomerUnitPrice(sectionId, lineItem, settings)

const getRepairSectionInternalTotal = (section: RepairSection) =>
  section.costSections.reduce(
    (total, costSection) =>
      total + costSection.lineItems.reduce((sectionTotal, lineItem) => sectionTotal + getInternalLineAmount(lineItem), 0),
    0,
  )

const getRepairSectionCustomerTotal = (section: RepairSection) =>
  section.costSections.reduce(
    (total, costSection) =>
      total + costSection.lineItems.reduce((sectionTotal, lineItem) => sectionTotal + getCustomerLineAmount(lineItem), 0),
    0,
  )

const isRepairScopedCostSection = (section: CostSection) =>
  ['parts', 'labor'].includes(section.id) || ['parts', 'labor'].includes(section.title.trim().toLowerCase())

const normalizeLineItem = (lineItem: RepairLineItem, fallbackDescription: string) => {
  const savedLineItem = lineItem as RepairLineItem & { text?: string }

  return {
    id: savedLineItem.id,
    description: savedLineItem.description ?? savedLineItem.text ?? fallbackDescription,
    internalCost: savedLineItem.internalCost ?? savedLineItem.rate ?? '0.00',
    quantity: savedLineItem.quantity ?? '1',
    customerPrice: savedLineItem.customerPrice ?? getLegacyCustomerUnitPrice(savedLineItem).toFixed(2),
    rate: savedLineItem.rate ?? '0.00',
    margin: getLineItemMargin(savedLineItem),
    source: savedLineItem.source,
  }
}

const normalizeCostSections = (sections: CostSection[]) =>
  sections.map((section) => ({
    ...section,
    lineItems: section.lineItems.map((lineItem) => normalizeLineItem(lineItem, 'Add line item here.')),
  }))

const normalizeEstimateCostSections = (sections: CostSection[]) =>
  normalizeCostSections(sections).filter((section) => !isRepairScopedCostSection(section))

const shouldPromoteRepairLineItemToDescription = (lineItem: RepairLineItem) =>
  Boolean(lineItem.description?.trim())
  && !shouldClearPlaceholderDescription(lineItem.description)

const normalizeRepairSections = (sections: RepairSection[], reportData?: Record<string, unknown>) =>
  sections.map((section) => {
    const normalizedLineItems = Array.isArray(section.lineItems)
      ? section.lineItems.map((lineItem) => normalizeLineItem(lineItem, 'Add repair detail here.'))
      : []
    const firstLineItem = normalizedLineItems[0]
    const shouldPromoteFirstLineItem =
      !section.description?.trim()
      && firstLineItem
      && shouldPromoteRepairLineItemToDescription(firstLineItem)
    const promotedDescription = shouldPromoteFirstLineItem ? firstLineItem.description : ''

    return {
      ...section,
      title: cleanRepairSectionTitle(section.title, reportData),
      description: section.description?.trim() ? section.description : promotedDescription,
      lineItems: [],
      costSections: normalizeCostSections(
        Array.isArray(section.costSections) && section.costSections.length > 0
          ? section.costSections
          : createDefaultRepairCostSections(section.id),
      ),
    }
  })

const normalizeReport = (report: ReportData) => {
  const nextReport = { ...defaultReport, ...report }

  if (nextReport.title === 'INSPECTION REPORT') nextReport.title = defaultReport.title
  if (!nextReport.scopeOfWorkHeader?.trim()) nextReport.scopeOfWorkHeader = defaultReport.scopeOfWorkHeader
  if (nextReport.scopeOfWork === legacyScopeOfWorkSample) nextReport.scopeOfWork = ''
  if (nextReport.contactName === 'Name: ---') nextReport.contactName = ''
  if (nextReport.contactEmail === 'Email: ---') nextReport.contactEmail = ''
  if (nextReport.contactPhone === 'Phone: ---') nextReport.contactPhone = ''
  if (nextReport.notesHeader === 'Notes') nextReport.notesHeader = defaultReport.notesHeader
  if (!nextReport.notes?.trim()) nextReport.notes = defaultAdditionalNotes
  if (nextReport.notes?.trimEnd() === defaultAdditionalNotesBody) nextReport.notes = defaultAdditionalNotes
  nextReport.summary = normalizeProtectedReportField('summary', nextReport.summary ?? '')
  nextReport.jobNumber = normalizeProtectedReportField('jobNumber', nextReport.jobNumber ?? '')

  return nextReport
}

const getNormalizedReportPayload = (report: EditableInspectionReport): EditableInspectionReportPayload => {
  const costSections = normalizeEstimateCostSections(report.costSections as CostSection[])
  const blockVisibility = { ...defaultBlockVisibility, ...(report.pageLayoutVisibility?.blockVisibility ?? report.blockVisibility) }
  const estimateNoteVisibility = {
    ...defaultEstimateNoteVisibility,
    ...(report.pageLayoutVisibility?.estimateNoteVisibility ?? report.estimateNoteVisibility),
  }
  const estimateCostSectionVisibility = {
    ...defaultEstimateCostSectionVisibility,
    ...getEstimateCostSectionVisibilityFromSections(costSections),
    ...(report.pageLayoutVisibility?.estimateCostSectionVisibility ?? report.estimateCostSectionVisibility),
  }
  const repairSectionVisibility = report.pageLayoutVisibility?.repairSectionVisibility ?? report.repairSectionVisibility

  return {
    reportData: normalizeReport(report.reportData),
    repairSections: normalizeRepairSections(report.repairSections as RepairSection[], report.reportData),
    costSections,
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
    equipmentRentalSettings: {
      ...defaultEquipmentRentalSettings,
      ...report.equipmentRentalSettings,
    },
  }
}

const hasSavedEditableReportPayload = (item: JobsQuotingItem) =>
  Boolean(item.reportName || Object.keys(item.reportData).length > 0 || item.repairSections.length > 0)

const getEditableReportPayloadFromQuoteItem = (item: JobsQuotingItem): EditableInspectionReportPayload => {
  if (hasSavedEditableReportPayload(item)) {
    const repairSections = item.repairSections as RepairSection[]
    const legacyRepairCostSections = (item.costSections as CostSection[]).filter(isRepairScopedCostSection)
    const remainingCostSections = (item.costSections as CostSection[]).filter((section) => !isRepairScopedCostSection(section))
    const costSections = normalizeEstimateCostSections(remainingCostSections)
    const estimateCostSectionVisibility = {
      ...defaultEstimateCostSectionVisibility,
      ...getEstimateCostSectionVisibilityFromSections(costSections),
      ...item.pageLayoutVisibility.estimateCostSectionVisibility,
    }
    const shouldMoveLegacyCostsIntoFirstRepair =
      legacyRepairCostSections.length > 0
      && repairSections.length > 0
      && !repairSections.some((section) => Array.isArray(section.costSections) && section.costSections.length > 0)

    return {
      reportData: applyQuoteItemColumnIdentifiersToReport(item.reportData, item),
      repairSections: shouldMoveLegacyCostsIntoFirstRepair
        ? repairSections.map((section, index) =>
            index === 0 ? { ...section, costSections: legacyRepairCostSections } : section,
          )
        : item.repairSections,
      costSections,
      blockVisibility: item.pageLayoutVisibility.blockVisibility,
      estimateNoteVisibility: item.pageLayoutVisibility.estimateNoteVisibility,
      estimateCostSectionVisibility,
      repairSectionVisibility: item.pageLayoutVisibility.repairSectionVisibility,
      pageLayoutVisibility: {
        ...item.pageLayoutVisibility,
        estimateCostSectionVisibility,
      },
      textBoxes: item.textBoxes,
      equipmentRentalSettings: item.equipmentRentalSettings,
    }
  }

  return {
    reportData: applyQuoteItemColumnIdentifiersToReport(buildReportFromJobsQuotingItem(item), item),
    repairSections: buildRepairSectionsFromJobsQuotingItem(item),
    costSections: defaultCostSections,
    blockVisibility: defaultBlockVisibility,
    estimateNoteVisibility: defaultEstimateNoteVisibility,
    estimateCostSectionVisibility: defaultEstimateCostSectionVisibility,
    repairSectionVisibility: {},
    pageLayoutVisibility: {
      blockVisibility: defaultBlockVisibility,
      estimateNoteVisibility: defaultEstimateNoteVisibility,
      estimateCostSectionVisibility: defaultEstimateCostSectionVisibility,
      repairSectionVisibility: {},
    },
    textBoxes: [],
    equipmentRentalSettings: defaultEquipmentRentalSettings,
  }
}

const getExternalInspectionReportWorkOrderId = (item: JobsQuotingItem) => {
  if (item.deshazoExternalInspectionReportWorkOrderId) return item.deshazoExternalInspectionReportWorkOrderId

  const workOrderId = item.extractionData.work_order_id
  if (typeof workOrderId === 'number' && Number.isFinite(workOrderId)) return workOrderId
  if (typeof workOrderId === 'string') {
    const parsedWorkOrderId = Number(workOrderId)
    return Number.isFinite(parsedWorkOrderId) ? parsedWorkOrderId : null
  }

  return null
}

const getOriginalInspectionReportUrl = (item: JobsQuotingItem) => {
  const workOrderId = getExternalInspectionReportWorkOrderId(item)
  if (!workOrderId) return ''

  const params = new URLSearchParams({ workOrderId: String(workOrderId) })
  const dNumber = item.dNumber || getTopLevelExtractedText(item.extractionData, ['d_number', 'dNumber'])
  if (dNumber) params.set('d', dNumber)

  return `/deshazo-external-reports?${params.toString()}`
}

const saveEditableReportPayloadLocally = (payload: EditableInspectionReportPayload) => {
  window.localStorage.setItem(storageKey, JSON.stringify(payload.reportData))
  window.localStorage.setItem(repairStorageKey, JSON.stringify(payload.repairSections))
  window.localStorage.setItem(costStorageKey, JSON.stringify(payload.costSections))
  window.localStorage.setItem(blockVisibilityStorageKey, JSON.stringify(payload.blockVisibility))
  window.localStorage.setItem(estimateNoteVisibilityStorageKey, JSON.stringify(payload.estimateNoteVisibility))
  window.localStorage.setItem(estimateCostSectionVisibilityStorageKey, JSON.stringify(payload.estimateCostSectionVisibility))
  window.localStorage.setItem(repairSectionVisibilityStorageKey, JSON.stringify(payload.repairSectionVisibility))
  window.localStorage.setItem(equipmentRentalSettingsStorageKey, JSON.stringify(payload.equipmentRentalSettings))
}

type EditableTextProps = {
  id: string
  data: ReportData
  className?: string
  linkify?: boolean
  multiline?: boolean
  protectedPrefix?: string
  renderReadOnly?: (value: string) => ReactNode
  onChange: (id: string, value: string) => void
}

function EditableText({
  id,
  data,
  className = '',
  linkify = false,
  multiline = false,
  protectedPrefix,
  renderReadOnly,
  onChange,
}: EditableTextProps) {
  const fieldValue = data[id] ?? ''
  const value =
    id === 'scopeOfWorkHeader' && !fieldValue.trim()
      ? defaultReport[id] ?? ''
      : fieldValue

  return (
    <EditableValue
      label={id}
      value={value}
      className={className}
      linkify={linkify}
      multiline={multiline}
      protectedPrefix={protectedPrefix}
      renderReadOnly={renderReadOnly}
      onChange={(value) => onChange(id, value)}
    />
  )
}

type EditableValueProps = {
  label: string
  value: string
  className?: string
  linkify?: boolean
  multiline?: boolean
  protectedPrefix?: string
  renderReadOnly?: (value: string) => ReactNode
  clearOnFocus?: boolean
  onEditFocus?: () => void
  onChange: (value: string) => void
  onDropMenuItem?: (item: MenuItem) => void
}

const menuItemDataTransferType = 'application/deshazo-menu-item'

function isMenuItemDrag(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes(menuItemDataTransferType)
}

function getDroppedMenuItem(event: DragEvent<HTMLElement>) {
  const payload = event.dataTransfer.getData(menuItemDataTransferType)
  if (!payload) return null

  try {
    return JSON.parse(payload) as MenuItem
  } catch {
    return { label: 'Menu item', description: payload, rate: '0.00', internalCost: '0.00', customerPrice: '0.00' }
  }
}

function renderLinkifiedText(value: string) {
  const linkPattern = /(https?:\/\/[^\s]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi
  const parts = value.split(linkPattern)

  return parts.map((part, index) => {
    if (!part) return null
    if (/^https?:\/\//i.test(part)) {
      return (
        <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" className="text-[#273f7a] underline">
          {part}
        </a>
      )
    }
    if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(part)) {
      return (
        <a key={`${part}-${index}`} href={`mailto:${part}`} className="text-[#273f7a] underline">
          {part}
        </a>
      )
    }

    return part
  })
}

function renderAdditionalNotesContent(value: string) {
  const { body, hasFooter } = splitAdditionalNotesFooter(value || '---')

  return (
    <div>
      {body ? <div className="whitespace-pre-wrap">{renderLinkifiedText(body)}</div> : null}
      {hasFooter ? (
        <div className="mt-5 text-[#222]">
          <div className="text-[20px] font-black leading-tight">Jeffrey R. Melton</div>
          <div className="mt-1.5 text-[17px] font-medium leading-tight">Assistant Service Manager</div>
          <div className="mt-2 text-[20px] font-black leading-tight text-black">513-903-6405-C</div>
          <img src="/deshazo-logo.png" alt="DESHAZO" className="mt-5 h-auto w-[126px]" />
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[15px] font-medium leading-tight text-[#777]">
            <span>CRANES</span>
            <span className="font-black text-[#f5a400]">/</span>
            <span>SERVICE</span>
            <span className="font-black text-[#f5a400]">/</span>
            <span>AUTOMATION</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const getEditableTextSelectionOffsets = (element: HTMLElement) => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return null

  const startRange = range.cloneRange()
  startRange.selectNodeContents(element)
  startRange.setEnd(range.startContainer, range.startOffset)

  const endRange = range.cloneRange()
  endRange.selectNodeContents(element)
  endRange.setEnd(range.endContainer, range.endOffset)

  return {
    start: startRange.toString().length,
    end: endRange.toString().length,
  }
}

const selectionTouchesProtectedPrefix = (element: HTMLElement, prefixLength: number, key: string) => {
  const selectionOffsets = getEditableTextSelectionOffsets(element)
  if (!selectionOffsets) return false

  if (selectionOffsets.start !== selectionOffsets.end) {
    return selectionOffsets.start < prefixLength
  }

  if (key === 'Backspace') return selectionOffsets.start <= prefixLength
  if (key === 'Delete') return selectionOffsets.start < prefixLength
  return false
}

function EditableValue({
  label,
  value,
  className = '',
  linkify = false,
  protectedPrefix,
  renderReadOnly,
  clearOnFocus = false,
  onEditFocus,
  onChange,
  onDropMenuItem,
}: EditableValueProps) {
  const elementRef = useRef<HTMLDivElement>(null)
  const [isEditing, setIsEditing] = useState(false)

  const clearValueIfPlaceholder = () => {
    if (clearOnFocus && elementRef.current?.innerText === value) {
      elementRef.current.innerText = ''
    }
  }

  const startEditing = () => {
    onEditFocus?.()
    clearValueIfPlaceholder()
  }

  useEffect(() => {
    if (linkify && !isEditing) return
    if (elementRef.current && elementRef.current.innerText !== value) {
      elementRef.current.innerText = value
    }
  }, [isEditing, linkify, value])

  return (
    <div
      ref={elementRef}
      role="textbox"
      aria-label={label}
      contentEditable={!linkify || isEditing}
      suppressContentEditableWarning
      spellCheck
      tabIndex={linkify && !isEditing ? 0 : undefined}
      className={`editable-report-field ${className}`}
      onMouseDown={startEditing}
      onClick={(event) => {
        startEditing()
        if (!linkify || isEditing || event.target instanceof HTMLAnchorElement) return
        setIsEditing(true)
        window.setTimeout(() => {
          if (!elementRef.current) return
          elementRef.current.innerText = value
          elementRef.current.focus()
        })
      }}
      onFocus={() => {
        startEditing()
        if (!linkify) return
        setIsEditing(true)
        window.setTimeout(() => {
          if (elementRef.current) elementRef.current.innerText = value
        })
      }}
      onBlur={(event) => {
        onChange(event.currentTarget.innerText)
        if (linkify) setIsEditing(false)
      }}
      onKeyDown={(event) => {
        if (!protectedPrefix || (event.key !== 'Backspace' && event.key !== 'Delete')) return
        if (selectionTouchesProtectedPrefix(event.currentTarget, protectedPrefix.length, event.key)) {
          event.preventDefault()
        }
      }}
      onCut={(event) => {
        if (!protectedPrefix) return
        const selectionOffsets = getEditableTextSelectionOffsets(event.currentTarget)
        if (selectionOffsets && selectionOffsets.start < protectedPrefix.length) {
          event.preventDefault()
        }
      }}
      onDragOver={(event) => {
        if (onDropMenuItem) {
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'copy'
          return
        }

        if (isMenuItemDrag(event)) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'none'
        }
      }}
      onDrop={(event) => {
        if (!onDropMenuItem) {
          if (isMenuItemDrag(event)) event.preventDefault()
          return
        }
        event.preventDefault()
        event.stopPropagation()
        const item = getDroppedMenuItem(event)
        if (item) onDropMenuItem(item)
      }}
      onPaste={(event) => {
        event.preventDefault()
        const text = event.clipboardData.getData('text/plain')
        document.execCommand('insertText', false, text)
      }}
    >
      {linkify && !isEditing ? (renderReadOnly ? renderReadOnly(value) : renderLinkifiedText(value)) : value}
    </div>
  )
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.86 3.49 3.65 3.65M4.75 19.25l4.34-.86L19.2 8.28a2.58 2.58 0 0 0-3.65-3.65L5.44 14.74l-.69 4.51Z" />
    </svg>
  )
}

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export default function EditableInspectionReport() {
  const generatedId = useRef(1000)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const jobsQuotingItemId = searchParams.get('jobsQuotingItemId')?.trim() || ''
  const editableReportIdParam = searchParams.get('editableReportId')?.trim() || ''
  const validJobsQuotingItemId = isUuid(jobsQuotingItemId) ? jobsQuotingItemId : ''
  const validEditableReportIdParam = isUuid(editableReportIdParam) ? editableReportIdParam : ''
  const menuDatabaseSyncReady = useRef(false)
  const skipNextMenuDatabaseSave = useRef(false)
  const reportHydrationReady = useRef(false)
  const skipNextReportDatabaseSave = useRef(false)
  const pendingReportChanges = useRef(false)
  const menuItemsUploadRefreshInterval = useRef<number | undefined>(undefined)
  const menuItemsUploadRefreshProgressInterval = useRef<number | undefined>(undefined)
  const menuItemsUploadRefreshTimeout = useRef<number | undefined>(undefined)
  const pagePdfDragDepth = useRef(0)
  const menuItemsRefreshRequestId = useRef(0)
  const reportContentRef = useRef<HTMLElement>(null)
  const relatedFolderInputRef = useRef<HTMLInputElement>(null)
  const relatedPdfInputRef = useRef<HTMLInputElement>(null)
  const [activeLineMenu, setActiveLineMenu] = useState('')
  const [activeMarginMenu, setActiveMarginMenu] = useState('')
  const [activeDoneLineItem, setActiveDoneLineItem] = useState('')
  const [pageLayoutMenuOpen, setPageLayoutMenuOpen] = useState(false)
  const [menuCollapsed, setMenuCollapsed] = useState(() => window.localStorage.getItem(menuCollapsedStorageKey) === 'true')
  const [menuSettingsOpen, setMenuSettingsOpen] = useState(false)
  const [relatedDocumentsOpen, setRelatedDocumentsOpen] = useState(false)
  const [pagePdfDragActive, setPagePdfDragActive] = useState(false)
  const [masterServiceAgreementOpen, setMasterServiceAgreementOpen] = useState(false)
  const [menuSearch, setMenuSearch] = useState('')
  const [menuSearchBranchScope, setMenuSearchBranchScope] = useState<'branches' | 'all'>('branches')
  const [menuSearchBranches, setMenuSearchBranches] = useState<string[]>([])
  const [menuSearchSections, setMenuSearchSections] = useState<InspectionMenuItemSection[] | null>(null)
  const [menuSearchLoading, setMenuSearchLoading] = useState(false)
  const [menuSearchMessage, setMenuSearchMessage] = useState('')
  const [menuItemDeleting, setMenuItemDeleting] = useState(false)
  const [menuItemUploaderNames, setMenuItemUploaderNames] = useState<Record<string, string>>({})
  const [relatedDocuments, setRelatedDocuments] = useState<RelatedDocument[]>([])
  const [relatedDocumentsMessage, setRelatedDocumentsMessage] = useState('')
  const [jobReportPrintMenuOpen, setJobReportPrintMenuOpen] = useState(false)
  const [jobReportPrintReports, setJobReportPrintReports] = useState<EditableInspectionReport[]>([])
  const [selectedJobReportPrintIds, setSelectedJobReportPrintIds] = useState<Set<string>>(() => new Set())
  const [jobReportPrintLoading, setJobReportPrintLoading] = useState(false)
  const [jobReportPrintMessage, setJobReportPrintMessage] = useState('')
  const [jobReportPrintDownloadMessage, setJobReportPrintDownloadMessage] = useState('')
  const [reportDatabaseStatus, setReportDatabaseStatus] = useState<'loading' | 'saving' | 'saved' | 'local' | 'error'>(
    isConfigured ? 'loading' : 'local',
  )
  const [currentEditableReportId, setCurrentEditableReportId] = useState(validEditableReportIdParam)
  const [currentReportName, setCurrentReportName] = useState('Untitled quote report')
  const [currentSourceDocumentName, setCurrentSourceDocumentName] = useState('Untitled quote report')
  const [currentJobsQuotingItemId, setCurrentJobsQuotingItemId] = useState<string | null>(validJobsQuotingItemId || null)
  const [runtimePageBreaks, setRuntimePageBreaks] = useState<Record<string, number>>({})
  const [runtimePageCount, setRuntimePageCount] = useState(1)
  const [isReportEditing, setIsReportEditing] = useState(false)
  const [menuItemsRefreshProgress, setMenuItemsRefreshProgress] = useState<MenuItemsRefreshProgress>({
    active: false,
    percent: 0,
  })
  const [newMenuLabel, setNewMenuLabel] = useState('')
  const [newMenuDescription, setNewMenuDescription] = useState('')
  const [newMenuInternalCost, setNewMenuInternalCost] = useState('0.00')
  const [newMenuCustomerPrice, setNewMenuCustomerPrice] = useState('0.00')
  const [editingMenuItem, setEditingMenuItem] = useState<EditingMenuItem | null>(null)
  const [pendingAddMenuLineItem, setPendingAddMenuLineItem] = useState<PendingAddMenuLineItem | null>(null)
  const [decayedMenuItemWarning, setDecayedMenuItemWarning] = useState<MenuItem | null>(null)
  const [menuDatabaseStatus, setMenuDatabaseStatus] = useState<'loading' | 'saving' | 'saved' | 'local' | 'error'>(
    isConfigured ? 'loading' : 'local',
  )
  const [menuDatabaseMessage, setMenuDatabaseMessage] = useState(
    isConfigured ? 'Loading menu items from the server.' : 'Supabase is not configured. Menu items are saved locally.',
  )
  const [report, setReport] = useState<ReportData>(() => {
    const savedReport = window.localStorage.getItem(storageKey)

    if (!savedReport) return defaultReport

    try {
      return normalizeReport(JSON.parse(savedReport) as ReportData)
    } catch {
      return defaultReport
    }
  })
  const [repairSections, setRepairSections] = useState<RepairSection[]>(() => {
    const savedSections = window.localStorage.getItem(repairStorageKey)

    if (!savedSections) return defaultRepairSections

    try {
      return normalizeRepairSections(JSON.parse(savedSections) as RepairSection[])
    } catch {
      return defaultRepairSections
    }
  })
  const [costSections, setCostSections] = useState<CostSection[]>(() => {
    const savedSections = window.localStorage.getItem(costStorageKey)

    if (!savedSections) return defaultCostSections

    try {
      return normalizeEstimateCostSections(JSON.parse(savedSections) as CostSection[])
    } catch {
      return defaultCostSections
    }
  })
  const [menuItemSections, setMenuItemSections] = useState<MenuItemSection[]>(() => {
    if (isConfigured) return normalizeMenuItemSections(defaultMenuItemSections)

    const savedSections = window.localStorage.getItem(menuStorageKey)

    if (!savedSections) return normalizeMenuItemSections(defaultMenuItemSections)

    try {
      const parsedSections = JSON.parse(savedSections) as MenuItemSection[]
      return normalizeMenuItemSections(parsedSections.length > 0 ? parsedSections : defaultMenuItemSections)
    } catch {
      return normalizeMenuItemSections(defaultMenuItemSections)
    }
  })
  const [blockVisibility, setBlockVisibility] = useState<QuoteBlockVisibility>(() => {
    const savedVisibility = window.localStorage.getItem(blockVisibilityStorageKey)

    if (!savedVisibility) return defaultBlockVisibility

    try {
      return { ...defaultBlockVisibility, ...JSON.parse(savedVisibility) as Partial<QuoteBlockVisibility> }
    } catch {
      return defaultBlockVisibility
    }
  })
  const [estimateNoteVisibility, setEstimateNoteVisibility] = useState<EstimateNoteVisibility>(() => {
    const savedVisibility = window.localStorage.getItem(estimateNoteVisibilityStorageKey)

    if (!savedVisibility) return defaultEstimateNoteVisibility

    try {
      return { ...defaultEstimateNoteVisibility, ...JSON.parse(savedVisibility) as Partial<EstimateNoteVisibility> }
    } catch {
      return defaultEstimateNoteVisibility
    }
  })
  const [estimateCostSectionVisibility, setEstimateCostSectionVisibility] = useState<EstimateCostSectionVisibility>(() => {
    const savedVisibility = window.localStorage.getItem(estimateCostSectionVisibilityStorageKey)

    if (!savedVisibility) return defaultEstimateCostSectionVisibility

    try {
      return {
        ...defaultEstimateCostSectionVisibility,
        ...(JSON.parse(savedVisibility) as EstimateCostSectionVisibility),
      }
    } catch {
      return defaultEstimateCostSectionVisibility
    }
  })
  const [repairSectionVisibility, setRepairSectionVisibility] = useState<Record<string, boolean>>(() => {
    const savedVisibility = window.localStorage.getItem(repairSectionVisibilityStorageKey)

    if (!savedVisibility) return {}

    try {
      return JSON.parse(savedVisibility) as Record<string, boolean>
    } catch {
      return {}
    }
  })
  const [equipmentRentalSettings, setEquipmentRentalSettings] = useState<EquipmentRentalSettings>(() => {
    const savedSettings = window.localStorage.getItem(equipmentRentalSettingsStorageKey)

    if (!savedSettings) return defaultEquipmentRentalSettings

    try {
      return { ...defaultEquipmentRentalSettings, ...JSON.parse(savedSettings) as Partial<EquipmentRentalSettings> }
    } catch {
      return defaultEquipmentRentalSettings
    }
  })
  const currentCraneIdentifier = useMemo(() => getCraneIdentifierFromReport(report), [report])
  const currentMenuDNumber = useMemo(() => getDNumberFromReport(report), [report])
  const currentJobNumber = useMemo(() => getJobNumberDisplayFromReport(report), [report])
  const menuSearchBranchesLabel = useMemo(
    () =>
      menuSearchBranches.length > 0
        ? `Your Branches (${menuSearchBranches.map(formatBranchLabel).join(', ')})`
        : 'Your Branches',
    [menuSearchBranches],
  )
  const normalizedCurrentJobNumber = useMemo(
    () => (currentJobNumber === '---' ? '' : currentJobNumber.trim()),
    [currentJobNumber],
  )
  const jobReportPrintOptions = useMemo(() => {
    const seenDNumbers = new Set<string>()
    const currentOption = {
      id: currentEditableReportId || 'current-report',
      reportId: currentEditableReportId,
      dNumber: getDNumberFromReport(report) || 'Unknown D Number',
      reportName: currentReportName,
      isCurrent: true,
      payload: {
        reportData: report,
        repairSections,
        costSections,
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
        equipmentRentalSettings,
      } satisfies EditableInspectionReportPayload,
    }
    const savedOptions = jobReportPrintReports.map((savedReport) => {
      const dNumber = savedReport.dNumber || getDNumberFromReport(savedReport.reportData)

      return {
        id: savedReport.id,
        reportId: savedReport.id,
        dNumber: dNumber || 'Unknown D Number',
        reportName: savedReport.reportName,
        isCurrent: savedReport.id === currentEditableReportId,
        payload: getNormalizedReportPayload(savedReport),
      }
    })

    return [currentOption, ...savedOptions]
      .filter((option) => {
        const uniqueKey = option.dNumber === 'Unknown D Number' ? option.id : option.dNumber.toUpperCase()
        if (seenDNumbers.has(uniqueKey)) return false
        seenDNumbers.add(uniqueKey)
      return true
    })
  }, [
    blockVisibility,
    costSections,
    currentEditableReportId,
    currentReportName,
    equipmentRentalSettings,
    estimateCostSectionVisibility,
    estimateNoteVisibility,
    jobReportPrintReports,
    repairSectionVisibility,
    repairSections,
    report,
  ])
  const selectedJobReportPrintCount = useMemo(
    () => jobReportPrintOptions.filter((option) => selectedJobReportPrintIds.has(option.id)).length,
    [jobReportPrintOptions, selectedJobReportPrintIds],
  )
  const jobReportPrintOptionIds = useMemo(
    () => jobReportPrintOptions.map((option) => option.id),
    [jobReportPrintOptions],
  )
  const allJobReportPrintOptionsSelected = useMemo(
    () =>
      jobReportPrintOptionIds.length > 0
      && jobReportPrintOptionIds.every((optionId) => selectedJobReportPrintIds.has(optionId)),
    [jobReportPrintOptionIds, selectedJobReportPrintIds],
  )
  const getJobReportPrintOptionIds = useCallback(
    (savedReports: EditableInspectionReport[]) => {
      const seenDNumbers = new Set<string>()
      const currentId = currentEditableReportId || 'current-report'
      const currentDNumber = getDNumberFromReport(report) || 'Unknown D Number'
      const optionIds: string[] = []

      const addOptionId = (id: string, dNumber: string) => {
        const uniqueKey = dNumber === 'Unknown D Number' ? id : dNumber.toUpperCase()
        if (seenDNumbers.has(uniqueKey)) return
        seenDNumbers.add(uniqueKey)
        optionIds.push(id)
      }

      addOptionId(currentId, currentDNumber)
      savedReports.forEach((savedReport) => {
        const dNumber = savedReport.dNumber || getDNumberFromReport(savedReport.reportData) || 'Unknown D Number'
        addOptionId(savedReport.id, dNumber)
      })

      return optionIds
    },
    [currentEditableReportId, report],
  )
  const currentEditableReportPayload = useMemo<EditableInspectionReportPayload>(
    () => ({
      reportData: report,
      repairSections,
      costSections,
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
      equipmentRentalSettings,
    }),
    [
      blockVisibility,
      costSections,
      equipmentRentalSettings,
      estimateCostSectionVisibility,
      estimateNoteVisibility,
      repairSectionVisibility,
      repairSections,
      report,
    ],
  )

  const visibleRepairSections = useMemo(
    () => getVisibleRepairSections(repairSections, repairSectionVisibility),
    [repairSections, repairSectionVisibility],
  )
  const visibleCostSections = useMemo(
    () => getVisibleEstimateCostSections(costSections, estimateCostSectionVisibility),
    [costSections, estimateCostSectionVisibility],
  )
  const repairTotal = useMemo(
    () =>
      visibleRepairSections.reduce(
        (total, section) => total + getRepairSectionCustomerTotal(section),
        0,
      ),
    [visibleRepairSections],
  )
  const costTotal = useMemo(
    () =>
      visibleCostSections.reduce(
        (total, section) =>
          total + section.lineItems.reduce(
            (sectionTotal, lineItem) =>
              sectionTotal + getCostCustomerLineAmount(section.id, lineItem, equipmentRentalSettings),
            0,
          ),
        0,
      ),
    [equipmentRentalSettings, visibleCostSections],
  )
  const invoiceTotal = repairTotal + costTotal
  const grandTotalInternalCost = useMemo(
    () =>
      visibleRepairSections.reduce(
        (total, section) => total + getRepairSectionInternalTotal(section),
        0,
      )
      + visibleCostSections.reduce(
        (total, section) =>
          total + section.lineItems.reduce((sectionTotal, lineItem) => sectionTotal + getInternalLineAmount(lineItem), 0),
        0,
      ),
    [visibleCostSections, visibleRepairSections],
  )
  const grandTotalProfit = invoiceTotal - grandTotalInternalCost
  const grandTotalMargin = getUnitMargin(grandTotalInternalCost, invoiceTotal)
  const originalInspectionDocument = useMemo(
    () => relatedDocuments.find((document) => ['Original Inspection Report', 'Original Inspection'].includes(document.name)),
    [relatedDocuments],
  )
  const masterServiceAgreementDocument = useMemo(
    () => relatedDocuments.find((document) => document.name === 'Master Service Agreement'),
    [relatedDocuments],
  )
  const uploadedRelatedDocuments = useMemo(
    () =>
      relatedDocuments.filter(
        (document) => !['Original Inspection Report', 'Original Inspection', 'Master Service Agreement'].includes(document.name),
      ),
    [relatedDocuments],
  )
  const visibleMenuItemSections = useMemo(() => {
    const searchValue = menuSearch.trim().toLowerCase()
    const sourceSections = searchValue && menuSearchSections ? menuSearchSections : menuItemSections
    const cappedSections = normalizeMenuItemSections(sourceSections)
    if (!searchValue) return cappedSections

    return cappedSections
  }, [menuItemSections, menuSearch, menuSearchSections])

  useEffect(() => {
    const searchValue = menuSearch.trim()

    if (!searchValue) {
      setMenuSearchSections(null)
      setMenuSearchLoading(false)
      setMenuSearchMessage('')
      return
    }

    if (!isConfigured) {
      setMenuSearchSections([])
      setMenuSearchLoading(false)
      setMenuSearchMessage('Supabase is not configured. Menu search is unavailable.')
      return
    }

    let active = true
    setMenuSearchLoading(true)
    setMenuSearchMessage('Searching menu items...')

    const searchTimer = window.setTimeout(() => {
      searchInspectionMenuItems(searchValue, menuSearchBranchScope === 'branches' ? menuSearchBranches : undefined)
        .then((savedMenu) => {
          if (!active) return

          const nextSections = normalizeMenuItemSections(savedMenu?.menuSections ?? [])
          setMenuSearchSections(nextSections)
          setMenuSearchMessage(nextSections[0]?.items.length ? '' : 'No database menu items found.')
        })
        .catch((error) => {
          if (!active) return

          setMenuSearchSections([])
          setMenuSearchMessage(error instanceof Error ? error.message : 'Menu item search failed.')
        })
        .finally(() => {
          if (active) setMenuSearchLoading(false)
        })
    }, menuSearchDebounceMs)

    return () => {
      active = false
      window.clearTimeout(searchTimer)
    }
  }, [currentCraneIdentifier, menuSearch, menuSearchBranches, menuSearchBranchScope])

  useEffect(() => {
    if (!isConfigured) {
      setMenuSearchBranches([])
      return
    }

    let active = true
    getInspectionMenuItemBranches()
      .then((branches) => {
        if (active) setMenuSearchBranches(branches)
      })
      .catch(() => {
        if (active) setMenuSearchBranches([])
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const sourceSections = menuSearchSections ?? menuItemSections
    const userIds = sourceSections.flatMap((section) => section.items.map((item) => item.userId).filter(Boolean)) as string[]

    if (userIds.length === 0) {
      setMenuItemUploaderNames({})
      return
    }

    let active = true

    getUserDisplayNames(userIds)
      .then((displayNames) => {
        if (active) setMenuItemUploaderNames(displayNames)
      })
      .catch(() => {
        if (active) setMenuItemUploaderNames({})
      })

    return () => {
      active = false
    }
  }, [menuItemSections, menuSearchSections])

  const markPendingLineItemAddedToMenu = () => {
    if (!pendingAddMenuLineItem) return

    if (pendingAddMenuLineItem.collection === 'repair') {
      setRepairSections((currentSections) =>
        saveRepairSections(
          currentSections.map((section) =>
            section.id === pendingAddMenuLineItem.sectionId
              ? {
                  ...section,
                  lineItems: section.lineItems.map((lineItem) =>
                    lineItem.id === pendingAddMenuLineItem.lineItemId ? { ...lineItem, source: 'menu' } : lineItem,
                  ),
                }
              : section,
          ),
        ),
      )
    } else {
      setCostSections((currentSections) =>
        saveCostSections(
          currentSections.map((section) =>
            section.id === pendingAddMenuLineItem.sectionId
              ? {
                  ...section,
                  lineItems: section.lineItems.map((lineItem) =>
                    lineItem.id === pendingAddMenuLineItem.lineItemId ? { ...lineItem, source: 'menu' } : lineItem,
                  ),
                }
              : section,
          ),
        ),
      )
    }

    setPendingAddMenuLineItem(null)
  }

  const openMenuSettingsFromLineItem = (lineItem: RepairLineItem, pendingLineItem: PendingAddMenuLineItem) => {
    const itemName = lineItem.description.trim() || 'New line item'
    setNewMenuLabel(itemName)
    setNewMenuDescription(itemName)
    setNewMenuInternalCost(getInternalUnitCost(lineItem).toFixed(2))
    setNewMenuCustomerPrice(getCustomerUnitPrice(lineItem).toFixed(2))
    setPendingAddMenuLineItem(pendingLineItem)
    setActiveLineMenu('')
    setMenuSettingsOpen(true)
  }

  const getRuntimePageBreakClassName = (blockId: string) =>
    !isReportEditing && runtimePageBreaks[blockId] && !shouldSuppressRuntimePageBreak(blockId)
      ? 'report-runtime-page-break'
      : ''

  const getRuntimePageBreakStyle = (blockId: string) => {
    void blockId
    return undefined
  }

  const applyEditableReportPayload = useCallback((payload: EditableInspectionReportPayload) => {
    const nextReport = normalizeReport(payload.reportData)
    const nextRepairSections = normalizeRepairSections(payload.repairSections as RepairSection[], payload.reportData)
    const nextCostSections = normalizeEstimateCostSections(payload.costSections as CostSection[])
    const nextBlockVisibility = { ...defaultBlockVisibility, ...payload.blockVisibility }
    const nextEstimateNoteVisibility = { ...defaultEstimateNoteVisibility, ...payload.estimateNoteVisibility }
    const nextEstimateCostSectionVisibility = {
      ...defaultEstimateCostSectionVisibility,
      ...getEstimateCostSectionVisibilityFromSections(nextCostSections),
      ...payload.estimateCostSectionVisibility,
    }
    const nextRepairSectionVisibility = payload.repairSectionVisibility
    const nextEquipmentRentalSettings = {
      ...defaultEquipmentRentalSettings,
      ...payload.equipmentRentalSettings,
    } as EquipmentRentalSettings

    saveEditableReportPayloadLocally({
      reportData: nextReport,
      repairSections: nextRepairSections,
      costSections: nextCostSections,
      blockVisibility: nextBlockVisibility,
      estimateNoteVisibility: nextEstimateNoteVisibility,
      estimateCostSectionVisibility: nextEstimateCostSectionVisibility,
      repairSectionVisibility: nextRepairSectionVisibility,
      pageLayoutVisibility: {
        blockVisibility: nextBlockVisibility,
        estimateNoteVisibility: nextEstimateNoteVisibility,
        estimateCostSectionVisibility: nextEstimateCostSectionVisibility,
        repairSectionVisibility: nextRepairSectionVisibility,
      },
      textBoxes: [],
      equipmentRentalSettings: nextEquipmentRentalSettings,
    })
    setReport(nextReport)
    setRepairSections(nextRepairSections)
    setCostSections(nextCostSections)
    setBlockVisibility(nextBlockVisibility)
    setEstimateNoteVisibility(nextEstimateNoteVisibility)
    setEstimateCostSectionVisibility(nextEstimateCostSectionVisibility)
    setRepairSectionVisibility(nextRepairSectionVisibility)
    setEquipmentRentalSettings(nextEquipmentRentalSettings)
  }, [])

  const saveCurrentEditableReportNow = useCallback(async () => {
    if (!isConfigured || !reportHydrationReady.current) return null

    setReportDatabaseStatus('saving')
    const reportName = getEditableReportDisplayName(currentEditableReportPayload.reportData, currentReportName)
    const savedReport = await saveEditableInspectionReport({
      ...currentEditableReportPayload,
      id: currentEditableReportId || currentJobsQuotingItemId,
      jobsQuotingItemId: currentJobsQuotingItemId,
      reportName,
      sourceDocumentName: currentSourceDocumentName,
    })

    pendingReportChanges.current = false
    skipNextReportDatabaseSave.current = true
    setCurrentEditableReportId(savedReport.id)
    setCurrentReportName(savedReport.reportName)
    setCurrentSourceDocumentName(savedReport.sourceDocumentName)
    setCurrentJobsQuotingItemId(savedReport.jobsQuotingItemId)
    setReportDatabaseStatus('saved')
    return savedReport
  }, [
    currentEditableReportId,
    currentEditableReportPayload,
    currentJobsQuotingItemId,
    currentReportName,
    currentSourceDocumentName,
  ])

  useEffect(() => {
    if (!isConfigured) {
      reportHydrationReady.current = true
      setReportDatabaseStatus('local')
      return
    }

    let active = true
    reportHydrationReady.current = false
    setReportDatabaseStatus('loading')

    async function hydrateEditableReport() {
      try {
        const quoteItemId = validJobsQuotingItemId || validEditableReportIdParam

        if (quoteItemId) {
          const quoteItem = await getJobsQuotingItem(quoteItemId)
          if (!active) return

          const editableReportPayload = getEditableReportPayloadFromQuoteItem(quoteItem)
          const reportName =
            quoteItem.reportName ||
            getEditableReportDisplayName(editableReportPayload.reportData, quoteItem.documentName)

          applyEditableReportPayload(editableReportPayload)
          setCurrentEditableReportId(quoteItem.id)
          setCurrentReportName(reportName)
          setCurrentSourceDocumentName(quoteItem.sourceDocumentName || quoteItem.documentName)
          setCurrentJobsQuotingItemId(quoteItem.id)
          setReportDatabaseStatus('saved')
        } else {
          setCurrentEditableReportId('')
          setCurrentReportName('Untitled quote report')
          setCurrentSourceDocumentName('Untitled quote report')
          setCurrentJobsQuotingItemId(null)
          setReportDatabaseStatus('saved')
        }

        skipNextReportDatabaseSave.current = true
        pendingReportChanges.current = false
        reportHydrationReady.current = true
      } catch {
        if (!active) return
        reportHydrationReady.current = true
        setReportDatabaseStatus('error')
      }
    }

    hydrateEditableReport()

    return () => {
      active = false
    }
  }, [applyEditableReportPayload, validEditableReportIdParam, validJobsQuotingItemId])

  useEffect(() => {
    if (!isConfigured || !reportHydrationReady.current) return

    if (skipNextReportDatabaseSave.current) {
      skipNextReportDatabaseSave.current = false
      return
    }

    pendingReportChanges.current = true
  }, [currentEditableReportPayload, reportDatabaseStatus])
  useLayoutEffect(() => {
    const contentElement = reportContentRef.current
    if (!contentElement) return

    const blockElements = Array.from(
      contentElement.querySelectorAll<HTMLElement>('[data-report-block-id]'),
    )

    if (blockElements.length === 0) {
      setRuntimePageBreaks((currentBreaks) => (Object.keys(currentBreaks).length === 0 ? currentBreaks : {}))
      setRuntimePageCount(1)
      return
    }

    blockElements.forEach((element) => {
      element.style.marginTop = ''
    })

    const inchProbe = document.createElement('div')
    inchProbe.style.position = 'absolute'
    inchProbe.style.visibility = 'hidden'
    inchProbe.style.height = '1in'
    document.body.appendChild(inchProbe)
    const pxPerInch = inchProbe.getBoundingClientRect().height || 96
    inchProbe.remove()

    const pageContentHeight = (printedPageHeightIn - printedPageMarginIn * 2) * pxPerInch
    const contentTop = contentElement.getBoundingClientRect().top
    const nextBreaks: Record<string, number> = {}
    let nextPageCount = 1
    let currentPageHeight = Math.max(0, blockElements[0].getBoundingClientRect().top - contentTop)

    const getBlockHeight = (element: HTMLElement) => {
      const styles = window.getComputedStyle(element)
      const marginTop = parseFloat(styles.marginTop) || 0
      const marginBottom = parseFloat(styles.marginBottom) || 0
      return {
        blockHeight: element.getBoundingClientRect().height + marginTop + marginBottom,
        marginTop,
      }
    }

    for (let index = 0; index < blockElements.length; index += 1) {
      const element = blockElements[index]
      const blockId = element.dataset.reportBlockId
      if (!blockId) continue

      const { blockHeight, marginTop } = getBlockHeight(element)
      let measuredFitHeight = blockHeight

      if (element.dataset.reportKeepWithNext === 'true') {
        for (let nextIndex = index + 1; nextIndex < blockElements.length; nextIndex += 1) {
          const nextElement = blockElements[nextIndex]
          measuredFitHeight += getBlockHeight(nextElement).blockHeight

          if (nextElement.dataset.reportKeepWithNext !== 'true') {
            break
          }
        }
      }

      const fitHeight = Math.min(measuredFitHeight, pageContentHeight)

      if (currentPageHeight > 0 && currentPageHeight + fitHeight > pageContentHeight) {
        const spacer =
          Math.max(0, pageContentHeight - currentPageHeight)
          + runtimePageGapPx
          + printedPageMarginIn * 2 * pxPerInch
          + marginTop
        nextBreaks[blockId] = spacer
        nextPageCount += 1
        currentPageHeight = blockHeight
        continue
      }

      currentPageHeight += blockHeight
    }

    setRuntimePageBreaks((currentBreaks) => {
      const currentKeys = Object.keys(currentBreaks)
      const nextKeys = Object.keys(nextBreaks)
      const sameBreaks =
        currentKeys.length === nextKeys.length
        && nextKeys.every((key) => Math.round(currentBreaks[key] ?? 0) === Math.round(nextBreaks[key] ?? 0))

      return sameBreaks ? currentBreaks : nextBreaks
    })
    setRuntimePageCount((currentPageCount) => (currentPageCount === nextPageCount ? currentPageCount : nextPageCount))
  }, [
    blockVisibility,
    costSections,
    estimateCostSectionVisibility,
    estimateNoteVisibility,
    equipmentRentalSettings,
    report,
    repairSectionVisibility,
    repairSections,
  ])

  const refreshMenuItemsFromDatabase = useCallback(
    async ({
      loadingMessage = 'Loading menu items from the server.',
      loadedMessage = 'Menu items loaded from the server.',
      emptyMessage = 'Menu items will save to the server after your next edit.',
      shouldApply = () => true,
      markSyncReady = false,
    }: {
      loadingMessage?: string
      loadedMessage?: string
      emptyMessage?: string
      shouldApply?: () => boolean
      markSyncReady?: boolean
    } = {}) => {
      if (!isConfigured) {
        menuDatabaseSyncReady.current = false
        setMenuDatabaseStatus('local')
        setMenuDatabaseMessage('Supabase is not configured. Menu items are saved locally.')
        return false
      }

      const refreshRequestId = menuItemsRefreshRequestId.current + 1
      menuItemsRefreshRequestId.current = refreshRequestId
      setMenuDatabaseStatus('loading')
      setMenuDatabaseMessage(loadingMessage)

      try {
        const savedMenu = await getInspectionMenuItems(currentMenuDNumber)
        if (!shouldApply() || refreshRequestId !== menuItemsRefreshRequestId.current) return false

        if (savedMenu) {
          const normalizedSections = normalizeMenuItemSections(
            savedMenu.menuSections.length > 0 ? savedMenu.menuSections : defaultMenuItemSections,
          )
          const itemCount = getMenuItemCount(normalizedSections)
          window.localStorage.setItem(menuStorageKey, JSON.stringify(normalizedSections))
          skipNextMenuDatabaseSave.current = true
          setMenuItemSections(normalizedSections)
          setMenuDatabaseMessage(loadedMessage)
          if (markSyncReady) menuDatabaseSyncReady.current = true
          setMenuDatabaseStatus('saved')
          return { applied: true, itemCount }
        } else {
          const emptySections = normalizeMenuItemSections(defaultMenuItemSections)
          window.localStorage.setItem(menuStorageKey, JSON.stringify(emptySections))
          skipNextMenuDatabaseSave.current = true
          setMenuItemSections(emptySections)
          setMenuDatabaseMessage(emptyMessage)
          if (markSyncReady) menuDatabaseSyncReady.current = true
          setMenuDatabaseStatus('saved')
          return { applied: true, itemCount: 0 }
        }
      } catch (error) {
        if (!shouldApply() || refreshRequestId !== menuItemsRefreshRequestId.current) return false
        if (markSyncReady) menuDatabaseSyncReady.current = false
        setMenuDatabaseStatus(markSyncReady ? 'local' : 'error')
        setMenuDatabaseMessage(error instanceof Error ? error.message : 'Menu items could not be loaded.')
        return false
      }
    },
    [currentMenuDNumber],
  )

  const clearMenuItemsUploadRefreshTimers = useCallback(() => {
    if (menuItemsUploadRefreshInterval.current) {
      window.clearInterval(menuItemsUploadRefreshInterval.current)
      menuItemsUploadRefreshInterval.current = undefined
    }

    if (menuItemsUploadRefreshProgressInterval.current) {
      window.clearInterval(menuItemsUploadRefreshProgressInterval.current)
      menuItemsUploadRefreshProgressInterval.current = undefined
    }

    if (menuItemsUploadRefreshTimeout.current) {
      window.clearTimeout(menuItemsUploadRefreshTimeout.current)
      menuItemsUploadRefreshTimeout.current = undefined
    }
  }, [])

  const refreshMenuItemsAfterPdfUpload = useCallback(() => {
    if (!isConfigured) return

    clearMenuItemsUploadRefreshTimers()

    const startedAt = Date.now()
    const refreshLoadingMessage = 'Loading menu items from uploaded PDFs.'
    const startingItemCount = getMenuItemCount(menuItemSections)

    const completeUploadRefresh = (itemCount: number) => {
      clearMenuItemsUploadRefreshTimers()
      menuItemsRefreshRequestId.current += 1
      setMenuItemsRefreshProgress({ active: false, percent: 100 })
      setMenuDatabaseStatus('saved')
      setMenuDatabaseMessage(`Successfully loaded ${itemCount - startingItemCount} item${itemCount - startingItemCount === 1 ? '' : 's'} from uploaded PDFs.`)
      setRelatedDocumentsMessage(`Successfully loaded menu items. Check the ${currentCraneIdentifier} section to see the new parts.`)
    }

    const checkForUploadedMenuItems = () => {
      void refreshMenuItemsFromDatabase({
        loadingMessage: refreshLoadingMessage,
        loadedMessage: 'Checking uploaded PDFs for new menu items.',
        emptyMessage: 'Checking uploaded PDFs for new menu items.',
      }).then((result) => {
        if (result && result.itemCount > startingItemCount) {
          completeUploadRefresh(result.itemCount)
        }
      })
    }

    setMenuItemsRefreshProgress({ active: true, percent: 0 })
    checkForUploadedMenuItems()

    menuItemsUploadRefreshProgressInterval.current = window.setInterval(() => {
      const elapsedMs = Date.now() - startedAt
      const percent = Math.min(100, Math.round((elapsedMs / menuItemsUploadRefreshDurationMs) * 100))
      setMenuItemsRefreshProgress({ active: percent < 100, percent })
    }, 1000)

    menuItemsUploadRefreshInterval.current = window.setInterval(() => {
      checkForUploadedMenuItems()
    }, menuItemsUploadRefreshIntervalMs)

    menuItemsUploadRefreshTimeout.current = window.setTimeout(() => {
      clearMenuItemsUploadRefreshTimers()
      setMenuItemsRefreshProgress({ active: false, percent: 100 })
      setRelatedDocumentsMessage(`Check the ${currentCraneIdentifier} section to see the new parts.`)
      refreshMenuItemsFromDatabase({
        loadingMessage: refreshLoadingMessage,
        loadedMessage: 'Menu items finished loading from uploaded PDFs.',
        emptyMessage: 'Menu items finished loading from uploaded PDFs.',
      })
    }, menuItemsUploadRefreshDurationMs)
  }, [clearMenuItemsUploadRefreshTimers, currentCraneIdentifier, menuItemSections, refreshMenuItemsFromDatabase])

  useEffect(() => {
    if (!isConfigured) {
      menuDatabaseSyncReady.current = false
      return
    }

    let active = true

    refreshMenuItemsFromDatabase({
      shouldApply: () => active,
      markSyncReady: true,
    })

    return () => {
      active = false
    }
  }, [refreshMenuItemsFromDatabase])

  useEffect(() => () => clearMenuItemsUploadRefreshTimers(), [clearMenuItemsUploadRefreshTimers])

  useEffect(() => {
    if (!isConfigured || !menuDatabaseSyncReady.current) return
    if (skipNextMenuDatabaseSave.current) {
      skipNextMenuDatabaseSave.current = false
      return
    }

    const nextSections = normalizeMenuItemSections(menuItemSections)
    const saveTimer = window.setTimeout(() => {
      setMenuDatabaseStatus('saving')
      setMenuDatabaseMessage('Saving menu items to the server.')

      upsertInspectionMenuItems(nextSections, currentMenuDNumber)
        .then(() => {
          setMenuDatabaseStatus('saved')
          setMenuDatabaseMessage('Menu items saved to the server.')
        })
        .catch((error) => {
          setMenuDatabaseStatus('error')
          setMenuDatabaseMessage(error instanceof Error ? error.message : 'Menu items could not be saved to the server.')
        })
    }, databaseSyncIdleDelayMs)

    return () => window.clearTimeout(saveTimer)
  }, [currentMenuDNumber, menuItemSections])

  useEffect(() => {
    if (!isConfigured) {
      setRelatedDocumentsMessage('Supabase is not configured. PDFs are not saved yet.')
      return
    }

    let active = true

    async function loadRelatedDocuments() {
      try {
        setRelatedDocumentsMessage('Loading saved PDFs.')

        let quoteInspectionDocument: RelatedDocument | null = null

        if (jobsQuotingItemId) {
          const quoteItem = await getJobsQuotingItem(jobsQuotingItemId)
          const originalInspectionReportUrl = getOriginalInspectionReportUrl(quoteItem)
          const quotePdfUrl = originalInspectionReportUrl ? '' : await getJobsQuotingItemPdfUrl(quoteItem)

          if (originalInspectionReportUrl || quotePdfUrl) {
            quoteInspectionDocument = {
              id: quoteItem.id,
              name: 'Original Inspection Report',
              description: originalInspectionReportUrl
                ? 'Open the synced Deshazo inspection report.'
                : 'Split inspection PDF selected from Jobs Quoting.',
              filePath: quoteItem.pdfStoragePath ?? '',
              fileName: quoteItem.pdfFileName ?? `${quoteItem.documentName}.pdf`,
              fileSize: quoteItem.pdfFileSize ?? 0,
              source: originalInspectionReportUrl ? 'Deshazo External Reports' : 'Jobs Quoting',
              url: originalInspectionReportUrl || quotePdfUrl || '',
              createdAt: quoteItem.createdAt,
            }
          }
        }

        await uploadEditableInspectionDocument({
          file: createMasterServiceAgreementFile(currentCraneIdentifier),
          name: 'Master Service Agreement',
          description: 'Example labor, service, equipment, travel, and freight pricing.',
          source: 'Built-in document',
          stableKey: masterServiceAgreementStableKey,
        })

        const savedDocuments = await getEditableInspectionDocuments()
        if (!active) return

        const nextDocuments = quoteInspectionDocument
          ? [
              quoteInspectionDocument,
              ...savedDocuments.filter((document) => !['Original Inspection', 'Original Inspection Report'].includes(document.name)),
            ]
          : savedDocuments

        setRelatedDocuments(nextDocuments)
        setRelatedDocumentsMessage(`${nextDocuments.length} PDF${nextDocuments.length === 1 ? '' : 's'} saved.`)
      } catch (error) {
        if (!active) return
        setRelatedDocumentsMessage(error instanceof Error ? error.message : 'Saved PDFs could not be loaded.')
      }
    }

    loadRelatedDocuments()

    return () => {
      active = false
    }
  }, [currentCraneIdentifier, jobsQuotingItemId])

  const updatedAt = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date()),
    [],
  )

  const updateField = (id: string, value: string) => {
    setReport((currentReport) => {
      const nextReport = { ...currentReport, [id]: normalizeProtectedReportField(id, value) }
      window.localStorage.setItem(storageKey, JSON.stringify(nextReport))
      return nextReport
    })
  }

  const saveRepairSections = (nextSections: RepairSection[]) => {
    window.localStorage.setItem(repairStorageKey, JSON.stringify(nextSections))
    return nextSections
  }

  const saveCostSections = (nextSections: CostSection[]) => {
    window.localStorage.setItem(costStorageKey, JSON.stringify(nextSections))
    return nextSections
  }

  const saveMenuItemSections = (nextSections: MenuItemSection[]) => {
    const normalizedSections = normalizeMenuItemSections(nextSections)
    window.localStorage.setItem(menuStorageKey, JSON.stringify(normalizedSections))
    return normalizedSections
  }

  const setQuoteBlockVisibility = (block: keyof QuoteBlockVisibility, visible: boolean) => {
    setBlockVisibility((currentVisibility) => {
      const nextVisibility = { ...currentVisibility, [block]: visible }
      window.localStorage.setItem(blockVisibilityStorageKey, JSON.stringify(nextVisibility))
      return nextVisibility
    })
  }

  const toggleRepairSectionVisibility = (sectionId: string, visible: boolean) => {
    setRepairSectionVisibility((currentVisibility) => {
      const nextVisibility = { ...currentVisibility, [sectionId]: visible }
      window.localStorage.setItem(repairSectionVisibilityStorageKey, JSON.stringify(nextVisibility))
      return nextVisibility
    })
  }

  const toggleRepairCostSectionVisibility = (sectionId: string, costSectionId: string, visible: boolean) => {
    setRepairSectionVisibility((currentVisibility) => {
      const nextVisibility = {
        ...currentVisibility,
        [getRepairCostSectionVisibilityKey(sectionId, costSectionId)]: visible,
      }
      window.localStorage.setItem(repairSectionVisibilityStorageKey, JSON.stringify(nextVisibility))
      return nextVisibility
    })
  }

  const toggleMenuCollapsed = () => {
    setMenuCollapsed((currentCollapsed) => {
      const nextCollapsed = !currentCollapsed
      window.localStorage.setItem(menuCollapsedStorageKey, String(nextCollapsed))
      return nextCollapsed
    })
  }

  const addMenuItemFromSettings = () => {
    const label = newMenuLabel.trim()
    const description = newMenuDescription.trim()
    if (!label || !description) return

    const internalCost = parseMoney(newMenuInternalCost).toFixed(2)
    const customerPrice = parseMoney(newMenuCustomerPrice).toFixed(2)
    const nextItem: MenuItem = {
      id: createMenuItemId(),
      label,
      description,
      rate: internalCost,
      internalCost,
      customerPrice,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dNumbers: normalizeDNumbers([currentMenuDNumber]),
    }

    setMenuItemSections((currentSections) =>
      saveMenuItemSections(
        [{ title: menuItemsSectionTitle, items: [...normalizeMenuItemSections(currentSections)[0].items, nextItem] }],
      ),
    )
    setNewMenuLabel('')
    setNewMenuDescription('')
    setNewMenuInternalCost('0.00')
    setNewMenuCustomerPrice('0.00')
    markPendingLineItemAddedToMenu()
  }

  const openMenuItemEditor = (item: MenuItem) => {
    setEditingMenuItem({
      itemId: item.id ?? createMenuItemId(),
      userId: item.userId,
      label: item.label,
      description: item.description,
      internalCost: item.internalCost ?? item.rate,
      customerPrice: item.customerPrice ?? item.rate,
      dNumbers: item.dNumbers,
    })
  }

  const saveEditedMenuItem = () => {
    if (!editingMenuItem) return

    const label = editingMenuItem.label.trim()
    const description = editingMenuItem.description.trim()
    if (!label || !description) return

    const nextInternalCost = parseMoney(editingMenuItem.internalCost).toFixed(2)
    const nextCustomerPrice = parseMoney(editingMenuItem.customerPrice).toFixed(2)
    const updatedAt = new Date().toISOString()

    setMenuItemSections((currentSections) =>
      saveMenuItemSections(
        normalizeMenuItemSections(currentSections).map((section) => ({
          ...section,
          items: section.items.map((item) =>
            item.id === editingMenuItem.itemId
              ? {
                  ...item,
                  id: editingMenuItem.itemId,
                  userId: editingMenuItem.userId,
                  label,
                  description,
                  rate: nextInternalCost,
                  internalCost: nextInternalCost,
                  customerPrice: nextCustomerPrice,
                  dNumbers: editingMenuItem.dNumbers,
                  updatedAt,
                }
              : item,
          ),
        })),
      ),
    )
    setEditingMenuItem(null)
  }

  const deleteEditedMenuItem = () => {
    if (!editingMenuItem) return

    setMenuItemDeleting(true)
    setMenuDatabaseStatus('saving')
    setMenuDatabaseMessage('Deleting menu item.')

    deleteInspectionMenuItem(editingMenuItem.itemId)
      .then((deleted) => {
        if (!deleted) {
          setMenuDatabaseStatus('error')
          setMenuDatabaseMessage('Only the user who uploaded this menu item can delete it.')
          return
        }

        const removeDeletedItem = (sections: MenuItemSection[]) =>
          saveMenuItemSections(
            normalizeMenuItemSections(sections).map((section) => ({
              ...section,
              items: section.items.filter((item) => item.id !== editingMenuItem.itemId),
            })),
          )

        skipNextMenuDatabaseSave.current = true
        setMenuItemSections((currentSections) => removeDeletedItem(currentSections))
        setMenuSearchSections((currentSections) => (currentSections ? removeDeletedItem(currentSections) : currentSections))
        setMenuDatabaseStatus('saved')
        setMenuDatabaseMessage('Menu item deleted from the server.')
        setEditingMenuItem(null)
      })
      .catch((error) => {
        setMenuDatabaseStatus('error')
        setMenuDatabaseMessage(error instanceof Error ? error.message : 'Menu item could not be deleted.')
      })
      .finally(() => {
        setMenuItemDeleting(false)
      })
  }

  const addMenuItemToRecentlyUsed = (item: MenuItem) => {
    void item
  }

  const createId = (prefix: string) => {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`
    generatedId.current += 1
    return `${prefix}-${generatedId.current}`
  }

  const addRelatedDocuments = async (files: Array<File & { webkitRelativePath?: string }>, source: string) => {
    if (files.length === 0) {
      setRelatedDocumentsMessage(
        source === 'Folder upload'
          ? 'No PDFs were found in that folder.'
          : source === 'Dropped PDF'
            ? 'No PDFs were dropped.'
          : 'No PDF was selected.',
      )
      return
    }

    if (!isConfigured) {
      setRelatedDocumentsMessage('Supabase is not configured. PDFs were not saved.')
      return
    }

    setRelatedDocumentsMessage(`Queued ${files.length} PDF${files.length === 1 ? '' : 's'} for Supabase and Extend.`)

    const uploadedDocuments: RelatedDocument[] = []
    const failedUploads: string[] = []
    const failedWorkflowSubmissions: string[] = []

    for (const [fileIndex, file] of files.entries()) {
      const relativePath = file.webkitRelativePath || file.name
      const uploadNumber = fileIndex + 1

      setRelatedDocumentsMessage(
        `Submitting ${uploadNumber} of ${files.length} to Supabase and Extend: ${file.name}`,
      )

      try {
        const uploadedDocument = await uploadEditableInspectionDocument({
          file,
          name: getDocumentNameFromFile(file.name),
          description: getUploadDescription(source, relativePath),
          source,
          stableKey: `${source}:${relativePath}:${file.size}:${file.lastModified}`,
          submitToVendorInvoiceWorkflow: true,
          craneIdentifier: currentCraneIdentifier,
        })

        uploadedDocuments.push(uploadedDocument)
        if (uploadedDocument.workflowSubmissionError) {
          failedWorkflowSubmissions.push(`${file.name}: ${uploadedDocument.workflowSubmissionError}`)
        }

        setRelatedDocuments((currentDocuments) => {
          const nextDocumentMap = new Map(currentDocuments.map((document) => [document.id, document]))
          nextDocumentMap.set(uploadedDocument.id, uploadedDocument)
          return Array.from(nextDocumentMap.values()).sort((firstDocument, secondDocument) =>
            secondDocument.createdAt.localeCompare(firstDocument.createdAt),
          )
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed.'
        failedUploads.push(`${file.name}: ${message}`)
      }
    }

    if (uploadedDocuments.length > 0) {
      refreshMenuItemsAfterPdfUpload()
    }

    if (failedUploads.length > 0) {
      setRelatedDocumentsMessage(
        `${uploadedDocuments.length} PDF${uploadedDocuments.length === 1 ? '' : 's'} saved. ${failedUploads.length} failed before saving: ${failedUploads[0]}`,
      )
      return
    }

    if (failedWorkflowSubmissions.length > 0) {
      setRelatedDocumentsMessage(
        `${uploadedDocuments.length} PDF${uploadedDocuments.length === 1 ? '' : 's'} saved to Supabase. ${failedWorkflowSubmissions.length} Extend submission${failedWorkflowSubmissions.length === 1 ? '' : 's'} failed: ${failedWorkflowSubmissions[0]}`,
      )
      return
    }

    setRelatedDocumentsMessage(
      `${uploadedDocuments.length} PDF${uploadedDocuments.length === 1 ? '' : 's'} saved to Supabase and sent to Extend.`,
    )
  }

  const uploadRelatedFolder = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []) as Array<File & { webkitRelativePath?: string }>
    const pdfs = files.filter((file) => file.name.toLowerCase().endsWith('.pdf'))

    await addRelatedDocuments(pdfs, 'Folder upload')
  }

  const uploadRelatedPdfs = async (fileList: FileList | null) => {
    const pdfs = Array.from(fileList ?? []).filter((file) => file.name.toLowerCase().endsWith('.pdf'))
    await addRelatedDocuments(pdfs, 'Uploaded PDF')
  }

  const isExternalFileDrag = (event: DragEvent<HTMLElement>) =>
    !isMenuItemDrag(event) && Array.from(event.dataTransfer.types).includes('Files')

  const handlePagePdfDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!isExternalFileDrag(event)) return

    event.preventDefault()
    pagePdfDragDepth.current += 1
    setPagePdfDragActive(true)
  }

  const handlePagePdfDragOver = (event: DragEvent<HTMLElement>) => {
    if (!isExternalFileDrag(event)) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setPagePdfDragActive(true)
  }

  const handlePagePdfDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!isExternalFileDrag(event)) return

    event.preventDefault()
    pagePdfDragDepth.current = Math.max(0, pagePdfDragDepth.current - 1)
    if (pagePdfDragDepth.current === 0) setPagePdfDragActive(false)
  }

  const handlePagePdfDrop = async (event: DragEvent<HTMLElement>) => {
    if (!isExternalFileDrag(event)) return

    event.preventDefault()
    event.stopPropagation()
    pagePdfDragDepth.current = 0
    setPagePdfDragActive(false)

    const pdfs = Array.from(event.dataTransfer.files).filter((file) => file.name.toLowerCase().endsWith('.pdf'))
    setRelatedDocumentsOpen(true)
    await addRelatedDocuments(pdfs, 'Dropped PDF')
  }

  const openMenuItemSourceDocument = async (item: MenuItem) => {
    if (!item.sourceDocumentFilePath) {
      setRelatedDocumentsMessage('This menu item does not have a source PDF path yet.')
      return
    }

    try {
      const sourceDocumentUrl = await getEditableInspectionDocumentSignedUrl(
        item.sourceDocumentFilePath,
        item.sourceDocumentBucket ?? undefined,
      )
      window.open(sourceDocumentUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setRelatedDocumentsMessage(error instanceof Error ? error.message : 'Source PDF could not be opened.')
    }
  }

  const deleteRelatedDocument = async (document: RelatedDocument) => {
    setRelatedDocumentsMessage(`Deleting ${document.name}.`)

    try {
      await deleteEditableInspectionDocument(document)
      setRelatedDocuments((currentDocuments) =>
        currentDocuments.filter((currentDocument) => currentDocument.id !== document.id),
      )
      setRelatedDocumentsMessage(`${document.name} deleted.`)
    } catch (error) {
      setRelatedDocumentsMessage(error instanceof Error ? error.message : 'Document could not be deleted.')
    }
  }

  const addRepairSection = () => {
    const nextSectionId = createId('repair')
    setRepairSections((currentSections) =>
      saveRepairSections([
        ...currentSections,
        {
          id: nextSectionId,
          title: 'New Repair Item',
          description: '',
          status: 'Repair',
          lineItems: [],
          costSections: createDefaultRepairCostSections(nextSectionId),
        },
      ]),
    )
    toggleRepairSectionVisibility(nextSectionId, true)
  }

  const updateRepairSection = (sectionId: string, field: 'title' | 'description' | 'status', value: string) => {
    setRepairSections((currentSections) =>
      saveRepairSections(
        currentSections.map((section) =>
          section.id === sectionId ? { ...section, [field]: value } : section,
        ),
      ),
    )
  }

  const removeRepairSection = (sectionId: string) => {
    setRepairSections((currentSections) =>
      saveRepairSections(currentSections.filter((section) => section.id !== sectionId)),
    )
  }

  const warnIfDecayedMenuItem = (item: MenuItem) => {
    if (isMenuItemDecayed(item)) setDecayedMenuItemWarning(item)
  }

  const addRepairCostLineItem = (repairSectionId: string, costSectionId: string) => {
    setRepairSections((currentSections) =>
      saveRepairSections(
        currentSections.map((section) =>
          section.id === repairSectionId
            ? {
                ...section,
                costSections: section.costSections.map((costSection) =>
                  costSection.id === costSectionId
                    ? {
                        ...costSection,
                        lineItems: [
                          ...costSection.lineItems,
                          createManualLineItem(createId('line'), 'Add line item here.'),
                        ],
                      }
                    : costSection,
                ),
              }
            : section,
        ),
      ),
    )
  }

  const updateRepairCostLineItem = (
    repairSectionId: string,
    costSectionId: string,
    lineItemId: string,
    field: 'description' | 'internalCost' | 'quantity' | 'customerPrice' | 'rate' | 'margin',
    value: string,
  ) => {
    setRepairSections((currentSections) =>
      saveRepairSections(
        currentSections.map((section) =>
          section.id === repairSectionId
            ? {
                ...section,
                costSections: section.costSections.map((costSection) =>
                  costSection.id === costSectionId
                    ? {
                        ...costSection,
                        lineItems: costSection.lineItems.map((lineItem) => {
                          if (lineItem.id !== lineItemId) return lineItem
                          if (field === 'internalCost') {
                            return {
                              ...lineItem,
                              internalCost: value,
                              rate: value,
                              margin: getUnitMargin(parseMoney(value), getCustomerUnitPrice(lineItem)).toFixed(2),
                            }
                          }
                          if (field === 'customerPrice') {
                            return {
                              ...lineItem,
                              customerPrice: value,
                              margin: getUnitMargin(getInternalUnitCost(lineItem), parseMoney(value)).toFixed(2),
                            }
                          }
                          if (field === 'margin') {
                            return {
                              ...lineItem,
                              margin: value,
                              customerPrice: (getInternalUnitCost(lineItem) * (1 + parseMoney(value) / 100)).toFixed(2),
                            }
                          }
                          return { ...lineItem, [field]: value }
                        }),
                      }
                    : costSection,
                ),
              }
            : section,
        ),
      ),
    )
  }

  const addMenuItemToRepairCostSection = (repairSectionId: string, costSectionId: string, item: MenuItem) => {
    addMenuItemToRecentlyUsed(item)
    warnIfDecayedMenuItem(item)
    setRepairSections((currentSections) =>
      saveRepairSections(
        currentSections.map((section) =>
          section.id === repairSectionId
            ? {
                ...section,
                costSections: section.costSections.map((costSection) =>
                  costSection.id === costSectionId
                    ? {
                        ...costSection,
                        lineItems: [
                          ...costSection.lineItems,
                          createMenuLineItem(createId('line'), item),
                        ],
                      }
                    : costSection,
                ),
              }
            : section,
        ),
      ),
    )
  }

  const removeRepairCostLineItem = (repairSectionId: string, costSectionId: string, lineItemId: string) => {
    setRepairSections((currentSections) =>
      saveRepairSections(
        currentSections.map((section) =>
          section.id === repairSectionId
            ? {
                ...section,
                costSections: section.costSections.map((costSection) =>
                  costSection.id === costSectionId
                    ? {
                        ...costSection,
                        lineItems: costSection.lineItems.filter((lineItem) => lineItem.id !== lineItemId),
                      }
                    : costSection,
                ),
              }
            : section,
        ),
      ),
    )
  }

  const addCostLineItem = (sectionId: string) => {
    setCostSections((currentSections) =>
      saveCostSections(
        currentSections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                lineItems: [
                  ...section.lineItems,
                  createManualLineItem(createId('line'), 'Add line item here.'),
                ],
              }
            : section,
        ),
      ),
    )
  }

  const updateCostSectionTitle = (sectionId: string, value: string) => {
    setCostSections((currentSections) =>
      saveCostSections(
        currentSections.map((section) => (section.id === sectionId ? { ...section, title: value } : section)),
      ),
    )
  }

  const toggleCostSection = (sectionId: string, checked: boolean) => {
    setCostSections((currentSections) => {
      if (currentSections.some((section) => section.id === sectionId)) return currentSections

      const sectionToAdd = defaultCostSections.find((section) => section.id === sectionId)
      if (!sectionToAdd) return currentSections

      const nextSections = [...currentSections, sectionToAdd].sort(
        (firstSection, secondSection) =>
          defaultCostSections.findIndex((section) => section.id === firstSection.id)
          - defaultCostSections.findIndex((section) => section.id === secondSection.id),
      )
      return saveCostSections(nextSections)
    })
    setEstimateCostSectionVisibility((currentVisibility) => {
      const nextVisibility = { ...currentVisibility, [sectionId]: checked }
      window.localStorage.setItem(estimateCostSectionVisibilityStorageKey, JSON.stringify(nextVisibility))
      return nextVisibility
    })
  }

  const toggleEstimateNote = (note: keyof EstimateNoteVisibility, checked: boolean) => {
    setEstimateNoteVisibility((currentVisibility) => {
      const nextVisibility = { ...currentVisibility, [note]: checked }
      window.localStorage.setItem(estimateNoteVisibilityStorageKey, JSON.stringify(nextVisibility))
      return nextVisibility
    })
  }

  const updateCostLineItem = (
    sectionId: string,
    lineItemId: string,
    field: 'description' | 'internalCost' | 'quantity' | 'customerPrice' | 'rate' | 'margin',
    value: string,
  ) => {
    setCostSections((currentSections) =>
      saveCostSections(
        currentSections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                lineItems: section.lineItems.map((lineItem) => {
                  if (lineItem.id !== lineItemId) return lineItem
                  if (field === 'internalCost') {
                    return {
                      ...lineItem,
                      internalCost: value,
                      rate: value,
                      margin: getUnitMargin(parseMoney(value), getCustomerUnitPrice(lineItem)).toFixed(2),
                    }
                  }
                  if (field === 'customerPrice') {
                    return {
                      ...lineItem,
                      customerPrice: value,
                      margin: getUnitMargin(getInternalUnitCost(lineItem), parseMoney(value)).toFixed(2),
                    }
                  }
                  if (field === 'margin') {
                    return {
                      ...lineItem,
                      margin: value,
                      customerPrice: (getInternalUnitCost(lineItem) * (1 + parseMoney(value) / 100)).toFixed(2),
                    }
                  }
                  return { ...lineItem, [field]: value }
                }),
              }
            : section,
        ),
      ),
    )
  }

  const addMenuItemToCostSection = (sectionId: string, item: MenuItem) => {
    addMenuItemToRecentlyUsed(item)
    warnIfDecayedMenuItem(item)
    setCostSections((currentSections) =>
      saveCostSections(
        currentSections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                lineItems: [
                  ...section.lineItems,
                  createMenuLineItem(createId('line'), item),
                ],
              }
            : section,
        ),
      ),
    )
  }

  const removeCostLineItem = (sectionId: string, lineItemId: string) => {
    setCostSections((currentSections) =>
      saveCostSections(
        currentSections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                lineItems: section.lineItems.filter((lineItem) => lineItem.id !== lineItemId),
              }
            : section,
        ),
      ),
    )
  }

  const goBackToJobsQuotingList = async () => {
    navigate('/jobsquotinglist')
  }

  const saveEditableReportFromButton = () => {
    saveCurrentEditableReportNow().catch((error) => {
      setReportDatabaseStatus('error')
      console.error('Editable report could not be saved.', error)
    })
  }

  const refreshJobReportPrintReports = useCallback(async () => {
    if (!isConfigured) {
      setJobReportPrintReports([])
      setJobReportPrintMessage('Supabase is not configured.')
      return []
    }

    if (!normalizedCurrentJobNumber) {
      setJobReportPrintReports([])
      setJobReportPrintMessage('No job number found for this report.')
      return []
    }

    setJobReportPrintLoading(true)
    setJobReportPrintMessage('')

    try {
      const reportsForJob = await getEditableInspectionReportsForJobNumber(normalizedCurrentJobNumber)
      setJobReportPrintReports(reportsForJob)
      setJobReportPrintMessage(reportsForJob.length > 0 ? '' : 'No saved reports found for this job number.')
      return reportsForJob
    } catch (error) {
      setJobReportPrintReports([])
      setJobReportPrintMessage('Could not load reports for this job number.')
      console.error('Editable reports for job number could not be loaded.', error)
      return []
    } finally {
      setJobReportPrintLoading(false)
    }
  }, [normalizedCurrentJobNumber])

  const printEditableReport = () => {
    const previousTitle = document.title
    document.title = currentReportName || 'DESHAZO Quote Proposal'

    const restoreTitle = () => {
      document.title = previousTitle
      window.removeEventListener('afterprint', restoreTitle)
    }

    window.addEventListener('afterprint', restoreTitle)
    window.print()
    window.setTimeout(restoreTitle, 1000)
  }

  const openJobReportPrintMenu = async () => {
    setJobReportPrintMenuOpen((isOpen) => !isOpen)
    if (!jobReportPrintMenuOpen) {
      const reportsForJob = await refreshJobReportPrintReports()
      setSelectedJobReportPrintIds(new Set(getJobReportPrintOptionIds(reportsForJob)))
    }
  }

  const toggleJobReportPrintSelection = (optionId: string) => {
    setJobReportPrintDownloadMessage('')
    setSelectedJobReportPrintIds((currentIds) => {
      const nextIds = new Set(currentIds)
      if (nextIds.has(optionId)) {
        nextIds.delete(optionId)
      } else {
        nextIds.add(optionId)
      }
      return nextIds
    })
  }

  const selectAllJobReportPrintOptions = () => {
    setJobReportPrintDownloadMessage('')
    setSelectedJobReportPrintIds(new Set(jobReportPrintOptionIds))
  }

  const downloadCheckedJobReportsPdf = () => {
    const selectedSources = jobReportPrintOptions
      .filter((option) => selectedJobReportPrintIds.has(option.id))
      .map((option) => ({
        dNumber: option.dNumber,
        reportName: option.reportName,
        payload: option.payload,
      }))

    if (selectedSources.length === 0) {
      setJobReportPrintDownloadMessage('Select at least one D number.')
      return
    }

    const printWindow = window.open('', '_blank')

    if (printWindow) {
      printWindow.document.write(getCombinedReportTemplateHtml(selectedSources))
      printWindow.document.close()
      printWindow.focus()
      printWindow.setTimeout(() => {
        printWindow.print()
      }, 250)
      setJobReportPrintDownloadMessage(`Opened ${selectedSources.length} report${selectedSources.length === 1 ? '' : 's'} for PDF download.`)
      return
    }

    const blob = createCombinedReportsPdfBlob(selectedSources)
    const downloadUrl = URL.createObjectURL(blob)
    const downloadLink = document.createElement('a')
    downloadLink.href = downloadUrl
    downloadLink.download = `editable-inspection-reports-${normalizedCurrentJobNumber || 'selected'}.pdf`
    document.body.appendChild(downloadLink)
    downloadLink.click()
    downloadLink.remove()
    URL.revokeObjectURL(downloadUrl)
    setJobReportPrintDownloadMessage('Popup blocked. Downloaded a simplified PDF instead.')
  }

  const selectJobReportPrintOption = (option: (typeof jobReportPrintOptions)[number]) => {
    setJobReportPrintMenuOpen(false)

    if (option.isCurrent || !option.reportId) {
      printEditableReport()
      return
    }

    setSearchParams({ editableReportId: option.reportId })
  }

  const openJobReportInNewTab = (option: (typeof jobReportPrintOptions)[number]) => {
    const reportUrl = new URL('/editable-inspection-report', window.location.origin)
    if (option.reportId) {
      reportUrl.searchParams.set('editableReportId', option.reportId)
    } else {
      window.open(window.location.href, '_blank', 'noopener,noreferrer')
      return
    }
    window.open(reportUrl.toString(), '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className="min-h-screen bg-[#e8eaef] text-[#111]"
      onDragEnter={handlePagePdfDragEnter}
      onDragOver={handlePagePdfDragOver}
      onDragLeave={handlePagePdfDragLeave}
      onDrop={handlePagePdfDrop}
    >
      <style>
        {`
          .editable-report-field {
            min-width: 0;
            border-radius: 2px;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            box-shadow: inset 0 0 0 1px transparent;
          }

          .editable-report-field:hover {
            background: rgba(255, 184, 0, 0.12);
            box-shadow: inset 0 0 0 1px rgba(245, 175, 0, 0.38);
          }

          .editable-report-field:focus {
            background: #fffdf3;
            outline: 0;
            box-shadow: inset 0 0 0 1.5px #f3a900;
          }

          .report-document {
            box-sizing: border-box;
            width: ${printedPageWidthIn}in;
            min-height: ${printedPageHeightIn}in;
            border: 1px solid #111;
            background: #fff;
            box-shadow: 0 24px 70px -40px rgba(17, 24, 39, 0.62);
          }

          .report-page-sheet {
            display: none;
          }

          .report-content-layer {
            box-sizing: border-box;
            width: ${printedPageWidthIn}in;
            padding: ${printedPageMarginIn}in;
          }

          .original-inspection-attachment-page {
            box-sizing: border-box;
            width: ${printedPageWidthIn}in;
            min-height: ${printedPageHeightIn}in;
            padding: ${printedPageMarginIn}in;
            margin-top: ${runtimePageGapPx}px;
            border: 1px solid #111;
            background: #fff;
            box-shadow: 0 24px 70px -40px rgba(17, 24, 39, 0.62);
            break-before: page;
            page-break-before: always;
          }

          .original-inspection-attachment-page canvas {
            display: block;
            max-width: 100%;
            height: auto !important;
          }

          .report-runtime-page-break {
            break-before: page;
            page-break-before: always;
          }

          .report-content-layer:focus-within .report-runtime-page-break {
            break-before: auto;
            page-break-before: auto;
            margin-top: 0 !important;
          }

          .report-content-layer:focus-within .report-runtime-page-break.mt-3 {
            margin-top: 0.75rem !important;
          }

          .report-content-layer:focus-within .report-runtime-page-break.mt-5 {
            margin-top: 1.25rem !important;
          }

          .report-content-layer:focus-within .report-runtime-page-break.mt-6 {
            margin-top: 1.5rem !important;
          }

          @media print {
            *,
            *::before,
            *::after {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            @page {
              size: ${printedPageWidthIn}in ${printedPageHeightIn}in;
              margin: ${printedPageMarginIn}in;
            }

            html,
            body {
              background: #fff !important;
              height: auto !important;
              overflow: visible !important;
            }

            .report-toolbar {
              display: none !important;
            }

            .report-inline-action {
              display: none !important;
            }

            .report-shell {
              display: block !important;
              height: auto !important;
              min-height: 0 !important;
              overflow: visible !important;
              padding: 0 !important;
              background: #fff !important;
            }

            .editor-workspace,
            .canvas-stage {
              display: block !important;
              height: auto !important;
              min-height: 0 !important;
              overflow: visible !important;
              padding: 0 !important;
              background: #fff !important;
            }

            .report-document,
            .report-content-layer {
              width: auto !important;
              min-height: auto !important;
              padding: 0 !important;
              height: auto !important;
              box-shadow: none !important;
              border: 0 !important;
            }

            .original-inspection-attachment-page {
              width: auto !important;
              min-height: auto !important;
              padding: 0 !important;
              border: 0 !important;
              box-shadow: none !important;
              margin-top: 0 !important;
            }

            .report-page-sheet {
              display: none !important;
            }

            .report-runtime-page-break {
              margin-top: 0 !important;
            }

            .repair-section {
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .report-print-empty-section {
              display: none !important;
            }

            .editable-report-field:hover,
            .editable-report-field:focus {
              background: transparent !important;
              outline: 0 !important;
              box-shadow: none !important;
            }
          }
        `}
      </style>
      {pagePdfDragActive ? (
        <div className="report-toolbar pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-[#273f7a]/18 px-6">
          <div className="rounded-md border-2 border-dashed border-[#273f7a] bg-white px-8 py-5 text-center shadow-[0_24px_70px_-34px_rgba(47,86,166,0.55)]">
            <div className="text-[18px] font-black text-[#273f7a]">Drop PDF to upload</div>
            <div className="mt-1 text-[13px] font-bold text-[#555b66]">It will be added to Related Documents and processed for menu items.</div>
          </div>
        </div>
      ) : null}

      <header className="report-toolbar sticky top-0 z-30 flex h-14 items-center justify-between bg-[var(--deshazo-blue)] px-5 text-white shadow-sm">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={goBackToJobsQuotingList}
            className="flex h-9 w-9 items-center justify-center rounded-md border-2 border-white/80 text-[20px] font-black leading-none transition hover:bg-white/10"
            aria-label="Go back to Jobs Quoting List"
            title="Back to Jobs Quoting List"
          >
            ⌂
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setRelatedDocumentsOpen((currentOpen) => !currentOpen)}
              className="rounded-md px-3 py-2 text-sm font-black transition hover:bg-white/10"
              aria-expanded={relatedDocumentsOpen}
            >
              Related Documents
            </button>
            {relatedDocumentsOpen ? (
              <div className="absolute left-0 top-[calc(100%+14px)] z-50 w-[340px] rounded-[18px] border border-[var(--deshazo-border)] bg-white p-2 text-[var(--deshazo-text)] shadow-[0_24px_70px_-34px_rgba(47,86,166,0.45)]">
                <input
                  ref={relatedFolderInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  {...{ webkitdirectory: '', directory: '' }}
                  onChange={(event) => {
                    uploadRelatedFolder(event.currentTarget.files)
                    event.currentTarget.value = ''
                  }}
                />
                <input
                  ref={relatedPdfInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    uploadRelatedPdfs(event.currentTarget.files)
                    event.currentTarget.value = ''
                  }}
                />
                <div className="mb-2 rounded-md border border-[#dfe4ef] bg-[#fbfcff] p-2">
                  <div className="text-[12px] font-black uppercase text-[#273f7a]">Upload Documents</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => relatedFolderInputRef.current?.click()}
                      className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[#273f7a] transition hover:bg-[#edf2fb]"
                    >
                      Choose Folder
                    </button>
                    <button
                      type="button"
                      onClick={() => relatedPdfInputRef.current?.click()}
                      className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[#273f7a] transition hover:bg-[#edf2fb]"
                    >
                      Upload PDF
                    </button>
                  </div>
                  {relatedDocumentsMessage ? (
                    <div className="mt-2 text-[12px] font-semibold text-[#747b8a]">{relatedDocumentsMessage}</div>
                  ) : null}
                  {menuItemsRefreshProgress.active ? (
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-black uppercase text-[#273f7a]">
                        <span>Loading in vendor items</span>
                        <span>{Math.round(menuItemsRefreshProgress.percent)}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#dfe4ef]">
                        <div
                          className="h-full rounded-full bg-[#273f7a] transition-[width] duration-500"
                          style={{ width: `${menuItemsRefreshProgress.percent}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
                {originalInspectionDocument ? (
                  <a
                    href={originalInspectionDocument.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setRelatedDocumentsOpen(false)}
                    className="w-full rounded-md px-3 py-3 text-left transition hover:bg-[#f4f6fb]"
                  >
                    <span className="block text-[14px] font-black text-[#1f2430]">Original Inspection Report</span>
                    <span className="mt-0.5 block text-[12px] font-semibold text-[#747b8a]">{originalInspectionDocument.description}</span>
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    if (masterServiceAgreementDocument?.url) {
                      window.open(masterServiceAgreementDocument.url, '_blank', 'noopener,noreferrer')
                    } else {
                      setMasterServiceAgreementOpen(true)
                    }
                    setRelatedDocumentsOpen(false)
                  }}
                  className="mt-1 w-full rounded-md px-3 py-3 text-left transition hover:bg-[#f4f6fb]"
                >
                  <span className="block text-[14px] font-black text-[#1f2430]">Master Service Agreement</span>
                  <span className="mt-0.5 block text-[12px] font-semibold text-[#747b8a]">Open the saved pricing PDF.</span>
                </button>
                {uploadedRelatedDocuments.length > 0 ? (
                  <div className="mt-2 border-t border-[#dfe4ef] pt-2">
                    {uploadedRelatedDocuments.map((document) => (
                      <div
                        key={document.id}
                        className="mt-1 flex items-start gap-2 rounded-md px-3 py-2 transition hover:bg-[#f4f6fb]"
                      >
                        <a
                          href={document.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setRelatedDocumentsOpen(false)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate text-[13px] font-black text-[#1f2430]">{document.name}</span>
                          <span className="mt-0.5 block text-[11px] font-semibold text-[#747b8a]">{document.description || document.source}</span>
                        </a>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            deleteRelatedDocument(document)
                          }}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#e0b8b8] bg-white text-[15px] font-black leading-none text-[#a82727] transition hover:border-[#d98b8b] hover:bg-[#fff5f5]"
                          aria-label={`Delete ${document.name}`}
                          title={`Delete ${document.name}`}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-md bg-white/10 px-4 py-2 text-sm font-black tracking-wide shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]">
          Job Number {getJobNumberDisplayFromReport(report)}
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden rounded-md border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold md:block">
            {reportDatabaseStatus === 'saving'
              ? 'Saving...'
              : reportDatabaseStatus === 'error'
                ? 'Save error'
                : currentEditableReportId
                  ? 'Saved report'
                  : `Saved ${updatedAt}`}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveEditableReportFromButton}
              className="rounded-md border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20"
            >
              Save
            </button>
            {isUuid(currentJobsQuotingItemId || '') || isUuid(currentEditableReportId) ? (
              <button
                type="button"
                onClick={() => {
                  const params = isUuid(currentJobsQuotingItemId || '')
                    ? `jobsQuotingItemId=${encodeURIComponent(currentJobsQuotingItemId || '')}`
                    : `editableReportId=${encodeURIComponent(currentEditableReportId)}`
                  navigate(`/equipment-notebook-llm?${params}`)
                }}
                className="rounded-md border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20"
              >
                AI Chat
              </button>
            ) : null}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  void openJobReportPrintMenu()
                }}
                className="rounded-md bg-white px-4 py-2 text-sm font-black text-[var(--deshazo-blue)] shadow-[0_10px_24px_-20px_rgba(47,86,166,0.55)] transition hover:bg-[var(--deshazo-surface)]"
                aria-haspopup="menu"
                aria-expanded={jobReportPrintMenuOpen}
              >
                Print PDF
              </button>
              {jobReportPrintMenuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+8px)] z-40 w-[240px] overflow-hidden rounded-md border border-[#d8dce8] bg-white text-[#1f2430] shadow-[0_20px_50px_-28px_rgba(21,32,57,0.5)]"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-[#edf0f6] px-3 py-2">
                    <span className="min-w-0 truncate text-[11px] font-black uppercase tracking-[0.08em] text-[#6f7788]">
                      Job {normalizedCurrentJobNumber || '---'}
                    </span>
                    <button
                      type="button"
                      onClick={selectAllJobReportPrintOptions}
                      className="shrink-0 rounded-sm px-1.5 py-1 text-[10px] font-black uppercase text-[#273f7a] transition hover:bg-[#eef3ff] disabled:cursor-not-allowed disabled:text-[#a7adba]"
                      disabled={jobReportPrintOptionIds.length === 0 || allJobReportPrintOptionsSelected}
                    >
                      Select All
                    </button>
                  </div>
                  {jobReportPrintLoading ? (
                    <div className="px-3 py-3 text-[12px] font-bold text-[#747b8a]">Loading D numbers...</div>
                  ) : jobReportPrintOptions.length > 0 ? (
                    <div className="max-h-[280px] overflow-y-auto py-1">
                      {jobReportPrintOptions.map((option) => (
                        <div
                          key={option.id}
                          role="menuitem"
                          className="flex w-full items-center gap-2 px-3 py-2 transition hover:bg-[#f5f7ff]"
                        >
                          <input
                            type="checkbox"
                            checked={selectedJobReportPrintIds.has(option.id)}
                            onChange={() => toggleJobReportPrintSelection(option.id)}
                            className="h-4 w-4 shrink-0 accent-[#273f7a]"
                            aria-label={`Select ${option.dNumber}`}
                          />
                          <button
                            type="button"
                            onClick={() => selectJobReportPrintOption(option)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-[13px] font-black text-[#1f2430]">{option.dNumber}</span>
                              {option.isCurrent ? (
                                <span className="shrink-0 rounded-sm bg-[#e8eefc] px-1.5 py-0.5 text-[10px] font-black uppercase text-[#273f7a]">
                                  Current
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] font-semibold text-[#747b8a]">{option.reportName}</span>
                          </button>
                          {option.isCurrent ? null : (
                            <button
                              type="button"
                              onClick={() => openJobReportInNewTab(option)}
                              className="shrink-0 rounded-md border border-[#d6dbe9] bg-white px-2.5 py-1.5 text-[11px] font-black text-[#273f7a] transition hover:border-[#b9c4e4] hover:bg-[#eef3ff]"
                            >
                              Open
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-3 text-[12px] font-bold text-[#747b8a]">
                      {jobReportPrintMessage || 'No D numbers found.'}
                    </div>
                  )}
                  <div className="border-t border-[#edf0f6] p-2">
                    <button
                      type="button"
                      onClick={downloadCheckedJobReportsPdf}
                      className="mb-2 w-full rounded-md bg-[#1f2430] px-3 py-2 text-[12px] font-black text-white transition hover:bg-[#343b4d] disabled:cursor-not-allowed disabled:bg-[#a7adba]"
                      disabled={selectedJobReportPrintCount === 0}
                    >
                      Download Checked PDF{selectedJobReportPrintCount > 0 ? ` (${selectedJobReportPrintCount})` : ''}
                    </button>
                    {jobReportPrintDownloadMessage ? (
                      <div className="mb-2 px-1 text-[11px] font-bold text-[#747b8a]">{jobReportPrintDownloadMessage}</div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setJobReportPrintMenuOpen(false)
                        printEditableReport()
                      }}
                      className="w-full rounded-md bg-[#273f7a] px-3 py-2 text-[12px] font-black text-white transition hover:bg-[#1f3261]"
                    >
                      Print Current Report
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="editor-workspace report-shell flex h-[calc(100vh-56px)] overflow-hidden bg-[var(--bg)]">
        <aside className={`report-toolbar relative flex shrink-0 flex-col border-r border-[#d9dce5] bg-[#fbfcff] shadow-sm transition-[width] duration-200 ${menuCollapsed ? 'w-[42px]' : 'w-[260px]'}`}>
          {menuCollapsed ? (
            <button
              type="button"
              onClick={toggleMenuCollapsed}
              className="flex h-full w-full items-center justify-center bg-white text-[#273f7a] transition hover:bg-[#f5f7ff]"
              aria-label="Open menu items"
            >
              <span className="[writing-mode:vertical-rl] rotate-180 text-[12px] font-black uppercase tracking-[0.12em]">
                Menu Items
              </span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleMenuCollapsed}
                className="absolute right-[-15px] top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[#d4dbea] bg-white text-[17px] font-black text-[#273f7a] shadow-sm transition hover:bg-[#f5f7ff]"
                aria-label="Hide menu items"
              >
                ‹
              </button>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
                <div className="mb-4 pr-4">
                  <p className="text-[16px] font-black text-[#1f2430]">Menu Items</p>
                  <p className="mt-1 text-[12px] font-semibold leading-tight text-[#747b8a]">
                    Drag an item into a repair or estimate section.
                  </p>
                </div>

                <label className="mb-4 block">
                  <span className="sr-only">Search menu items</span>
                  <input
                    value={menuSearch}
                    onChange={(event) => setMenuSearch(event.currentTarget.value)}
                    placeholder="Search menu items..."
                    className="w-full rounded-md border border-[#cfd6e5] bg-white px-3 py-2 text-[13px] font-bold text-[#1f2430] outline-none transition placeholder:text-[#9aa2b2] focus:border-[#273f7a]"
                  />
                </label>
                <label className="mb-4 grid gap-1.5 text-[10px] font-black uppercase tracking-[0.04em] text-[#747b8a]">
                  Search filter
                  <select
                    value={menuSearchBranchScope}
                    onChange={(event) => setMenuSearchBranchScope(event.currentTarget.value === 'all' ? 'all' : 'branches')}
                    className="w-full rounded-md border border-[#cfd6e5] bg-white px-3 py-2 text-[12px] font-black normal-case tracking-normal text-[#1f2430] outline-none transition focus:border-[#273f7a]"
                  >
                    <option value="branches">
                      {menuSearchBranchesLabel}
                    </option>
                    <option value="all">All</option>
                  </select>
                </label>
                {menuSearchMessage ? (
                  <p className="mb-3 rounded-md border border-[#dfe4ef] bg-white px-3 py-2 text-[11px] font-bold text-[#4d5360]">
                    {menuSearchMessage}
                  </p>
                ) : null}

                <div className="space-y-4">
                  {menuSearchLoading ? (
                    <div className="rounded-md border border-[#dfe4ef] bg-white px-3 py-4 text-center text-[12px] font-bold text-[#747b8a]">
                      Searching database...
                    </div>
                  ) : visibleMenuItemSections[0]?.items.length ? (
                      <div className="space-y-2">
                        {!menuSearch.trim() && currentMenuDNumber ? (
                          <div className="rounded-md border border-[#dfe4ef] bg-[#f4f7ff] px-3 py-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#747b8a]">
                              D-number section
                            </p>
                            <p className="mt-0.5 text-[13px] font-black text-[#273f7a]">{currentMenuDNumber}</p>
                          </div>
                        ) : null}
                        {visibleMenuItemSections[0].items.map((item) => {
                          const createdDateLabel = getMenuItemCreatedDateLabel(item)
                          const decayed = isMenuItemDecayed(item)

                          return (
                          <div
                            key={item.id ?? item.label}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData(menuItemDataTransferType, JSON.stringify(item))
                              event.dataTransfer.setData('text/plain', item.description)
                              event.dataTransfer.effectAllowed = 'copy'
                            }}
                            className={cx(
                              'w-full cursor-grab rounded-md border px-3 py-2 text-left shadow-[0_8px_20px_-18px_rgba(31,36,48,0.45)] transition active:cursor-grabbing',
                              decayed
                                ? 'border-[#9f7430] bg-[#f2dda1] shadow-[inset_0_0_0_1px_rgba(93,61,20,0.16),inset_0_0_26px_rgba(112,72,22,0.22),0_8px_20px_-18px_rgba(31,36,48,0.45)] hover:border-[#7f5722] hover:bg-[#efd48b]'
                                : 'border-[#dde3ef] bg-white hover:border-[#9bb0dc] hover:bg-[#f5f7ff]',
                            )}
                            style={decayed
                              ? {
                                  backgroundImage:
                                    'linear-gradient(135deg, rgba(255,255,238,0.34) 0%, rgba(255,255,238,0) 36%, rgba(102,63,17,0.13) 100%), repeating-linear-gradient(0deg, rgba(120,82,31,0.08) 0, rgba(120,82,31,0.08) 1px, transparent 1px, transparent 8px), repeating-linear-gradient(90deg, rgba(90,58,20,0.05) 0, rgba(90,58,20,0.05) 1px, transparent 1px, transparent 13px)',
                                }
                              : undefined}
                          >
                            <span className="flex items-start justify-between gap-2">
                              <span className="min-w-0 text-[13px] font-black leading-tight text-[#273f7a]">{item.label}</span>
                              <button
                                type="button"
                                draggable={false}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openMenuItemEditor(item)
                                }}
                                onDragStart={(event) => event.preventDefault()}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#d8deea] bg-white text-[#4d5360] transition hover:border-[#9bb0dc] hover:bg-[#eef3ff] hover:text-[#273f7a]"
                                aria-label={`Edit ${item.label}`}
                                title={`Edit ${item.label}`}
                              >
                                <PencilIcon />
                              </button>
                            </span>
                            <span className="mt-1 block text-[12px] font-semibold leading-tight text-[#4d5360]">{item.description}</span>
                            <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-black text-[#111]">
                              <span>Internal {formatMoney(parseMoney(item.internalCost ?? item.rate))}</span>
                              <span>Customer {formatMoney(parseMoney(item.customerPrice ?? item.rate))}</span>
                            </span>
                            {createdDateLabel ? (
                              <span className={cx('mt-1 block text-[10px] font-black uppercase', decayed ? 'text-[#9a6a12]' : 'text-[#8a92a3]')}>
                                Created at {createdDateLabel}
                              </span>
                            ) : null}
                            {item.sourceDocumentName ? (
                              <button
                                type="button"
                                draggable={false}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openMenuItemSourceDocument(item)
                                }}
                                onDragStart={(event) => event.preventDefault()}
                                className="mt-2 block max-w-full whitespace-normal break-words rounded-md border border-[#9fd5b0] bg-[#effaf2] px-2 py-1 text-left text-[10px] font-black uppercase leading-tight text-[#1f7a3a] shadow-sm transition hover:border-[#70bd87] hover:bg-[#e3f6e8]"
                                title={`Open source PDF: ${item.sourceDocumentName}`}
                              >
                                {item.sourceDocumentName}
                              </button>
                            ) : null}
                          </div>
                          )
                        })}
                      </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-[#cfd6e5] bg-white px-3 py-5 text-center text-[12px] font-bold text-[#747b8a]">
                      No menu items found.
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-[#d9dce5] bg-white p-4">
                {menuItemsRefreshProgress.active ? (
                  <div className="mb-3 rounded-md border border-[var(--deshazo-border)] bg-white px-3 py-2">
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-black uppercase text-[var(--deshazo-blue)]">
                      <span>Loading in vendor items</span>
                      <span>{Math.round(menuItemsRefreshProgress.percent)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#dfe4ef]">
                      <div
                        className="h-full rounded-full bg-[var(--deshazo-blue)] transition-[width] duration-500"
                        style={{ width: `${menuItemsRefreshProgress.percent}%` }}
                      />
                    </div>
                  </div>
                ) : null}
                <div
                  className={`mb-3 rounded-md border px-3 py-2 text-[11px] font-bold leading-tight ${
                    menuDatabaseStatus === 'error'
                      ? 'border-[#f3c7c7] bg-[#fff5f5] text-[#9f1d1d]'
                      : menuDatabaseStatus === 'local'
                        ? 'border-[var(--deshazo-border)] bg-white text-[rgba(21,24,33,0.58)]'
                        : 'border-[#cfe6d5] bg-[#f3fbf5] text-[#286239]'
                  }`}
                >
                  {menuDatabaseMessage}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPendingAddMenuLineItem(null)
                    setMenuSettingsOpen(true)
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--deshazo-blue)] px-3 py-2.5 text-[13px] font-black text-white shadow-[0_12px_26px_-20px_rgba(47,86,166,0.7)] transition hover:bg-[var(--deshazo-blue-deep)]"
                >
                  <span className="text-[16px]">⚙</span>
                  <span>Menu Settings</span>
                </button>
              </div>
            </>
          )}
        </aside>

        <main className="canvas-stage min-w-0 flex-1 overflow-auto bg-[linear-gradient(180deg,var(--deshazo-surface)_0%,var(--bg)_100%)] px-8 py-7">
          <div className="mx-auto w-fit">
            <div className="report-toolbar mb-3 flex items-center justify-between rounded-[14px] border border-[var(--deshazo-border)] bg-white/80 px-4 py-3 text-[rgba(21,24,33,0.62)] shadow-[0_14px_30px_-28px_rgba(47,86,166,0.42)]">
              <div className="text-[16px] font-black text-[var(--deshazo-text)]">
                Page 1 <span className="font-bold text-[rgba(21,24,33,0.55)]">- Quote proposal</span>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPageLayoutMenuOpen((currentOpen) => !currentOpen)}
                  className="rounded-md border border-[#c8cfdb] bg-white px-3 py-2 text-[12px] font-black uppercase text-[#273f7a] shadow-sm transition hover:bg-[#f5f7ff]"
                  aria-expanded={pageLayoutMenuOpen}
                >
                  Edit Page Layout
                </button>
                {pageLayoutMenuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[330px] rounded-md border border-[#cfd6e5] bg-white p-3 text-left shadow-[0_18px_48px_-28px_rgba(15,23,42,0.55)]">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black uppercase text-[#555b66]">Page hierarchy</span>
                      <button
                        type="button"
                        onClick={() => setPageLayoutMenuOpen(false)}
                        className="rounded-md border border-[#d8deea] bg-white px-2.5 py-1 text-[11px] font-black uppercase text-[#273f7a] transition hover:bg-[#f4f6fb]"
                        aria-label="Done editing page layout"
                      >
                        Done
                      </button>
                    </div>

                    <div className="space-y-3">
                      <section className="rounded-md border border-[#e3e8f1] bg-[#fbfcff] p-2">
                        <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px] font-black text-[#1f2430]">
                          <span>Contact</span>
                          <input
                            type="checkbox"
                            checked={blockVisibility.contact}
                            onChange={(event) => setQuoteBlockVisibility('contact', event.currentTarget.checked)}
                            className="h-4 w-4 accent-[#273f7a]"
                          />
                        </label>
                      </section>

                      <section className="rounded-md border border-[#e3e8f1] bg-[#fbfcff] p-2">
                        <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px] font-black text-[#1f2430]">
                          <span>Scope of Work</span>
                          <input
                            type="checkbox"
                            checked={blockVisibility.scopeOfWork}
                            onChange={(event) => setQuoteBlockVisibility('scopeOfWork', event.currentTarget.checked)}
                            className="h-4 w-4 accent-[#273f7a]"
                          />
                        </label>
                      </section>

                      <section className="rounded-md border border-[#e3e8f1] bg-[#fbfcff] p-2">
                        <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px] font-black text-[#1f2430]">
                          <span>Repair Items</span>
                          <input
                            type="checkbox"
                            checked={blockVisibility.repairItems}
                            onChange={(event) => setQuoteBlockVisibility('repairItems', event.currentTarget.checked)}
                            className="h-4 w-4 accent-[#273f7a]"
                          />
                        </label>
                        <div className="mt-2 space-y-1 border-l border-[#d8deea] pl-3">
                          {repairSections.map((section) => (
                            <div key={section.id} className="rounded-sm px-2 py-1">
                              <label className="flex cursor-pointer items-center justify-between gap-3 text-[12px] font-bold text-[#4d5360] transition hover:bg-white">
                                <span className="min-w-0 flex-1 truncate">{section.title}</span>
                                <input
                                  type="checkbox"
                                  checked={repairSectionVisibility[section.id] !== false}
                                  onChange={(event) => toggleRepairSectionVisibility(section.id, event.currentTarget.checked)}
                                  className="h-4 w-4 accent-[#273f7a]"
                                />
                              </label>
                              <div className="mt-1 space-y-1 border-l border-[#d8deea] pl-3">
                                {section.costSections.map((costSection) => (
                                  <label
                                    key={costSection.id}
                                    className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1 text-[11px] font-bold text-[#4d5360] transition hover:bg-white"
                                  >
                                    <span className="min-w-0 flex-1 truncate">{costSection.title}</span>
                                    <input
                                      type="checkbox"
                                      checked={isRepairCostSectionVisible(repairSectionVisibility, section.id, costSection.id)}
                                      onChange={(event) =>
                                        toggleRepairCostSectionVisibility(section.id, costSection.id, event.currentTarget.checked)
                                      }
                                      className="h-4 w-4 accent-[#273f7a]"
                                    />
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="rounded-md border border-[#e3e8f1] bg-[#fbfcff] p-2">
                        <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px] font-black text-[#1f2430]">
                          <span>Estimate Summary</span>
                          <input
                            type="checkbox"
                            checked={blockVisibility.estimateSummary}
                            onChange={(event) => setQuoteBlockVisibility('estimateSummary', event.currentTarget.checked)}
                            className="h-4 w-4 accent-[#273f7a]"
                          />
                        </label>
                        <div className="mt-2 space-y-1 border-l border-[#d8deea] pl-3">
                          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1 text-[12px] font-bold text-[#7d5c00] transition hover:bg-white">
                            <span>Top Note</span>
                            <input
                              type="checkbox"
                              checked={estimateNoteVisibility.topNote}
                              onChange={(event) => toggleEstimateNote('topNote', event.currentTarget.checked)}
                              className="h-4 w-4 accent-[#f5b400]"
                            />
                          </label>
                          {defaultCostSections.map((section) => (
                            <label
                              key={section.id}
                              className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1 text-[12px] font-bold text-[#4d5360] transition hover:bg-white"
                            >
                              <span>{section.title}</span>
                              <input
                                type="checkbox"
                                checked={estimateCostSectionVisibility[section.id] !== false}
                                onChange={(event) => toggleCostSection(section.id, event.currentTarget.checked)}
                                className="h-4 w-4 accent-[#273f7a]"
                              />
                            </label>
                          ))}
                          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1 text-[12px] font-bold text-[#7d5c00] transition hover:bg-white">
                            <span>Bottom Note</span>
                            <input
                              type="checkbox"
                              checked={estimateNoteVisibility.bottomNote}
                              onChange={(event) => toggleEstimateNote('bottomNote', event.currentTarget.checked)}
                              className="h-4 w-4 accent-[#f5b400]"
                            />
                          </label>
                        </div>
                      </section>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="report-document relative">
              {Array.from({ length: runtimePageCount }, (_, pageIndex) => (
                <div
                  key={pageIndex}
                  className="report-page-sheet"
                  style={{ top: `calc(${pageIndex * printedPageHeightIn}in + ${pageIndex * runtimePageGapPx}px)` }}
                  aria-hidden="true"
                />
              ))}
            <article
              ref={reportContentRef}
              className="report-content-layer relative z-10"
              onFocusCapture={() => setIsReportEditing(true)}
              onBlurCapture={() => {
                window.setTimeout(() => {
                  if (!reportContentRef.current?.contains(document.activeElement)) {
                    setIsReportEditing(false)
                  }
                })
              }}
            >
          <section className="grid grid-cols-[1.2fr_1fr_0.95fr] items-center bg-[#f5b400] px-6 py-2">
            <div>
              <EditableText id="logoName" data={report} onChange={updateField} className="text-[30px] font-black leading-none tracking-[-0.04em]" />
              <EditableText id="logoTagline" data={report} onChange={updateField} className="text-[10px] font-black leading-tight" />
            </div>
            <div className="space-y-0.5 text-[12px] font-semibold leading-tight">
              <EditableText id="branch" data={report} onChange={updateField} />
              <EditableText id="phone" data={report} onChange={updateField} />
            </div>
            <EditableText id="title" data={report} onChange={updateField} className="text-right text-[18px] font-black leading-tight" />
          </section>

          <section className="px-6 py-3">
            <div className="grid grid-cols-[34px_1.5fr_0.85fr_0.9fr] items-center border-b border-[#bcbcbc]">
              <div className="flex h-[34px] items-center justify-center">
                <div className="relative h-6 w-8 border-t-2 border-[#111]">
                  <span className="absolute left-0.5 top-[-5px] h-1.5 w-1.5 rounded-full bg-[#111]" />
                  <span className="absolute right-0.5 top-[-5px] h-1.5 w-1.5 rounded-full bg-[#111]" />
                  <span className="absolute left-2 top-0 h-5 border-l-2 border-[#111]" />
                  <span className="absolute right-2 top-0 h-5 border-l-2 border-[#111]" />
                  <span className="absolute left-1/2 top-1 h-4 -translate-x-1/2 border-l border-[#111]" />
                </div>
              </div>
              <EditableText
                id="summary"
                data={report}
                onChange={updateField}
                protectedPrefix="D"
                className="border-r border-[#cfcfcf] px-2 text-[12px] font-bold leading-tight"
              />
              <EditableText id="type" data={report} onChange={updateField} className="border-r border-[#cfcfcf] px-2 text-[12px] font-bold leading-tight" />
              <EditableText id="date" data={report} onChange={updateField} className="px-2 text-[12px] font-bold leading-tight" />
            </div>

            <div className="grid grid-cols-[1.7fr_0.9fr_0.95fr] border-b border-[#d4d4d4] text-[11px] font-bold leading-tight">
              <EditableText id="structure" data={report} onChange={updateField} className="px-2 py-0.5" />
              <EditableText id="description" data={report} onChange={updateField} className="border-l border-[#d4d4d4] px-2 py-0.5" />
              <EditableText id="customer" data={report} onChange={updateField} className="border-l border-[#d4d4d4] px-2 py-0.5" />
            </div>

            <div className="grid grid-cols-4 text-[11px] font-semibold leading-tight">
              {cells.flatMap((row, rowIndex) =>
                shouldShowReportTableRow(row, rowIndex, report)
                  ? row.map((fieldId, columnIndex) => (
                      <EditableText
                        key={fieldId}
                        id={fieldId}
                        data={report}
                        onChange={updateField}
                        protectedPrefix={fieldId === 'jobNumber' ? 'Job #: ' : undefined}
                        className={`min-h-[21px] border-b border-[#dcdcdc] px-2 py-0.5 ${
                          columnIndex > 0 ? 'border-l border-[#d4d4d4]' : ''
                        } ${rowIndex === 1 ? 'font-bold' : ''}`}
                      />
                    ))
                  : [],
              )}
            </div>

            {blockVisibility.contact ? (
            <section
              data-report-block-id="contact"
              style={getRuntimePageBreakStyle('contact')}
              className={`relative mt-3 border border-[#d4d4d4] ${getRuntimePageBreakClassName('contact')}`}
            >
              <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-[#d4d4d4] bg-[#f7f7f7] text-[11px] font-black uppercase text-[#555b66]">
                <div className="px-2 py-1">Contact Name</div>
                <div className="border-l border-[#d4d4d4] px-2 py-1">Email</div>
                <div className="border-l border-[#d4d4d4] px-2 py-1">Phone Number</div>
              </div>
              <div className="grid grid-cols-[1fr_1fr_1fr] text-[12px] font-semibold leading-tight">
                <EditableText id="contactName" data={report} onChange={updateField} className="px-2 py-1.5" />
                <EditableText id="contactEmail" data={report} onChange={updateField} className="border-l border-[#d4d4d4] px-2 py-1.5" />
                <EditableText id="contactPhone" data={report} onChange={updateField} className="border-l border-[#d4d4d4] px-2 py-1.5" />
              </div>
            </section>
            ) : null}

            {blockVisibility.scopeOfWork ? (
            <section
              data-report-block-id="scope-of-work"
              style={getRuntimePageBreakStyle('scope-of-work')}
              className={`relative mt-3 border border-[#d4d4d4] ${getRuntimePageBreakClassName('scope-of-work')}`}
            >
              <EditableText
                id="scopeOfWorkHeader"
                data={report}
                onChange={updateField}
                className="bg-[#f2f2f2] px-3 py-2 text-[17px] font-black"
              />
              <EditableText
                id="scopeOfWork"
                data={report}
                onChange={updateField}
                multiline
                className="min-h-[58px] border-t border-[#d4d4d4] px-3 py-3 text-[14px] font-semibold leading-snug"
              />
            </section>
            ) : null}

            {blockVisibility.repairItems ? (
            <section className="relative mt-3 border border-[#d4d4d4]">
              <div className="flex items-center justify-between gap-3 bg-[#f2f2f2]">
                <EditableText
                  id="sectionHeader"
                  data={report}
                  onChange={updateField}
                  className="flex-1 px-3 py-2 text-[17px] font-black uppercase"
                />
                <button
                  type="button"
                  onClick={addRepairSection}
                  className="report-inline-action mr-2 rounded-md border border-[#bdc4d3] bg-white px-3 py-1.5 text-[12px] font-black uppercase text-[#273f7a] transition hover:bg-[#edf2fb]"
                >
                  Add Repair Item
                </button>
              </div>

              <div className="border-t border-[#d4d4d4]">
                {visibleRepairSections.map((section, sectionIndex) => {
                  const sectionTone = getRepairSectionTone(section.status)

                  return (
                    <section
                      key={section.id}
                      data-report-block-id={`repair-section-${section.id}`}
                      style={getRuntimePageBreakStyle(`repair-section-${section.id}`)}
                      className={`repair-section ${sectionTone.sectionBackground} ${getRuntimePageBreakClassName(`repair-section-${section.id}`)} ${
                        sectionIndex > 0 ? `border-t ${sectionTone.sectionBorder}` : ''
                      } ${hasPrintableRepairSectionLineItems(section) ? '' : 'report-print-empty-section'}`}
                    >
                      <div className={`grid grid-cols-[1fr_150px] gap-3 border-b ${sectionTone.sectionBorder} px-2.5 py-1`}>
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[13px] leading-tight">
                          <EditableValue
                            label={`${section.title} title`}
                            value={section.title}
                            onChange={(value) => updateRepairSection(section.id, 'title', value)}
                            className="min-w-[150px] font-black"
                            multiline
                          />
                          {section.description?.trim() ? (
                            <span className="font-black text-[#4d1f1f]"> - </span>
                          ) : null}
                          <EditableValue
                            label={`${section.title} repair description`}
                            value={section.description ?? ''}
                            onChange={(value) => updateRepairSection(section.id, 'description', value)}
                            className="min-w-[180px] flex-1 font-semibold text-[#4d1f1f]"
                            multiline
                          />
                        </div>
                        <div className="space-y-0.5">
                          <div className={`flex items-center justify-between gap-1.5 ${sectionTone.statusBackground} px-1.5 py-0.5 ${sectionTone.statusText}`}>
                            <span className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ${sectionTone.statusIcon} text-[9px] font-black text-white`}>
                              !
                            </span>
                            <EditableValue
                              label={`${section.title} status`}
                              value={section.status}
                              onChange={(value) => updateRepairSection(section.id, 'status', value)}
                              className="min-w-0 flex-1 text-[11px] font-black leading-tight"
                            />
                          </div>
                          {repairSections.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => removeRepairSection(section.id)}
                              className="report-inline-action w-full rounded-sm border border-[#d4a7a7] bg-white/70 px-1.5 py-0.5 text-[8px] font-black uppercase leading-tight text-[#7d1515] transition hover:bg-white"
                            >
                              Remove Section
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="bg-white">
                        {section.costSections.map((costSection) => (
                          <section
                            key={costSection.id}
                            onDragOver={(event) => {
                              if (!isMenuItemDrag(event)) return
                              event.preventDefault()
                              event.dataTransfer.dropEffect = 'copy'
                            }}
                            onDrop={(event) => {
                              if (!isMenuItemDrag(event)) return
                              event.preventDefault()
                              const item = getDroppedMenuItem(event)
                              if (item) addMenuItemToRepairCostSection(section.id, costSection.id, item)
                            }}
                            className={`border-b border-[#d8d8d8] ${hasLineItems(costSection.lineItems) ? '' : 'report-print-empty-section'}`}
                          >
                            <div className="border-b border-[#d8d8d8] bg-[#f7f7f7] px-3 py-1.5 text-[12px] font-black uppercase leading-tight text-[#273f7a]">
                              {costSection.title}
                            </div>
                            <div className="relative grid grid-cols-[1fr_86px_54px_92px_108px_112px_38px] border-b border-[#d8d8d8] bg-[#fbfbfb] text-[9px] font-black uppercase text-[#555b66]">
                              <div className="px-2 py-1">Description</div>
                              <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Internal Cost</div>
                              <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Qty</div>
                              <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Customer Price</div>
                              <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Total Internal Cost</div>
                              <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Total Customer Price</div>
                              <div className="report-inline-action border-l border-[#d8d8d8]" />
                              <div className="report-toolbar absolute left-[calc(100%+86px)] top-0 grid h-full w-[228px] grid-cols-3 overflow-hidden rounded-t-md border border-[#cfd6e5] bg-[#f7f8fb] text-[10px] font-black uppercase leading-tight text-[#555b66] shadow-[0_16px_34px_-28px_rgba(15,23,42,0.58)]">
                                <div className="px-3 py-2">Margin</div>
                                <div className="border-l border-[#cfd6e5] px-3 py-2 text-right">Profit Per Unit</div>
                                <div className="border-l border-[#cfd6e5] px-3 py-2 text-right">Total Profit</div>
                              </div>
                            </div>
                            {costSection.lineItems.map((lineItem, lineIndex) => (
                              <div
                                key={lineItem.id}
                                className="relative grid grid-cols-[1fr_86px_54px_92px_108px_112px_38px] border-b border-[#e5e5e5] text-[12px] font-semibold"
                              >
                                {activeDoneLineItem === `repair-cost-${section.id}-${costSection.id}-${lineItem.id}` ? (
                                  <button
                                    type="button"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => {
                                      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
                                      setActiveDoneLineItem('')
                                    }}
                                    className="report-inline-action absolute right-[-84px] top-1/2 z-20 -translate-y-1/2 rounded-r-md border border-l-0 border-[#2f9e44] bg-[#e7f8ec] px-2.5 py-1 text-[10px] font-black uppercase leading-none text-[#17652b] shadow-sm transition hover:bg-[#d3f3dc]"
                                    aria-label={`Finish editing ${costSection.title} line item ${lineIndex + 1}`}
                                  >
                                    Done
                                  </button>
                                ) : null}
                                <div className="flex min-h-[25px] items-start gap-2 px-2 py-1.5">
                                  <EditableValue
                                    label={`${section.title} ${costSection.title} line item ${lineIndex + 1}`}
                                    value={lineItem.description}
                                    onChange={(value) => updateRepairCostLineItem(section.id, costSection.id, lineItem.id, 'description', value)}
                                    onDropMenuItem={(item) => addMenuItemToRepairCostSection(section.id, costSection.id, item)}
                                    clearOnFocus={shouldClearPlaceholderDescription(lineItem.description)}
                                    onEditFocus={() => setActiveDoneLineItem(`repair-cost-${section.id}-${costSection.id}-${lineItem.id}`)}
                                    className="min-w-0 flex-1 leading-tight"
                                  />
                                </div>
                                <EditableValue
                                  label={`${section.title} ${costSection.title} internal cost ${lineIndex + 1}`}
                                  value={formatMoney(getInternalUnitCost(lineItem))}
                                  onChange={(value) => updateRepairCostLineItem(section.id, costSection.id, lineItem.id, 'internalCost', parseMoney(value).toFixed(2))}
                                  clearOnFocus={getInternalUnitCost(lineItem) === 0}
                                  onEditFocus={() => setActiveDoneLineItem(`repair-cost-${section.id}-${costSection.id}-${lineItem.id}`)}
                                  className="min-h-[25px] border-l border-[#e5e5e5] px-2 py-1.5 text-right"
                                />
                                <EditableValue
                                  label={`${section.title} ${costSection.title} quantity ${lineIndex + 1}`}
                                  value={lineItem.quantity}
                                  onChange={(value) => updateRepairCostLineItem(section.id, costSection.id, lineItem.id, 'quantity', value)}
                                  onEditFocus={() => setActiveDoneLineItem(`repair-cost-${section.id}-${costSection.id}-${lineItem.id}`)}
                                  className="min-h-[25px] border-l border-[#e5e5e5] px-2 py-1.5 text-right"
                                />
                                <EditableValue
                                  label={`${section.title} ${costSection.title} customer price ${lineIndex + 1}`}
                                  value={formatMoney(getCustomerUnitPrice(lineItem))}
                                  onChange={(value) => updateRepairCostLineItem(section.id, costSection.id, lineItem.id, 'customerPrice', parseMoney(value).toFixed(2))}
                                  clearOnFocus={getCustomerUnitPrice(lineItem) === 0}
                                  onEditFocus={() => setActiveDoneLineItem(`repair-cost-${section.id}-${costSection.id}-${lineItem.id}`)}
                                  className="min-h-[25px] border-l border-[#e5e5e5] px-2 py-1.5 text-right"
                                />
                                <div className="border-l border-[#e5e5e5] px-2 py-1.5 text-right font-black">
                                  {formatMoney(getInternalLineAmount(lineItem))}
                                </div>
                                <div className="border-l border-[#e5e5e5] px-2 py-1.5 text-right font-black">
                                  {formatMoney(getCustomerLineAmount(lineItem))}
                                </div>
                                <div className="report-toolbar absolute left-[calc(100%+86px)] top-0 grid h-full w-[228px] grid-cols-3 overflow-visible border-x border-b border-[#cfd6e5] bg-white text-[12px] font-black text-[#1f2430] shadow-[0_16px_34px_-28px_rgba(15,23,42,0.58)]">
                                  <div className="relative flex items-stretch">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveLineMenu('')
                                        setActiveMarginMenu((currentMenu) =>
                                          currentMenu === `repair-cost-${section.id}-${costSection.id}-${lineItem.id}`
                                            ? ''
                                            : `repair-cost-${section.id}-${costSection.id}-${lineItem.id}`,
                                        )
                                      }}
                                      className={`flex w-full items-center px-3 py-1.5 text-left transition ${getMarginCellClassName(lineItem.margin)}`}
                                      aria-label={`Open margin settings for ${section.title} ${costSection.title} line item ${lineIndex + 1}`}
                                    >
                                      {Math.round(parseMoney(lineItem.margin))}%
                                    </button>
                                    {activeMarginMenu === `repair-cost-${section.id}-${costSection.id}-${lineItem.id}` ? (
                                      <div className="absolute left-0 top-[calc(100%+4px)] z-30 w-[230px] rounded-md border border-[#cfd6e5] bg-white p-3 text-left shadow-[0_18px_44px_-28px_rgba(15,23,42,0.55)]">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                          <span className="text-[11px] font-black uppercase text-[#555b66]">Margin</span>
                                          <button
                                            type="button"
                                            onClick={() => setActiveMarginMenu('')}
                                            className="flex h-6 w-6 items-center justify-center rounded-md border border-[#d8deea] bg-white text-[13px] font-black text-[#4d5360] transition hover:bg-[#f4f6fb]"
                                            aria-label="Close margin settings"
                                          >
                                            x
                                          </button>
                                        </div>
                                        <label className="block text-[11px] font-black uppercase text-[#555b66]">
                                          Margin: {Math.round(parseMoney(lineItem.margin))}%
                                        </label>
                                        <input
                                          type="range"
                                          min="-100"
                                          max="100"
                                          step="1"
                                          value={parseMoney(lineItem.margin)}
                                          onChange={(event) =>
                                            updateRepairCostLineItem(section.id, costSection.id, lineItem.id, 'margin', event.currentTarget.value)
                                          }
                                          className="mt-2 w-full accent-[#273f7a]"
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center justify-end border-l border-[#e5e7ef] px-3 py-1.5 text-right">
                                    {formatMoney(getUnitProfit(getInternalUnitCost(lineItem), getCustomerUnitPrice(lineItem)))}
                                  </div>
                                  <div className="flex items-center justify-end border-l border-[#e5e7ef] px-3 py-1.5 text-right">
                                    {formatMoney(getLineProfit(getInternalLineAmount(lineItem), getCustomerLineAmount(lineItem)))}
                                  </div>
                                </div>
                                <div className="report-inline-action relative border-l border-[#e5e5e5]">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveMarginMenu('')
                                      setActiveLineMenu((currentMenu) =>
                                        currentMenu === `repair-cost-${section.id}-${costSection.id}-${lineItem.id}`
                                          ? ''
                                          : `repair-cost-${section.id}-${costSection.id}-${lineItem.id}`,
                                      )
                                    }}
                                    className="flex min-h-[25px] w-full items-center justify-center bg-white text-[19px] font-black leading-none text-[#4d5360] transition hover:bg-[#f4f6fb]"
                                    aria-label={`Open settings for ${costSection.title} line item ${lineIndex + 1}`}
                                  >
                                    ⚙
                                  </button>
                                  {activeLineMenu === `repair-cost-${section.id}-${costSection.id}-${lineItem.id}` ? (
                                    <div className="absolute right-0 top-[calc(100%+4px)] z-20 w-[230px] rounded-md border border-[#cfd6e5] bg-white p-3 text-left shadow-[0_18px_44px_-28px_rgba(15,23,42,0.55)]">
                                      <div className="mb-2 flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-black uppercase text-[#555b66]">Line settings</span>
                                        <button
                                          type="button"
                                          onClick={() => setActiveLineMenu('')}
                                          className="flex h-6 w-6 items-center justify-center rounded-md border border-[#d8deea] bg-white text-[13px] font-black text-[#4d5360] transition hover:bg-[#f4f6fb]"
                                          aria-label="Close line settings"
                                        >
                                          x
                                        </button>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          removeRepairCostLineItem(section.id, costSection.id, lineItem.id)
                                          setActiveLineMenu('')
                                        }}
                                        className="mb-3 w-full rounded-md border border-[#e1c6c6] bg-[#fff7f7] px-3 py-2 text-left text-[12px] font-black text-[#8a1a1a] transition hover:bg-[#fcecec]"
                                      >
                                        Delete item
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                            <div className="grid grid-cols-[1fr_150px_108px_112px_30px] bg-[#fbfbfb] text-[12px] font-black">
                              <div className="px-2 py-1.5">
                                <button
                                  type="button"
                                  onClick={() => addRepairCostLineItem(section.id, costSection.id)}
                                  className="report-inline-action rounded-md border border-[#bdc4d3] bg-[#f8fafc] px-2 py-1 text-[10px] font-black uppercase text-[#273f7a] transition hover:bg-[#edf2fb]"
                                >
                                  Add {costSection.title} Item
                                </button>
                              </div>
                              <div className="border-l border-[#d8d8d8] px-2 py-1.5 text-right uppercase text-[#555b66]">
                                {costSection.title} Subtotal
                              </div>
                              <div className="border-l border-[#d8d8d8] px-2 py-1.5 text-right text-[#111]">
                                {formatMoney(costSection.lineItems.reduce((total, lineItem) => total + getInternalLineAmount(lineItem), 0))}
                              </div>
                              <div className="border-l border-[#d8d8d8] px-2 py-1.5 text-right text-[#111]">
                                {formatMoney(costSection.lineItems.reduce((total, lineItem) => total + getCustomerLineAmount(lineItem), 0))}
                              </div>
                              <div className="report-inline-action border-l border-[#d8d8d8]" />
                            </div>
                          </section>
                        ))}
                        <div className="grid grid-cols-[1fr_150px_108px_112px_30px] bg-[#f0f4fb] text-[12px] font-black">
                          <div className="px-2 py-1.5" />
                          <div className="border-l border-[#d8d8d8] px-2 py-1.5 text-right uppercase text-[#273f7a]">
                            Repair Item Total
                          </div>
                          <div className="border-l border-[#d8d8d8] px-2 py-1.5 text-right text-[#111]">
                            {formatMoney(getRepairSectionInternalTotal(section))}
                          </div>
                          <div className="border-l border-[#d8d8d8] px-2 py-1.5 text-right text-[#111]">
                            {formatMoney(getRepairSectionCustomerTotal(section))}
                          </div>
                          <div className="report-inline-action border-l border-[#d8d8d8]" />
                        </div>
                      </div>
                    </section>
                  )
                })}
              </div>
            </section>
            ) : null}
            {blockVisibility.estimateSummary ? (
            <section className="relative mt-3">
              <div
                data-report-block-id="estimate-summary-header"
                data-report-keep-with-next="true"
                style={getRuntimePageBreakStyle('estimate-summary-header')}
                className={`border-x border-t border-[#d4d4d4] bg-[#f2f2f2] px-3 py-2 ${getRuntimePageBreakClassName('estimate-summary-header')}`}
              >
                <div className="text-[17px] font-black uppercase">Estimate Summary</div>
              </div>

              <div>
                {estimateNoteVisibility.topNote ? (
                  <div
                    data-report-block-id="estimate-top-note"
                    data-report-keep-with-next="true"
                    style={getRuntimePageBreakStyle('estimate-top-note')}
                    className={`border-x border-b border-[#d8d8d8] bg-[#fffdf3] px-3 py-2 ${getRuntimePageBreakClassName('estimate-top-note')}`}
                  >
                    <EditableText
                      id="estimateTopNote"
                      data={report}
                      onChange={updateField}
                      multiline
                      className="min-h-[34px] text-[13px] font-semibold leading-tight text-[#4d5360]"
                    />
                  </div>
                ) : null}
                {visibleCostSections.map((section) => (
                  <section
                    key={section.id}
                    data-report-block-id={`cost-section-${section.id}`}
                    style={getRuntimePageBreakStyle(`cost-section-${section.id}`)}
                    onDragOver={(event) => {
                      if (!isMenuItemDrag(event)) return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'copy'
                    }}
                    onDrop={(event) => {
                      if (!isMenuItemDrag(event)) return
                      event.preventDefault()
                      const item = getDroppedMenuItem(event)
                      if (item) addMenuItemToCostSection(section.id, item)
                    }}
                    className={`repair-section border-x border-b border-[#d4d4d4] bg-white ${getRuntimePageBreakClassName(`cost-section-${section.id}`)} ${hasLineItems(section.lineItems) ? '' : 'report-print-empty-section'}`}
                  >
                    <div className="relative flex items-center justify-between gap-3 border-b border-[#d8d8d8] bg-[#f7f7f7] px-3 py-1.5">
                      <EditableValue
                        label={`${section.title} section title`}
                        value={section.title}
                        onChange={(value) => updateCostSectionTitle(section.id, value)}
                        className="min-w-0 flex-1 text-[14px] font-black uppercase leading-tight text-[#273f7a]"
                      />
                    </div>

                    <div className="relative grid grid-cols-[1fr_86px_54px_92px_108px_112px_38px] border-b border-[#d8d8d8] bg-[#fbfbfb] text-[9px] font-black uppercase text-[#555b66]">
                      <div className="px-2 py-1">Description</div>
                      <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Internal Cost</div>
                      <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Qty</div>
                      <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Customer Price</div>
                      <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Total Internal Cost</div>
                      <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Total Customer Price</div>
                      <div className="report-inline-action border-l border-[#d8d8d8]" />
                      <div className="report-toolbar absolute left-[calc(100%+86px)] top-0 grid h-full w-[228px] grid-cols-3 overflow-hidden rounded-t-md border border-[#cfd6e5] bg-[#f7f8fb] text-[10px] font-black uppercase leading-tight text-[#555b66] shadow-[0_16px_34px_-28px_rgba(15,23,42,0.58)]">
                        <div className="px-3 py-2">Margin</div>
                        <div className="border-l border-[#cfd6e5] px-3 py-2 text-right">Profit Per Unit</div>
                        <div className="border-l border-[#cfd6e5] px-3 py-2 text-right">Total Profit</div>
                      </div>
                    </div>

                    {section.lineItems.map((lineItem, lineIndex) => (
                      <div
                        key={lineItem.id}
                        className="relative grid grid-cols-[1fr_86px_54px_92px_108px_112px_38px] border-b border-[#e5e5e5] text-[12px] font-semibold"
                      >
                        {activeDoneLineItem === `cost-${section.id}-${lineItem.id}` ? (
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
                              setActiveDoneLineItem('')
                            }}
                            className="report-inline-action absolute right-[-84px] top-1/2 z-20 -translate-y-1/2 rounded-r-md border border-l-0 border-[#2f9e44] bg-[#e7f8ec] px-2.5 py-1 text-[10px] font-black uppercase leading-none text-[#17652b] shadow-sm transition hover:bg-[#d3f3dc]"
                            aria-label={`Finish editing ${section.title} line item ${lineIndex + 1}`}
                          >
                            Done
                          </button>
                        ) : null}
                        {shouldShowAddMenuItemTag(lineItem) ? (
                          <button
                            type="button"
                            onClick={() =>
                              openMenuSettingsFromLineItem(lineItem, {
                                collection: 'cost',
                                sectionId: section.id,
                                lineItemId: lineItem.id,
                              })
                            }
                            className="report-inline-action absolute left-[-112px] top-1 z-10 rounded-l-md border border-r-0 border-[#d8b24f] bg-[#fff5cf] px-2 py-1 text-[9px] font-black uppercase leading-none text-[#6c4a00] shadow-sm transition hover:bg-[#ffeaa0]"
                            aria-label={`Add menu item from ${lineItem.description}`}
                            title="Add menu item"
                          >
                            <span className="mr-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-[#d8a91e] text-[9px] leading-none text-white">
                              +
                            </span>
                            Add Menu Item
                          </button>
                        ) : null}
                        <div className="flex min-h-[25px] items-start gap-2 px-2 py-1.5">
                          <EditableValue
                            label={`${section.title} line item ${lineIndex + 1}`}
                            value={lineItem.description}
                            onChange={(value) => updateCostLineItem(section.id, lineItem.id, 'description', value)}
                            onDropMenuItem={(item) => addMenuItemToCostSection(section.id, item)}
                            clearOnFocus={shouldClearPlaceholderDescription(lineItem.description)}
                            onEditFocus={() => setActiveDoneLineItem(`cost-${section.id}-${lineItem.id}`)}
                            className="min-w-0 flex-1 leading-tight"
                          />
                        </div>
                        <EditableValue
                          label={`${section.title} internal cost ${lineIndex + 1}`}
                          value={formatMoney(getInternalUnitCost(lineItem))}
                          onChange={(value) => updateCostLineItem(section.id, lineItem.id, 'internalCost', parseMoney(value).toFixed(2))}
                          clearOnFocus={getInternalUnitCost(lineItem) === 0}
                          onEditFocus={() => setActiveDoneLineItem(`cost-${section.id}-${lineItem.id}`)}
                          className="min-h-[25px] border-l border-[#e5e5e5] px-2 py-1.5 text-right"
                        />
                        <EditableValue
                          label={`${section.title} quantity ${lineIndex + 1}`}
                          value={lineItem.quantity}
                          onChange={(value) => updateCostLineItem(section.id, lineItem.id, 'quantity', value)}
                          onEditFocus={() => setActiveDoneLineItem(`cost-${section.id}-${lineItem.id}`)}
                          className="min-h-[25px] border-l border-[#e5e5e5] px-2 py-1.5 text-right"
                        />
                        <EditableValue
                          label={`${section.title} customer price ${lineIndex + 1}`}
                          value={formatMoney(getCustomerUnitPrice(lineItem))}
                          onChange={(value) => updateCostLineItem(section.id, lineItem.id, 'customerPrice', parseMoney(value).toFixed(2))}
                          clearOnFocus={getCustomerUnitPrice(lineItem) === 0}
                          onEditFocus={() => setActiveDoneLineItem(`cost-${section.id}-${lineItem.id}`)}
                          className="min-h-[25px] border-l border-[#e5e5e5] px-2 py-1.5 text-right"
                        />
                        <div className="border-l border-[#e5e5e5] px-2 py-1.5 text-right font-black">
                          {formatMoney(getInternalLineAmount(lineItem))}
                        </div>
                        <div className="border-l border-[#e5e5e5] px-2 py-1.5 text-right font-black">
                          {formatMoney(getCostCustomerLineAmount(section.id, lineItem, equipmentRentalSettings))}
                        </div>
                        <div className="report-toolbar absolute left-[calc(100%+86px)] top-0 grid h-full w-[228px] grid-cols-3 overflow-visible border-x border-b border-[#cfd6e5] bg-white text-[12px] font-black text-[#1f2430] shadow-[0_16px_34px_-28px_rgba(15,23,42,0.58)]">
                          <div className="relative flex items-stretch">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveLineMenu('')
                                setActiveMarginMenu((currentMenu) =>
                                  currentMenu === `cost-${section.id}-${lineItem.id}`
                                    ? ''
                                    : `cost-${section.id}-${lineItem.id}`,
                                )
                              }}
                              className={`flex w-full items-center px-3 py-1.5 text-left transition ${getMarginCellClassName(lineItem.margin)}`}
                              aria-label={`Open margin settings for ${section.title} line item ${lineIndex + 1}`}
                            >
                              {Math.round(parseMoney(lineItem.margin))}%
                            </button>
                            {activeMarginMenu === `cost-${section.id}-${lineItem.id}` ? (
                              <div className="absolute left-0 top-[calc(100%+4px)] z-30 w-[230px] rounded-md border border-[#cfd6e5] bg-white p-3 text-left shadow-[0_18px_44px_-28px_rgba(15,23,42,0.55)]">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-black uppercase text-[#555b66]">Margin</span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveMarginMenu('')}
                                    className="flex h-6 w-6 items-center justify-center rounded-md border border-[#d8deea] bg-white text-[13px] font-black text-[#4d5360] transition hover:bg-[#f4f6fb]"
                                    aria-label="Close margin settings"
                                  >
                                    x
                                  </button>
                                </div>
                                <label className="block text-[11px] font-black uppercase text-[#555b66]">
                                  Margin: {Math.round(parseMoney(lineItem.margin))}%
                                </label>
                                <input
                                  type="range"
                                  min="-100"
                                  max="100"
                                  step="1"
                                  value={parseMoney(lineItem.margin)}
                                  onChange={(event) =>
                                    updateCostLineItem(section.id, lineItem.id, 'margin', event.currentTarget.value)
                                  }
                                  className="mt-2 w-full accent-[#273f7a]"
                                />
                              </div>
                            ) : null}
                          </div>
                          <div className="flex items-center justify-end border-l border-[#e5e7ef] px-3 py-1.5 text-right">
                            {formatMoney(getUnitProfit(getInternalUnitCost(lineItem), getCostCustomerUnitPrice(section.id, lineItem, equipmentRentalSettings)))}
                          </div>
                          <div className="flex items-center justify-end border-l border-[#e5e7ef] px-3 py-1.5 text-right">
                            {formatMoney(getLineProfit(getInternalLineAmount(lineItem), getCostCustomerLineAmount(section.id, lineItem, equipmentRentalSettings)))}
                          </div>
                        </div>
                        <div className="report-inline-action relative border-l border-[#e5e5e5]">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMarginMenu('')
                              setActiveLineMenu((currentMenu) =>
                                currentMenu === `cost-${section.id}-${lineItem.id}`
                                  ? ''
                                  : `cost-${section.id}-${lineItem.id}`,
                              )
                            }}
                            className="flex min-h-[25px] w-full items-center justify-center bg-white text-[19px] font-black leading-none text-[#4d5360] transition hover:bg-[#f4f6fb]"
                            aria-label={`Open settings for ${section.title} line item ${lineIndex + 1}`}
                          >
                            ⚙
                          </button>
                          {activeLineMenu === `cost-${section.id}-${lineItem.id}` ? (
                            <div className="absolute right-0 top-[calc(100%+4px)] z-20 w-[230px] rounded-md border border-[#cfd6e5] bg-white p-3 text-left shadow-[0_18px_44px_-28px_rgba(15,23,42,0.55)]">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="text-[11px] font-black uppercase text-[#555b66]">Line settings</span>
                                <button
                                  type="button"
                                  onClick={() => setActiveLineMenu('')}
                                  className="flex h-6 w-6 items-center justify-center rounded-md border border-[#d8deea] bg-white text-[13px] font-black text-[#4d5360] transition hover:bg-[#f4f6fb]"
                                  aria-label="Close line settings"
                                >
                                  x
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  removeCostLineItem(section.id, lineItem.id)
                                  setActiveLineMenu('')
                                }}
                                className="mb-3 w-full rounded-md border border-[#e1c6c6] bg-[#fff7f7] px-3 py-2 text-left text-[12px] font-black text-[#8a1a1a] transition hover:bg-[#fcecec]"
                              >
                                Delete item
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}

                    <div className="grid grid-cols-[1fr_150px_108px_112px_30px] border-b border-[#d8d8d8] bg-[#fbfbfb] text-[12px] font-black">
                      <div className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => addCostLineItem(section.id)}
                          className="report-inline-action rounded-md border border-[#bdc4d3] bg-[#f8fafc] px-2 py-1 text-[10px] font-black uppercase text-[#273f7a] transition hover:bg-[#edf2fb]"
                        >
                          Add Line Item
                        </button>
                      </div>
                      <div className="border-l border-[#d8d8d8] px-2 py-1.5 text-right uppercase text-[#555b66]">
                        Subtotal
                      </div>
                      <div className="border-l border-[#d8d8d8] px-2 py-1.5 text-right text-[#111]">
                        {formatMoney(section.lineItems.reduce(
                          (total, lineItem) => total + getInternalLineAmount(lineItem),
                          0,
                        ))}
                      </div>
                      <div className="border-l border-[#d8d8d8] px-2 py-1.5 text-right text-[#111]">
                        {formatMoney(section.lineItems.reduce(
                          (total, lineItem) =>
                            total + getCostCustomerLineAmount(section.id, lineItem, equipmentRentalSettings),
                          0,
                        ))}
                      </div>
                      <div className="report-inline-action border-l border-[#d8d8d8]" />
                    </div>
                  </section>
                ))}
                {estimateNoteVisibility.bottomNote ? (
                  <div
                    data-report-block-id="estimate-bottom-note"
                    style={getRuntimePageBreakStyle('estimate-bottom-note')}
                    className={`border-x border-b border-[#d8d8d8] bg-[#fffdf3] px-3 py-2 ${getRuntimePageBreakClassName('estimate-bottom-note')}`}
                  >
                    <EditableText
                      id="estimateBottomNote"
                      data={report}
                      onChange={updateField}
                      multiline
                      className="min-h-[34px] text-[13px] font-semibold leading-tight text-[#4d5360]"
                    />
                  </div>
                ) : null}
              </div>
            </section>
            ) : null}

            {blockVisibility.grandTotal ? (
            <section
              data-report-block-id="grand-total"
              style={getRuntimePageBreakStyle('grand-total')}
              className={`relative mt-3 border-2 border-[#111] ${getRuntimePageBreakClassName('grand-total')}`}
            >
              <div className="grid grid-cols-[1fr_180px_160px] bg-[#f2f2f2] text-[16px] font-black">
                <div className="px-4 py-3 uppercase text-[#555b66]">Grand Total</div>
                <div className="border-l border-[#cfcfcf] px-4 py-3 text-right uppercase text-[#555b66]">Total</div>
                <div className="border-l border-[#111] bg-[#f5b400] px-4 py-3 text-right text-[#111]">
                  {formatMoney(invoiceTotal)}
                </div>
              </div>
              <div className="report-toolbar absolute left-[calc(100%+86px)] top-0 grid min-h-[70px] w-[252px] grid-cols-3 overflow-hidden border border-[#111] bg-white text-[#1f2430] shadow-[0_16px_34px_-28px_rgba(15,23,42,0.58)]">
                <div className={`flex flex-col justify-center px-3 py-2.5 ${getMarginCellClassName(String(grandTotalMargin))}`}>
                  <span className="text-[9px] font-black uppercase leading-tight">Margin</span>
                  <span className="mt-0.5 text-[13px] font-black">{Math.round(grandTotalMargin)}%</span>
                </div>
                <div className="flex flex-col justify-center border-l border-[#cfcfcf] px-3 py-2.5 text-right">
                  <span className="text-[9px] font-black uppercase leading-tight text-[#555b66]">Total Internal Cost</span>
                  <span className="mt-0.5 text-[13px] font-black">{formatMoney(grandTotalInternalCost)}</span>
                </div>
                <div className="flex flex-col justify-center border-l border-[#cfcfcf] px-3 py-2.5 text-right">
                  <span className="text-[9px] font-black uppercase leading-tight text-[#555b66]">Total Profit</span>
                  <span className="mt-0.5 text-[13px] font-black">{formatMoney(grandTotalProfit)}</span>
                </div>
              </div>
            </section>
            ) : null}

            {blockVisibility.notes ? (
            <section
              data-report-block-id="notes"
              style={getRuntimePageBreakStyle('notes')}
              className={`relative mt-3 border border-[#d4d4d4] ${getRuntimePageBreakClassName('notes')}`}
            >
              <EditableText
                id="notesHeader"
                data={report}
                onChange={updateField}
                className="bg-[#f2f2f2] px-3 py-2 text-[17px] font-black uppercase"
              />
              <EditableText
                id="notes"
                data={report}
                onChange={updateField}
                multiline
                linkify
                renderReadOnly={renderAdditionalNotesContent}
                className="min-h-[96px] px-3 py-3 text-[15px] font-semibold"
              />
            </section>
            ) : null}
          </section>
        </article>
            </div>
          </div>
      </main>
    </div>
    {menuSettingsOpen ? (
      <div className="report-toolbar fixed inset-0 z-50 flex items-center justify-center bg-[#151821]/45 px-4">
        <div className="w-full max-w-[680px] overflow-hidden rounded-[18px] border border-[var(--deshazo-border)] bg-white shadow-[0_28px_80px_-36px_rgba(47,86,166,0.65)]">
          <div className="flex items-center justify-between border-b border-[var(--deshazo-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,var(--deshazo-surface)_100%)] px-5 py-4">
            <div>
              <h2 className="text-[20px] font-black text-[var(--deshazo-text)]">Menu Settings</h2>
              <p className="mt-1 text-[13px] font-semibold text-[rgba(21,24,33,0.58)]">Add a draggable menu item.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPendingAddMenuLineItem(null)
                setMenuSettingsOpen(false)
              }}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white text-[16px] font-black text-[rgba(21,24,33,0.62)] transition hover:bg-[var(--deshazo-surface)]"
              aria-label="Close menu settings"
            >
              x
            </button>
          </div>

          <div className="grid gap-4 px-5 py-5">
            <label className="grid gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[rgba(21,24,33,0.62)]">
              Item name
              <input
                value={newMenuLabel}
                onChange={(event) => setNewMenuLabel(event.currentTarget.value)}
                placeholder="Example: Replacement contactor"
                className="rounded-md border border-[var(--deshazo-border)] px-3 py-2 text-[14px] font-bold normal-case text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]"
              />
            </label>

            <label className="grid gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[rgba(21,24,33,0.62)]">
              Description
              <textarea
                value={newMenuDescription}
                onChange={(event) => setNewMenuDescription(event.currentTarget.value)}
                placeholder="Description that will appear in the quote line item"
                className="min-h-[110px] resize-y rounded-md border border-[var(--deshazo-border)] px-3 py-2 text-[14px] font-semibold normal-case text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[rgba(21,24,33,0.62)]">
                Internal Cost
                <input
                  value={newMenuInternalCost}
                  onChange={(event) => setNewMenuInternalCost(event.currentTarget.value)}
                  inputMode="decimal"
                  className="rounded-md border border-[var(--deshazo-border)] px-3 py-2 text-[14px] font-bold normal-case text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]"
                />
              </label>

              <label className="grid gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[rgba(21,24,33,0.62)]">
                Customer Price
                <input
                  value={newMenuCustomerPrice}
                  onChange={(event) => setNewMenuCustomerPrice(event.currentTarget.value)}
                  inputMode="decimal"
                  className="rounded-md border border-[var(--deshazo-border)] px-3 py-2 text-[14px] font-bold normal-case text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--deshazo-border)] bg-[var(--deshazo-surface)]/55 px-5 py-4">
            <p className="text-[12px] font-semibold text-[rgba(21,24,33,0.58)]">{menuDatabaseMessage}</p>
            <button
              type="button"
              onClick={addMenuItemFromSettings}
              disabled={!newMenuLabel.trim() || !newMenuDescription.trim()}
              className="rounded-md bg-[var(--deshazo-blue)] px-5 py-2.5 text-[13px] font-black text-white shadow-[0_12px_26px_-20px_rgba(47,86,166,0.7)] transition hover:bg-[var(--deshazo-blue-deep)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Add Item
            </button>
          </div>
        </div>
      </div>
    ) : null}
    {editingMenuItem ? (
      <div className="report-toolbar fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 px-4">
        <div className="w-full max-w-[680px] rounded-md border border-[#cfd6e5] bg-white shadow-[0_28px_80px_-36px_rgba(15,23,42,0.75)]">
          <div className="flex items-center justify-between border-b border-[#dfe4ef] px-5 py-4">
            <div>
              <h2 className="text-[20px] font-black text-[#1f2430]">Edit Menu Item</h2>
            </div>
            <button
              type="button"
              onClick={() => setEditingMenuItem(null)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-[#d8deea] bg-white text-[16px] font-black text-[#4d5360] transition hover:bg-[#f4f6fb]"
              aria-label="Close menu item editor"
            >
              x
            </button>
          </div>

          <div className="grid gap-4 px-5 py-5">
            <label className="grid gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[#555b66]">
              Item name
              <input
                value={editingMenuItem.label}
                onChange={(event) => {
                  const nextLabel = event.currentTarget.value
                  setEditingMenuItem((currentItem) =>
                    currentItem ? { ...currentItem, label: nextLabel } : currentItem,
                  )
                }}
                className="rounded-md border border-[#cfd6e5] px-3 py-2 text-[14px] font-bold normal-case text-[#1f2430] outline-none focus:border-[#273f7a]"
              />
            </label>

            <label className="grid gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[#555b66]">
              Description
              <textarea
                value={editingMenuItem.description}
                onChange={(event) => {
                  const nextDescription = event.currentTarget.value
                  setEditingMenuItem((currentItem) =>
                    currentItem ? { ...currentItem, description: nextDescription } : currentItem,
                  )
                }}
                className="min-h-[110px] resize-y rounded-md border border-[#cfd6e5] px-3 py-2 text-[14px] font-semibold normal-case text-[#1f2430] outline-none focus:border-[#273f7a]"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[#555b66]">
                Internal Cost
                <input
                  value={editingMenuItem.internalCost}
                  onChange={(event) => {
                    const nextInternalCost = event.currentTarget.value
                    setEditingMenuItem((currentItem) =>
                      currentItem ? { ...currentItem, internalCost: nextInternalCost } : currentItem,
                    )
                  }}
                  inputMode="decimal"
                  className="rounded-md border border-[#cfd6e5] px-3 py-2 text-[14px] font-bold normal-case text-[#1f2430] outline-none focus:border-[#273f7a]"
                />
              </label>

              <label className="grid gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[#555b66]">
                Customer Price
                <input
                  value={editingMenuItem.customerPrice}
                  onChange={(event) => {
                    const nextCustomerPrice = event.currentTarget.value
                    setEditingMenuItem((currentItem) =>
                      currentItem ? { ...currentItem, customerPrice: nextCustomerPrice } : currentItem,
                    )
                  }}
                  inputMode="decimal"
                  className="rounded-md border border-[#cfd6e5] px-3 py-2 text-[14px] font-bold normal-case text-[#1f2430] outline-none focus:border-[#273f7a]"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[#dfe4ef] bg-[#fbfcff] px-5 py-4">
            <div className="min-w-0 pr-4 text-[12px] font-semibold text-[#747b8a]">
              <p className="font-black text-[#273f7a]">
                Uploaded by: {editingMenuItem.userId ? menuItemUploaderNames[editingMenuItem.userId] || 'Unknown user' : '-'}
              </p>
              <p>{menuDatabaseMessage}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={deleteEditedMenuItem}
                disabled={menuItemDeleting}
                className="rounded-md border border-[#e0b8b8] bg-white px-4 py-2.5 text-[13px] font-black text-[#a82727] transition hover:border-[#d98b8b] hover:bg-[#fff5f5] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {menuItemDeleting ? 'Deleting...' : 'Delete Item'}
              </button>
              <button
                type="button"
                onClick={saveEditedMenuItem}
                disabled={!editingMenuItem.label.trim() || !editingMenuItem.description.trim()}
                className="rounded-md bg-[#273f7a] px-5 py-2.5 text-[13px] font-black text-white transition hover:bg-[#1f3262] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Save Item
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    {decayedMenuItemWarning ? (
      <div className="report-toolbar fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 px-4">
        <div className="w-full max-w-[460px] overflow-hidden rounded-md border border-[#9f7430] bg-[#fff8df] shadow-[0_28px_80px_-36px_rgba(91,57,14,0.72)]">
          <div
            className="border-b border-[#d7b56e] px-5 py-4"
            style={{
              backgroundImage:
                'linear-gradient(135deg, rgba(255,255,238,0.48) 0%, rgba(255,255,238,0) 42%, rgba(102,63,17,0.14) 100%), repeating-linear-gradient(0deg, rgba(120,82,31,0.08) 0, rgba(120,82,31,0.08) 1px, transparent 1px, transparent 8px)',
            }}
          >
            <p className="text-[11px] font-black uppercase text-[#9a6a12]">Pricing check recommended</p>
            <h2 className="mt-1 text-[20px] font-black leading-tight text-[#3d2a10]">{decayedMenuItemWarning.label}</h2>
          </div>
          <div className="px-5 py-5">
            <p className="text-[14px] font-bold leading-relaxed text-[#4b3619]">
              Hey, this is an over-six-month-old menu item. You should check the pricing again because it could be outdated, and you want to make sure you have the correct pricing.
            </p>
            <p className="mt-3 text-[12px] font-black uppercase text-[#8f6822]">
              Created at {getMenuItemCreatedDateLabel(decayedMenuItemWarning) || 'an older date'}
            </p>
          </div>
          <div className="flex justify-end border-t border-[#e1c681] bg-[#f3dfaa] px-5 py-4">
            <button
              type="button"
              onClick={() => setDecayedMenuItemWarning(null)}
              className="rounded-md bg-[#273f7a] px-5 py-2.5 text-[13px] font-black text-white shadow-[0_12px_26px_-20px_rgba(39,63,122,0.7)] transition hover:bg-[#1f3262]"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    ) : null}
    {masterServiceAgreementOpen ? (
      <div className="report-toolbar fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/55 px-4 py-6">
        <div className="flex h-full w-full max-w-[920px] flex-col rounded-md border border-[#cfd6e5] bg-white shadow-[0_28px_80px_-36px_rgba(15,23,42,0.75)]">
          <div className="flex items-center justify-between border-b border-[#dfe4ef] px-5 py-3">
            <div>
              <h2 className="text-[18px] font-black text-[#1f2430]">Master Service Agreement</h2>
              <p className="mt-0.5 text-[12px] font-semibold text-[#747b8a]">Example pricing schedule for Wabash service work</p>
            </div>
            <button
              type="button"
              onClick={() => setMasterServiceAgreementOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-[#d8deea] bg-white text-[16px] font-black text-[#4d5360] transition hover:bg-[#f4f6fb]"
              aria-label="Close master service agreement"
            >
              x
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[#eef1f6] px-5 py-5">
            <article className="mx-auto min-h-[980px] max-w-[760px] bg-white px-12 py-10 text-[#1f2430] shadow-[0_18px_46px_-30px_rgba(15,23,42,0.5)]">
              <div className="border-b-4 border-[#f5b400] pb-4">
                <p className="text-[12px] font-black uppercase tracking-[0.08em] text-[#273f7a]">Example Agreement</p>
                <h3 className="mt-2 text-[30px] font-black leading-tight">Master Service Agreement</h3>
                <p className="mt-2 text-[13px] font-semibold text-[#5b606b]">
                  DESHAZO service pricing reference for quote proposal preparation.
                </p>
              </div>

              <section className="mt-6 grid grid-cols-2 gap-4 text-[13px] font-semibold">
                <div className="rounded-md border border-[#dfe4ef] p-4">
                  <p className="text-[11px] font-black uppercase text-[#747b8a]">Customer</p>
                  <p className="mt-1 text-[16px] font-black">Wabash</p>
                </div>
                <div className="rounded-md border border-[#dfe4ef] p-4">
                  <p className="text-[11px] font-black uppercase text-[#747b8a]">Covered Equipment</p>
                  <p className="mt-1 text-[16px] font-black">Crane {currentCraneIdentifier}</p>
                </div>
              </section>

              <section className="mt-7">
                <h4 className="text-[16px] font-black uppercase text-[#273f7a]">Labor Rates</h4>
                <div className="mt-3 overflow-hidden rounded-md border border-[#cfd6e5] text-[13px]">
                  <div className="grid grid-cols-[1fr_120px] bg-[#f7f8fb] text-[11px] font-black uppercase text-[#555b66]">
                    <div className="px-3 py-2">Service Type</div>
                    <div className="border-l border-[#cfd6e5] px-3 py-2 text-right">Rate</div>
                  </div>
                  {[
                    ['Regular technician labor', '$145.00/hr'],
                    ['Overtime technician labor', '$217.50/hr'],
                    ['Double-time emergency labor', '$290.00/hr'],
                    ['Project manager / engineering support', '$185.00/hr'],
                    ['Helper / apprentice labor', '$95.00/hr'],
                  ].map(([label, rate]) => (
                    <div key={label} className="grid grid-cols-[1fr_120px] border-t border-[#e5e9f2] font-semibold">
                      <div className="px-3 py-2">{label}</div>
                      <div className="border-l border-[#e5e9f2] px-3 py-2 text-right font-black">{rate}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-7">
                <h4 className="text-[16px] font-black uppercase text-[#273f7a]">Equipment, Travel, and Freight</h4>
                <div className="mt-3 grid gap-3 text-[13px] font-semibold">
                  {[
                    ['Service truck', '$85.00 per visit'],
                    ['Scissor lift rental', '$275.00 per day'],
                    ['Forklift / telehandler rental', '$425.00 per day'],
                    ['Freight and delivery', 'Actual cost plus 15%'],
                    ['Mileage outside service area', '$1.25 per mile'],
                  ].map(([label, rate]) => (
                    <div key={label} className="flex items-center justify-between rounded-md border border-[#dfe4ef] px-3 py-2">
                      <span>{label}</span>
                      <span className="font-black">{rate}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-7 rounded-md border border-[#e4d08a] bg-[#fff9df] p-4">
                <h4 className="text-[14px] font-black uppercase text-[#7d5c00]">Commercial Terms</h4>
                <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#4d5360]">
                  Parts are billed at quoted cost plus applicable margin. Taxes, permits, special site access,
                  and expedited freight are added when required. Pricing shown here is example data for this
                  quoting prototype.
                </p>
              </section>
            </article>
          </div>
        </div>
      </div>
    ) : null}
    </div>
  )
}
