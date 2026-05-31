import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { isConfigured } from '../lib/supabase'
import {
  deleteInspectionMenuItem,
  getInspectionMenuItems,
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
  getEditableInspectionReport,
  getEditableInspectionReportForJobsQuotingItem,
  getEditableInspectionReports,
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

type RepairSection = {
  id: string
  title: string
  status: string
  lineItems: RepairLineItem[]
}

type RepairSectionTone = {
  sectionBackground: string
  sectionBorder: string
  statusBackground: string
  statusText: string
  statusIcon: string
}

type CostSection = {
  id: string
  title: string
  lineItems: RepairLineItem[]
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
}

type PendingAddMenuLineItem = {
  collection: 'repair' | 'cost'
  sectionId: string
  lineItemId: string
}

type RelatedDocument = EditableInspectionDocument

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

const storageKey = 'deshazo-editable-inspection-report'
const repairStorageKey = 'deshazo-editable-inspection-report-repairs'
const costStorageKey = 'deshazo-editable-inspection-report-costs'
const menuStorageKey = 'deshazo-editable-inspection-report-menu-items'
const blockVisibilityStorageKey = 'deshazo-editable-inspection-report-block-visibility'
const menuCollapsedStorageKey = 'deshazo-editable-inspection-report-menu-collapsed'
const estimateNoteVisibilityStorageKey = 'deshazo-editable-inspection-report-estimate-note-visibility'
const repairSectionVisibilityStorageKey = 'deshazo-editable-inspection-report-repair-section-visibility'
const equipmentRentalSettingsStorageKey = 'deshazo-editable-inspection-report-equipment-rental-settings'
const equipmentRentalSectionId = 'equipment-rental'
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

const defaultAdditionalNotes = `1. Quote is subject to DeSHAZO General Terms and Conditions, available at http://www.deshazo.com/terms.
2. Unless specified in Scope of Work, all work is to be performed during normal working hours, Monday- Friday.
3. Any additional work beyond scope provided will be billed on a time and material basis.
4. Quote assumes free & clear access to crane, runway, and all components to be serviced.
5. Quote does not include tax and freight.
6. If a man-lift or equipment is required, Customer to provide, or DeShazo can provide at cost plus 20%.
7. Quote is valid for 30 days.
8. Payment Terms: Net 30 days.
9. Field work schedule subject to availability and delivery of parts, if applicable.

DeSHAZO appreciates the opportunity to provide you with this quotation. If you have any questions, please feel free to email me at jmelton@deshazo.com`

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

const defaultRepairSections: RepairSection[] = [
  {
    id: 'under-running-bridge-wheels',
    title: 'Under Running Bridge: Wheels',
    status: 'Repair',
    lineItems: [
      { id: 'wheel-line-1', description: 'Inspect wheel tread wear and flange condition.', quantity: '1', rate: '185.00', margin: '0' },
      { id: 'wheel-line-2', description: 'Confirm wheel bearings rotate freely under load.', quantity: '1', rate: '145.00', margin: '0' },
    ],
  },
  {
    id: 'under-running-bridge-conductors',
    title: 'Under Running Bridge: Conductors/Festoon System',
    status: 'Repair',
    lineItems: [
      { id: 'festoon-line-1', description: 'Replace damaged festoon cable carrier hardware.', quantity: '2', rate: '95.00', margin: '0' },
      { id: 'festoon-line-2', description: 'Verify conductor alignment through full bridge travel.', quantity: '1', rate: '125.00', margin: '0' },
    ],
  },
  {
    id: 'hoist-1-festoons',
    title: 'Hoist 1: Festoons',
    status: 'Repair',
    lineItems: [
      { id: 'hoist-line-1', description: 'Repair loose festoon trolley and check cable strain relief.', quantity: '1', rate: '210.00', margin: '0' },
    ],
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
    id: 'parts',
    title: 'Parts',
    lineItems: [{ id: 'parts-line-1', description: 'Parts required for listed repairs.', quantity: '1', rate: '0.00', margin: '0' }],
  },
  {
    id: 'labor',
    title: 'Labor',
    lineItems: [{ id: 'labor-line-1', description: 'Technician labor.', quantity: '1', rate: '0.00', margin: '0' }],
  },
  {
    id: 'equipment-rental',
    title: 'Equipment Rental',
    lineItems: [{ id: 'rental-line-1', description: 'Rental equipment.', quantity: '1', rate: '0.00', margin: '0' }],
  },
  {
    id: 'freight',
    title: 'Freight',
    lineItems: [{ id: 'freight-line-1', description: 'Freight and delivery.', quantity: '1', rate: '0.00', margin: '0' }],
  },
]

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

const getDNumberFromReport = (reportData: ReportData | Record<string, string>) => {
  const reportText = Object.values(reportData).join(' ')
  const match = reportText.match(/\bD[\s-]*\d{3,}\b/i)
  return match ? match[0].replace(/[\s-]+/g, '').toUpperCase() : ''
}

const normalizeReportIdentityValue = (value: string) => value.replace(/[^a-z0-9]/gi, '').toUpperCase()

const getJobNumberFromReport = (reportData: ReportData | Record<string, string>) =>
  normalizeReportIdentityValue(removeReportValueLabel(reportData.jobNumber ?? '').replace(/^#\s*/, ''))

const getJobNumberDisplayFromReport = (reportData: ReportData | Record<string, string>) =>
  removeReportValueLabel(reportData.jobNumber ?? '').replace(/^#\s*/, '').trim() || '---'

const getReportIdentity = (reportData: ReportData | Record<string, string>) => ({
  dNumber: normalizeReportIdentityValue(getDNumberFromReport(reportData)),
  jobNumber: getJobNumberFromReport(reportData),
})

const hasCompleteReportIdentity = (identity: ReturnType<typeof getReportIdentity>) =>
  Boolean(identity.dNumber && identity.jobNumber)

const reportIdentitiesMatch = (
  firstReportData: ReportData | Record<string, string>,
  secondReportData: ReportData | Record<string, string>,
) => {
  const firstIdentity = getReportIdentity(firstReportData)
  const secondIdentity = getReportIdentity(secondReportData)

  return (
    hasCompleteReportIdentity(firstIdentity) &&
    hasCompleteReportIdentity(secondIdentity) &&
    firstIdentity.dNumber === secondIdentity.dNumber &&
    firstIdentity.jobNumber === secondIdentity.jobNumber
  )
}

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
    scopeOfWork: '',
    notes: defaultAdditionalNotes,
  }
}

const getTextFromRecord = (value: unknown, keys: string[]) =>
  value && typeof value === 'object' ? getExtractedText(value, keys) : ''

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
      const title = [sectionName, componentName].filter(Boolean).join(': ') || `Inspection Item ${index + 1}`
      const status = getTextFromRecord(extractedItem, ['severity', 'status', 'type', 'condition']) || defaultStatus
      const note =
        getTextFromRecord(extractedItem, ['note', 'notes', 'description', 'comment', 'recommended_corrective_action', 'recommendedCorrectiveAction']) ||
        title

      return {
        id: `jobs-quoting-${item.id}-${index}`,
        title,
        status,
        lineItems: [
          {
            id: `jobs-quoting-${item.id}-${index}-line-1`,
            description: note,
            quantity: '1',
            rate: '0.00',
            margin: '0',
          },
        ],
      }
    })
    .filter((section): section is RepairSection => Boolean(section))

  if (sections.length > 0) return sections

  return [
    {
      id: `jobs-quoting-${item.id}-review`,
      title: item.documentName,
      status: item.safetyCount > item.repairCount ? 'Monitor' : 'Repair',
      lineItems: [
        {
          id: `jobs-quoting-${item.id}-review-line-1`,
          description: 'Review the saved split inspection PDF and add quote line items for the listed repair/safety scope.',
          quantity: '1',
          rate: '0.00',
          margin: '0',
        },
      ],
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

const getMarginCellClassName = (margin: string) =>
  parseMoney(margin) < 30
    ? 'bg-[#fbe3e3] text-[#8a1a1a] hover:bg-[#f7d4d4]'
    : 'bg-[#e2f5e7] text-[#17652b] hover:bg-[#d0edda]'

const getCostCustomerUnitPrice = (
  sectionId: string,
  lineItem: RepairLineItem,
  settings: EquipmentRentalSettings,
) => {
  const customerPrice = getCustomerUnitPrice(lineItem)
  const lineMargin = parseMoney(lineItem.margin)
  const sectionMargin =
    sectionId === equipmentRentalSectionId && settings.applyMarginToAll ? parseMoney(settings.margin) : 0
  return customerPrice * (1 + (lineMargin + sectionMargin) / 100)
}

const getCostCustomerLineAmount = (
  sectionId: string,
  lineItem: RepairLineItem,
  settings: EquipmentRentalSettings,
) =>
  parseMoney(lineItem.quantity) * getCostCustomerUnitPrice(sectionId, lineItem, settings)

const normalizeRepairSections = (sections: RepairSection[]) =>
  sections.map((section) => ({
    ...section,
    lineItems: section.lineItems.map((lineItem) => {
      const savedLineItem = lineItem as RepairLineItem & { text?: string }

      return {
        id: savedLineItem.id,
        description: savedLineItem.description ?? savedLineItem.text ?? 'Add repair detail here.',
        internalCost: savedLineItem.internalCost ?? savedLineItem.rate ?? '0.00',
        quantity: savedLineItem.quantity ?? '1',
        customerPrice: savedLineItem.customerPrice ?? getLegacyCustomerUnitPrice(savedLineItem).toFixed(2),
        rate: savedLineItem.rate ?? '0.00',
        margin: savedLineItem.customerPrice ? savedLineItem.margin ?? '0' : '0',
        source: savedLineItem.source,
      }
    }),
  }))

const normalizeCostSections = (sections: CostSection[]) =>
  sections.map((section) => ({
    ...section,
    lineItems: section.lineItems.map((lineItem) => {
      const savedLineItem = lineItem as RepairLineItem & { text?: string }

      return {
        id: savedLineItem.id,
        description: savedLineItem.description ?? savedLineItem.text ?? 'Add line item here.',
        internalCost: savedLineItem.internalCost ?? savedLineItem.rate ?? '0.00',
        quantity: savedLineItem.quantity ?? '1',
        customerPrice: savedLineItem.customerPrice ?? getLegacyCustomerUnitPrice(savedLineItem).toFixed(2),
        rate: savedLineItem.rate ?? '0.00',
        margin: savedLineItem.customerPrice ? savedLineItem.margin ?? '0' : '0',
        source: savedLineItem.source,
      }
    }),
  }))

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

  return nextReport
}

const getNormalizedReportPayload = (report: EditableInspectionReport): EditableInspectionReportPayload => ({
  reportData: normalizeReport(report.reportData),
  repairSections: normalizeRepairSections(report.repairSections as RepairSection[]),
  costSections: normalizeCostSections(report.costSections as CostSection[]),
  blockVisibility: { ...defaultBlockVisibility, ...report.blockVisibility },
  estimateNoteVisibility: { ...defaultEstimateNoteVisibility, ...report.estimateNoteVisibility },
  repairSectionVisibility: report.repairSectionVisibility,
  textBoxes: [],
  equipmentRentalSettings: {
    ...defaultEquipmentRentalSettings,
    ...report.equipmentRentalSettings,
  },
})

const saveEditableReportPayloadLocally = (payload: EditableInspectionReportPayload) => {
  window.localStorage.setItem(storageKey, JSON.stringify(payload.reportData))
  window.localStorage.setItem(repairStorageKey, JSON.stringify(payload.repairSections))
  window.localStorage.setItem(costStorageKey, JSON.stringify(payload.costSections))
  window.localStorage.setItem(blockVisibilityStorageKey, JSON.stringify(payload.blockVisibility))
  window.localStorage.setItem(estimateNoteVisibilityStorageKey, JSON.stringify(payload.estimateNoteVisibility))
  window.localStorage.setItem(repairSectionVisibilityStorageKey, JSON.stringify(payload.repairSectionVisibility))
  window.localStorage.setItem(equipmentRentalSettingsStorageKey, JSON.stringify(payload.equipmentRentalSettings))
}

type EditableTextProps = {
  id: string
  data: ReportData
  className?: string
  linkify?: boolean
  multiline?: boolean
  onChange: (id: string, value: string) => void
}

function EditableText({ id, data, className = '', linkify = false, multiline = false, onChange }: EditableTextProps) {
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

function EditableValue({
  label,
  value,
  className = '',
  linkify = false,
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
      {linkify && !isEditing ? renderLinkifiedText(value) : value}
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

export default function EditableInspectionReport() {
  const generatedId = useRef(1000)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const jobsQuotingItemId = searchParams.get('jobsQuotingItemId')?.trim() || ''
  const editableReportIdParam = searchParams.get('editableReportId')?.trim() || ''
  const menuDatabaseSyncReady = useRef(false)
  const skipNextMenuDatabaseSave = useRef(false)
  const reportHydrationReady = useRef(false)
  const skipNextReportDatabaseSave = useRef(false)
  const pendingReportChanges = useRef(false)
  const menuItemsUploadRefreshInterval = useRef<number | undefined>(undefined)
  const menuItemsUploadRefreshProgressInterval = useRef<number | undefined>(undefined)
  const menuItemsUploadRefreshTimeout = useRef<number | undefined>(undefined)
  const menuItemsRefreshRequestId = useRef(0)
  const reportContentRef = useRef<HTMLElement>(null)
  const relatedFolderInputRef = useRef<HTMLInputElement>(null)
  const relatedPdfInputRef = useRef<HTMLInputElement>(null)
  const [activeLineMenu, setActiveLineMenu] = useState('')
  const [activeMarginMenu, setActiveMarginMenu] = useState('')
  const [activeDoneLineItem, setActiveDoneLineItem] = useState('')
  const [equipmentRentalSettingsOpen, setEquipmentRentalSettingsOpen] = useState(false)
  const [pageLayoutMenuOpen, setPageLayoutMenuOpen] = useState(false)
  const [menuCollapsed, setMenuCollapsed] = useState(() => window.localStorage.getItem(menuCollapsedStorageKey) === 'true')
  const [menuSettingsOpen, setMenuSettingsOpen] = useState(false)
  const [relatedDocumentsOpen, setRelatedDocumentsOpen] = useState(false)
  const [masterServiceAgreementOpen, setMasterServiceAgreementOpen] = useState(false)
  const [menuSearch, setMenuSearch] = useState('')
  const [menuSearchSections, setMenuSearchSections] = useState<InspectionMenuItemSection[] | null>(null)
  const [menuSearchLoading, setMenuSearchLoading] = useState(false)
  const [menuSearchMessage, setMenuSearchMessage] = useState('')
  const [menuItemDeleting, setMenuItemDeleting] = useState(false)
  const [menuItemUploaderNames, setMenuItemUploaderNames] = useState<Record<string, string>>({})
  const [relatedDocuments, setRelatedDocuments] = useState<RelatedDocument[]>([])
  const [relatedDocumentsMessage, setRelatedDocumentsMessage] = useState('')
  const [reportDatabaseStatus, setReportDatabaseStatus] = useState<'loading' | 'saving' | 'saved' | 'local' | 'error'>(
    isConfigured ? 'loading' : 'local',
  )
  const [currentEditableReportId, setCurrentEditableReportId] = useState(editableReportIdParam)
  const [currentReportName, setCurrentReportName] = useState('Untitled quote report')
  const [currentSourceDocumentName, setCurrentSourceDocumentName] = useState('Untitled quote report')
  const [currentJobsQuotingItemId, setCurrentJobsQuotingItemId] = useState<string | null>(jobsQuotingItemId || null)
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
      return normalizeCostSections(JSON.parse(savedSections) as CostSection[])
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
  const currentEditableReportPayload = useMemo<EditableInspectionReportPayload>(
    () => ({
      reportData: report,
      repairSections,
      costSections,
      blockVisibility,
      estimateNoteVisibility,
      repairSectionVisibility,
      textBoxes: [],
      equipmentRentalSettings,
    }),
    [
      blockVisibility,
      costSections,
      equipmentRentalSettings,
      estimateNoteVisibility,
      repairSectionVisibility,
      repairSections,
      report,
    ],
  )

  const repairTotal = useMemo(
    () =>
      repairSections.reduce(
        (total, section) =>
          total + section.lineItems.reduce((sectionTotal, lineItem) => sectionTotal + getCustomerLineAmount(lineItem), 0),
        0,
      ),
    [repairSections],
  )
  const costTotal = useMemo(
    () =>
      costSections.reduce(
        (total, section) =>
          total + section.lineItems.reduce(
            (sectionTotal, lineItem) =>
              sectionTotal + getCostCustomerLineAmount(section.id, lineItem, equipmentRentalSettings),
            0,
          ),
        0,
      ),
    [costSections, equipmentRentalSettings],
  )
  const invoiceTotal = repairTotal + costTotal
  const grandTotalInternalCost = useMemo(
    () =>
      repairSections.reduce(
        (total, section) =>
          total + section.lineItems.reduce((sectionTotal, lineItem) => sectionTotal + getInternalLineAmount(lineItem), 0),
        0,
      )
      + costSections.reduce(
        (total, section) =>
          total + section.lineItems.reduce((sectionTotal, lineItem) => sectionTotal + getInternalLineAmount(lineItem), 0),
        0,
      ),
    [costSections, repairSections],
  )
  const grandTotalProfit = invoiceTotal - grandTotalInternalCost
  const grandTotalMargin = getUnitMargin(grandTotalInternalCost, invoiceTotal)
  const visibleRepairSections = useMemo(
    () => repairSections.filter((section) => repairSectionVisibility[section.id] !== false),
    [repairSections, repairSectionVisibility],
  )
  const originalInspectionDocument = useMemo(
    () => relatedDocuments.find((document) => document.name === 'Original Inspection'),
    [relatedDocuments],
  )
  const masterServiceAgreementDocument = useMemo(
    () => relatedDocuments.find((document) => document.name === 'Master Service Agreement'),
    [relatedDocuments],
  )
  const uploadedRelatedDocuments = useMemo(
    () =>
      relatedDocuments.filter(
        (document) => !['Original Inspection', 'Master Service Agreement'].includes(document.name),
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
      searchInspectionMenuItems(searchValue)
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
  }, [currentCraneIdentifier, menuSearch])

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
    if (isReportEditing || shouldSuppressRuntimePageBreak(blockId)) return undefined

    const spacer = runtimePageBreaks[blockId]
    return spacer ? { marginTop: `${spacer}px` } : undefined
  }

  const applyEditableReportPayload = useCallback((payload: EditableInspectionReportPayload) => {
    const nextReport = normalizeReport(payload.reportData)
    const nextRepairSections = normalizeRepairSections(payload.repairSections as RepairSection[])
    const nextCostSections = normalizeCostSections(payload.costSections as CostSection[])
    const nextBlockVisibility = { ...defaultBlockVisibility, ...payload.blockVisibility }
    const nextEstimateNoteVisibility = { ...defaultEstimateNoteVisibility, ...payload.estimateNoteVisibility }
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
      repairSectionVisibility: nextRepairSectionVisibility,
      textBoxes: [],
      equipmentRentalSettings: nextEquipmentRentalSettings,
    })
    setReport(nextReport)
    setRepairSections(nextRepairSections)
    setCostSections(nextCostSections)
    setBlockVisibility(nextBlockVisibility)
    setEstimateNoteVisibility(nextEstimateNoteVisibility)
    setRepairSectionVisibility(nextRepairSectionVisibility)
    setEquipmentRentalSettings(nextEquipmentRentalSettings)
  }, [])

  const findExistingEditableReportForQuoteItem = useCallback(async (jobsQuotingItemIdToMatch: string, quoteReport: ReportData) => {
    const existingReportForItem = await getEditableInspectionReportForJobsQuotingItem(jobsQuotingItemIdToMatch)
    if (existingReportForItem) return existingReportForItem

    const quoteIdentity = getReportIdentity(quoteReport)
    if (!hasCompleteReportIdentity(quoteIdentity)) return null

    const reports = await getEditableInspectionReports()
    return reports.find((savedReport) => reportIdentitiesMatch(savedReport.reportData, quoteReport)) ?? null
  }, [])

  const saveCurrentEditableReportNow = useCallback(async () => {
    if (!isConfigured || !reportHydrationReady.current) return null

    setReportDatabaseStatus('saving')
    const reportName = getEditableReportDisplayName(currentEditableReportPayload.reportData, currentReportName)
    const existingReport =
      !currentEditableReportId && currentJobsQuotingItemId
        ? await findExistingEditableReportForQuoteItem(currentJobsQuotingItemId, currentEditableReportPayload.reportData)
        : null
    const savedReport = await saveEditableInspectionReport({
      ...currentEditableReportPayload,
      id: currentEditableReportId || existingReport?.id || null,
      jobsQuotingItemId: currentJobsQuotingItemId,
      reportName,
      sourceDocumentName: currentSourceDocumentName,
    })

    pendingReportChanges.current = false
    skipNextReportDatabaseSave.current = true
    if (!currentEditableReportId) {
      setSearchParams({ editableReportId: savedReport.id }, { replace: true })
    }
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
    findExistingEditableReportForQuoteItem,
    setSearchParams,
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
        if (editableReportIdParam) {
          const savedReport = await getEditableInspectionReport(editableReportIdParam)
          if (!active) return

          applyEditableReportPayload(getNormalizedReportPayload(savedReport))
          setCurrentEditableReportId(savedReport.id)
          setCurrentReportName(savedReport.reportName)
          setCurrentSourceDocumentName(savedReport.sourceDocumentName)
          setCurrentJobsQuotingItemId(savedReport.jobsQuotingItemId)
          setReportDatabaseStatus('saved')
        } else if (jobsQuotingItemId) {
          const quoteItem = await getJobsQuotingItem(jobsQuotingItemId)
          if (!active) return
          const quoteReport = buildReportFromJobsQuotingItem(quoteItem)
          const existingReport = await findExistingEditableReportForQuoteItem(jobsQuotingItemId, quoteReport)
          if (!active) return

          if (existingReport) {
            applyEditableReportPayload(getNormalizedReportPayload(existingReport))
            setCurrentEditableReportId(existingReport.id)
            setCurrentReportName(existingReport.reportName)
            setCurrentSourceDocumentName(existingReport.sourceDocumentName)
            setCurrentJobsQuotingItemId(existingReport.jobsQuotingItemId)
            setReportDatabaseStatus('saved')
            skipNextReportDatabaseSave.current = true
            pendingReportChanges.current = false
            reportHydrationReady.current = true
            setSearchParams({ editableReportId: existingReport.id }, { replace: true })
            return
          }

          applyEditableReportPayload({
            reportData: quoteReport,
            repairSections: buildRepairSectionsFromJobsQuotingItem(quoteItem),
            costSections: defaultCostSections,
            blockVisibility: defaultBlockVisibility,
            estimateNoteVisibility: defaultEstimateNoteVisibility,
            repairSectionVisibility: {},
            textBoxes: [],
            equipmentRentalSettings: defaultEquipmentRentalSettings,
          })
          setCurrentEditableReportId('')
          setCurrentReportName(getEditableReportDisplayName(quoteReport, quoteItem.documentName))
          setCurrentSourceDocumentName(quoteItem.documentName)
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
  }, [applyEditableReportPayload, editableReportIdParam, findExistingEditableReportForQuoteItem, jobsQuotingItemId, setSearchParams])

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
        const savedMenu = await getInspectionMenuItems()
        if (!shouldApply() || refreshRequestId !== menuItemsRefreshRequestId.current) return false

        if (savedMenu) {
          const normalizedSections = normalizeMenuItemSections(
            savedMenu.menuSections.length > 0 ? savedMenu.menuSections : defaultMenuItemSections,
          )
          window.localStorage.setItem(menuStorageKey, JSON.stringify(normalizedSections))
          skipNextMenuDatabaseSave.current = true
          setMenuItemSections(normalizedSections)
          setMenuDatabaseMessage(loadedMessage)
        } else {
          const emptySections = normalizeMenuItemSections(defaultMenuItemSections)
          window.localStorage.setItem(menuStorageKey, JSON.stringify(emptySections))
          skipNextMenuDatabaseSave.current = true
          setMenuItemSections(emptySections)
          setMenuDatabaseMessage(emptyMessage)
        }

        if (markSyncReady) menuDatabaseSyncReady.current = true
        setMenuDatabaseStatus('saved')
        return true
      } catch (error) {
        if (!shouldApply() || refreshRequestId !== menuItemsRefreshRequestId.current) return false
        if (markSyncReady) menuDatabaseSyncReady.current = false
        setMenuDatabaseStatus(markSyncReady ? 'local' : 'error')
        setMenuDatabaseMessage(error instanceof Error ? error.message : 'Menu items could not be loaded.')
        return false
      }
    },
    [],
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

    setMenuItemsRefreshProgress({ active: true, percent: 0 })
    refreshMenuItemsFromDatabase({
      loadingMessage: refreshLoadingMessage,
      loadedMessage: 'Checking uploaded PDFs for new menu items.',
      emptyMessage: 'Checking uploaded PDFs for new menu items.',
    })

    menuItemsUploadRefreshProgressInterval.current = window.setInterval(() => {
      const elapsedMs = Date.now() - startedAt
      const percent = Math.min(100, Math.round((elapsedMs / menuItemsUploadRefreshDurationMs) * 100))
      setMenuItemsRefreshProgress({ active: percent < 100, percent })
    }, 1000)

    menuItemsUploadRefreshInterval.current = window.setInterval(() => {
      refreshMenuItemsFromDatabase({
        loadingMessage: refreshLoadingMessage,
        loadedMessage: 'Checking uploaded PDFs for new menu items.',
        emptyMessage: 'Checking uploaded PDFs for new menu items.',
      })
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
  }, [clearMenuItemsUploadRefreshTimers, currentCraneIdentifier, refreshMenuItemsFromDatabase])

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

      upsertInspectionMenuItems(nextSections)
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
  }, [menuItemSections])

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
          const quotePdfUrl = await getJobsQuotingItemPdfUrl(quoteItem)

          if (!quotePdfUrl) {
            throw new Error('The selected quote job does not have a saved split PDF yet.')
          }

          quoteInspectionDocument = {
            id: quoteItem.id,
            name: 'Original Inspection',
            description: 'Split inspection PDF selected from Jobs Quoting.',
            filePath: quoteItem.pdfStoragePath ?? '',
            fileName: quoteItem.pdfFileName ?? `${quoteItem.documentName}.pdf`,
            fileSize: quoteItem.pdfFileSize ?? 0,
            source: 'Jobs Quoting',
            url: quotePdfUrl,
            createdAt: quoteItem.createdAt,
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
              ...savedDocuments.filter((document) => document.name !== 'Original Inspection'),
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
      const nextReport = { ...currentReport, [id]: value }
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

  const saveEquipmentRentalSettings = (nextSettings: EquipmentRentalSettings) => {
    window.localStorage.setItem(equipmentRentalSettingsStorageKey, JSON.stringify(nextSettings))
    return nextSettings
  }

  const updateEquipmentRentalSettings = <Field extends keyof EquipmentRentalSettings>(
    field: Field,
    value: EquipmentRentalSettings[Field],
  ) => {
    setEquipmentRentalSettings((currentSettings) =>
      saveEquipmentRentalSettings({ ...currentSettings, [field]: value }),
    )
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
      updatedAt: new Date().toISOString(),
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
                  id: editingMenuItem.itemId,
                  userId: editingMenuItem.userId,
                  label,
                  description,
                  rate: nextInternalCost,
                  internalCost: nextInternalCost,
                  customerPrice: nextCustomerPrice,
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

  const addMenuItemToRecentlyUsed = (_item: MenuItem) => {}

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
          status: 'Repair',
          lineItems: [createManualLineItem(createId('line'), 'Add repair detail here.')],
        },
      ]),
    )
    toggleRepairSectionVisibility(nextSectionId, true)
  }

  const updateRepairSection = (sectionId: string, field: 'title' | 'status', value: string) => {
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

  const addRepairLineItem = (sectionId: string) => {
    setRepairSections((currentSections) =>
      saveRepairSections(
        currentSections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                lineItems: [
                  ...section.lineItems,
                  createManualLineItem(createId('line'), 'Add repair detail here.'),
                ],
              }
            : section,
        ),
      ),
    )
  }

  const updateRepairLineItem = (
    sectionId: string,
    lineItemId: string,
    field: 'description' | 'internalCost' | 'quantity' | 'customerPrice' | 'rate' | 'margin',
    value: string,
  ) => {
    setRepairSections((currentSections) =>
      saveRepairSections(
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

  const addMenuItemToRepairSection = (sectionId: string, item: MenuItem) => {
    addMenuItemToRecentlyUsed(item)
    setRepairSections((currentSections) =>
      saveRepairSections(
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

  const removeRepairLineItem = (sectionId: string, lineItemId: string) => {
    setRepairSections((currentSections) =>
      saveRepairSections(
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
      if (!checked) return saveCostSections(currentSections.filter((section) => section.id !== sectionId))
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

  const resetTemplate = async () => {
    if (!isConfigured) {
      setReportDatabaseStatus('local')
      return
    }

    setReportDatabaseStatus('loading')

    try {
      let savedReport: EditableInspectionReport | null = null

      if (currentEditableReportId) {
        savedReport = await getEditableInspectionReport(currentEditableReportId)
      } else if (currentJobsQuotingItemId) {
        savedReport = await getEditableInspectionReportForJobsQuotingItem(currentJobsQuotingItemId)
      }

      if (savedReport) {
        applyEditableReportPayload(getNormalizedReportPayload(savedReport))
        setCurrentEditableReportId(savedReport.id)
        setCurrentReportName(savedReport.reportName)
        setCurrentSourceDocumentName(savedReport.sourceDocumentName)
        setCurrentJobsQuotingItemId(savedReport.jobsQuotingItemId)
        setSearchParams({ editableReportId: savedReport.id }, { replace: true })
      } else if (currentJobsQuotingItemId) {
        const quoteItem = await getJobsQuotingItem(currentJobsQuotingItemId)
        const quoteReport = buildReportFromJobsQuotingItem(quoteItem)

        applyEditableReportPayload({
          reportData: quoteReport,
          repairSections: buildRepairSectionsFromJobsQuotingItem(quoteItem),
          costSections: defaultCostSections,
          blockVisibility: defaultBlockVisibility,
          estimateNoteVisibility: defaultEstimateNoteVisibility,
          repairSectionVisibility: {},
          textBoxes: [],
          equipmentRentalSettings: defaultEquipmentRentalSettings,
        })
        setCurrentEditableReportId('')
        setCurrentReportName(getEditableReportDisplayName(quoteReport, quoteItem.documentName))
        setCurrentSourceDocumentName(quoteItem.documentName)
        setCurrentJobsQuotingItemId(quoteItem.id)
        setSearchParams({ jobsQuotingItemId: quoteItem.id }, { replace: true })
      } else {
        applyEditableReportPayload({
          reportData: defaultReport,
          repairSections: defaultRepairSections,
          costSections: defaultCostSections,
          blockVisibility: defaultBlockVisibility,
          estimateNoteVisibility: defaultEstimateNoteVisibility,
          repairSectionVisibility: {},
          textBoxes: [],
          equipmentRentalSettings: defaultEquipmentRentalSettings,
        })
        setCurrentEditableReportId('')
        setCurrentReportName('Untitled quote report')
        setCurrentSourceDocumentName('Untitled quote report')
        setCurrentJobsQuotingItemId(null)
      }

      skipNextReportDatabaseSave.current = true
      pendingReportChanges.current = false
      setReportDatabaseStatus('saved')
    } catch (error) {
      setReportDatabaseStatus('error')
      console.error('Editable report could not be reset.', error)
    }

    setPageLayoutMenuOpen(false)
    setRelatedDocumentsOpen(false)
    setMenuSettingsOpen(false)
    setPendingAddMenuLineItem(null)
  }

  const goBackToJobsQuotingList = async () => {
    if (pendingReportChanges.current) {
      const shouldSave = window.confirm('Save changes before going back to Jobs Quoting List? Press OK to save, or Cancel to discard changes.')
      if (shouldSave) {
        try {
          await saveCurrentEditableReportNow()
        } catch {
          setReportDatabaseStatus('error')
          return
        }
      }
    }

    navigate('/jobsquotinglist')
  }

  const saveEditableReportFromButton = () => {
    saveCurrentEditableReportNow().catch((error) => {
      setReportDatabaseStatus('error')
      console.error('Editable report could not be saved.', error)
    })
  }

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

  return (
    <div className="min-h-screen bg-[#e8eaef] text-[#111]">
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

            .editable-report-field:hover,
            .editable-report-field:focus {
              background: transparent !important;
              outline: 0 !important;
              box-shadow: none !important;
            }
          }
        `}
      </style>

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
                    <span className="block text-[14px] font-black text-[#1f2430]">Original Inspection</span>
                    <span className="mt-0.5 block text-[12px] font-semibold text-[#747b8a]">Open the source inspection PDF in a new tab.</span>
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
            {currentJobsQuotingItemId || currentEditableReportId ? (
              <button
                type="button"
                onClick={() => {
                  const params = currentJobsQuotingItemId
                    ? `jobsQuotingItemId=${encodeURIComponent(currentJobsQuotingItemId)}`
                    : `editableReportId=${encodeURIComponent(currentEditableReportId)}`
                  navigate(`/equipment-notebook-llm?${params}`)
                }}
                className="rounded-md border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20"
              >
                AI Chat
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                void resetTemplate()
              }}
              className="rounded-md border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={printEditableReport}
              className="rounded-md bg-white px-4 py-2 text-sm font-black text-[var(--deshazo-blue)] shadow-[0_10px_24px_-20px_rgba(47,86,166,0.55)] transition hover:bg-[var(--deshazo-surface)]"
            >
              Print PDF
            </button>
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
                        {visibleMenuItemSections[0].items.map((item) => (
                          <div
                            key={item.id ?? item.label}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData(menuItemDataTransferType, JSON.stringify(item))
                              event.dataTransfer.setData('text/plain', item.description)
                              event.dataTransfer.effectAllowed = 'copy'
                            }}
                            className="w-full cursor-grab rounded-md border border-[#dde3ef] bg-white px-3 py-2 text-left shadow-[0_8px_20px_-18px_rgba(31,36,48,0.45)] transition hover:border-[#9bb0dc] hover:bg-[#f5f7ff] active:cursor-grabbing"
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
                        ))}
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
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-[#d8deea] bg-white text-[13px] font-black text-[#4d5360] transition hover:bg-[#f4f6fb]"
                        aria-label="Close page layout menu"
                      >
                        x
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
                        <div className="mt-2 space-y-1 border-l border-[#d8deea] pl-3 text-[12px] font-bold text-[#4d5360]">
                          <div className="rounded-sm px-2 py-1">Name</div>
                          <div className="rounded-sm px-2 py-1">Email</div>
                          <div className="rounded-sm px-2 py-1">Phone Number</div>
                        </div>
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
                            <label
                              key={section.id}
                              className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1 text-[12px] font-bold text-[#4d5360] transition hover:bg-white"
                            >
                              <span className="min-w-0 flex-1 truncate">{section.title}</span>
                              <input
                                type="checkbox"
                                checked={repairSectionVisibility[section.id] !== false}
                                onChange={(event) => toggleRepairSectionVisibility(section.id, event.currentTarget.checked)}
                                className="h-4 w-4 accent-[#273f7a]"
                              />
                            </label>
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
                                checked={costSections.some((costSection) => costSection.id === section.id)}
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
              <EditableText id="summary" data={report} onChange={updateField} className="border-r border-[#cfcfcf] px-2 text-[12px] font-bold leading-tight" />
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
              <div className="grid grid-cols-[130px_1fr_1fr_1fr] border-b border-[#d4d4d4] bg-[#f7f7f7] text-[11px] font-black uppercase text-[#555b66]">
                <div className="px-2 py-1">Contact</div>
                <div className="border-l border-[#d4d4d4] px-2 py-1">Name</div>
                <div className="border-l border-[#d4d4d4] px-2 py-1">Email</div>
                <div className="border-l border-[#d4d4d4] px-2 py-1">Phone Number</div>
              </div>
              <div className="grid grid-cols-[130px_1fr_1fr_1fr] text-[12px] font-semibold leading-tight">
                <div className="px-2 py-1.5" />
                <EditableText id="contactName" data={report} onChange={updateField} className="border-l border-[#d4d4d4] px-2 py-1.5" />
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
                      onDragOver={(event) => {
                        if (!isMenuItemDrag(event)) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'copy'
                      }}
                      onDrop={(event) => {
                        if (!isMenuItemDrag(event)) return
                        event.preventDefault()
                        const item = getDroppedMenuItem(event)
                        if (item) addMenuItemToRepairSection(section.id, item)
                      }}
                      className={`repair-section ${sectionTone.sectionBackground} ${getRuntimePageBreakClassName(`repair-section-${section.id}`)} ${
                        sectionIndex > 0 ? `border-t ${sectionTone.sectionBorder}` : ''
                      }`}
                    >
                      <div className={`grid grid-cols-[1fr_150px] gap-3 border-b ${sectionTone.sectionBorder} px-2.5 py-1`}>
                        <EditableValue
                          label={`${section.title} title`}
                          value={section.title}
                          onChange={(value) => updateRepairSection(section.id, 'title', value)}
                          className="text-[13px] font-black leading-tight"
                          multiline
                        />
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
                      <div className="relative grid grid-cols-[1fr_86px_54px_92px_108px_112px_38px] border-b border-[#d8d8d8] bg-[#f7f7f7] text-[9px] font-black uppercase text-[#555b66]">
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
                      <div>
                        {section.lineItems.map((lineItem, lineIndex) => (
                          <div
                            key={lineItem.id}
                            className="relative grid grid-cols-[1fr_86px_54px_92px_108px_112px_38px] border-b border-[#e5e5e5] text-[12px] font-semibold"
                          >
                            {activeDoneLineItem === `repair-${section.id}-${lineItem.id}` ? (
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
                                    collection: 'repair',
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
                                onChange={(value) => updateRepairLineItem(section.id, lineItem.id, 'description', value)}
                                onDropMenuItem={(item) => addMenuItemToRepairSection(section.id, item)}
                                clearOnFocus={shouldClearPlaceholderDescription(lineItem.description)}
                                onEditFocus={() => setActiveDoneLineItem(`repair-${section.id}-${lineItem.id}`)}
                                className="min-w-0 flex-1 leading-tight"
                                multiline
                              />
                            </div>
                            <EditableValue
                              label={`${section.title} internal cost ${lineIndex + 1}`}
                              value={formatMoney(getInternalUnitCost(lineItem))}
                              onChange={(value) => updateRepairLineItem(section.id, lineItem.id, 'internalCost', parseMoney(value).toFixed(2))}
                              clearOnFocus={getInternalUnitCost(lineItem) === 0}
                              onEditFocus={() => setActiveDoneLineItem(`repair-${section.id}-${lineItem.id}`)}
                              className="min-h-[25px] border-l border-[#e5e5e5] px-2 py-1.5 text-right"
                            />
                            <EditableValue
                              label={`${section.title} quantity ${lineIndex + 1}`}
                              value={lineItem.quantity}
                              onChange={(value) => updateRepairLineItem(section.id, lineItem.id, 'quantity', value)}
                              onEditFocus={() => setActiveDoneLineItem(`repair-${section.id}-${lineItem.id}`)}
                              className="min-h-[25px] border-l border-[#e5e5e5] px-2 py-1.5 text-right"
                            />
                            <EditableValue
                              label={`${section.title} customer price ${lineIndex + 1}`}
                              value={formatMoney(getCustomerUnitPrice(lineItem))}
                              onChange={(value) => updateRepairLineItem(section.id, lineItem.id, 'customerPrice', parseMoney(value).toFixed(2))}
                              clearOnFocus={getCustomerUnitPrice(lineItem) === 0}
                              onEditFocus={() => setActiveDoneLineItem(`repair-${section.id}-${lineItem.id}`)}
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
                                      currentMenu === `repair-${section.id}-${lineItem.id}`
                                        ? ''
                                        : `repair-${section.id}-${lineItem.id}`,
                                    )
                                  }}
                                  className={`flex w-full items-center px-3 py-1.5 text-left transition ${getMarginCellClassName(lineItem.margin)}`}
                                  aria-label={`Open margin settings for ${section.title} line item ${lineIndex + 1}`}
                                >
                                  {Math.round(parseMoney(lineItem.margin))}%
                                </button>
                                {activeMarginMenu === `repair-${section.id}-${lineItem.id}` ? (
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
                                        updateRepairLineItem(section.id, lineItem.id, 'margin', event.currentTarget.value)
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
                                    currentMenu === `repair-${section.id}-${lineItem.id}`
                                      ? ''
                                      : `repair-${section.id}-${lineItem.id}`,
                                  )
                                }}
                                className="flex min-h-[25px] w-full items-center justify-center bg-white text-[19px] font-black leading-none text-[#4d5360] transition hover:bg-[#f4f6fb]"
                                aria-label={`Open settings for line item ${lineIndex + 1}`}
                              >
                                ⚙
                              </button>
                              {activeLineMenu === `repair-${section.id}-${lineItem.id}` ? (
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
                                      removeRepairLineItem(section.id, lineItem.id)
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
                      </div>
                      <div className="grid grid-cols-[1fr_150px_108px_112px_30px] border-b border-[#d8d8d8] bg-[#fbfbfb] text-[12px] font-black">
                        <div className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => addRepairLineItem(section.id)}
                            className="report-inline-action rounded-md border border-[#bdc4d3] bg-[#f8fafc] px-2 py-1 text-[10px] font-black uppercase text-[#273f7a] transition hover:bg-[#edf2fb]"
                          >
                            Add Line Item
                          </button>
                        </div>
                        <div className="border-l border-[#d8d8d8] px-2 py-1.5 text-right uppercase text-[#555b66]">
                          Section Subtotal
                        </div>
                        <div className="border-l border-[#d8d8d8] px-2 py-1.5 text-right text-[#111]">
                          {formatMoney(section.lineItems.reduce((total, lineItem) => total + getInternalLineAmount(lineItem), 0))}
                        </div>
                        <div className="border-l border-[#d8d8d8] px-2 py-1.5 text-right text-[#111]">
                          {formatMoney(section.lineItems.reduce((total, lineItem) => total + getCustomerLineAmount(lineItem), 0))}
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
                {costSections.map((section) => (
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
                    className={`repair-section border-x border-b border-[#d4d4d4] bg-white ${getRuntimePageBreakClassName(`cost-section-${section.id}`)}`}
                  >
                    <div className="relative flex items-center justify-between gap-3 border-b border-[#d8d8d8] bg-[#f7f7f7] px-3 py-1.5">
                      <EditableValue
                        label={`${section.title} section title`}
                        value={section.title}
                        onChange={(value) => updateCostSectionTitle(section.id, value)}
                        className="min-w-0 flex-1 text-[14px] font-black uppercase leading-tight text-[#273f7a]"
                      />
                      {section.id === equipmentRentalSectionId ? (
                        <>
                          {equipmentRentalSettings.applyMarginToAll ? (
                            <span className="text-[10px] font-black uppercase text-[#17652b]">
                              +{Math.round(parseMoney(equipmentRentalSettings.margin))}% margin
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setEquipmentRentalSettingsOpen((currentOpen) => !currentOpen)}
                            className="report-inline-action flex h-7 w-7 items-center justify-center rounded-md border border-[#bdc4d3] bg-white text-[18px] font-black leading-none text-[#4d5360] transition hover:bg-[#edf2fb]"
                            aria-label="Open equipment rental settings"
                          >
                            ⚙
                          </button>
                          {equipmentRentalSettingsOpen ? (
                            <div className="report-inline-action absolute right-2 top-[calc(100%+6px)] z-30 w-[270px] rounded-md border border-[#cfd6e5] bg-white p-3 text-left shadow-[0_18px_44px_-28px_rgba(15,23,42,0.55)]">
                              <div className="mb-3 flex items-center justify-between gap-2">
                                <span className="text-[11px] font-black uppercase text-[#555b66]">Equipment rental settings</span>
                                <button
                                  type="button"
                                  onClick={() => setEquipmentRentalSettingsOpen(false)}
                                  className="flex h-6 w-6 items-center justify-center rounded-md border border-[#d8deea] bg-white text-[13px] font-black text-[#4d5360] transition hover:bg-[#f4f6fb]"
                                  aria-label="Close equipment rental settings"
                                >
                                  x
                                </button>
                              </div>
                              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-[#e3e8f1] bg-[#fffdf3] px-3 py-2 text-[12px] font-black text-[#7d5c00]">
                                <span>Apply margin to all</span>
                                <input
                                  type="checkbox"
                                  checked={equipmentRentalSettings.applyMarginToAll}
                                  onChange={(event) =>
                                    updateEquipmentRentalSettings('applyMarginToAll', event.currentTarget.checked)
                                  }
                                  className="h-4 w-4 accent-[#f5b400]"
                                />
                              </label>
                              <label className="mt-3 block text-[11px] font-black uppercase text-[#555b66]">
                                Margin: {Math.round(parseMoney(equipmentRentalSettings.margin))}%
                              </label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                value={parseMoney(equipmentRentalSettings.margin)}
                                onChange={(event) => updateEquipmentRentalSettings('margin', event.currentTarget.value)}
                                className="mt-2 w-full accent-[#273f7a]"
                              />
                            </div>
                          ) : null}
                        </>
                      ) : null}
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
                        {section.id === equipmentRentalSectionId && equipmentRentalSettings.applyMarginToAll ? (
                          <div className="flex min-h-[25px] items-center justify-end gap-1 border-l border-[#e5e5e5] px-2 py-1.5 text-right">
                            <EditableValue
                              label={`${section.title} customer price ${lineIndex + 1}`}
                              value={formatMoney(getCustomerUnitPrice(lineItem))}
                              onChange={(value) => updateCostLineItem(section.id, lineItem.id, 'customerPrice', parseMoney(value).toFixed(2))}
                              clearOnFocus={getCustomerUnitPrice(lineItem) === 0}
                              onEditFocus={() => setActiveDoneLineItem(`cost-${section.id}-${lineItem.id}`)}
                              className="min-w-0"
                            />
                            <span className="whitespace-nowrap font-black text-[#17652b]">
                              + {Math.round(parseMoney(equipmentRentalSettings.margin))}%
                            </span>
                          </div>
                        ) : (
                          <EditableValue
                            label={`${section.title} customer price ${lineIndex + 1}`}
                            value={formatMoney(getCustomerUnitPrice(lineItem))}
                            onChange={(value) => updateCostLineItem(section.id, lineItem.id, 'customerPrice', parseMoney(value).toFixed(2))}
                            clearOnFocus={getCustomerUnitPrice(lineItem) === 0}
                            onEditFocus={() => setActiveDoneLineItem(`cost-${section.id}-${lineItem.id}`)}
                            className="min-h-[25px] border-l border-[#e5e5e5] px-2 py-1.5 text-right"
                          />
                        )}
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
              <EditableText id="notes" data={report} onChange={updateField} multiline linkify className="min-h-[96px] px-3 py-3 text-[15px] font-semibold" />
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
