import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { isConfigured } from '../lib/supabase'
import {
  getInspectionMenuItems,
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
  deleteEditableInspectionReport,
  getEditableInspectionReport,
  getEditableInspectionReportForJobsQuotingItem,
  getEditableInspectionReports,
  saveEditableInspectionReport,
  type EditableInspectionReport,
  type EditableInspectionReportPayload,
} from '../lib/editableInspectionReports'

type ReportData = Record<string, string>

type RepairLineItem = {
  id: string
  description: string
  quantity: string
  rate: string
  margin: string
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
  originalSectionTitle: string
  sectionTitle: string
  itemId: string
  label: string
  description: string
  rate: string
}

type CanvasTextBox = {
  id: string
  text: string
  x: number
  y: number
}

type RelatedDocument = EditableInspectionDocument

type QuoteBlockVisibility = {
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
const textBoxStorageKey = 'deshazo-editable-inspection-report-text-boxes'
const menuCollapsedStorageKey = 'deshazo-editable-inspection-report-menu-collapsed'
const estimateNoteVisibilityStorageKey = 'deshazo-editable-inspection-report-estimate-note-visibility'
const repairSectionVisibilityStorageKey = 'deshazo-editable-inspection-report-repair-section-visibility'
const equipmentRentalSettingsStorageKey = 'deshazo-editable-inspection-report-equipment-rental-settings'
const maxRecentlyUsedItems = 2
const equipmentRentalSectionId = 'equipment-rental'
const equipmentRentalDefaultMargin = 15
const printedPageWidthIn = 8.5
const printedPageHeightIn = 11
const printedPageMarginIn = 0.45
const runtimePageGapPx = 28
const databaseSyncIdleDelayMs = 650
const menuItemsUploadRefreshDurationMs = 60 * 1000
const menuItemsUploadRefreshIntervalMs = 5 * 1000
const defaultCraneIdentifier = 'D200235'
const originalInspectionStableKey = 'built-in:original-inspection'
const masterServiceAgreementStableKey = 'built-in:master-service-agreement'

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
  sectionHeader: 'Repair Items',
  estimateTopNote: 'Top note: Add estimate context here.',
  estimateBottomNote: 'Bottom note: Add estimate terms here.',
  notesHeader: 'Additional Notes',
  notes:
    'Click into any text on this report and type to edit. Use the print button to save as PDF from the browser print dialog.',
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

const defaultMenuItemSections: MenuItemSection[] = [
  {
    title: 'Past history',
    items: [
      { label: 'Previous wheel repair', description: 'Repeat repair from prior wheel inspection history.', rate: '185.00' },
      { label: 'Known festoon issue', description: 'Address recurring festoon wear noted on past reports.', rate: '95.00' },
    ],
  },
  {
    title: 'Customer specific',
    items: [
      { label: 'Labor', description: 'Customer-specific labor rate for Wabash service work.', rate: '145.00' },
      { label: 'Freight', description: 'Customer-specific freight and delivery charge.', rate: '85.00' },
    ],
  },
  {
    title: defaultCraneIdentifier,
    items: [
      { label: 'Wheel inspection', description: 'Inspect wheel tread wear and flange condition.', rate: '185.00' },
      { label: 'Cable alignment', description: 'Verify conductor alignment through full bridge travel.', rate: '125.00' },
      { label: 'Festoon repair', description: 'Replace damaged festoon cable carrier hardware.', rate: '95.00' },
    ],
  },
  {
    title: 'Shared',
    items: [
      { label: 'Technician labor', description: 'Technician labor.', rate: '145.00' },
      { label: 'Lift rental', description: 'Scissor lift rental.', rate: '275.00' },
      { label: 'Freight', description: 'Freight and delivery.', rate: '85.00' },
    ],
  },
]

const recentlyUsedMenuSectionTitle = 'Past history'
const globalMenuSectionTitles = new Set([recentlyUsedMenuSectionTitle, 'Customer specific', 'Shared'])

const getDefaultAddableMenuSection = (sections: MenuItemSection[]) =>
  sections.find((section) => section.title !== recentlyUsedMenuSectionTitle)?.title ?? 'Shared'

const getMenuSectionDisplayTitle = (title: string) => {
  if (title === recentlyUsedMenuSectionTitle) return 'Recently used'
  if (title === 'Customer specific') return 'Customer specific (Wabash)'
  return title
}

const createMenuItemId = () => globalThis.crypto?.randomUUID?.() ?? `menu-${Date.now()}-${Math.random()}`

const getNormalizedMenuSectionTitle = (title: string, craneIdentifier: string) => {
  if (title === 'This crane') return craneIdentifier
  if (globalMenuSectionTitles.has(title)) return title
  return craneIdentifier
}

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

const getSavedReportDisplayName = (savedReport: EditableInspectionReport) =>
  getEditableReportDisplayName(savedReport.reportData, savedReport.reportName)

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
  const repairCount = getTopLevelExtractedText(data, ['repair_count', 'repairCount', 'Repair']) || '0'
  const safetyCount = getTopLevelExtractedText(data, ['safety_and_monitor_count', 'safety_count', 'safetyCount', 'Safety and Monitor Items']) || '0'
  const satisfactoryCount = getTopLevelExtractedText(data, ['satisfactory_count', 'satisfactoryCount', 'Satisfactory Items']) || '0'
  const naCount = getTopLevelExtractedText(data, ['na_count', 'naCount', 'N/A Items'])

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
    scopeOfWork: [
      dNumber ? `Prepare quote from inspection report ${dNumber}.` : 'Prepare quote from selected inspection report.',
      `Repair items: ${repairCount}.`,
      `Safety and monitor items: ${safetyCount}.`,
      `Satisfactory items: ${satisfactoryCount}.`,
      naCount ? `N/A items: ${naCount}.` : '',
    ].filter(Boolean).join(' '),
    notes: `Seeded from jobs_quoting_items.extraction_data for ${dNumber || item.documentName}. Open Related Documents to view the split inspection PDF.`,
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

const normalizeMenuItemSections = (sections: MenuItemSection[], craneIdentifier = defaultCraneIdentifier) => {
  const usedItemIds = new Set<string>()
  const sectionMap = new Map<string, MenuItemSection>()

  sections.forEach((section) => {
    const sectionTitle = getNormalizedMenuSectionTitle(section.title, craneIdentifier)
    const cappedItems =
      sectionTitle === recentlyUsedMenuSectionTitle ? section.items.slice(0, maxRecentlyUsedItems) : section.items
    const normalizedItems = cappedItems.map((item) => {
      const itemId = item.id && !usedItemIds.has(item.id) ? item.id : createMenuItemId()
      usedItemIds.add(itemId)

      return {
        ...item,
        id: itemId,
      }
    })

    const existingSection = sectionMap.get(sectionTitle)
    sectionMap.set(sectionTitle, {
      ...section,
      title: sectionTitle,
      items: existingSection ? [...existingSection.items, ...normalizedItems] : normalizedItems,
    })
  })

  return [
    recentlyUsedMenuSectionTitle,
    craneIdentifier,
    'Customer specific',
    'Shared',
    ...Array.from(sectionMap.keys()).filter(
      (sectionTitle) =>
        ![recentlyUsedMenuSectionTitle, craneIdentifier, 'Customer specific', 'Shared'].includes(sectionTitle),
    ),
  ]
    .map((sectionTitle) => sectionMap.get(sectionTitle))
    .filter((section): section is MenuItemSection => Boolean(section))
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

const getBaseLineAmount = (lineItem: RepairLineItem) =>
  parseMoney(lineItem.quantity) * parseMoney(lineItem.rate)

const getMarginAmount = (lineItem: RepairLineItem) =>
  getBaseLineAmount(lineItem) * (parseMoney(lineItem.margin) / 100)

const getLineAmount = (lineItem: RepairLineItem) =>
  getBaseLineAmount(lineItem) + getMarginAmount(lineItem)

const getCostBaseLineAmount = (_sectionId: string, lineItem: RepairLineItem) => {
  const rate = parseMoney(lineItem.rate)
  return parseMoney(lineItem.quantity) * rate
}

const getCostMarginAmount = (
  sectionId: string,
  lineItem: RepairLineItem,
  settings: EquipmentRentalSettings,
) => {
  const lineMargin = parseMoney(lineItem.margin)
  const sectionMargin =
    sectionId === equipmentRentalSectionId && settings.applyMarginToAll ? parseMoney(settings.margin) : 0
  return getCostBaseLineAmount(sectionId, lineItem) * ((lineMargin + sectionMargin) / 100)
}

const getCostLineAmount = (
  sectionId: string,
  lineItem: RepairLineItem,
  settings: EquipmentRentalSettings,
) =>
  getCostBaseLineAmount(sectionId, lineItem) + getCostMarginAmount(sectionId, lineItem, settings)

const normalizeRepairSections = (sections: RepairSection[]) =>
  sections.map((section) => ({
    ...section,
    lineItems: section.lineItems.map((lineItem) => {
      const savedLineItem = lineItem as RepairLineItem & { text?: string }

      return {
        id: savedLineItem.id,
        description: savedLineItem.description ?? savedLineItem.text ?? 'Add repair detail here.',
        quantity: savedLineItem.quantity ?? '1',
        rate: savedLineItem.rate ?? '0.00',
        margin: savedLineItem.margin ?? '0',
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
        quantity: savedLineItem.quantity ?? '1',
        rate: savedLineItem.rate ?? '0.00',
        margin: savedLineItem.margin ?? '0',
      }
    }),
  }))

const normalizeReport = (report: ReportData) => {
  const nextReport = { ...defaultReport, ...report }

  if (nextReport.title === 'INSPECTION REPORT') nextReport.title = defaultReport.title
  if (!nextReport.scopeOfWorkHeader?.trim()) nextReport.scopeOfWorkHeader = defaultReport.scopeOfWorkHeader
  if (nextReport.scopeOfWork === legacyScopeOfWorkSample) nextReport.scopeOfWork = ''
  if (nextReport.notesHeader === 'Notes') nextReport.notesHeader = defaultReport.notesHeader

  return nextReport
}

const getNormalizedReportPayload = (report: EditableInspectionReport): EditableInspectionReportPayload => ({
  reportData: normalizeReport(report.reportData),
  repairSections: normalizeRepairSections(report.repairSections as RepairSection[]),
  costSections: normalizeCostSections(report.costSections as CostSection[]),
  blockVisibility: { ...defaultBlockVisibility, ...report.blockVisibility },
  estimateNoteVisibility: { ...defaultEstimateNoteVisibility, ...report.estimateNoteVisibility },
  repairSectionVisibility: report.repairSectionVisibility,
  textBoxes: report.textBoxes as CanvasTextBox[],
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
  window.localStorage.setItem(textBoxStorageKey, JSON.stringify(payload.textBoxes))
  window.localStorage.setItem(equipmentRentalSettingsStorageKey, JSON.stringify(payload.equipmentRentalSettings))
}

type EditableTextProps = {
  id: string
  data: ReportData
  className?: string
  multiline?: boolean
  onChange: (id: string, value: string) => void
}

function EditableText({ id, data, className = '', multiline = false, onChange }: EditableTextProps) {
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
      multiline={multiline}
      onChange={(value) => onChange(id, value)}
    />
  )
}

type EditableValueProps = {
  label: string
  value: string
  className?: string
  multiline?: boolean
  onChange: (value: string) => void
  onDropMenuItem?: (item: MenuItem) => void
}

function EditableValue({ label, value, className = '', onChange, onDropMenuItem }: EditableValueProps) {
  const elementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (elementRef.current && elementRef.current.innerText !== value) {
      elementRef.current.innerText = value
    }
  }, [value])

  return (
    <div
      ref={elementRef}
      role="textbox"
      aria-label={label}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      className={`editable-report-field ${className}`}
      onBlur={(event) => onChange(event.currentTarget.innerText)}
      onDragOver={(event) => {
        if (onDropMenuItem) event.preventDefault()
      }}
      onDrop={(event) => {
        if (!onDropMenuItem) return
        event.preventDefault()
        const payload = event.dataTransfer.getData('application/deshazo-menu-item')
        if (!payload) return

        try {
          onDropMenuItem(JSON.parse(payload) as MenuItem)
        } catch {
          onDropMenuItem({ label: 'Menu item', description: payload, rate: '0.00' })
        }
      }}
      onPaste={(event) => {
        event.preventDefault()
        const text = event.clipboardData.getData('text/plain')
        document.execCommand('insertText', false, text)
      }}
    >
      {value}
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

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7V5.75A1.75 1.75 0 0 1 10.75 4h2.5A1.75 1.75 0 0 1 15 5.75V7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m8 7 .7 11.2A2 2 0 0 0 10.7 20h2.6a2 2 0 0 0 2-1.8L16 7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 10.5v6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5v6" />
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
  const textBoxDragStart = useRef<Record<string, { clientX: number; clientY: number; x: number; y: number }>>({})
  const reportContentRef = useRef<HTMLElement>(null)
  const relatedFolderInputRef = useRef<HTMLInputElement>(null)
  const relatedPdfInputRef = useRef<HTMLInputElement>(null)
  const [activeLineMenu, setActiveLineMenu] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [textMenuOpen, setTextMenuOpen] = useState(false)
  const [equipmentRentalSettingsOpen, setEquipmentRentalSettingsOpen] = useState(false)
  const [pageLayoutMenuOpen, setPageLayoutMenuOpen] = useState(false)
  const [menuCollapsed, setMenuCollapsed] = useState(() => window.localStorage.getItem(menuCollapsedStorageKey) === 'true')
  const [menuSettingsOpen, setMenuSettingsOpen] = useState(false)
  const [relatedDocumentsOpen, setRelatedDocumentsOpen] = useState(false)
  const [masterServiceAgreementOpen, setMasterServiceAgreementOpen] = useState(false)
  const [menuSearch, setMenuSearch] = useState('')
  const [relatedDocuments, setRelatedDocuments] = useState<RelatedDocument[]>([])
  const [relatedDocumentsMessage, setRelatedDocumentsMessage] = useState('')
  const [savedReports, setSavedReports] = useState<EditableInspectionReport[]>([])
  const [savedReportsMessage, setSavedReportsMessage] = useState('')
  const [reportDatabaseStatus, setReportDatabaseStatus] = useState<'loading' | 'saving' | 'saved' | 'local' | 'error'>(
    isConfigured ? 'loading' : 'local',
  )
  const [currentEditableReportId, setCurrentEditableReportId] = useState(editableReportIdParam)
  const [currentReportName, setCurrentReportName] = useState('Untitled quote report')
  const [currentSourceDocumentName, setCurrentSourceDocumentName] = useState('Untitled quote report')
  const [currentJobsQuotingItemId, setCurrentJobsQuotingItemId] = useState<string | null>(jobsQuotingItemId || null)
  const [runtimePageBreaks, setRuntimePageBreaks] = useState<Record<string, number>>({})
  const [runtimePageCount, setRuntimePageCount] = useState(1)
  const [menuItemsRefreshProgress, setMenuItemsRefreshProgress] = useState<MenuItemsRefreshProgress>({
    active: false,
    percent: 0,
  })
  const [newMenuSection, setNewMenuSection] = useState(getDefaultAddableMenuSection(defaultMenuItemSections))
  const [newMenuLabel, setNewMenuLabel] = useState('')
  const [newMenuDescription, setNewMenuDescription] = useState('')
  const [newMenuRate, setNewMenuRate] = useState('0.00')
  const [editingMenuItem, setEditingMenuItem] = useState<EditingMenuItem | null>(null)
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
  const [canvasTextBoxes, setCanvasTextBoxes] = useState<CanvasTextBox[]>(() => {
    const savedTextBoxes = window.localStorage.getItem(textBoxStorageKey)

    if (!savedTextBoxes) return []

    try {
      return JSON.parse(savedTextBoxes) as CanvasTextBox[]
    } catch {
      return []
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
      textBoxes: canvasTextBoxes,
      equipmentRentalSettings,
    }),
    [
      blockVisibility,
      canvasTextBoxes,
      costSections,
      equipmentRentalSettings,
      estimateNoteVisibility,
      repairSectionVisibility,
      repairSections,
      report,
    ],
  )
  const activeSavedReport = useMemo(
    () => savedReports.find((savedReport) => savedReport.id === currentEditableReportId),
    [currentEditableReportId, savedReports],
  )

  const repairTotal = useMemo(
    () =>
      repairSections.reduce(
        (total, section) =>
          total + section.lineItems.reduce((sectionTotal, lineItem) => sectionTotal + getLineAmount(lineItem), 0),
        0,
      ),
    [repairSections],
  )
  const costTotal = useMemo(
    () =>
      costSections.reduce(
        (total, section) =>
          total + section.lineItems.reduce(
            (sectionTotal, lineItem) => sectionTotal + getCostLineAmount(section.id, lineItem, equipmentRentalSettings),
            0,
          ),
        0,
      ),
    [costSections, equipmentRentalSettings],
  )
  const invoiceTotal = repairTotal + costTotal
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
    const cappedSections = normalizeMenuItemSections(menuItemSections, currentCraneIdentifier)
    if (!searchValue) return cappedSections

    return cappedSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          `${item.label} ${item.description} ${item.rate}`.toLowerCase().includes(searchValue),
        ),
      }))
      .filter((section) => section.items.length > 0)
  }, [currentCraneIdentifier, menuItemSections, menuSearch])
  const addableMenuItemSections = useMemo(
    () => menuItemSections.filter((section) => section.title !== recentlyUsedMenuSectionTitle),
    [menuItemSections],
  )
  const editableMenuItemSections = useMemo(() => {
    if (!editingMenuItem) return addableMenuItemSections

    return menuItemSections.filter(
      (section) => section.title !== recentlyUsedMenuSectionTitle || section.title === editingMenuItem.originalSectionTitle,
    )
  }, [addableMenuItemSections, editingMenuItem, menuItemSections])
  const selectedAddableMenuSection = addableMenuItemSections.some((section) => section.title === newMenuSection)
    ? newMenuSection
    : getDefaultAddableMenuSection(addableMenuItemSections)

  const getRuntimePageBreakClassName = (blockId: string) =>
    runtimePageBreaks[blockId] ? 'report-runtime-page-break' : ''

  const getRuntimePageBreakStyle = (blockId: string) => {
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
    const nextTextBoxes = payload.textBoxes as CanvasTextBox[]
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
      textBoxes: nextTextBoxes,
      equipmentRentalSettings: nextEquipmentRentalSettings,
    })
    setReport(nextReport)
    setRepairSections(nextRepairSections)
    setCostSections(nextCostSections)
    setBlockVisibility(nextBlockVisibility)
    setEstimateNoteVisibility(nextEstimateNoteVisibility)
    setRepairSectionVisibility(nextRepairSectionVisibility)
    setCanvasTextBoxes(nextTextBoxes)
    setEquipmentRentalSettings(nextEquipmentRentalSettings)
  }, [])

  const refreshSavedReports = useCallback(async () => {
    if (!isConfigured) {
      setReportDatabaseStatus('local')
      setSavedReportsMessage('Supabase is not configured. Editable reports are saved only in this browser.')
      return []
    }

    try {
      const reports = await getEditableInspectionReports()
      setSavedReports(reports)
      setSavedReportsMessage(reports.length > 0 ? `${reports.length} saved report${reports.length === 1 ? '' : 's'}.` : 'No saved reports yet.')
      return reports
    } catch (error) {
      setReportDatabaseStatus('error')
      setSavedReportsMessage(error instanceof Error ? error.message : 'Saved reports could not be loaded.')
      return []
    }
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
    setSavedReports((currentReports) => {
      const nextReports = [
        savedReport,
        ...currentReports.filter((currentReport) => currentReport.id !== savedReport.id),
      ]
      return nextReports.sort((firstReport, secondReport) => secondReport.updatedAt.localeCompare(firstReport.updatedAt))
    })
    setSavedReportsMessage(`Saved ${savedReport.reportName}.`)
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
    refreshSavedReports()
  }, [refreshSavedReports])

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
          setSavedReportsMessage(`Loaded ${savedReport.reportName}.`)
        } else if (jobsQuotingItemId) {
          const quoteItem = await getJobsQuotingItem(jobsQuotingItemId)
          if (!active) return
          const quoteReport = buildReportFromJobsQuotingItem(quoteItem)
          const existingReport = await findExistingEditableReportForQuoteItem(jobsQuotingItemId, quoteReport)
          if (!active) return

          if (existingReport) {
            const existingReportName = getSavedReportDisplayName(existingReport)
            const shouldOpenSavedReport = window.confirm(
              `A saved editable copy already exists for ${existingReportName}.\n\nPress OK to open the saved edited copy, or Cancel to start fresh from the extracted report.`,
            )

            if (shouldOpenSavedReport) {
              applyEditableReportPayload(getNormalizedReportPayload(existingReport))
              setCurrentEditableReportId(existingReport.id)
              setCurrentReportName(existingReport.reportName)
              setCurrentSourceDocumentName(existingReport.sourceDocumentName)
              setCurrentJobsQuotingItemId(existingReport.jobsQuotingItemId)
              setReportDatabaseStatus('saved')
              setSavedReportsMessage(`Loaded ${existingReport.reportName}.`)
              skipNextReportDatabaseSave.current = true
              pendingReportChanges.current = false
              reportHydrationReady.current = true
              setSearchParams({ editableReportId: existingReport.id }, { replace: true })
              return
            }
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
          setSavedReportsMessage(
            existingReport
              ? `Started fresh edit for ${getEditableReportDisplayName(quoteReport, quoteItem.documentName)}. Save will update the existing saved copy.`
              : `Started editable report for ${getEditableReportDisplayName(quoteReport, quoteItem.documentName)}.`,
          )
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
      } catch (error) {
        if (!active) return
        reportHydrationReady.current = true
        setReportDatabaseStatus('error')
        setSavedReportsMessage(error instanceof Error ? error.message : 'Editable report could not be loaded.')
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
    if (reportDatabaseStatus !== 'error') {
      setSavedReportsMessage('Unsaved changes. Click Save to update the saved report.')
    }
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
    canvasTextBoxes,
    costSections,
    estimateNoteVisibility,
    equipmentRentalSettings,
    report,
    repairSectionVisibility,
    repairSections,
  ])

  useEffect(() => {
    setMenuItemSections((currentSections) => {
      if (!currentSections.some((section) => getNormalizedMenuSectionTitle(section.title, currentCraneIdentifier) !== section.title)) {
        return currentSections
      }
      const normalizedSections = normalizeMenuItemSections(currentSections, currentCraneIdentifier)
      window.localStorage.setItem(menuStorageKey, JSON.stringify(normalizedSections))
      skipNextMenuDatabaseSave.current = true
      return normalizedSections
    })
  }, [currentCraneIdentifier])

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

      setMenuDatabaseStatus('loading')
      setMenuDatabaseMessage(loadingMessage)

      try {
        const savedMenu = await getInspectionMenuItems()
        if (!shouldApply()) return false

        if (savedMenu) {
          const normalizedSections = normalizeMenuItemSections(
            savedMenu.menuSections.length > 0 ? savedMenu.menuSections : defaultMenuItemSections,
            currentCraneIdentifier,
          )
          window.localStorage.setItem(menuStorageKey, JSON.stringify(normalizedSections))
          skipNextMenuDatabaseSave.current = true
          setMenuItemSections(normalizedSections)
          setMenuDatabaseMessage(loadedMessage)
        } else {
          setMenuDatabaseMessage(emptyMessage)
        }

        if (markSyncReady) menuDatabaseSyncReady.current = true
        setMenuDatabaseStatus('saved')
        return true
      } catch (error) {
        if (!shouldApply()) return false
        if (markSyncReady) menuDatabaseSyncReady.current = false
        setMenuDatabaseStatus(markSyncReady ? 'local' : 'error')
        setMenuDatabaseMessage(error instanceof Error ? error.message : 'Menu items could not be loaded.')
        return false
      }
    },
    [currentCraneIdentifier],
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

    const nextSections = normalizeMenuItemSections(menuItemSections, currentCraneIdentifier)
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
  }, [currentCraneIdentifier, menuItemSections])

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
        } else {
          const originalInspectionResponse = await fetch('/testassessment.pdf')
          if (!originalInspectionResponse.ok) {
            throw new Error('Original inspection PDF could not be loaded.')
          }

          const originalInspectionBlob = await originalInspectionResponse.blob()
          const originalInspectionFile = new File([originalInspectionBlob], 'original-inspection.pdf', {
            type: 'application/pdf',
          })

          await uploadEditableInspectionDocument({
            file: originalInspectionFile,
            name: 'Original Inspection',
            description: 'Source inspection PDF used for this editable quote proposal.',
            source: 'Built-in document',
            stableKey: originalInspectionStableKey,
          })
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
    const normalizedSections = normalizeMenuItemSections(nextSections, currentCraneIdentifier)
    window.localStorage.setItem(menuStorageKey, JSON.stringify(normalizedSections))
    return normalizedSections
  }

  const saveCanvasTextBoxes = (nextTextBoxes: CanvasTextBox[]) => {
    window.localStorage.setItem(textBoxStorageKey, JSON.stringify(nextTextBoxes))
    return nextTextBoxes
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

  const deleteQuoteBlock = (block: keyof QuoteBlockVisibility) => {
    setBlockVisibility((currentVisibility) => {
      const nextVisibility = { ...currentVisibility, [block]: false }
      window.localStorage.setItem(blockVisibilityStorageKey, JSON.stringify(nextVisibility))
      return nextVisibility
    })
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
    if (selectedAddableMenuSection === recentlyUsedMenuSectionTitle) return

    const label = newMenuLabel.trim()
    const description = newMenuDescription.trim()
    if (!label || !description) return

    const nextItem: MenuItem = {
      id: createMenuItemId(),
      label,
      description,
      rate: parseMoney(newMenuRate).toFixed(2),
    }

    setMenuItemSections((currentSections) =>
      saveMenuItemSections(
        currentSections.map((section) =>
          section.title === selectedAddableMenuSection ? { ...section, items: [...section.items, nextItem] } : section,
        ),
      ),
    )
    setNewMenuLabel('')
    setNewMenuDescription('')
    setNewMenuRate('0.00')
  }

  const openMenuItemEditor = (sectionTitle: string, item: MenuItem) => {
    setEditingMenuItem({
      originalSectionTitle: sectionTitle,
      sectionTitle,
      itemId: item.id ?? createMenuItemId(),
      label: item.label,
      description: item.description,
      rate: item.rate,
    })
  }

  const saveEditedMenuItem = () => {
    if (!editingMenuItem) return

    const label = editingMenuItem.label.trim()
    const description = editingMenuItem.description.trim()
    if (!label || !description) return

    const nextRate = parseMoney(editingMenuItem.rate).toFixed(2)

    setMenuItemSections((currentSections) =>
      saveMenuItemSections(
        currentSections.map((section) => {
          if (section.title === editingMenuItem.sectionTitle) {
            const updatedItem = {
              id: editingMenuItem.itemId,
              label,
              description,
              rate: nextRate,
            }

            if (section.title === editingMenuItem.originalSectionTitle) {
              return {
                ...section,
                items: section.items.map((item) =>
                  item.id === editingMenuItem.itemId ? updatedItem : item,
                ),
              }
            }

            return {
              ...section,
              items: [...section.items, updatedItem],
            }
          }

          if (section.title === editingMenuItem.originalSectionTitle) {
            return {
              ...section,
              items: section.items.filter((item) => item.id !== editingMenuItem.itemId),
            }
          }

          return section
        }),
      ),
    )
    setEditingMenuItem(null)
  }

  const deleteEditedMenuItem = () => {
    if (!editingMenuItem) return

    setMenuItemSections((currentSections) =>
      saveMenuItemSections(
        currentSections.map((section) =>
          section.title === editingMenuItem.originalSectionTitle
            ? {
                ...section,
                items: section.items.filter((item) => item.id !== editingMenuItem.itemId),
              }
            : section,
        ),
      ),
    )
    setEditingMenuItem(null)
  }

  const addMenuItemToRecentlyUsed = (item: MenuItem) => {
    setMenuItemSections((currentSections) =>
      saveMenuItemSections(
        currentSections.map((section) => {
          if (section.title !== recentlyUsedMenuSectionTitle) return section

          const matchingItem = (sectionItem: MenuItem) =>
            sectionItem.label === item.label
            || (sectionItem.description === item.description && sectionItem.rate === item.rate)

          return {
            ...section,
            items: [
              { ...item, id: createMenuItemId() },
              ...section.items.filter((sectionItem) => !matchingItem(sectionItem)),
            ].slice(0, maxRecentlyUsedItems),
          }
        }),
      ),
    )
  }

  const createId = (prefix: string) => {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`
    generatedId.current += 1
    return `${prefix}-${generatedId.current}`
  }

  const addCanvasTextBox = () => {
    setCanvasTextBoxes((currentTextBoxes) =>
      saveCanvasTextBoxes([
        ...currentTextBoxes,
        {
          id: createId('text-box'),
          text: 'Add text',
          x: 360,
          y: 255 + currentTextBoxes.length * 22,
        },
      ]),
    )
    setTextMenuOpen(false)
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

  const updateCanvasTextBox = (textBoxId: string, value: string) => {
    setCanvasTextBoxes((currentTextBoxes) =>
      saveCanvasTextBoxes(
        currentTextBoxes.map((textBox) =>
          textBox.id === textBoxId ? { ...textBox, text: value } : textBox,
        ),
      ),
    )
  }

  const moveCanvasTextBox = (textBoxId: string, x: number, y: number) => {
    setCanvasTextBoxes((currentTextBoxes) =>
      saveCanvasTextBoxes(
        currentTextBoxes.map((textBox) =>
          textBox.id === textBoxId
            ? {
                ...textBox,
                x: Math.max(12, Math.min(960, x)),
                y: Math.max(12, Math.min(790, y)),
              }
            : textBox,
        ),
      ),
    )
  }

  const deleteCanvasTextBox = (textBoxId: string) => {
    setCanvasTextBoxes((currentTextBoxes) =>
      saveCanvasTextBoxes(currentTextBoxes.filter((textBox) => textBox.id !== textBoxId)),
    )
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
          lineItems: [{ id: createId('line'), description: 'Add repair detail here.', quantity: '1', rate: '0.00', margin: '0' }],
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
                  { id: createId('line'), description: 'Add repair detail here.', quantity: '1', rate: '0.00', margin: '0' },
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
    field: 'description' | 'quantity' | 'rate' | 'margin',
    value: string,
  ) => {
    setRepairSections((currentSections) =>
      saveRepairSections(
        currentSections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                lineItems: section.lineItems.map((lineItem) =>
                  lineItem.id === lineItemId ? { ...lineItem, [field]: value } : lineItem,
                ),
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
                  { id: createId('line'), description: item.description, quantity: '1', rate: item.rate, margin: '0' },
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
                  { id: createId('line'), description: 'Add line item here.', quantity: '1', rate: '0.00', margin: '0' },
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
    field: 'description' | 'quantity' | 'rate' | 'margin',
    value: string,
  ) => {
    setCostSections((currentSections) =>
      saveCostSections(
        currentSections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                lineItems: section.lineItems.map((lineItem) =>
                  lineItem.id === lineItemId ? { ...lineItem, [field]: value } : lineItem,
                ),
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
                  { id: createId('line'), description: item.description, quantity: '1', rate: item.rate, margin: '0' },
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

  const resetTemplate = () => {
    window.localStorage.removeItem(storageKey)
    window.localStorage.removeItem(repairStorageKey)
    window.localStorage.removeItem(costStorageKey)
    window.localStorage.removeItem(menuStorageKey)
    window.localStorage.removeItem(blockVisibilityStorageKey)
    window.localStorage.removeItem(textBoxStorageKey)
    window.localStorage.removeItem(menuCollapsedStorageKey)
    window.localStorage.removeItem(estimateNoteVisibilityStorageKey)
    window.localStorage.removeItem(repairSectionVisibilityStorageKey)
    window.localStorage.removeItem(equipmentRentalSettingsStorageKey)
    setReport(defaultReport)
    setRepairSections(defaultRepairSections)
    setCostSections(defaultCostSections)
    setMenuItemSections(normalizeMenuItemSections(defaultMenuItemSections, currentCraneIdentifier))
    setBlockVisibility(defaultBlockVisibility)
    setEstimateNoteVisibility(defaultEstimateNoteVisibility)
    setRepairSectionVisibility({})
    setCanvasTextBoxes([])
    setMenuCollapsed(false)
    setEquipmentRentalSettings(defaultEquipmentRentalSettings)
    setUnlocked(false)
    setTextMenuOpen(false)
    setPageLayoutMenuOpen(false)
    setRelatedDocumentsOpen(false)
    setMenuSettingsOpen(false)
  }

  const openSavedEditableReport = async (savedReport: EditableInspectionReport) => {
    if (savedReport.id === currentEditableReportId) return

    if (pendingReportChanges.current) {
      const shouldSave = window.confirm('Save changes before opening this report? Press OK to save, or Cancel to discard changes.')
      if (shouldSave) {
        try {
          await saveCurrentEditableReportNow()
        } catch (error) {
          setReportDatabaseStatus('error')
          setSavedReportsMessage(error instanceof Error ? error.message : 'Editable report could not be saved.')
          return
        }
      }
    }

    setSearchParams({ editableReportId: savedReport.id })
  }

  const goBackToJobsQuotingList = async () => {
    if (pendingReportChanges.current) {
      const shouldSave = window.confirm('Save changes before going back to Jobs Quoting List? Press OK to save, or Cancel to discard changes.')
      if (shouldSave) {
        try {
          await saveCurrentEditableReportNow()
        } catch (error) {
          setReportDatabaseStatus('error')
          setSavedReportsMessage(error instanceof Error ? error.message : 'Editable report could not be saved.')
          return
        }
      }
    }

    navigate('/jobsquotinglist')
  }

  const deleteSavedEditableReport = async (savedReport: EditableInspectionReport) => {
    const reportName = getSavedReportDisplayName(savedReport)
    if (!window.confirm(`Delete saved report "${reportName}"?`)) return

    try {
      await deleteEditableInspectionReport(savedReport.id)
      setSavedReports((currentReports) => currentReports.filter((currentReport) => currentReport.id !== savedReport.id))
      setSavedReportsMessage(`Deleted ${reportName}.`)

      if (savedReport.id === currentEditableReportId) {
        pendingReportChanges.current = false
        skipNextReportDatabaseSave.current = true
        setCurrentEditableReportId('')
        setReportDatabaseStatus('saved')
        setSearchParams(currentJobsQuotingItemId ? { jobsQuotingItemId: currentJobsQuotingItemId } : {}, { replace: true })
      }
    } catch (error) {
      setReportDatabaseStatus('error')
      setSavedReportsMessage(error instanceof Error ? error.message : 'Saved report could not be deleted.')
    }
  }

  const saveEditableReportFromButton = () => {
    saveCurrentEditableReportNow().catch((error) => {
      setReportDatabaseStatus('error')
      setSavedReportsMessage(error instanceof Error ? error.message : 'Editable report could not be saved.')
    })
  }

  return (
    <div className="min-h-screen bg-[#e8eaef] text-[#111]">
      <style>
        {`
          .editable-report-field {
            min-width: 0;
            border-radius: 2px;
            outline: 1px solid transparent;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
          }

          .editable-report-field:hover {
            background: rgba(255, 184, 0, 0.12);
            outline-color: rgba(245, 175, 0, 0.38);
          }

          .editable-report-field:focus {
            background: #fffdf3;
            outline: 2px solid #f3a900;
            box-shadow: 0 0 0 3px rgba(243, 169, 0, 0.14);
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

          .report-runtime-page-break {
            break-before: page;
            page-break-before: always;
            margin-top: 0 !important;
          }

          @media print {
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

      <header className="report-toolbar sticky top-0 z-30 flex h-14 items-center justify-between bg-[linear-gradient(90deg,#3cb9c5_0%,#7a35e8_100%)] px-4 text-white shadow-sm">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={goBackToJobsQuotingList}
            className="text-[22px] font-black leading-none transition hover:scale-105 hover:text-white/85"
            aria-label="Go back to Jobs Quoting List"
            title="Back to Jobs Quoting List"
          >
            ⌂
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setTextMenuOpen((currentOpen) => !currentOpen)}
              className="rounded-md px-2 py-1 text-sm font-black transition hover:bg-white/15"
              aria-expanded={textMenuOpen}
            >
              Text
            </button>
            {textMenuOpen ? (
              <div className="absolute left-0 top-[calc(100%+14px)] z-50 w-[360px] rounded-[22px] border border-[#dfe4ef] bg-white p-4 text-[#111] shadow-[0_24px_70px_-34px_rgba(15,23,42,0.55)]">
                <label className="relative block">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[28px] leading-none text-[#111]">
                    ⌕
                  </span>
                  <input
                    placeholder="Search fonts and combinations"
                    className="w-full rounded-[18px] border-2 border-[#eadcff] bg-white py-4 pl-14 pr-4 text-[18px] font-semibold text-[#1f2430] outline-none placeholder:text-[#7b808b]"
                  />
                </label>
                <button
                  type="button"
                  onClick={addCanvasTextBox}
                  className="mt-4 flex w-full items-center justify-center gap-4 rounded-xl bg-[#8b3dff] px-4 py-4 text-[18px] font-black text-white transition hover:bg-[#7830e8]"
                >
                  <span className="text-[31px] leading-none">T</span>
                  <span>Add a text box</span>
                </button>
              </div>
            ) : null}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setRelatedDocumentsOpen((currentOpen) => !currentOpen)}
              className="rounded-md px-2 py-1 text-sm font-black transition hover:bg-white/15"
              aria-expanded={relatedDocumentsOpen}
            >
              Related Documents
            </button>
            {relatedDocumentsOpen ? (
              <div className="absolute left-0 top-[calc(100%+14px)] z-50 w-[340px] rounded-md border border-[#dfe4ef] bg-white p-2 text-[#111] shadow-[0_24px_70px_-34px_rgba(15,23,42,0.55)]">
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
                <a
                  href={originalInspectionDocument?.url ?? '/testassessment.pdf'}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setRelatedDocumentsOpen(false)}
                  className="w-full rounded-md px-3 py-3 text-left transition hover:bg-[#f4f6fb]"
                >
                  <span className="block text-[14px] font-black text-[#1f2430]">Original Inspection</span>
                  <span className="mt-0.5 block text-[12px] font-semibold text-[#747b8a]">Open the source inspection PDF in a new tab.</span>
                </a>
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
          <button
            type="button"
            onClick={() => setUnlocked((currentUnlocked) => !currentUnlocked)}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-black transition ${
              unlocked
                ? 'border-white bg-white text-[#35245f]'
                : 'border-white/25 bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <span className="text-base">{unlocked ? '🔓' : '🔒'}</span>
            <span>{unlocked ? 'Unlocked' : 'Locked'}</span>
          </button>
        </div>

        <div className="text-sm font-black tracking-wide">DESHAZO Quote Builder</div>

        <div className="flex items-center gap-2">
          <div className="hidden rounded-md border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold md:block">
            {reportDatabaseStatus === 'saving'
              ? 'Saving...'
              : reportDatabaseStatus === 'error'
                ? 'Save error'
                : activeSavedReport
                  ? `Saved ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(activeSavedReport.updatedAt))}`
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
            <button
              type="button"
              onClick={resetTemplate}
              className="rounded-md border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md bg-white px-4 py-2 text-sm font-black text-[#35245f] transition hover:bg-[#f3efff]"
            >
              Print PDF
            </button>
          </div>
        </div>
      </header>

      <div className="editor-workspace report-shell flex h-[calc(100vh-56px)] overflow-hidden bg-[#f3f4f8]">
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
                    Drag an item into any line-item description.
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

                <div className="space-y-4">
                  {visibleMenuItemSections.length > 0 ? visibleMenuItemSections.map((section) => (
                    <section key={section.title}>
                      <h3 className="mb-2 border-b border-[#dfe4ef] pb-1 text-[12px] font-black uppercase tracking-[0.02em] text-[#273f7a]">
                        {getMenuSectionDisplayTitle(section.title)}
                      </h3>
                      <div className="space-y-2">
                        {section.items.map((item) => (
                          <div
                            key={`${section.title}-${item.id ?? item.label}`}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData('application/deshazo-menu-item', JSON.stringify(item))
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
                                  openMenuItemEditor(section.title, item)
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
                            <span className="mt-2 block text-[12px] font-black text-[#111]">{formatMoney(parseMoney(item.rate))}</span>
                            {section.title === 'Customer specific' && ['Labor', 'Freight'].includes(item.label) ? (
                              <button
                                type="button"
                                draggable={false}
                                onClick={() => {
                                  if (masterServiceAgreementDocument?.url) {
                                    window.open(masterServiceAgreementDocument.url, '_blank', 'noopener,noreferrer')
                                  } else {
                                    setMasterServiceAgreementOpen(true)
                                  }
                                }}
                                onDragStart={(event) => event.preventDefault()}
                                className="mt-2 rounded-md border border-[#f5b400] bg-[#fff2bf] px-2 py-1 text-[10px] font-black uppercase leading-tight text-[#6c4a00] shadow-sm transition hover:bg-[#ffe68a]"
                              >
                                Master Service Agreement
                              </button>
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
                        ))}
                      </div>
                    </section>
                  )) : (
                    <div className="rounded-md border border-dashed border-[#cfd6e5] bg-white px-3 py-5 text-center text-[12px] font-bold text-[#747b8a]">
                      No menu items found.
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-[#d9dce5] bg-white p-4">
                {menuItemsRefreshProgress.active ? (
                  <div className="mb-3 rounded-md border border-[#cfd9ef] bg-[#f4f7ff] px-3 py-2">
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
                <div
                  className={`mb-3 rounded-md border px-3 py-2 text-[11px] font-bold leading-tight ${
                    menuDatabaseStatus === 'error'
                      ? 'border-[#f3c7c7] bg-[#fff5f5] text-[#9f1d1d]'
                      : menuDatabaseStatus === 'local'
                        ? 'border-[#dfe4ef] bg-[#fbfcff] text-[#747b8a]'
                        : 'border-[#cfe6d5] bg-[#f3fbf5] text-[#286239]'
                  }`}
                >
                  {menuDatabaseMessage}
                </div>
                <button
                  type="button"
                  onClick={() => setMenuSettingsOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-[#273f7a] px-3 py-2.5 text-[13px] font-black text-white transition hover:bg-[#1f3262]"
                >
                  <span className="text-[16px]">⚙</span>
                  <span>Menu Settings</span>
                </button>
              </div>
            </>
          )}
        </aside>

        <main className="canvas-stage min-w-0 flex-1 overflow-auto px-8 py-7">
          <div className="mx-auto w-fit">
            <div className="report-toolbar mb-3 flex items-center justify-between text-[#5b606b]">
              <div className="text-[16px] font-black text-[#1e222b]">
                Page 1 <span className="font-bold text-[#7b808b]">- Quote proposal</span>
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
            <article ref={reportContentRef} className="report-content-layer relative z-10">
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

            {blockVisibility.scopeOfWork ? (
            <section
              data-report-block-id="scope-of-work"
              style={getRuntimePageBreakStyle('scope-of-work')}
              className={`relative mt-3 border border-[#d4d4d4] ${getRuntimePageBreakClassName('scope-of-work')} ${unlocked ? 'ring-2 ring-red-500/45' : ''}`}
            >
              {unlocked ? (
                <button
                  type="button"
                  onClick={() => deleteQuoteBlock('scopeOfWork')}
                  className="report-toolbar absolute right-[-14px] top-[-14px] z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-red-600 bg-white text-[15px] font-black text-red-700 shadow-sm transition hover:bg-red-50"
                  aria-label="Delete scope of work block"
                >
                  🗑
                </button>
              ) : null}
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
            <section className={`relative mt-3 border border-[#d4d4d4] ${unlocked ? 'ring-2 ring-red-500/45' : ''}`}>
              {unlocked ? (
                <button
                  type="button"
                  onClick={() => deleteQuoteBlock('repairItems')}
                  className="report-toolbar absolute right-[-14px] top-[-14px] z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-red-600 bg-white text-[15px] font-black text-red-700 shadow-sm transition hover:bg-red-50"
                  aria-label="Delete repair items block"
                >
                  🗑
                </button>
              ) : null}
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
                      <div className="grid grid-cols-[1fr_70px_96px_112px_38px] border-b border-[#d8d8d8] bg-[#f7f7f7] text-[10px] font-black uppercase text-[#555b66]">
                        <div className="px-2 py-1">Description</div>
                        <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Qty</div>
                        <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Rate</div>
                        <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Amount</div>
                        <div className="report-inline-action border-l border-[#d8d8d8]" />
                      </div>
                      <div>
                        {section.lineItems.map((lineItem, lineIndex) => (
                          <div
                            key={lineItem.id}
                            className="relative grid grid-cols-[1fr_70px_96px_112px_38px] border-b border-[#e5e5e5] text-[12px] font-semibold"
                          >
                            {parseMoney(lineItem.margin) > 0 ? (
                              <span className="absolute right-[-106px] top-1 z-10 inline-flex items-center gap-1.5 rounded-r-md border border-l-0 border-[#42a65a] bg-[#e9f8ed] px-2 py-1 text-[10px] font-black leading-none text-[#17652b] shadow-sm">
                                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1f9d45] text-[12px] leading-none text-white">
                                  +
                                </span>
                                <span>{Math.round(parseMoney(lineItem.margin))}% margin</span>
                              </span>
                            ) : null}
                            <div className="flex min-h-[25px] items-start gap-2 px-2 py-1.5">
                              <EditableValue
                                label={`${section.title} line item ${lineIndex + 1}`}
                                value={lineItem.description}
                                onChange={(value) => updateRepairLineItem(section.id, lineItem.id, 'description', value)}
                                onDropMenuItem={(item) => addMenuItemToRepairSection(section.id, item)}
                                className="min-w-0 flex-1 leading-tight"
                                multiline
                              />
                            </div>
                            <EditableValue
                              label={`${section.title} quantity ${lineIndex + 1}`}
                              value={lineItem.quantity}
                              onChange={(value) => updateRepairLineItem(section.id, lineItem.id, 'quantity', value)}
                              className="min-h-[25px] border-l border-[#e5e5e5] px-2 py-1.5 text-right"
                            />
                            <EditableValue
                              label={`${section.title} rate ${lineIndex + 1}`}
                              value={lineItem.rate}
                              onChange={(value) => updateRepairLineItem(section.id, lineItem.id, 'rate', value)}
                              className="min-h-[25px] border-l border-[#e5e5e5] px-2 py-1.5 text-right"
                            />
                            <div className="border-l border-[#e5e5e5] px-2 py-1.5 text-right font-black">
                              {formatMoney(getLineAmount(lineItem))}
                            </div>
                            <div className="report-inline-action relative border-l border-[#e5e5e5]">
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveLineMenu((currentMenu) =>
                                    currentMenu === `repair-${section.id}-${lineItem.id}`
                                      ? ''
                                      : `repair-${section.id}-${lineItem.id}`,
                                  )
                                }
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
                                  <label className="block text-[11px] font-black uppercase text-[#555b66]">
                                    Add margin: {Math.round(parseMoney(lineItem.margin))}%
                                  </label>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={parseMoney(lineItem.margin)}
                                    onChange={(event) =>
                                      updateRepairLineItem(section.id, lineItem.id, 'margin', event.currentTarget.value)
                                    }
                                    className="mt-2 w-full accent-[#273f7a]"
                                  />
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-bold text-[#4d5360]">
                                    <span>Base</span>
                                    <span className="text-right">{formatMoney(getBaseLineAmount(lineItem))}</span>
                                    <span>Increase</span>
                                    <span className="text-right text-[#7d1515]">{formatMoney(getMarginAmount(lineItem))}</span>
                                    <span className="font-black text-[#111]">New price</span>
                                    <span className="text-right font-black text-[#111]">{formatMoney(getLineAmount(lineItem))}</span>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-[1fr_150px_112px_30px] border-b border-[#d8d8d8] bg-[#fbfbfb] text-[12px] font-black">
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
                          {formatMoney(section.lineItems.reduce((total, lineItem) => total + getLineAmount(lineItem), 0))}
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
            <section className={`relative mt-5 ${unlocked ? 'ring-2 ring-red-500/45' : ''}`}>
              {unlocked ? (
                <button
                  type="button"
                  onClick={() => deleteQuoteBlock('estimateSummary')}
                  className="report-toolbar absolute right-[-14px] top-[-14px] z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-red-600 bg-white text-[15px] font-black text-red-700 shadow-sm transition hover:bg-red-50"
                  aria-label="Delete estimate summary block"
                >
                  🗑
                </button>
              ) : null}
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

                    <div className="grid grid-cols-[1fr_70px_96px_112px_38px] border-b border-[#d8d8d8] bg-[#fbfbfb] text-[10px] font-black uppercase text-[#555b66]">
                      <div className="px-2 py-1">Description</div>
                      <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Qty</div>
                      <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Rate</div>
                      <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Amount</div>
                      <div className="report-inline-action border-l border-[#d8d8d8]" />
                    </div>

                    {section.lineItems.map((lineItem, lineIndex) => (
                      <div
                        key={lineItem.id}
                        className="relative grid grid-cols-[1fr_70px_96px_112px_38px] border-b border-[#e5e5e5] text-[12px] font-semibold"
                      >
                        {parseMoney(lineItem.margin) > 0 ? (
                          <span className="absolute right-[-106px] top-1 z-10 inline-flex items-center gap-1.5 rounded-r-md border border-l-0 border-[#42a65a] bg-[#e9f8ed] px-2 py-1 text-[10px] font-black leading-none text-[#17652b] shadow-sm">
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1f9d45] text-[12px] leading-none text-white">
                              +
                            </span>
                            <span>{Math.round(parseMoney(lineItem.margin))}% margin</span>
                          </span>
                        ) : null}
                        <div className="flex min-h-[25px] items-start gap-2 px-2 py-1.5">
                          <EditableValue
                            label={`${section.title} line item ${lineIndex + 1}`}
                            value={lineItem.description}
                            onChange={(value) => updateCostLineItem(section.id, lineItem.id, 'description', value)}
                            onDropMenuItem={(item) => addMenuItemToCostSection(section.id, item)}
                            className="min-w-0 flex-1 leading-tight"
                          />
                        </div>
                        <EditableValue
                          label={`${section.title} quantity ${lineIndex + 1}`}
                          value={lineItem.quantity}
                          onChange={(value) => updateCostLineItem(section.id, lineItem.id, 'quantity', value)}
                          className="min-h-[25px] border-l border-[#e5e5e5] px-2 py-1.5 text-right"
                        />
                        {section.id === equipmentRentalSectionId && equipmentRentalSettings.applyMarginToAll ? (
                          <div className="flex min-h-[25px] items-center justify-end gap-1 border-l border-[#e5e5e5] px-2 py-1.5 text-right">
                            <EditableValue
                              label={`${section.title} rate ${lineIndex + 1}`}
                              value={lineItem.rate}
                              onChange={(value) => updateCostLineItem(section.id, lineItem.id, 'rate', value)}
                              className="min-w-0"
                            />
                            <span className="whitespace-nowrap font-black text-[#17652b]">
                              + {Math.round(parseMoney(equipmentRentalSettings.margin))}%
                            </span>
                          </div>
                        ) : (
                          <EditableValue
                            label={`${section.title} rate ${lineIndex + 1}`}
                            value={lineItem.rate}
                            onChange={(value) => updateCostLineItem(section.id, lineItem.id, 'rate', value)}
                            className="min-h-[25px] border-l border-[#e5e5e5] px-2 py-1.5 text-right"
                          />
                        )}
                        <div className="border-l border-[#e5e5e5] px-2 py-1.5 text-right font-black">
                          {formatMoney(getCostLineAmount(section.id, lineItem, equipmentRentalSettings))}
                        </div>
                        <div className="report-inline-action relative border-l border-[#e5e5e5]">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveLineMenu((currentMenu) =>
                                currentMenu === `cost-${section.id}-${lineItem.id}`
                                  ? ''
                                  : `cost-${section.id}-${lineItem.id}`,
                              )
                            }
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
                              <label className="block text-[11px] font-black uppercase text-[#555b66]">
                                Add margin: {Math.round(parseMoney(lineItem.margin))}%
                              </label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                value={parseMoney(lineItem.margin)}
                                onChange={(event) =>
                                  updateCostLineItem(section.id, lineItem.id, 'margin', event.currentTarget.value)
                                }
                                className="mt-2 w-full accent-[#273f7a]"
                              />
                              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-bold text-[#4d5360]">
                                <span>Base</span>
                                <span className="text-right">{formatMoney(getCostBaseLineAmount(section.id, lineItem))}</span>
                                <span>Increase</span>
                                <span className="text-right text-[#7d1515]">{formatMoney(getCostMarginAmount(section.id, lineItem, equipmentRentalSettings))}</span>
                                <span className="font-black text-[#111]">New price</span>
                                <span className="text-right font-black text-[#111]">{formatMoney(getCostLineAmount(section.id, lineItem, equipmentRentalSettings))}</span>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}

                    <div className="grid grid-cols-[1fr_150px_112px_30px] border-b border-[#d8d8d8] bg-[#fbfbfb] text-[12px] font-black">
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
                          (total, lineItem) => total + getCostLineAmount(section.id, lineItem, equipmentRentalSettings),
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
              className={`relative mt-5 border-2 border-[#111] ${getRuntimePageBreakClassName('grand-total')} ${unlocked ? 'ring-2 ring-red-500/45' : ''}`}
            >
              {unlocked ? (
                <button
                  type="button"
                  onClick={() => deleteQuoteBlock('grandTotal')}
                  className="report-toolbar absolute right-[-14px] top-[-14px] z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-red-600 bg-white text-[15px] font-black text-red-700 shadow-sm transition hover:bg-red-50"
                  aria-label="Delete grand total block"
                >
                  🗑
                </button>
              ) : null}
              <div className="grid grid-cols-[1fr_180px_160px] bg-[#f2f2f2] text-[16px] font-black">
                <div className="px-4 py-3 uppercase text-[#555b66]">Grand Total</div>
                <div className="border-l border-[#cfcfcf] px-4 py-3 text-right uppercase text-[#555b66]">Total</div>
                <div className="border-l border-[#111] bg-[#f5b400] px-4 py-3 text-right text-[#111]">
                  {formatMoney(invoiceTotal)}
                </div>
              </div>
            </section>
            ) : null}

            {blockVisibility.notes ? (
            <section
              data-report-block-id="notes"
              style={getRuntimePageBreakStyle('notes')}
              className={`relative mt-5 border border-[#d4d4d4] ${getRuntimePageBreakClassName('notes')} ${unlocked ? 'ring-2 ring-red-500/45' : ''}`}
            >
              {unlocked ? (
                <button
                  type="button"
                  onClick={() => deleteQuoteBlock('notes')}
                  className="report-toolbar absolute right-[-14px] top-[-14px] z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-red-600 bg-white text-[15px] font-black text-red-700 shadow-sm transition hover:bg-red-50"
                  aria-label="Delete notes block"
                >
                  🗑
                </button>
              ) : null}
              <EditableText
                id="notesHeader"
                data={report}
                onChange={updateField}
                className="bg-[#f2f2f2] px-3 py-2 text-[17px] font-black uppercase"
              />
              <EditableText id="notes" data={report} onChange={updateField} multiline className="min-h-[96px] px-3 py-3 text-[15px] font-semibold" />
            </section>
            ) : null}
          </section>
          {canvasTextBoxes.map((textBox) => (
            <div
              key={textBox.id}
              draggable
              onDragStart={(event) => {
                textBoxDragStart.current[textBox.id] = {
                  clientX: event.clientX,
                  clientY: event.clientY,
                  x: textBox.x,
                  y: textBox.y,
                }
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={(event) => {
                const start = textBoxDragStart.current[textBox.id]
                if (!start || event.clientX === 0 || event.clientY === 0) return
                moveCanvasTextBox(
                  textBox.id,
                  start.x + event.clientX - start.clientX,
                  start.y + event.clientY - start.clientY,
                )
                delete textBoxDragStart.current[textBox.id]
              }}
              className="absolute z-20 min-w-[170px] max-w-[360px] cursor-move rounded-md ring-2 ring-[#8b3dff]/35"
              style={{ left: textBox.x, top: textBox.y }}
            >
              <button
                type="button"
                onClick={() => deleteCanvasTextBox(textBox.id)}
                className="report-toolbar absolute right-[-12px] top-[-12px] z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-red-600 bg-white text-[13px] font-black text-red-700 shadow-sm transition hover:bg-red-50"
                aria-label="Delete text box"
              >
                🗑
              </button>
              <EditableValue
                label="Canvas text box"
                value={textBox.text}
                onChange={(value) => updateCanvasTextBox(textBox.id, value)}
                className="min-h-[34px] rounded-md border border-dashed border-[#8b3dff]/55 bg-white/90 px-2.5 py-1.5 font-['Times_New_Roman',Times,serif] text-[18px] font-normal leading-tight shadow-[0_8px_22px_-20px_rgba(15,23,42,0.55)]"
                multiline
              />
            </div>
          ))}
        </article>
            </div>
          </div>
      </main>
        <aside className="report-toolbar flex w-[280px] shrink-0 flex-col border-l border-[#d9dce5] bg-[#fbfcff] shadow-sm">
          <div className="border-b border-[#dfe4ef] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-black text-[#1f2430]">Saved Reports</h2>
                <p className="mt-0.5 text-[11px] font-semibold text-[#747b8a]">Editable quote drafts</p>
              </div>
              <button
                type="button"
                onClick={saveEditableReportFromButton}
                className="rounded-md border border-[#bdc4d3] bg-white px-2.5 py-1.5 text-[11px] font-black text-[#273f7a] transition hover:bg-[#edf2fb]"
              >
                Save
              </button>
            </div>
            <div
              className={`mt-3 rounded-md border px-3 py-2 text-[11px] font-bold leading-tight ${
                reportDatabaseStatus === 'error'
                  ? 'border-[#f3c7c7] bg-[#fff5f5] text-[#9f1d1d]'
                  : reportDatabaseStatus === 'local'
                    ? 'border-[#dfe4ef] bg-white text-[#747b8a]'
                    : 'border-[#cfe6d5] bg-[#f3fbf5] text-[#286239]'
              }`}
            >
              {reportDatabaseStatus === 'saving' ? 'Saving editable report.' : savedReportsMessage || 'Click Save to store editable report changes.'}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
            {savedReports.length > 0 ? (
              <div className="space-y-2">
                {savedReports.map((savedReport) => {
                  const savedReportDisplayName = getSavedReportDisplayName(savedReport)

                  return (
                    <div
                      key={savedReport.id}
                      className={`relative rounded-md border transition ${
                        savedReport.id === currentEditableReportId
                          ? 'border-[#273f7a] bg-[#edf2ff]'
                          : 'border-[#dfe4ef] bg-white hover:bg-[#f4f6fb]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openSavedEditableReport(savedReport)}
                        className="w-full px-3 py-2 pr-10 text-left"
                      >
                        <span className="block whitespace-normal break-words text-[13px] font-black leading-snug text-[#1f2430]">
                          {savedReportDisplayName}
                        </span>
                        <span className="mt-1 block whitespace-normal break-words text-[11px] font-semibold leading-snug text-[#747b8a]">
                          {savedReport.sourceDocumentName}
                        </span>
                        <span className="mt-2 block text-[10px] font-black uppercase text-[#8b91a1]">
                          {new Intl.DateTimeFormat('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          }).format(new Date(savedReport.updatedAt))}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSavedEditableReport(savedReport)}
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md border border-[#e0b8b8] bg-white text-[#a82727] transition hover:border-[#d98b8b] hover:bg-[#fff5f5]"
                        aria-label={`Delete ${savedReportDisplayName}`}
                        title={`Delete ${savedReportDisplayName}`}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-[#cfd6e5] bg-white px-3 py-5 text-center text-[12px] font-bold text-[#747b8a]">
                No saved editable reports yet.
              </div>
            )}
          </div>
        </aside>
    </div>
    {menuSettingsOpen ? (
      <div className="report-toolbar fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 px-4">
        <div className="w-full max-w-[680px] rounded-md border border-[#cfd6e5] bg-white shadow-[0_28px_80px_-36px_rgba(15,23,42,0.75)]">
          <div className="flex items-center justify-between border-b border-[#dfe4ef] px-5 py-4">
            <div>
              <h2 className="text-[20px] font-black text-[#1f2430]">Menu Settings</h2>
              <p className="mt-1 text-[13px] font-semibold text-[#747b8a]">Add a draggable item to one of the menu sections.</p>
            </div>
            <button
              type="button"
              onClick={() => setMenuSettingsOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-[#d8deea] bg-white text-[16px] font-black text-[#4d5360] transition hover:bg-[#f4f6fb]"
              aria-label="Close menu settings"
            >
              x
            </button>
          </div>

          <div className="grid gap-4 px-5 py-5">
            <label className="grid gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[#555b66]">
              Section
              <select
                value={selectedAddableMenuSection}
                onChange={(event) => setNewMenuSection(event.currentTarget.value)}
                className="rounded-md border border-[#cfd6e5] bg-white px-3 py-2 text-[14px] font-bold normal-case text-[#1f2430] outline-none focus:border-[#273f7a]"
              >
                {addableMenuItemSections.map((section) => (
                  <option key={section.title} value={section.title}>
                    {getMenuSectionDisplayTitle(section.title)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[#555b66]">
              Item name
              <input
                value={newMenuLabel}
                onChange={(event) => setNewMenuLabel(event.currentTarget.value)}
                placeholder="Example: Replacement contactor"
                className="rounded-md border border-[#cfd6e5] px-3 py-2 text-[14px] font-bold normal-case text-[#1f2430] outline-none focus:border-[#273f7a]"
              />
            </label>

            <label className="grid gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[#555b66]">
              Description
              <textarea
                value={newMenuDescription}
                onChange={(event) => setNewMenuDescription(event.currentTarget.value)}
                placeholder="Description that will appear in the quote line item"
                className="min-h-[110px] resize-y rounded-md border border-[#cfd6e5] px-3 py-2 text-[14px] font-semibold normal-case text-[#1f2430] outline-none focus:border-[#273f7a]"
              />
            </label>

            <label className="grid max-w-[220px] gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[#555b66]">
              Rate
              <input
                value={newMenuRate}
                onChange={(event) => setNewMenuRate(event.currentTarget.value)}
                inputMode="decimal"
                className="rounded-md border border-[#cfd6e5] px-3 py-2 text-[14px] font-bold normal-case text-[#1f2430] outline-none focus:border-[#273f7a]"
              />
            </label>
          </div>

          <div className="flex items-center justify-between border-t border-[#dfe4ef] bg-[#fbfcff] px-5 py-4">
            <p className="text-[12px] font-semibold text-[#747b8a]">{menuDatabaseMessage}</p>
            <button
              type="button"
              onClick={addMenuItemFromSettings}
              disabled={!newMenuLabel.trim() || !newMenuDescription.trim()}
              className="rounded-md bg-[#273f7a] px-5 py-2.5 text-[13px] font-black text-white transition hover:bg-[#1f3262] disabled:cursor-not-allowed disabled:opacity-45"
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
              <p className="mt-1 text-[13px] font-semibold text-[#747b8a]">
                {getMenuSectionDisplayTitle(editingMenuItem.sectionTitle)}
              </p>
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
              Section
              <select
                value={editingMenuItem.sectionTitle}
                onChange={(event) => {
                  const nextSectionTitle = event.currentTarget.value
                  setEditingMenuItem((currentItem) =>
                    currentItem ? { ...currentItem, sectionTitle: nextSectionTitle } : currentItem,
                  )
                }}
                className="rounded-md border border-[#cfd6e5] bg-white px-3 py-2 text-[14px] font-bold normal-case text-[#1f2430] outline-none focus:border-[#273f7a]"
              >
                {editableMenuItemSections.map((section) => (
                  <option key={section.title} value={section.title}>
                    {getMenuSectionDisplayTitle(section.title)}
                  </option>
                ))}
              </select>
            </label>

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

            <label className="grid max-w-[220px] gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[#555b66]">
              Rate
              <input
                value={editingMenuItem.rate}
                onChange={(event) => {
                  const nextRate = event.currentTarget.value
                  setEditingMenuItem((currentItem) =>
                    currentItem ? { ...currentItem, rate: nextRate } : currentItem,
                  )
                }}
                inputMode="decimal"
                className="rounded-md border border-[#cfd6e5] px-3 py-2 text-[14px] font-bold normal-case text-[#1f2430] outline-none focus:border-[#273f7a]"
              />
            </label>
          </div>

          <div className="flex items-center justify-between border-t border-[#dfe4ef] bg-[#fbfcff] px-5 py-4">
            <p className="text-[12px] font-semibold text-[#747b8a]">{menuDatabaseMessage}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={deleteEditedMenuItem}
                className="rounded-md border border-[#e0b8b8] bg-white px-4 py-2.5 text-[13px] font-black text-[#a82727] transition hover:border-[#d98b8b] hover:bg-[#fff5f5]"
              >
                Delete Item
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
