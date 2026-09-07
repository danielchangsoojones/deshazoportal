import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import ProfileMenu from '../components/ProfileMenu'
import { supabase, isConfigured } from '../lib/supabase'
import {
  createBlankJobQuotingItem,
  createInspectionQuoteItem,
  createJobQuotingItemFromExternalCraneDNumber,
  createJobQuotingItemsFromExternalInspectionReports,
  deleteJobsQuotingItem,
  getJobsQuotingItemResults,
  getJobsQuotingItemsForJobNumbers,
  getJobsQuotingItemsForRuns,
  getJobsQuotingRuns,
  saveJobsQuotingItemResult,
  syncExternalWorkOrdersForQuoting,
  syncJobsQuotingRun,
  uploadExtractOnlyInspectionForQuoting,
  uploadInspectionForQuoting,
  type JobsQuotingItem,
  type JobsQuotingItemResult,
  type JobsQuotingItemResultStatus,
  type JobsQuotingRun,
} from '../lib/jobsQuoting'
import { getCurrentUserTag, getUserDisplayNames } from '../lib/userTags'

const activeStatuses = new Set(['uploading', 'pending', 'processing', 'needs_review'])
const inspectionRunsCollapsedStorageKey = 'deshazo-jobs-quoting-inspection-runs-collapsed'
const currentQuoteJobsStorageKey = 'deshazo-jobs-quoting-current-jobs'
const extractOnlyUploadMaxFilesPerRequest = 25
const extractOnlyUploadMaxBytesPerRequest = 60 * 1024 * 1024
const runGroupWindowMs = 10 * 60 * 1000
const allJobsSectionId = 'all-jobs'
const reportsPerPage = 50
const syncCustomerBatchSize = 10
const syncMaxCustomerBatches = 60
const uploadProcessingNote = 'This can take 5 to 15 minutes to load in the report. Please refresh the page.'

const inspectionQuoteTemplateSections = [
  { id: 'frequent-inspections', title: 'Frequent Inspections' },
  { id: 'periodic-inspections', title: 'Periodic Inspections' },
  { id: 'preventative-maintenance', title: 'Preventative Maintenance' },
  { id: 'below-the-hook', title: 'Below-The-Hook' },
  { id: 'slings-rigging-hardware', title: 'Slings / Rigging / Hardware' },
  { id: 'structural-runway', title: 'Structural Runway Inspections / Surveys' },
  { id: 'load-testing', title: 'Load Testing / Inspection' },
  { id: 'nondestructive-testing', title: 'Nondestructive Testing' },
  { id: 'asset-management-dashboard', title: 'DeSHAZO Dashboard / Asset Management' },
]

type JobsQuotingRunGroup = {
  id: string
  sourceFileName: string
  status: string
  extendWorkflowUrl: string | null
  createdAt: string
  updatedAt: string
  runs: JobsQuotingRun[]
  runIds: string[]
}

type JobsQuotingJobGroup = {
  id: string
  jobNumber: string
  dNumber: string
  items: JobsQuotingItem[]
  repairCount: number
  safetyCount: number
  priorityCount: number
  modifiedAt: string
}

type QuoteJobListScope = 'current' | 'all'

type CurrentQuoteJobsState = {
  jobNumbers: string[]
  itemIds: string[]
}

type ExistingImportedJobModal = {
  jobNumbers: string[]
  items: JobsQuotingItem[]
}

type QuoteLineItem = {
  quantity?: unknown
  customerPrice?: unknown
  rate?: unknown
  margin?: unknown
}

type QuoteCostSection = {
  id?: unknown
  title?: unknown
  lineItems?: unknown
}

type QuoteRepairSection = {
  id?: unknown
  costSections?: unknown
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

function parseMoney(value: unknown) {
  const numericValue = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(numericValue) ? numericValue : 0
}

function getLegacyCustomerUnitPrice(lineItem: QuoteLineItem) {
  return parseMoney(lineItem.rate) * (1 + parseMoney(lineItem.margin) / 100)
}

function getCustomerLineAmount(lineItem: QuoteLineItem) {
  const quantity = parseMoney(lineItem.quantity ?? '1')
  const unitPrice = lineItem.customerPrice == null || lineItem.customerPrice === ''
    ? getLegacyCustomerUnitPrice(lineItem)
    : parseMoney(lineItem.customerPrice)

  return quantity * unitPrice
}

function getCostSectionTotal(section: QuoteCostSection) {
  const lineItems = Array.isArray(section.lineItems) ? section.lineItems : []
  return lineItems.reduce((total, lineItem) => total + getCustomerLineAmount(lineItem as QuoteLineItem), 0)
}

function getSectionKey(section: QuoteCostSection | QuoteRepairSection) {
  if (typeof section.id === 'string' && section.id.trim()) return section.id
  if ('title' in section && typeof section.title === 'string' && section.title.trim()) return section.title
  return ''
}

function isSectionVisible(sectionKey: string, visibility: Record<string, boolean>) {
  return !sectionKey || visibility[sectionKey] !== false
}

function getQuoteTotalAmount(item: JobsQuotingItem) {
  const repairTotal = item.repairSections.reduce<number>((total, repairSection) => {
    const section = repairSection as QuoteRepairSection
    const sectionKey = getSectionKey(section)
    if (!isSectionVisible(sectionKey, item.repairSectionVisibility)) return total

    const costSections = Array.isArray(section.costSections) ? section.costSections : []
    return total + costSections.reduce<number>((sectionTotal, costSection) => sectionTotal + getCostSectionTotal(costSection as QuoteCostSection), 0)
  }, 0)

  const costTotal = item.costSections.reduce<number>((total, costSection) => {
    const section = costSection as QuoteCostSection
    const sectionKey = getSectionKey(section)
    if (!isSectionVisible(sectionKey, item.estimateCostSectionVisibility)) return total

    return total + getCostSectionTotal(section)
  }, 0)

  return Math.round((repairTotal + costTotal) * 100) / 100
}

function getFriendlyErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Job quoting data could not be loaded.'
  const lowerMessage = message.toLowerCase()

  if (lowerMessage === 'load failed' || lowerMessage.includes('failed to fetch')) {
    return 'Upload request could not reach the backend. Try fewer PDFs at once; if it still happens, confirm the extract-only backend route is deployed and the Heroku env vars are set.'
  }

  if (lowerMessage.includes('rate_limit_exceeded') || lowerMessage.includes('status 429')) {
    return 'Extend is rate limiting this upload. Wait a minute and try again, or upload fewer PDFs at once.'
  }

  if (lowerMessage.includes('does not have an extend workflow run id')) {
    return 'This upload did not start an Extend run, likely because Extend rejected the upload before returning a workflow id. Please upload it again.'
  }

  if (
    lowerMessage.includes('schema cache') ||
    lowerMessage.includes('could not find the table') ||
    lowerMessage.includes('relation "public.jobs_quoting_')
  ) {
    return 'Jobs quoting tables are not installed yet. Apply supabase/jobs_quoting.sql to enable saved quote runs.'
  }

  return message
}

function getFriendlyImportErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Job import could not be completed.'
  const lowerMessage = message.toLowerCase()

  if (lowerMessage === 'load failed' || lowerMessage.includes('failed to fetch')) {
    return 'Job import request could not reach the backend. Confirm the external inspection report import route is deployed and reachable.'
  }

  return getFriendlyErrorMessage(error)
}

function getFriendlySyncErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Work order sync could not be completed.'
  const lowerMessage = message.toLowerCase()

  if (lowerMessage === 'load failed' || lowerMessage.includes('failed to fetch')) {
    return 'Sync request could not reach the backend. Confirm the work order sync route is deployed and reachable.'
  }

  return getFriendlyErrorMessage(error)
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural
}

function getImportResultErrorMessage(item: {
  jobNumber?: string | null
  workOrderId?: number | string
  error?: string
}) {
  const label = item.jobNumber || item.workOrderId || 'report'
  const error = item.error || 'Import could not be completed.'
  const lowerError = error.toLowerCase()

  if (lowerError.includes('cannot find a matching job number')) {
    return `Import failed for ${label}. No matching synced inspection reports found.`
  }

  if (lowerError.includes('previously marked as imported') && lowerError.includes('no quote items')) {
    return `Import failed for ${label}. It was marked imported, but no quote items are visible.`
  }

  return `Import failed for ${label}. ${error}`
}

function chunkFilesForUpload(files: File[]) {
  const batches: File[][] = []
  let batch: File[] = []
  let batchBytes = 0

  files.forEach((file) => {
    const shouldStartNextBatch =
      batch.length >= extractOnlyUploadMaxFilesPerRequest ||
      (batch.length > 0 && batchBytes + file.size > extractOnlyUploadMaxBytesPerRequest)

    if (shouldStartNextBatch) {
      batches.push(batch)
      batch = []
      batchBytes = 0
    }

    batch.push(file)
    batchBytes += file.size
  })

  if (batch.length > 0) {
    batches.push(batch)
  }

  return batches
}

function getFileListFolderName(files: File[]) {
  const relativePath = files[0]?.webkitRelativePath || ''
  return relativePath.includes('/') ? relativePath.split('/')[0] : ''
}

function renameRunsForDisplay(runs: JobsQuotingRun[], sourceFileName: string) {
  return runs.map((run) => ({ ...run, sourceFileName }))
}

function getGroupStatus(runs: JobsQuotingRun[]) {
  const statuses = runs.map((run) => run.status)
  if (statuses.some((status) => status === 'failed')) return 'failed'
  if (statuses.some((status) => activeStatuses.has(status))) return statuses.find((status) => activeStatuses.has(status)) ?? 'processing'
  if (statuses.every((status) => status === 'ready')) return 'ready'
  if (statuses.some((status) => status === 'ready')) return 'ready'
  return statuses[0] ?? 'pending'
}

function buildRunGroups(runs: JobsQuotingRun[]): JobsQuotingRunGroup[] {
  const groups: JobsQuotingRunGroup[] = []

  runs.forEach((run) => {
    const runCreatedAt = new Date(run.createdAt).getTime()
    const matchingGroup = groups.find((group) => {
      const groupCreatedAt = new Date(group.createdAt).getTime()
      return group.sourceFileName === run.sourceFileName && Math.abs(groupCreatedAt - runCreatedAt) <= runGroupWindowMs
    })

    if (matchingGroup) {
      matchingGroup.runs.push(run)
      matchingGroup.runIds.push(run.id)
      matchingGroup.status = getGroupStatus(matchingGroup.runs)
      matchingGroup.extendWorkflowUrl = matchingGroup.extendWorkflowUrl || run.extendWorkflowUrl
      if (new Date(run.updatedAt).getTime() > new Date(matchingGroup.updatedAt).getTime()) {
        matchingGroup.updatedAt = run.updatedAt
      }
      return
    }

    groups.push({
      id: run.id,
      sourceFileName: run.sourceFileName,
      status: run.status,
      extendWorkflowUrl: run.extendWorkflowUrl,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      runs: [run],
      runIds: [run.id],
    })
  })

  return groups
}

function getExtractionValue(data: Record<string, unknown>, key: string) {
  const field = data[key]
  if (field && typeof field === 'object' && 'value' in field) {
    const value = (field as { value?: unknown }).value
    return value == null ? '' : String(value)
  }

  return field == null ? '' : String(field)
}

function getFirstExtractionValue(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getExtractionValue(data, key).trim()
    if (value) return value
  }

  return ''
}

function removeReportValueLabel(value: string) {
  return value.includes(':') ? value.split(':').slice(1).join(':').trim() : value.trim()
}

function getMeaningfulReportValue(value: string | undefined) {
  const normalizedValue = removeReportValueLabel(value ?? '')
  if (!normalizedValue || /^[-–—]+$/.test(normalizedValue) || /^n\/?a$/i.test(normalizedValue)) return ''
  return normalizedValue
}

function getItemLocation(item: JobsQuotingItem) {
  return getMeaningfulReportValue(
    item.reportData.location ||
    getFirstExtractionValue(item.extractionData, ['location', 'Location', 'service_location', 'serviceLocation', 'Service Location']),
  )
}

function getItemDescription(item: JobsQuotingItem) {
  return getMeaningfulReportValue(
    item.reportData.description ||
    getFirstExtractionValue(item.extractionData, ['description', 'Description']),
  )
}

function getItemDNumberDisplay(item: JobsQuotingItem) {
  return [
    getItemDNumber(item) || '-',
    getItemLocation(item),
    getItemDescription(item),
  ].filter(Boolean).join(' - ')
}

function getSearchVariants(value: string) {
  const normalizedValue = value.trim().toLowerCase()
  if (!normalizedValue) return []

  const variants = new Set([normalizedValue])
  normalizedValue
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .forEach((token) => {
      variants.add(token)
      if (/^0+\d+$/.test(token)) {
        variants.add(token.replace(/^0+/, '') || '0')
      }
    })

  return Array.from(variants)
}

function getItemSearchText(item: JobsQuotingItem) {
  return [
    ...getSearchVariants(getItemDNumber(item)),
    ...getSearchVariants(getItemLocation(item)),
    ...getSearchVariants(getItemDescription(item)),
    ...getSearchVariants(getItemJobNumber(item)),
  ]
    .join(' ')
}

function normalizeDisplayJobNumber(value: string) {
  const normalizedValue = value.trim()
  if (!normalizedValue || normalizedValue === '---') return ''

  const withoutLabel = normalizedValue.replace(/^job\s*#?\s*:\s*/i, '').trim()
  return withoutLabel === '---' ? '' : withoutLabel
}

function getItemJobNumber(item: JobsQuotingItem) {
  return normalizeDisplayJobNumber(item.jobNumber || getExtractionValue(item.extractionData, 'job_number'))
}

function normalizeJobNumberForMatch(jobNumber: string) {
  return jobNumber.trim().toLowerCase()
}

function getJobNumberMatchKeys(jobNumber: string) {
  const normalizedJobNumber = normalizeJobNumberForMatch(jobNumber)
  if (!normalizedJobNumber) return []

  const keys = new Set([normalizedJobNumber])
  const compactJobNumber = normalizedJobNumber.replace(/[^a-z0-9]+/g, '')
  if (compactJobNumber) {
    keys.add(compactJobNumber)
  }
  if (/^0+\d+$/.test(compactJobNumber)) {
    keys.add(compactJobNumber.replace(/^0+/, '') || '0')
  }

  return Array.from(keys)
}

function getExistingImportedItemsForJobNumbers(jobNumbers: string[], sourceItems: JobsQuotingItem[]) {
  const requestedJobNumberKeys = new Set(jobNumbers.flatMap(getJobNumberMatchKeys))
  if (requestedJobNumberKeys.size === 0) return []

  return sourceItems.filter((item) => {
    const itemJobNumberKeys = getJobNumberMatchKeys(getItemJobNumber(item))
    return itemJobNumberKeys.some((key) => requestedJobNumberKeys.has(key))
  })
}

function getUniqueJobNumbersForItems(items: JobsQuotingItem[], fallbackJobNumbers: string[]) {
  const jobNumbers = items.map(getItemJobNumber).filter(Boolean)
  const uniqueJobNumbers = Array.from(new Set(jobNumbers))
  return uniqueJobNumbers.length > 0 ? uniqueJobNumbers : fallbackJobNumbers
}

function getStoredCurrentQuoteJobs(): CurrentQuoteJobsState {
  try {
    const storedValue = window.localStorage.getItem(currentQuoteJobsStorageKey)
    const parsedValue: unknown = storedValue ? JSON.parse(storedValue) : null
    if (!parsedValue || typeof parsedValue !== 'object') {
      return { jobNumbers: [], itemIds: [] }
    }

    const value = parsedValue as Partial<CurrentQuoteJobsState>
    return {
      jobNumbers: Array.isArray(value.jobNumbers) ? value.jobNumbers.filter((jobNumber): jobNumber is string => typeof jobNumber === 'string') : [],
      itemIds: Array.isArray(value.itemIds) ? value.itemIds.filter((itemId): itemId is string => typeof itemId === 'string') : [],
    }
  } catch {
    return { jobNumbers: [], itemIds: [] }
  }
}

function storeCurrentQuoteJobs(currentJobs: CurrentQuoteJobsState) {
  window.localStorage.setItem(currentQuoteJobsStorageKey, JSON.stringify(currentJobs))
}

function getItemDNumber(item: JobsQuotingItem) {
  return (item.dNumber || getExtractionValue(item.extractionData, 'd_number')).trim()
}

function normalizeDNumberForSort(dNumber: string) {
  return dNumber.trim().toUpperCase().replace(/\s+/g, '')
}

function compareDNumbers(firstDNumber: string, secondDNumber: string) {
  const firstNormalized = normalizeDNumberForSort(firstDNumber)
  const secondNormalized = normalizeDNumberForSort(secondDNumber)
  const firstParts = firstNormalized.match(/^([A-Z]+)(\d+)(.*)$/)
  const secondParts = secondNormalized.match(/^([A-Z]+)(\d+)(.*)$/)

  if (firstParts && secondParts) {
    const prefixComparison = firstParts[1].localeCompare(secondParts[1])
    if (prefixComparison !== 0) return prefixComparison

    const numberComparison = Number(firstParts[2]) - Number(secondParts[2])
    if (numberComparison !== 0) return numberComparison

    return firstParts[3].localeCompare(secondParts[3], undefined, { numeric: true, sensitivity: 'base' })
  }

  return firstNormalized.localeCompare(secondNormalized, undefined, { numeric: true, sensitivity: 'base' })
}

function getItemFileName(item: JobsQuotingItem) {
  return (item.pdfFileName || item.sourceDocumentName || item.documentName).trim()
}

function formatJobTypeTag(jobType: string) {
  const normalizedJobType = jobType
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')

  if (!normalizedJobType) return 'Inspection'

  return normalizedJobType.replace(/\b\w/g, (character) => character.toUpperCase())
}

function getItemJobGroupKey(item: JobsQuotingItem) {
  const jobNumber = getItemJobNumber(item)
  if (jobNumber) return `job:${jobNumber.toLowerCase()}`

  const dNumber = getItemDNumber(item)
  if (dNumber) return `d-number:${dNumber.toLowerCase()}`

  if (item.splitType === 'blank_quote') return `blank:${item.id}`

  return `document:${item.documentName.trim().toLowerCase() || item.id}`
}

function sortItemsByNewest(items: JobsQuotingItem[]) {
  return [...items].sort((firstItem, secondItem) => new Date(secondItem.updatedAt).getTime() - new Date(firstItem.updatedAt).getTime())
}

function sortItemsByPriority(items: JobsQuotingItem[]) {
  return [...items].sort((firstItem, secondItem) => {
    if (secondItem.priorityCount !== firstItem.priorityCount) return secondItem.priorityCount - firstItem.priorityCount
    if (secondItem.repairCount !== firstItem.repairCount) return secondItem.repairCount - firstItem.repairCount
    if (secondItem.safetyCount !== firstItem.safetyCount) return secondItem.safetyCount - firstItem.safetyCount
    return new Date(secondItem.updatedAt).getTime() - new Date(firstItem.updatedAt).getTime()
  })
}

function sortItemsByDNumber(items: JobsQuotingItem[]) {
  return [...items].sort((firstItem, secondItem) => {
    const firstDNumber = getItemDNumber(firstItem)
    const secondDNumber = getItemDNumber(secondItem)

    if (firstDNumber && secondDNumber) return compareDNumbers(firstDNumber, secondDNumber)
    if (firstDNumber !== secondDNumber) return firstDNumber ? -1 : 1

    return new Date(secondItem.updatedAt).getTime() - new Date(firstItem.updatedAt).getTime()
  })
}

function buildJobGroups(items: JobsQuotingItem[]) {
  const groupsByKey = new Map<string, JobsQuotingJobGroup>()

  items.forEach((item) => {
    const groupKey = getItemJobGroupKey(item)
    const itemModifiedAt = item.updatedAt
    const existingGroup = groupsByKey.get(groupKey)

    if (existingGroup) {
      existingGroup.items.push(item)
      existingGroup.repairCount += item.repairCount
      existingGroup.safetyCount += item.safetyCount
      existingGroup.priorityCount += item.priorityCount
      if (new Date(itemModifiedAt).getTime() > new Date(existingGroup.modifiedAt).getTime()) {
        existingGroup.modifiedAt = itemModifiedAt
      }
      if (!existingGroup.jobNumber) {
        existingGroup.jobNumber = getItemJobNumber(item)
      }
      if (!existingGroup.dNumber) {
        existingGroup.dNumber = getItemDNumber(item)
      }
      return
    }

    groupsByKey.set(groupKey, {
      id: groupKey,
      jobNumber: getItemJobNumber(item),
      dNumber: getItemDNumber(item),
      items: [item],
      repairCount: item.repairCount,
      safetyCount: item.safetyCount,
      priorityCount: item.priorityCount,
      modifiedAt: itemModifiedAt,
    })
  })

  return Array.from(groupsByKey.values()).map((group) => ({
    ...group,
    items: sortItemsByDNumber(group.items),
  }))
}

export default function JobsQuotingList() {
  const [storedCurrentQuoteJobs] = useState(getStoredCurrentQuoteJobs)
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [runs, setRuns] = useState<JobsQuotingRun[]>([])
  const [items, setItems] = useState<JobsQuotingItem[]>([])
  const [itemResults, setItemResults] = useState<Record<string, JobsQuotingItemResult>>({})
  const [userDisplayNames, setUserDisplayNames] = useState<Record<string, string>>({})
  const [currentUserTag, setCurrentUserTag] = useState('')
  const [itemsLoading, setItemsLoading] = useState(false)
  const [selectedJobSectionId, setSelectedJobSectionId] = useState<string>(allJobsSectionId)
  const [quoteJobListScope, setQuoteJobListScope] = useState<QuoteJobListScope>('current')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false)
  const [createDNumberModalOpen, setCreateDNumberModalOpen] = useState(false)
  const [inspectionQuoteModalOpen, setInspectionQuoteModalOpen] = useState(false)
  const [inspectionQuoteSelectedSectionIds, setInspectionQuoteSelectedSectionIds] = useState<string[]>(['periodic-inspections'])
  const [existingImportedJobModal, setExistingImportedJobModal] = useState<ExistingImportedJobModal | null>(null)
  const [openItemSettingsId, setOpenItemSettingsId] = useState<string | null>(null)
  const [openJobSettingsId, setOpenJobSettingsId] = useState<string | null>(null)
  const [deletingItemIds, setDeletingItemIds] = useState<Set<string>>(() => new Set())
  const [externalJobNumberInput, setExternalJobNumberInput] = useState('')
  const [externalJobImporting, setExternalJobImporting] = useState(false)
  const [externalWorkOrdersSyncing, setExternalWorkOrdersSyncing] = useState(false)
  const [createDNumberInput, setCreateDNumberInput] = useState('')
  const [createDNumberSubmitting, setCreateDNumberSubmitting] = useState(false)
  const [createBlankSubmitting, setCreateBlankSubmitting] = useState(false)
  const [createInspectionQuoteSubmitting, setCreateInspectionQuoteSubmitting] = useState(false)
  const [markResultItemId, setMarkResultItemId] = useState<string | null>(null)
  const [markResultJobItemIds, setMarkResultJobItemIds] = useState<string[]>([])
  const [markResultJobLabel, setMarkResultJobLabel] = useState('')
  const [markResultStatus, setMarkResultStatus] = useState<JobsQuotingItemResultStatus>('pending')
  const [markResultAmountWon, setMarkResultAmountWon] = useState('')
  const [markResultSubmitting, setMarkResultSubmitting] = useState(false)
  const [pinnedImportedJobNumbers, setPinnedImportedJobNumbers] = useState<string[]>([])
  const [currentQuoteJobNumbers, setCurrentQuoteJobNumbers] = useState<string[]>(storedCurrentQuoteJobs.jobNumbers)
  const [currentQuoteItemIds, setCurrentQuoteItemIds] = useState<string[]>(storedCurrentQuoteJobs.itemIds)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [inspectionRunsCollapsed, setInspectionRunsCollapsed] = useState(
    () => window.localStorage.getItem(inspectionRunsCollapsedStorageKey) !== 'false',
  )
  const extractPdfInputRef = useRef<HTMLInputElement>(null)
  const splitFolderInputRef = useRef<HTMLInputElement>(null)
  const giantPdfInputRef = useRef<HTMLInputElement>(null)
  const blankQuoteCreateInFlight = useRef(false)
  const navigate = useNavigate()

  const runsById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs])
  const jobSectionGroups = useMemo(
    () => buildJobGroups(items).sort((firstGroup, secondGroup) => new Date(secondGroup.modifiedAt).getTime() - new Date(firstGroup.modifiedAt).getTime()),
    [items],
  )
  const selectedJobSection = jobSectionGroups.find((group) => group.id === selectedJobSectionId)
  const getItemUploaderName = useCallback(
    (item: JobsQuotingItem) => {
      const uploaderUserId = item.uploadedByUserId || runsById.get(item.runId)?.userId
      return uploaderUserId ? userDisplayNames[uploaderUserId] || '' : 'Shared'
    },
    [runsById, userDisplayNames],
  )
  const currentQuoteJobNumberKeys = useMemo(
    () => new Set(currentQuoteJobNumbers.flatMap(getJobNumberMatchKeys)),
    [currentQuoteJobNumbers],
  )
  const currentQuoteItemIdSet = useMemo(() => new Set(currentQuoteItemIds), [currentQuoteItemIds])
  const currentQuoteItems = useMemo(() => {
    if (currentQuoteItemIdSet.size === 0 && currentQuoteJobNumberKeys.size === 0) return []

    return items.filter((item) => {
      if (currentQuoteItemIdSet.has(item.id)) return true
      const itemJobNumberKeys = getJobNumberMatchKeys(getItemJobNumber(item))
      return itemJobNumberKeys.some((key) => currentQuoteJobNumberKeys.has(key))
    })
  }, [currentQuoteItemIdSet, currentQuoteJobNumberKeys, items])
  const visibleItems = useMemo(() => {
    if (selectedJobSectionId === allJobsSectionId || !selectedJobSection) {
      return sortItemsByNewest(quoteJobListScope === 'current' ? currentQuoteItems : items)
    }

    return sortItemsByPriority(selectedJobSection.items)
  }, [currentQuoteItems, items, quoteJobListScope, selectedJobSection, selectedJobSectionId])
  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) return visibleItems
    const queryVariants = getSearchVariants(normalizedQuery)
    return visibleItems.filter((item) => {
      const itemSearchText = getItemSearchText(item)
      return queryVariants.some((queryVariant) => itemSearchText.includes(queryVariant))
    })
  }, [searchQuery, visibleItems])
  const jobGroups = useMemo(() => buildJobGroups(filteredItems), [filteredItems])
  const sortedJobGroups = useMemo(() => {
    const pinnedJobNumbers = new Set(pinnedImportedJobNumbers.flatMap(getJobNumberMatchKeys))
    const comparePinnedGroups = (firstGroup: JobsQuotingJobGroup, secondGroup: JobsQuotingJobGroup) => {
      const firstGroupPinned = firstGroup.jobNumber ? getJobNumberMatchKeys(firstGroup.jobNumber).some((key) => pinnedJobNumbers.has(key)) : false
      const secondGroupPinned = secondGroup.jobNumber ? getJobNumberMatchKeys(secondGroup.jobNumber).some((key) => pinnedJobNumbers.has(key)) : false

      if (firstGroupPinned !== secondGroupPinned) {
        return firstGroupPinned ? -1 : 1
      }

      return null
    }

    if (selectedJobSectionId === allJobsSectionId) {
      return [...jobGroups].sort((firstGroup, secondGroup) => {
        const pinnedComparison = comparePinnedGroups(firstGroup, secondGroup)
        if (pinnedComparison !== null) return pinnedComparison
        return new Date(secondGroup.modifiedAt).getTime() - new Date(firstGroup.modifiedAt).getTime()
      })
    }

    return [...jobGroups].sort((firstGroup, secondGroup) => {
      const pinnedComparison = comparePinnedGroups(firstGroup, secondGroup)
      if (pinnedComparison !== null) return pinnedComparison
      if (secondGroup.priorityCount !== firstGroup.priorityCount) return secondGroup.priorityCount - firstGroup.priorityCount
      if (secondGroup.repairCount !== firstGroup.repairCount) return secondGroup.repairCount - firstGroup.repairCount
      if (secondGroup.safetyCount !== firstGroup.safetyCount) return secondGroup.safetyCount - firstGroup.safetyCount
      return new Date(secondGroup.modifiedAt).getTime() - new Date(firstGroup.modifiedAt).getTime()
    })
  }, [jobGroups, pinnedImportedJobNumbers, selectedJobSectionId])
  const pageCount = Math.max(1, Math.ceil(sortedJobGroups.length / reportsPerPage))
  const safeCurrentPage = Math.min(currentPage, pageCount)
  const pageStartIndex = (safeCurrentPage - 1) * reportsPerPage
  const paginatedJobGroups = sortedJobGroups.slice(pageStartIndex, pageStartIndex + reportsPerPage)
  const pageFirstJob = sortedJobGroups.length === 0 ? 0 : pageStartIndex + 1
  const pageLastJob = Math.min(pageStartIndex + paginatedJobGroups.length, sortedJobGroups.length)
  const markResultItem = markResultItemId ? items.find((item) => item.id === markResultItemId) ?? null : null
  const markResultJobItems = markResultJobItemIds
    .map((itemId) => items.find((item) => item.id === itemId) ?? null)
    .filter((item): item is JobsQuotingItem => Boolean(item))
  const markResultTargetItems = markResultItem ? [markResultItem] : markResultJobItems
  const markResultTargetLabel = markResultItem
    ? getItemDNumber(markResultItem) || getItemFileName(markResultItem)
    : markResultJobLabel
  const markResultQuoteTotal = markResultTargetItems.reduce((total, item) => total + getQuoteTotalAmount(item), 0)
  const canSyncExternalWorkOrders = ['dev', 'developer'].includes(currentUserTag.trim().toLowerCase())

  const showQuoteJobScope = (scope: QuoteJobListScope) => {
    setQuoteJobListScope(scope)
    setSelectedJobSectionId(allJobsSectionId)
  }

  const updateQuoteSearchQuery = (nextSearchQuery: string) => {
    setSearchQuery(nextSearchQuery)
    if (nextSearchQuery.trim()) {
      showQuoteJobScope('all')
      setCurrentPage(1)
    }
  }

  const setCurrentQuoteJobsFromItems = (nextItems: JobsQuotingItem[]) => {
    const nextCurrentJobs = {
      itemIds: nextItems.map((item) => item.id),
      jobNumbers: nextItems.map(getItemJobNumber).filter(Boolean),
    }
    storeCurrentQuoteJobs(nextCurrentJobs)
    setCurrentQuoteItemIds(nextCurrentJobs.itemIds)
    setCurrentQuoteJobNumbers(nextCurrentJobs.jobNumbers)
    showQuoteJobScope('current')
  }

  const setCurrentQuoteJobsFromJobNumbers = (jobNumbers: string[]) => {
    const nextCurrentJobs = {
      itemIds: [],
      jobNumbers: jobNumbers.filter((jobNumber) => jobNumber.trim()),
    }
    storeCurrentQuoteJobs(nextCurrentJobs)
    setCurrentQuoteItemIds(nextCurrentJobs.itemIds)
    setCurrentQuoteJobNumbers(nextCurrentJobs.jobNumbers)
    showQuoteJobScope('current')
  }

  const setCurrentQuoteJobsFromItemIds = (itemIds: string[], jobNumbers: string[] = []) => {
    const nextCurrentJobs = {
      itemIds: itemIds.filter((itemId) => itemId.trim()),
      jobNumbers: jobNumbers.filter((jobNumber) => jobNumber.trim()),
    }
    storeCurrentQuoteJobs(nextCurrentJobs)
    setCurrentQuoteItemIds(nextCurrentJobs.itemIds)
    setCurrentQuoteJobNumbers(nextCurrentJobs.jobNumbers)
    showQuoteJobScope('current')
  }

  const showExistingImportedJob = (existingJob: ExistingImportedJobModal) => {
    const jobNumbers = getUniqueJobNumbersForItems(existingJob.items, existingJob.jobNumbers)
    setPinnedImportedJobNumbers(jobNumbers)
    setCurrentQuoteJobsFromItemIds(existingJob.items.map((item) => item.id), jobNumbers)
    setSearchQuery('')
    setCurrentPage(1)
    setExistingImportedJobModal(null)
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [quoteJobListScope, searchQuery, selectedJobSectionId])

  useEffect(() => {
    if (searchQuery.trim()) {
      setPinnedImportedJobNumbers([])
    }
  }, [searchQuery])

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount))
  }, [pageCount])

  useEffect(() => {
    if (!isConfigured || !supabase) {
      navigate('/quotelogin')
      return
    }

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate('/quotelogin')
      } else {
        setUser(data.user)
      }
      setAuthLoading(false)
    })
  }, [navigate])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/quotelogin')
  }

  const loadQuotingData = useCallback(async (sectionId?: string) => {
    setLoading(true)
    setItemsLoading(true)
    setMessage('')

    try {
      const nextRuns = await getJobsQuotingRuns()
      const nextRunGroups = buildRunGroups(nextRuns)
      const nextRunIds = nextRunGroups.flatMap((group) => group.runIds)
      const nextItems = nextRunIds.length > 0 ? await getJobsQuotingItemsForRuns(nextRunIds) : []
      const nextItemResults = nextItems.length > 0 ? await getJobsQuotingItemResults(nextItems.map((item) => item.id)) : []
      const nextJobSections = buildJobGroups(nextItems)
      const nextSelectedSectionId =
        sectionId && (sectionId === allJobsSectionId || nextJobSections.some((group) => group.id === sectionId))
          ? sectionId
          : allJobsSectionId

      setRuns(nextRuns)
      setSelectedJobSectionId(nextSelectedSectionId)
      setItems(nextItems)
      setItemResults(Object.fromEntries(nextItemResults.map((result) => [result.jobQuoteItemId, result])))
    } catch (error) {
      setMessage(getFriendlyErrorMessage(error))
    } finally {
      setLoading(false)
      setItemsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) {
      loadQuotingData()
    }
  }, [loadQuotingData, user])

  useEffect(() => {
    if (!user) {
      setCurrentUserTag('')
      return
    }

    let cancelled = false
    getCurrentUserTag(user.id)
      .then((tag) => {
        if (!cancelled) setCurrentUserTag(String(tag || ''))
      })
      .catch(() => {
        if (!cancelled) setCurrentUserTag('')
      })

    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    const userIds = [
      ...runs.map((run) => run.userId).filter((userId): userId is string => Boolean(userId)),
      ...items.map((item) => item.uploadedByUserId).filter((userId): userId is string => Boolean(userId)),
    ]

    if (userIds.length === 0) {
      setUserDisplayNames({})
      return
    }

    let cancelled = false
    getUserDisplayNames(userIds)
      .then((displayNames) => {
        if (!cancelled) setUserDisplayNames(displayNames)
      })
      .catch(() => {
        if (!cancelled) setUserDisplayNames({})
      })

    return () => {
      cancelled = true
    }
  }, [items, runs])

  useEffect(() => {
    const activeRuns = runs.filter((run) => activeStatuses.has(run.status))
    if (!user || activeRuns.length === 0 || busy) return

    let syncing = false
    let cancelled = false

    const refreshInterval = window.setInterval(async () => {
      if (syncing) return
      syncing = true

      try {
        const results = await Promise.allSettled(activeRuns.map((run) => syncJobsQuotingRun(run.id)))
        if (cancelled) return

        const syncedResults = results
          .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof syncJobsQuotingRun>>> => result.status === 'fulfilled')
          .map((result) => result.value)
        const failedResult = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')

        if (syncedResults.length > 0) {
          const syncedRunsById = new Map(syncedResults.map((result) => [result.run.id, result.run]))
          const nextRuns = runs.map((run) => syncedRunsById.get(run.id) ?? run)
          setRuns(nextRuns)

          const nextRunIds = buildRunGroups(nextRuns).flatMap((group) => group.runIds)
          const nextItems = nextRunIds.length > 0 ? await getJobsQuotingItemsForRuns(nextRunIds) : []
          const nextItemResults = nextItems.length > 0 ? await getJobsQuotingItemResults(nextItems.map((item) => item.id)) : []
          setItems(nextItems)
          setItemResults(Object.fromEntries(nextItemResults.map((result) => [result.jobQuoteItemId, result])))
        }

        if (failedResult) {
          setMessage(getFriendlyErrorMessage(failedResult.reason))
        }
      } catch (error) {
        if (cancelled) return
        setMessage(getFriendlyErrorMessage(error))
      } finally {
        syncing = false
      }
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(refreshInterval)
    }
  }, [busy, runs, user])

  const mergeUploadedRuns = (uploadedRuns: JobsQuotingRun[]) => {
    const uploadedRunIds = new Set(uploadedRuns.map((run) => run.id))
    setRuns((currentRuns) => [
      ...uploadedRuns,
      ...currentRuns.filter((run) => !uploadedRunIds.has(run.id)),
    ])
  }

  const deleteQuoteItem = async (item: JobsQuotingItem) => {
    const itemLabel = getItemDNumber(item) ? `D-number ${getItemDNumber(item)}` : getItemFileName(item) || 'this quote item'
    const confirmed = window.confirm(`Delete ${itemLabel}? This will remove only this quote item from the jobs quoting list.`)
    if (!confirmed) return

    setDeletingItemIds((currentIds) => new Set(currentIds).add(item.id))
    setOpenItemSettingsId(null)
    setMessage(`Deleting ${itemLabel}.`)

    try {
      await deleteJobsQuotingItem(item.id)
      setItems((currentItems) => currentItems.filter((currentItem) => currentItem.id !== item.id))
      setItemResults((currentResults) => {
        const nextResults = { ...currentResults }
        delete nextResults[item.id]
        return nextResults
      })
      setMessage(`Deleted ${itemLabel}.`)
    } catch (error) {
      setMessage(getFriendlyErrorMessage(error))
    } finally {
      setDeletingItemIds((currentIds) => {
        const nextIds = new Set(currentIds)
        nextIds.delete(item.id)
        return nextIds
      })
    }
  }

  const deleteQuoteJob = async (jobGroup: JobsQuotingJobGroup) => {
    const jobLabel = jobGroup.jobNumber ? `job ${jobGroup.jobNumber}` : 'this job'
    const confirmed = window.confirm(`Delete ${jobLabel}? This will delete all ${jobGroup.items.length} quote proposal${jobGroup.items.length === 1 ? '' : 's'} in this job.`)
    if (!confirmed) return

    const itemIds = jobGroup.items.map((item) => item.id)
    setDeletingItemIds((currentIds) => {
      const nextIds = new Set(currentIds)
      itemIds.forEach((itemId) => nextIds.add(itemId))
      return nextIds
    })
    setOpenJobSettingsId(null)
    setMessage(`Deleting ${jobLabel}.`)

    try {
      await Promise.all(jobGroup.items.map((item) => deleteJobsQuotingItem(item.id)))
      setItems((currentItems) => currentItems.filter((currentItem) => !itemIds.includes(currentItem.id)))
      setItemResults((currentResults) => {
        const nextResults = { ...currentResults }
        itemIds.forEach((itemId) => {
          delete nextResults[itemId]
        })
        return nextResults
      })
      setMessage(`Deleted ${jobLabel}.`)
    } catch (error) {
      setMessage(getFriendlyErrorMessage(error))
    } finally {
      setDeletingItemIds((currentIds) => {
        const nextIds = new Set(currentIds)
        itemIds.forEach((itemId) => nextIds.delete(itemId))
        return nextIds
      })
    }
  }

  const applyUploadResult = (result: Awaited<ReturnType<typeof uploadInspectionForQuoting>>) => {
    const uploadedRuns = result.runs && result.runs.length > 0 ? result.runs : [result.run]
    mergeUploadedRuns(uploadedRuns)
    setCurrentQuoteJobsFromItems(result.items)
    setItems((currentItems) => sortItemsByNewest([...result.items, ...currentItems.filter((item) => !result.items.some((nextItem) => nextItem.id === item.id))]))
    setMessage(`${result.message ?? 'Inspection report sent to Extend.'} ${uploadProcessingNote}`)
  }

  const uploadGiantPdf = async (fileList: FileList | null) => {
    const file = Array.from(fileList ?? []).find((currentFile) => currentFile.name.toLowerCase().endsWith('.pdf'))
    if (!file) {
      setMessage('Choose a PDF inspection report to upload.')
      return
    }

    setBusy(true)
    setUploadMenuOpen(false)
    setMessage(`Sending ${file.name} to Extend for splitting.`)

    try {
      const result = await uploadInspectionForQuoting(file)
      applyUploadResult(result)
    } catch (error) {
      setMessage(getFriendlyErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const uploadFolderThroughSplitter = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []).filter((currentFile) => currentFile.name.toLowerCase().endsWith('.pdf'))
    if (files.length === 0) {
      setMessage('Choose at least one PDF inspection report to upload.')
      return
    }

    const folderName = getFileListFolderName(files) || `${files.length} inspection reports`
    setBusy(true)
    setUploadMenuOpen(false)
    setMessage(`Sending ${folderName} through the split workflow.`)

    try {
      let firstResult: Awaited<ReturnType<typeof uploadInspectionForQuoting>> | null = null
      const uploadedItems: JobsQuotingItem[] = []

      for (const [fileIndex, file] of files.entries()) {
        setMessage(`Sending PDF ${fileIndex + 1} of ${files.length} through the split workflow.`)
        const result = await uploadInspectionForQuoting(file, folderName)
        const uploadedRuns = renameRunsForDisplay(result.runs && result.runs.length > 0 ? result.runs : [result.run], folderName)
        mergeUploadedRuns(uploadedRuns)
        uploadedItems.push(...result.items)

        if (!firstResult) {
          firstResult = result
          setItems((currentItems) => sortItemsByNewest([...result.items, ...currentItems.filter((item) => !result.items.some((nextItem) => nextItem.id === item.id))]))
        }
      }

      setCurrentQuoteJobsFromItems(uploadedItems)
      setMessage(`${files.length} PDFs from ${folderName} sent through the split workflow. ${uploadProcessingNote}`)
    } catch (error) {
      setMessage(getFriendlyErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const uploadExtractOnlyPdfs = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []).filter((currentFile) => currentFile.name.toLowerCase().endsWith('.pdf'))
    if (files.length === 0) {
      setMessage('Choose at least one PDF inspection report to upload.')
      return
    }

    setBusy(true)
    setUploadMenuOpen(false)
    const folderName = getFileListFolderName(files)
    const sourceFileName = folderName || undefined
    const batches = chunkFilesForUpload(files)
    setMessage(
      files.length === 1
        ? `Sending ${files[0].name} to Extend for extraction.`
        : `Uploading ${files.length} PDFs in ${batches.length} batches.`,
    )

    try {
      let firstResult: Awaited<ReturnType<typeof uploadExtractOnlyInspectionForQuoting>> | null = null
      const uploadedItems: JobsQuotingItem[] = []
      for (const [batchIndex, batch] of batches.entries()) {
        setMessage(`Uploading batch ${batchIndex + 1} of ${batches.length} (${batch.length} PDF${batch.length === 1 ? '' : 's'}).`)
        const result = await uploadExtractOnlyInspectionForQuoting(batch, sourceFileName)
        const uploadedRuns = sourceFileName
          ? renameRunsForDisplay(result.runs && result.runs.length > 0 ? result.runs : [result.run], sourceFileName)
          : result.runs && result.runs.length > 0
            ? result.runs
            : [result.run]
        mergeUploadedRuns(uploadedRuns)
        uploadedItems.push(...result.items)

        if (!firstResult) {
          firstResult = result
          setItems((currentItems) => sortItemsByNewest([...result.items, ...currentItems.filter((item) => !result.items.some((nextItem) => nextItem.id === item.id))]))
        }
      }

      setCurrentQuoteJobsFromItems(uploadedItems)

      if (firstResult) {
        setMessage(
          batches.length === 1
            ? firstResult.message ?? 'Inspection report sent to Extend.'
            : `${files.length} PDFs uploaded in ${batches.length} batches. Runs will refresh as Extend finishes.`,
        )
      }
    } catch (error) {
      setMessage(getFriendlyErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const importExternalInspectionReportsForJob = async () => {
    const jobNumbers = externalJobNumberInput
      .split(/[\s,]+/)
      .map((jobNumber) => jobNumber.trim())
      .filter(Boolean)

    if (jobNumbers.length === 0) {
      setMessage('Enter a job number to import from synced Deshazo inspection reports.')
      return
    }

    setBusy(true)
    setExternalJobImporting(true)
    setUploadMenuOpen(false)
    setMessage(`Checking for a matching quote job for ${jobNumbers.join(', ')}.`)

    try {
      const loadedExistingItems = getExistingImportedItemsForJobNumbers(jobNumbers, items)
      const existingItems = loadedExistingItems.length > 0
        ? loadedExistingItems
        : await getJobsQuotingItemsForJobNumbers(jobNumbers)

      if (existingItems.length > 0) {
        const existingJobNumbers = getUniqueJobNumbersForItems(existingItems, jobNumbers)
        setMessage(`Found matching job ${existingJobNumbers.join(', ')}.`)
        setExistingImportedJobModal({ jobNumbers: existingJobNumbers, items: existingItems })
        setPinnedImportedJobNumbers(existingJobNumbers)
        setCurrentQuoteJobsFromItemIds(existingItems.map((item) => item.id), existingJobNumbers)
        setSearchQuery('')
        setCurrentPage(1)
        await loadQuotingData(allJobsSectionId)
        setMessage('If you need a fresh copy of the job reports, please delete the existing copy and import again.')
        return
      }

      setMessage(`Importing quote items for ${jobNumbers.join(', ')} from synced inspection reports.`)
      const result = await createJobQuotingItemsFromExternalInspectionReports(jobNumbers)
      const createdCount = result.results.reduce((total, item) => total + (item.createdOrUpdated ?? 0), 0)
      const existingCount = result.results.reduce((total, item) => total + (item.existingQuoteItems?.length ?? 0), 0)
      const visibleQuoteItemCount = createdCount + existingCount
      const sourceReportCount = result.results.reduce((total, item) => total + (item.sourceReportCount ?? 0), 0)
      const quoteableReportCount = result.results.reduce((total, item) => total + (item.quoteableReportCount ?? 0), 0)
      const skippedNoQuoteItemsCount = result.results.reduce((total, item) => total + (item.skippedNoQuoteItemsCount ?? 0), 0)
      const importedJobNumbers = result.results
        .filter((item) => (item.createdOrUpdated ?? 0) > 0 || (item.existingQuoteItems?.length ?? 0) > 0)
        .map((item) => item.jobNumber || '')
        .filter(Boolean)
      const importErrors = result.results
        .filter((item) => item.error)
        .map(getImportResultErrorMessage)
      const importWarnings = result.results
        .filter((item) => item.warning)
        .map((item) => item.warning || '')
        .filter(Boolean)
      const refreshedIncompleteCount = result.results.filter((item) => item.refreshedIncompleteReport).length
      const refreshedIncompleteNote =
        refreshedIncompleteCount > 0
          ? ` Refreshed stale synced inspection data for ${refreshedIncompleteCount} job${refreshedIncompleteCount === 1 ? '' : 's'} before importing.`
          : ''
      const quoteFilterNote =
        sourceReportCount > 0
          ? ` ${quoteableReportCount} of ${sourceReportCount} ${pluralize(sourceReportCount, 'report')} had repair/safety findings.${skippedNoQuoteItemsCount > 0 ? ` ${skippedNoQuoteItemsCount} skipped.` : ''}`
          : ''
      const warningNote = importWarnings.length > 0 ? ` ${importWarnings.join(' ')}` : ''
      const noQuoteItemsMessage =
        sourceReportCount > 0 && quoteableReportCount === 0
          ? `No quote items for ${jobNumbers.join(', ')}. The synced reports have no repair/safety findings.`
          : `No quote items for ${jobNumbers.join(', ')}. Only reports with repair/safety findings appear here.`
      const finalImportMessage =
        importErrors.length > 0
          ? importErrors.join(' ')
          : createdCount > 0
          ? `Imported ${createdCount} quote ${pluralize(createdCount, 'item')} for ${jobNumbers.join(', ')}.`
          : existingCount > 0
          ? `${existingCount} existing quote ${pluralize(existingCount, 'item')} for ${jobNumbers.join(', ')} moved to top.`
          : `${noQuoteItemsMessage}${sourceReportCount > 0 && quoteableReportCount > 0 ? quoteFilterNote : ''}${warningNote}${refreshedIncompleteNote}`

      if (createdCount > 0 || existingCount > 0) {
        setMessage(`Imported ${visibleQuoteItemCount} quote ${pluralize(visibleQuoteItemCount, 'item')}. Refreshing jobs...`)
        if (createdCount > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 3000))
        }
        setPinnedImportedJobNumbers(importedJobNumbers.length > 0 ? importedJobNumbers : jobNumbers)
        setCurrentQuoteJobsFromJobNumbers(importedJobNumbers.length > 0 ? importedJobNumbers : jobNumbers)
        setSearchQuery('')
        setCurrentPage(1)
        await loadQuotingData(allJobsSectionId)
      }

      setExternalJobNumberInput('')
      setMessage(finalImportMessage)
    } catch (error) {
      setMessage(getFriendlyImportErrorMessage(error))
    } finally {
      setExternalJobImporting(false)
      setBusy(false)
    }
  }

  const openCreateDNumberModal = () => {
    setUploadMenuOpen(false)
    setCreateDNumberModalOpen(true)
    setMessage('')
  }

  const syncExternalWorkOrders = async () => {
    setBusy(true)
    setExternalWorkOrdersSyncing(true)
    setUploadMenuOpen(false)
    setMessage('Syncing current work orders for all customers...')

    try {
      let workOrdersSeen = 0
      let reportsSeen = 0
      let customersProcessed = 0
      let partialSync = false
      const failures: unknown[] = []

      for (let batch = 1; batch <= syncMaxCustomerBatches; batch += 1) {
        const customerOffset = (batch - 1) * syncCustomerBatchSize
        setMessage(`Syncing current work orders... batch ${batch}, ${customersProcessed} customers checked.`)
        const result = await syncExternalWorkOrdersForQuoting({
          incremental: true,
          pageSize: 25,
          page: 1,
          maxCustomers: syncCustomerBatchSize,
          customerOffset,
          maxRunMillis: 22000,
        })

        customersProcessed += result.customersProcessed ?? 0
        workOrdersSeen += result.workOrdersSeen ?? 0
        reportsSeen += result.reportsSeen ?? 0
        failures.push(...(result.failures ?? []))

        if (result.partial) {
          partialSync = true
          break
        }

        if ((result.customersProcessed ?? 0) < syncCustomerBatchSize) {
          break
        }
      }

      await loadQuotingData(allJobsSectionId)
      const failureCount = failures.length
      const warning = failureCount > 0 ? ` ${failureCount} sync ${pluralize(failureCount, 'issue')} found.` : ''
      const status = partialSync ? 'Sync paused before timeout' : 'Sync complete'
      const nextStep = partialSync ? ' Click sync again to continue.' : ''
      setMessage(`${status}. ${customersProcessed} customers checked; ${workOrdersSeen} work ${pluralize(workOrdersSeen, 'order')} and ${reportsSeen} ${pluralize(reportsSeen, 'report')} processed.${warning}${nextStep}`)
    } catch (error) {
      setMessage(getFriendlySyncErrorMessage(error))
    } finally {
      setExternalWorkOrdersSyncing(false)
      setBusy(false)
    }
  }

  const closeCreateDNumberModal = () => {
    if (createDNumberSubmitting) return
    setCreateDNumberModalOpen(false)
    setCreateDNumberInput('')
  }

  const createQuoteItemFromDNumber = async () => {
    const normalizedDNumber = createDNumberInput.trim().toUpperCase().replace(/\s+/g, '')
    if (!/^D[0-9]{6}$/.test(normalizedDNumber)) {
      setMessage('Enter a D number in the format D123456.')
      return
    }

    setBusy(true)
    setCreateDNumberSubmitting(true)
    setMessage(`Creating quote report for ${normalizedDNumber}.`)

    try {
      const result = await createJobQuotingItemFromExternalCraneDNumber(normalizedDNumber)
      setCurrentQuoteJobsFromItemIds([result.itemId], result.jobNumber ? [result.jobNumber] : [])
      setCreateDNumberModalOpen(false)
      setCreateDNumberInput('')
      navigate(`/editable-inspection-report?jobsQuotingItemId=${encodeURIComponent(result.itemId)}`)
    } catch (error) {
      setMessage(getFriendlyImportErrorMessage(error))
    } finally {
      setCreateDNumberSubmitting(false)
      setBusy(false)
    }
  }

  const createBlankQuoteItem = async () => {
    if (blankQuoteCreateInFlight.current) return
    blankQuoteCreateInFlight.current = true
    setBusy(true)
    setCreateBlankSubmitting(true)
    setUploadMenuOpen(false)
    setMessage('Creating blank quote report.')

    try {
      const result = await createBlankJobQuotingItem()
      setCurrentQuoteJobsFromItemIds([result.itemId])
      navigate(`/editable-inspection-report?jobsQuotingItemId=${encodeURIComponent(result.itemId)}`)
    } catch (error) {
      setMessage(getFriendlyImportErrorMessage(error))
    } finally {
      blankQuoteCreateInFlight.current = false
      setCreateBlankSubmitting(false)
      setBusy(false)
    }
  }

  const openInspectionQuoteModal = () => {
    setUploadMenuOpen(false)
    setInspectionQuoteModalOpen(true)
    setMessage('')
  }

  const toggleInspectionQuoteSection = (sectionId: string, checked: boolean) => {
    setInspectionQuoteSelectedSectionIds((currentIds) => {
      if (checked) return currentIds.includes(sectionId) ? currentIds : [...currentIds, sectionId]
      return currentIds.filter((currentId) => currentId !== sectionId)
    })
  }

  const createInspectionQuote = async () => {
    if (inspectionQuoteSelectedSectionIds.length === 0) {
      setMessage('Choose at least one inspection quote section.')
      return
    }

    setBusy(true)
    setCreateInspectionQuoteSubmitting(true)
    setMessage('Creating inspection quote report.')

    try {
      const result = await createInspectionQuoteItem(inspectionQuoteSelectedSectionIds)
      setCurrentQuoteJobsFromItemIds([result.itemId])
      setInspectionQuoteModalOpen(false)
      navigate(`/editable-inspection-report?jobsQuotingItemId=${encodeURIComponent(result.itemId)}`)
    } catch (error) {
      setMessage(getFriendlyImportErrorMessage(error))
    } finally {
      setCreateInspectionQuoteSubmitting(false)
      setBusy(false)
    }
  }

  const openMarkResultModal = (item: JobsQuotingItem) => {
    const existingResult = itemResults[item.id]
    const quoteTotalAmount = getQuoteTotalAmount(item)
    setOpenItemSettingsId(null)
    setOpenJobSettingsId(null)
    setMarkResultItemId(item.id)
    setMarkResultJobItemIds([])
    setMarkResultJobLabel('')
    setMarkResultStatus(existingResult?.winStatus ?? 'pending')
    setMarkResultAmountWon(
      existingResult?.amountWon != null
        ? String(existingResult.amountWon)
        : existingResult?.winStatus === 'won'
          ? String(quoteTotalAmount)
          : '',
    )
    setMessage('')
  }

  const openMarkJobResultModal = (jobGroup: JobsQuotingJobGroup) => {
    const itemIds = jobGroup.items.map((item) => item.id)
    const existingResults = itemIds.map((itemId) => itemResults[itemId]).filter(Boolean)
    const firstStatus = existingResults[0]?.winStatus
    const sharedStatus = firstStatus && existingResults.every((result) => result.winStatus === firstStatus)
      ? firstStatus
      : 'pending'
    const jobQuoteTotal = jobGroup.items.reduce((total, item) => total + getQuoteTotalAmount(item), 0)
    const existingAmountWon = existingResults.reduce((total, result) => total + (result.amountWon ?? 0), 0)

    setOpenItemSettingsId(null)
    setOpenJobSettingsId(null)
    setMarkResultItemId(null)
    setMarkResultJobItemIds(itemIds)
    setMarkResultJobLabel(jobGroup.jobNumber ? `Job ${jobGroup.jobNumber}` : 'Job number not found')
    setMarkResultStatus(sharedStatus)
    setMarkResultAmountWon(existingAmountWon > 0 ? String(existingAmountWon) : sharedStatus === 'won' ? String(jobQuoteTotal) : '')
    setMessage('')
  }

  const closeMarkResultModal = () => {
    if (markResultSubmitting) return
    setMarkResultItemId(null)
    setMarkResultJobItemIds([])
    setMarkResultJobLabel('')
    setMarkResultStatus('pending')
    setMarkResultAmountWon('')
  }

  const saveMarkResult = async () => {
    if (markResultTargetItems.length === 0) return

    const normalizedAmountWon = markResultStatus === 'won' ? parseMoney(markResultAmountWon) : null
    if (markResultStatus === 'won' && (!normalizedAmountWon || normalizedAmountWon <= 0)) {
      setMessage('Enter an amount won greater than $0.')
      return
    }

    setMarkResultSubmitting(true)
    setMessage(`Saving result for ${markResultTargetLabel}.`)

    try {
      const savedResults = await Promise.all(markResultTargetItems.map((item) => {
        const itemQuoteTotal = getQuoteTotalAmount(item)
        const itemAmountWon = normalizedAmountWon == null
          ? null
          : markResultTargetItems.length === 1 || markResultQuoteTotal <= 0
            ? normalizedAmountWon
            : normalizedAmountWon * (itemQuoteTotal / markResultQuoteTotal)

        return saveJobsQuotingItemResult({
          jobQuoteItemId: item.id,
          quoteTotalAmount: itemQuoteTotal,
          winStatus: markResultStatus,
          amountWon: itemAmountWon,
        })
      }))
      setItemResults((currentResults) => ({
        ...currentResults,
        ...Object.fromEntries(savedResults.map((result) => [result.jobQuoteItemId, result])),
      }))
      setMarkResultItemId(null)
      setMarkResultJobItemIds([])
      setMarkResultJobLabel('')
      setMarkResultStatus('pending')
      setMarkResultAmountWon('')
      setMessage(`Marked ${markResultTargetLabel} result as ${markResultStatus}.`)
    } catch (error) {
      setMessage(getFriendlyErrorMessage(error))
    } finally {
      setMarkResultSubmitting(false)
    }
  }

  const toggleInspectionRunsCollapsed = () => {
    setInspectionRunsCollapsed((currentCollapsed) => {
      const nextCollapsed = !currentCollapsed
      window.localStorage.setItem(inspectionRunsCollapsedStorageKey, String(nextCollapsed))
      return nextCollapsed
    })
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#edf1f7] px-4">
        <div className="rounded-md border border-[#d3dbea] bg-white px-6 py-4 text-sm font-black text-[var(--deshazo-blue)] shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
          Loading jobs quoting...
        </div>
      </div>
    )
  }

  if (!user) return null

  const jobsListLoading = loading || itemsLoading
  const totalRepairItems = filteredItems.reduce((total, item) => total + item.repairCount, 0)
  const totalSafetyItems = filteredItems.reduce((total, item) => total + item.safetyCount, 0)

  return (
    <div className="min-h-screen bg-[#edf1f7] text-[var(--deshazo-text)]">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-[var(--deshazo-blue)] px-4 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/deshazo-internal-dashboard')}
            className="rounded-md border border-white/30 bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-normal text-white transition hover:bg-white/20"
            aria-label="Home"
          >
            Home
          </button>
        </div>

        <div className="text-sm font-black tracking-wide">DESHAZO Quote Builder</div>

        <div className="relative flex items-center gap-2">
          <form
            className="hidden items-center gap-2 md:flex"
            onSubmit={(event) => {
              event.preventDefault()
              importExternalInspectionReportsForJob()
            }}
          >
            {canSyncExternalWorkOrders ? (
              <button
                type="button"
                onClick={syncExternalWorkOrders}
                disabled={busy}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/30 bg-white/10 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Sync latest work orders"
                title="Sync latest work orders"
              >
                <svg
                  className={`h-5 w-5 ${externalWorkOrdersSyncing ? 'animate-spin' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 7.5a8.2 8.2 0 0 0-14.4-1.9A8 8 0 0 0 4 8.1" />
                  <path d="M4 4v4.1h4.1" />
                  <path d="M4 16.5a8.2 8.2 0 0 0 14.4 1.9A8 8 0 0 0 20 15.9" />
                  <path d="M20 20v-4.1h-4.1" />
                </svg>
              </button>
            ) : null}
            <label className="sr-only" htmlFor="external-job-number-import">
              Job number
            </label>
            <input
              id="external-job-number-import"
              type="text"
              value={externalJobNumberInput}
              onChange={(event) => setExternalJobNumberInput(event.currentTarget.value)}
              disabled={busy}
              placeholder="Job #"
              className="h-9 w-[132px] rounded-md border border-white/30 bg-white/95 px-3 text-xs font-black text-[var(--deshazo-text)] outline-none transition placeholder:text-[#7a808e] focus:border-white focus:ring-2 focus:ring-white/30 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !externalJobNumberInput.trim()}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-white/30 bg-white px-3 text-xs font-black text-[var(--deshazo-blue)] transition hover:bg-[#e6efff] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {externalJobImporting ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#c8d5f2] border-t-[var(--deshazo-blue)]" />
              ) : null}
              <span>{externalJobImporting ? 'Importing' : 'Import Job'}</span>
            </button>
          </form>
          <input
            ref={extractPdfInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => {
              uploadExtractOnlyPdfs(event.currentTarget.files)
              event.currentTarget.value = ''
            }}
          />
          <input
            ref={splitFolderInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            {...{ webkitdirectory: '', directory: '' }}
            onChange={(event) => {
              uploadFolderThroughSplitter(event.currentTarget.files)
              event.currentTarget.value = ''
            }}
          />
          <input
            ref={giantPdfInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => {
              uploadGiantPdf(event.currentTarget.files)
              event.currentTarget.value = ''
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => setUploadMenuOpen((currentOpen) => !currentOpen)}
            className="rounded-md bg-white px-4 py-2 text-sm font-black text-[var(--deshazo-blue)] transition hover:bg-[#e6efff] disabled:cursor-not-allowed disabled:opacity-60"
            aria-expanded={uploadMenuOpen}
          >
            Create New
          </button>
          <ProfileMenu user={user} onSignOut={handleSignOut} tone="light" />
          {uploadMenuOpen ? (
            <div className="absolute right-0 top-[calc(100%+14px)] z-50 w-[340px] rounded-md border border-[#d3dbea] bg-white p-2 text-[var(--deshazo-text)] shadow-[0_24px_70px_-34px_rgba(15,23,42,0.55)]">
              <form
                className="mb-2 rounded-md border border-[#d3dbea] bg-[#f8fbff] p-2 md:hidden"
                onSubmit={(event) => {
                  event.preventDefault()
                  importExternalInspectionReportsForJob()
                }}
              >
                <div className="text-[12px] font-black uppercase text-[var(--deshazo-blue)]">Import Synced Job</div>
                <div className="mt-2 flex gap-2">
                  <label className="sr-only" htmlFor="external-job-number-import-mobile">
                    Job number
                  </label>
                  <input
                    id="external-job-number-import-mobile"
                    type="text"
                    value={externalJobNumberInput}
                    onChange={(event) => setExternalJobNumberInput(event.currentTarget.value)}
                    disabled={busy}
                    placeholder="Job number"
                    className="min-w-0 flex-1 rounded-md border border-[#c7d1e2] bg-white px-3 py-2 text-[12px] font-bold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]"
                  />
                  <button
                    type="submit"
                    disabled={busy || !externalJobNumberInput.trim()}
                    className="inline-flex items-center gap-2 rounded-md bg-[var(--deshazo-blue)] px-3 py-2 text-[12px] font-black text-white transition hover:bg-[var(--deshazo-blue-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {externalJobImporting ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : null}
                    Import
                  </button>
                </div>
              </form>
              <div className="rounded-md border border-[#d3dbea] bg-[#f8fbff] p-2">
                <div className="text-[12px] font-black uppercase text-[var(--deshazo-blue)]">Create New</div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={createBlankQuoteItem}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {createBlankSubmitting ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#c8d5f2] border-t-[var(--deshazo-blue)]" />
                    ) : null}
                    <span>Create Blank</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={openCreateDNumberModal}
                    className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Create with D Number
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={openInspectionQuoteModal}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {createInspectionQuoteSubmitting ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#c8d5f2] border-t-[var(--deshazo-blue)]" />
                    ) : null}
                    <span>Inspection Quote</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => extractPdfInputRef.current?.click()}
                    className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Upload PDF
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => splitFolderInputRef.current?.click()}
                    className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Choose Folder
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => giantPdfInputRef.current?.click()}
                    className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Giant PDF
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {existingImportedJobModal ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#111827]/45 px-4">
          <div className="w-full max-w-[430px] rounded-md border border-[#d3dbea] bg-white p-5 text-[var(--deshazo-text)] shadow-[0_28px_90px_-38px_rgba(15,23,42,0.7)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[18px] font-black leading-tight text-[var(--deshazo-text)]">Job Already Imported</h2>
                <p className="mt-1 text-[13px] font-semibold leading-5 text-[#5b606b]">
                  You have already imported job {existingImportedJobModal.jobNumbers.join(', ')} here.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExistingImportedJobModal(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#c7d1e2] bg-white text-[18px] font-black leading-none text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb]"
                aria-label="Close already imported job"
              >
                ×
              </button>
            </div>

            <div className="mt-5 rounded-md border border-[#d3dbea] bg-[#f8fbff] px-3 py-3">
              <p className="text-[13px] font-bold leading-5 text-[#4d5360]">
                The existing quote work was left unchanged. Use the existing job instead of importing it again.
              </p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExistingImportedJobModal(null)}
                className="rounded-md border border-[#bdc4d3] bg-white px-4 py-2 text-[13px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => showExistingImportedJob(existingImportedJobModal)}
                className="rounded-md bg-[var(--deshazo-blue)] px-4 py-2 text-[13px] font-black text-white transition hover:bg-[var(--deshazo-blue-deep)]"
              >
                Let me see it
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {inspectionQuoteModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#111827]/45 px-4">
          <div className="w-full max-w-[560px] rounded-md border border-[#d3dbea] bg-white p-5 text-[var(--deshazo-text)] shadow-[0_28px_90px_-38px_rgba(15,23,42,0.7)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[18px] font-black leading-tight text-[var(--deshazo-text)]">Inspection Quote</h2>
                <p className="mt-1 text-[13px] font-semibold leading-5 text-[#5b606b]">
                  Choose the inspection sections to include in the scope of work.
                </p>
              </div>
              <button
                type="button"
                disabled={createInspectionQuoteSubmitting}
                onClick={() => setInspectionQuoteModalOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#c7d1e2] bg-white text-[18px] font-black leading-none text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close inspection quote"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {inspectionQuoteTemplateSections.map((section) => (
                <label
                  key={section.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-[#c7d1e2] bg-white px-3 py-3 text-[13px] font-black text-[var(--deshazo-text)] transition hover:bg-[#eef4ff]"
                >
                  <input
                    type="checkbox"
                    checked={inspectionQuoteSelectedSectionIds.includes(section.id)}
                    onChange={(event) => toggleInspectionQuoteSection(section.id, event.currentTarget.checked)}
                    disabled={createInspectionQuoteSubmitting}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--deshazo-blue)]"
                  />
                  <span className="leading-5">{section.title}</span>
                </label>
              ))}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={createInspectionQuoteSubmitting}
                onClick={() => setInspectionQuoteModalOpen(false)}
                className="rounded-md border border-[#bdc4d3] bg-white px-4 py-2 text-[13px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={createInspectionQuoteSubmitting || inspectionQuoteSelectedSectionIds.length === 0}
                onClick={createInspectionQuote}
                className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-md bg-[var(--deshazo-blue)] px-4 py-2 text-[13px] font-black text-white transition hover:bg-[var(--deshazo-blue-deep)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {createInspectionQuoteSubmitting ? (
                  <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : null}
                Create Quote
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createDNumberModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#111827]/45 px-4">
          <div className="w-full max-w-[420px] rounded-md border border-[#d3dbea] bg-white p-5 text-[var(--deshazo-text)] shadow-[0_28px_90px_-38px_rgba(15,23,42,0.7)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[18px] font-black leading-tight text-[var(--deshazo-text)]">Create with D Number</h2>
                <p className="mt-1 text-[13px] font-semibold leading-5 text-[#5b606b]">
                  Create a blank quote report with header details from Shazo external crane data.
                </p>
              </div>
              <button
                type="button"
                disabled={createDNumberSubmitting}
                onClick={closeCreateDNumberModal}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#c7d1e2] bg-white text-[18px] font-black leading-none text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close create with D number"
              >
                ×
              </button>
            </div>

            <form
              className="mt-5"
              onSubmit={(event) => {
                event.preventDefault()
                createQuoteItemFromDNumber()
              }}
            >
              <label className="text-[12px] font-black uppercase text-[var(--deshazo-blue)]" htmlFor="create-d-number-input">
                D Number
              </label>
              <input
                id="create-d-number-input"
                type="text"
                value={createDNumberInput}
                onChange={(event) => setCreateDNumberInput(event.currentTarget.value.toUpperCase())}
                disabled={createDNumberSubmitting}
                placeholder="D123456"
                autoFocus
                className="mt-2 h-11 w-full rounded-md border border-[#c7d1e2] bg-white px-3 text-[14px] font-black text-[var(--deshazo-text)] outline-none transition placeholder:text-[#7a808e] focus:border-[var(--deshazo-blue)] focus:ring-2 focus:ring-[rgba(6,24,73,0.16)] disabled:cursor-not-allowed disabled:opacity-60"
              />
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={createDNumberSubmitting}
                  onClick={closeCreateDNumberModal}
                  className="rounded-md border border-[#bdc4d3] bg-white px-4 py-2 text-[13px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createDNumberSubmitting || !createDNumberInput.trim()}
                  className="inline-flex min-w-[112px] items-center justify-center gap-2 rounded-md bg-[var(--deshazo-blue)] px-4 py-2 text-[13px] font-black text-white transition hover:bg-[var(--deshazo-blue-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createDNumberSubmitting ? (
                    <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : null}
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {markResultTargetItems.length > 0 ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#111827]/45 px-4">
          <div className="w-full max-w-[460px] rounded-md border border-[#d3dbea] bg-white p-5 text-[var(--deshazo-text)] shadow-[0_28px_90px_-38px_rgba(15,23,42,0.7)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-[18px] font-black leading-tight text-[var(--deshazo-text)]">Mark Result</h2>
                <p className="mt-1 truncate text-[13px] font-semibold leading-5 text-[#5b606b]">
                  {markResultTargetLabel}
                  {markResultJobItemIds.length > 0 ? ` • ${markResultJobItemIds.length} quote proposals` : ''}
                </p>
              </div>
              <button
                type="button"
                disabled={markResultSubmitting}
                onClick={closeMarkResultModal}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#c7d1e2] bg-white text-[18px] font-black leading-none text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close mark result"
              >
                ×
              </button>
            </div>

            <div className="mt-5 rounded-md border border-[#d3dbea] bg-[#f8fbff] px-3 py-3">
              <div className="flex items-center justify-between gap-3 text-[13px] font-bold text-[#4d5360]">
                <span>Quote Total Amount</span>
                <span className="text-[16px] font-black text-[var(--deshazo-blue)]">{formatMoney(markResultQuoteTotal)}</span>
              </div>
            </div>

            <form
              className="mt-5"
              onSubmit={(event) => {
                event.preventDefault()
                saveMarkResult()
              }}
            >
              <fieldset disabled={markResultSubmitting} className="space-y-3">
                <legend className="text-[12px] font-black uppercase text-[var(--deshazo-blue)]">Win Status</legend>
                <label className="flex cursor-pointer items-center gap-3 rounded-md border border-[#c7d1e2] bg-white px-3 py-3 text-[13px] font-black text-[var(--deshazo-text)] transition hover:bg-[#eef4ff]">
                  <input
                    type="checkbox"
                    checked={markResultStatus === 'won'}
                    onChange={(event) => setMarkResultStatus(event.currentTarget.checked ? 'won' : 'pending')}
                    className="h-4 w-4 accent-[var(--deshazo-blue)]"
                  />
                  Won
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-md border border-[#c7d1e2] bg-white px-3 py-3 text-[13px] font-black text-[var(--deshazo-text)] transition hover:bg-[#eef4ff]">
                  <input
                    type="checkbox"
                    checked={markResultStatus === 'lost'}
                    onChange={(event) => setMarkResultStatus(event.currentTarget.checked ? 'lost' : 'pending')}
                    className="h-4 w-4 accent-[#a2472f]"
                  />
                  Lost
                </label>
              </fieldset>

              <label className="mt-5 block text-[12px] font-black uppercase text-[var(--deshazo-blue)]" htmlFor="mark-result-amount-won">
                Amount Won
              </label>
              <input
                id="mark-result-amount-won"
                type="text"
                inputMode="decimal"
                value={markResultAmountWon}
                onChange={(event) => setMarkResultAmountWon(event.currentTarget.value)}
                disabled={markResultSubmitting || markResultStatus !== 'won'}
                placeholder={formatMoney(markResultQuoteTotal)}
                className="mt-2 h-11 w-full rounded-md border border-[#c7d1e2] bg-white px-3 text-[14px] font-black text-[var(--deshazo-text)] outline-none transition placeholder:text-[#7a808e] focus:border-[var(--deshazo-blue)] focus:ring-2 focus:ring-[rgba(6,24,73,0.16)] disabled:cursor-not-allowed disabled:bg-[#f4f7fb] disabled:opacity-70"
              />

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={markResultSubmitting}
                  onClick={closeMarkResultModal}
                  className="rounded-md border border-[#bdc4d3] bg-white px-4 py-2 text-[13px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={markResultSubmitting}
                  className="inline-flex min-w-[92px] items-center justify-center gap-2 rounded-md bg-[var(--deshazo-blue)] px-4 py-2 text-[13px] font-black text-white transition hover:bg-[var(--deshazo-blue-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {markResultSubmitting ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : null}
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <main className="flex h-[calc(100vh-56px)] overflow-hidden bg-[#f4f7fb]">
        <aside
          className={`relative hidden shrink-0 flex-col border-r border-[#d3dbea] bg-[#f8fbff] shadow-sm transition-[width] duration-200 lg:flex ${
            inspectionRunsCollapsed ? 'w-[42px]' : 'w-[300px]'
          }`}
        >
          {inspectionRunsCollapsed ? (
            <button
              type="button"
              onClick={toggleInspectionRunsCollapsed}
              className="flex h-full w-full items-center justify-center bg-white text-[var(--deshazo-blue)] transition hover:bg-[#eef4ff]"
              aria-label="Open job sections"
              title="Open job sections"
            >
              <span className="[writing-mode:vertical-rl] rotate-180 text-[12px] font-black uppercase tracking-[0.12em]">
                Job Sections
              </span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleInspectionRunsCollapsed}
                className="absolute right-[-15px] top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[#c8d5ea] bg-white text-[17px] font-black text-[var(--deshazo-blue)] shadow-sm transition hover:bg-[#eef4ff]"
                aria-label="Hide job sections"
                title="Hide job sections"
              >
                ‹
              </button>
              <div className="border-b border-[#d3dbea] px-4 py-5">
                <p className="text-[16px] font-black text-[var(--deshazo-text)]">Job Sections</p>
                <p className="mt-1 text-[12px] font-semibold leading-tight text-[#747b8a]">
                  Select all jobs or one job section.
                </p>
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => loadQuotingData(selectedJobSectionId)}
                  className="mt-4 flex w-full items-center justify-center rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reload Jobs
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setSelectedJobSectionId(allJobsSectionId)}
                    className={`w-full rounded-md border px-3 py-3 text-left shadow-[0_8px_20px_-18px_rgba(31,36,48,0.45)] transition ${
                      selectedJobSectionId === allJobsSectionId
                        ? 'border-[#8aa3d8] bg-[#eef4ff]'
                        : 'border-[#d3dbea] bg-white hover:border-[#8aa3d8] hover:bg-[#eef4ff]'
                    }`}
                  >
                    <span className="block text-[13px] font-black leading-tight text-[var(--deshazo-blue)]">
                      All Jobs
                    </span>
                    <span className="mt-2 flex items-center justify-between gap-2 text-[12px] font-bold text-[#747b8a]">
                      <span>Recently changed first</span>
                      <span className="rounded-sm bg-[#e6efff] px-2 py-1 text-[10px] font-black uppercase text-[var(--deshazo-blue)]">
                        {jobSectionGroups.length}
                      </span>
                    </span>
                  </button>

                  {jobSectionGroups.map((jobSection) => (
                    <button
                      key={jobSection.id}
                      type="button"
                      onClick={() => setSelectedJobSectionId(jobSection.id)}
                      className={`w-full rounded-md border px-3 py-3 text-left shadow-[0_8px_20px_-18px_rgba(31,36,48,0.45)] transition ${
                        selectedJobSectionId === jobSection.id
                          ? 'border-[#8aa3d8] bg-[#eef4ff]'
                          : 'border-[#d3dbea] bg-white hover:border-[#8aa3d8] hover:bg-[#eef4ff]'
                      }`}
                    >
                      <span className="block truncate text-[13px] font-black leading-tight text-[var(--deshazo-blue)]">
                        {jobSection.jobNumber ? `Job ${jobSection.jobNumber}` : 'Job number not found'}
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-2 text-[12px] font-bold text-[#747b8a]">
                        <span>
                          {jobSection.items.length} report{jobSection.items.length === 1 ? '' : 's'}
                          {jobSection.dNumber ? ` • ${jobSection.dNumber}` : ''}
                        </span>
                        <span className="rounded-sm bg-[#e6efff] px-2 py-1 text-[10px] font-black uppercase text-[var(--deshazo-blue)]">
                          {jobSection.repairCount + jobSection.safetyCount}
                        </span>
                      </span>
                    </button>
                  ))}

                  {!loading && jobSectionGroups.length === 0 ? (
                    <div className="rounded-md border border-dashed border-[#c7d1e2] bg-white px-3 py-8 text-center text-[12px] font-bold text-[#747b8a]">
                      No quote jobs yet.
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </aside>

        <section className="min-w-0 flex-1 overflow-auto px-5 py-5 sm:px-8">
          <div className="mb-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-[clamp(24px,2.4vw,34px)] font-black leading-tight tracking-normal text-[var(--deshazo-text)]">
                Jobs Quoting List
              </h1>
              <p className="mt-2 max-w-[72ch] text-[15px] font-semibold leading-6 text-[#5b606b]">
                Upload a full Deshazo inspection reports, then edit only the reports that contain repair or safety items.
              </p>
            </div>

            <div className="grid min-w-[280px] grid-cols-2 overflow-hidden rounded-md border border-[#d3dbea] bg-white shadow-[0_16px_44px_-36px_rgba(15,23,42,0.55)]">
              <div className="border-r border-[#d3dbea] px-4 py-3">
                <p className="text-[11px] font-black uppercase text-[#747b8a]">Repairs</p>
                <p className="mt-1 text-2xl font-black text-[var(--deshazo-blue)]">{jobsListLoading ? '...' : totalRepairItems}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] font-black uppercase text-[#747b8a]">Safety</p>
                <p className="mt-1 text-2xl font-black text-[#a2472f]">{jobsListLoading ? '...' : totalSafetyItems}</p>
              </div>
            </div>
          </div>

          {message ? (
            <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-[#c8d5ea] bg-[#eef4ff] px-4 py-3 text-[13px] font-bold text-[var(--deshazo-blue)]">
              <span className="min-w-0 leading-5">{message}</span>
              <button
                type="button"
                onClick={() => setMessage('')}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#c8d5ea] bg-white/70 text-[16px] font-black leading-none text-[var(--deshazo-blue)] transition hover:bg-white"
                aria-label="Close message"
                title="Close message"
              >
                ×
              </button>
            </div>
          ) : null}

          <div className="lg:hidden">
            <section className="mb-4 rounded-md border border-[#d3dbea] bg-[#f8fbff] p-3 shadow-[0_16px_44px_-36px_rgba(15,23,42,0.45)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-black text-[var(--deshazo-text)]">Job Sections</h2>
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => loadQuotingData(selectedJobSectionId)}
                  className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:opacity-60"
                >
                  Reload
                </button>
              </div>
              <select
                value={selectedJobSectionId}
                onChange={(event) => setSelectedJobSectionId(event.currentTarget.value)}
                className="w-full rounded-md border border-[#c7d1e2] bg-white px-3 py-2 text-[13px] font-bold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]"
              >
                <option value={allJobsSectionId}>All Jobs - Recently changed first</option>
                {jobSectionGroups.map((jobSection) => (
                  <option key={jobSection.id} value={jobSection.id}>
                    {jobSection.jobNumber ? `Job ${jobSection.jobNumber}` : 'Job number not found'} - {jobSection.items.length} report{jobSection.items.length === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </section>
          </div>

          <section className="min-w-0 overflow-hidden rounded-md border border-[#d3dbea] bg-white shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
              <div className="flex flex-col justify-between gap-3 border-b border-[#d3dbea] bg-[#f8fbff] px-5 py-4 lg:flex-row lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <h2 className="text-[20px] font-black tracking-normal text-[var(--deshazo-text)]">
                      {selectedJobSectionId === allJobsSectionId
                        ? quoteJobListScope === 'current'
                          ? 'Current Quote Jobs'
                          : 'All Quote Jobs'
                        : selectedJobSection?.jobNumber
                          ? `Job ${selectedJobSection.jobNumber}`
                          : 'Job number not found'}
                    </h2>
                    <div className="inline-grid w-fit grid-cols-2 overflow-hidden rounded-md border border-[#c7d1e2] bg-white p-0.5 shadow-[0_10px_28px_-24px_rgba(15,23,42,0.5)]">
                      {(['current', 'all'] as const).map((scope) => (
                        <button
                          key={scope}
                          type="button"
                          onClick={() => showQuoteJobScope(scope)}
                          className={`min-w-[82px] rounded-[4px] px-3 py-1.5 text-[12px] font-black capitalize transition ${
                            quoteJobListScope === scope && selectedJobSectionId === allJobsSectionId
                              ? 'bg-[var(--deshazo-blue)] text-white shadow-sm'
                              : 'text-[var(--deshazo-blue)] hover:bg-[#e8eefb]'
                          }`}
                          aria-pressed={quoteJobListScope === scope && selectedJobSectionId === allJobsSectionId}
                        >
                          {scope}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="mt-1 text-[13px] font-semibold text-[#747b8a]">
                    {selectedJobSectionId === allJobsSectionId
                      ? quoteJobListScope === 'current'
                        ? 'Only the job or upload you most recently imported in this session.'
                        : 'All quote jobs, sorted by newest changed first.'
                      : 'Showing quote reports from the selected job section.'}
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:min-w-[360px]">
                  <label className="sr-only" htmlFor="quote-report-search">
                    Search quote reports
                  </label>
                  <div className="relative">
                    <input
                      id="quote-report-search"
                      type="text"
                      value={searchQuery}
                      onChange={(event) => updateQuoteSearchQuery(event.currentTarget.value)}
                      placeholder="Search D-number or job number..."
                      className="w-full rounded-md border border-[#c7d1e2] bg-white py-2 pl-3 pr-10 text-[13px] font-bold text-[var(--deshazo-text)] outline-none transition placeholder:text-[#8b91a1] focus:border-[var(--deshazo-blue)] focus:ring-2 focus:ring-[#dbe5ff]"
                    />
                    {searchQuery ? (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[16px] font-black leading-none text-[#747b8a] transition hover:bg-[#e8eefb] hover:text-[var(--deshazo-blue)]"
                        aria-label="Clear quote search"
                        title="Clear search"
                      >
                        ×
                      </button>
                    ) : (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b91a1]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>

              <div className="overflow-x-hidden">
                <table className="w-full table-fixed border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#d3dbea] bg-[#eef2f8] text-[11px] font-black uppercase text-[#747b8a]">
                      <th className="w-[28%] px-3 py-3">D-number</th>
                      <th className="w-[14%] px-3 py-3">Job Type</th>
                      <th className="w-[11%] px-2 py-3 text-center">Date Modified</th>
                      <th className="w-[10%] px-2 py-3 text-center">Uploaded By</th>
                      <th className="w-[7%] px-1 py-3 text-center">Repairs</th>
                      <th className="w-[7%] px-1 py-3 text-center">Safety</th>
                      <th className="w-[7%] px-1 py-3 text-center">Total</th>
                      <th className="w-[16%] px-3 py-3 text-center">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobsListLoading ? (
                      <tr>
                        <td colSpan={8} className="px-5 py-16">
                          <div className="mx-auto flex max-w-xs flex-col items-center justify-center text-center">
                            <div className="h-9 w-9 animate-spin rounded-full border-4 border-[#d3dbea] border-t-[var(--deshazo-blue)]" />
                            <p className="mt-4 text-sm font-black text-[var(--deshazo-text)]">Loading quote jobs...</p>
                            <p className="mt-1 text-xs font-semibold text-[#747b8a]">
                              Preparing the selected report list.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : paginatedJobGroups.map((jobGroup) => (
                      <Fragment key={jobGroup.id}>
                        <tr className="border-y border-[#d3dbea] bg-[#f7f9fd]">
                          <td className="px-3 py-3 align-middle" colSpan={4}>
                            <div className="min-w-0">
                              <p className="text-[15px] font-black leading-tight text-[var(--deshazo-text)]">
                                {jobGroup.jobNumber ? `Job ${jobGroup.jobNumber}` : 'Job number not found'}
                              </p>
                              <p className="mt-1 text-[12px] font-bold text-[#747b8a]">
                                {jobGroup.items.length} inspection report{jobGroup.items.length === 1 ? '' : 's'}
                                {jobGroup.dNumber ? ` • D-number ${jobGroup.dNumber}` : ''}
                              </p>
                            </div>
                          </td>
                          <td className="px-1 py-3 text-center align-middle text-lg font-black text-[var(--deshazo-blue)]">
                            {jobGroup.repairCount}
                          </td>
                          <td className="px-1 py-3 text-center align-middle text-lg font-black text-[#a2472f]">
                            {jobGroup.safetyCount}
                          </td>
                          <td className="px-1 py-3 text-center align-middle text-lg font-black text-[var(--deshazo-text)]">
                            {jobGroup.priorityCount}
                          </td>
                          <td className="px-3 py-3 text-center align-middle text-[12px] font-bold text-[#4d5360]">
                            <div className="flex flex-col items-center gap-2">
                              <div className="inline-flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const params = new URLSearchParams()
                                    params.set('jobsQuotingItemId', jobGroup.items[0].id)
                                    params.set('jobItemIds', jobGroup.items.map((item) => item.id).join(','))
                                    if (jobGroup.jobNumber) params.set('jobNumber', jobGroup.jobNumber)
                                    navigate(`/editable-inspection-report?${params.toString()}`)
                                  }}
                                  className="inline-flex whitespace-nowrap rounded-md bg-[var(--deshazo-blue)] px-3 py-2 text-[11px] font-black text-white transition hover:bg-[var(--deshazo-blue-deep)]"
                                >
                                  Edit Job
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setOpenJobSettingsId((currentId) => currentId === jobGroup.id ? null : jobGroup.id)}
                                  disabled={jobGroup.items.some((item) => deletingItemIds.has(item.id))}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#bdc4d3] bg-white text-[15px] font-black leading-none text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-60"
                                  aria-label="Job settings"
                                  title="Job settings"
                                >
                                  ⚙
                                </button>
                              </div>
                              {openJobSettingsId === jobGroup.id ? (
                                <div className="w-[150px] rounded-md border border-[#d3dbea] bg-white p-2 text-left shadow-[0_14px_34px_-28px_rgba(15,23,42,0.5)]">
                                  <button
                                    type="button"
                                    onClick={() => openMarkJobResultModal(jobGroup)}
                                    disabled={jobGroup.items.some((item) => deletingItemIds.has(item.id))}
                                    className="mb-2 w-full rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-left text-[12px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Mark Result
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteQuoteJob(jobGroup)}
                                    disabled={jobGroup.items.some((item) => deletingItemIds.has(item.id))}
                                    className="w-full rounded-md border border-[#f0c4bd] bg-[#fff7f5] px-3 py-2 text-left text-[12px] font-black text-[#a2472f] transition hover:bg-[#ffece8] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {jobGroup.items.some((item) => deletingItemIds.has(item.id)) ? 'Deleting...' : 'Delete Job'}
                                  </button>
                                </div>
                              ) : null}
                              <span>Modified {formatDate(jobGroup.modifiedAt)}</span>
                            </div>
                          </td>
                        </tr>
                        {jobGroup.items.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b border-[#e2e8f2] transition hover:bg-[#f8fbff] last:border-b-0"
                          >
                            <td className="px-3 py-4 align-top">
                              <span className="block whitespace-normal break-words text-sm font-black leading-snug text-[var(--deshazo-text)]">
                                {getItemDNumberDisplay(item)}
                              </span>
                            </td>
                            <td className="px-3 py-4 align-top">
                              <span className="inline-flex max-w-full items-center rounded-sm border border-[#c8d5ea] bg-[#e6efff] px-2.5 py-1 text-[12px] font-black leading-snug text-[var(--deshazo-blue)]">
                                <span className="truncate">{formatJobTypeTag(item.jobType)}</span>
                              </span>
                            </td>
                            <td className="px-2 py-4 text-center align-top text-xs font-bold leading-snug text-[#4d5360]">
                              {formatDate(item.updatedAt)}
                            </td>
                            <td className="px-2 py-4 text-center align-top text-sm font-bold text-[#4d5360]">
                              <span className="block truncate" title={getItemUploaderName(item)}>
                                {getItemUploaderName(item) || '-'}
                              </span>
                            </td>
                            <td className="px-1 py-4 text-center align-top text-lg font-black text-[var(--deshazo-blue)]">
                              {item.repairCount}
                            </td>
                            <td className="px-1 py-4 text-center align-top text-lg font-black text-[#a2472f]">
                              {item.safetyCount}
                            </td>
                            <td className="px-1 py-4 text-center align-top text-lg font-black text-[var(--deshazo-text)]">
                              {item.priorityCount}
                            </td>
                            <td className="px-3 py-4 text-center align-top">
                              <div className="inline-flex flex-col items-center justify-center">
                                <div className="inline-flex items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/editable-inspection-report?jobsQuotingItemId=${encodeURIComponent(item.id)}`)}
                                    className="inline-flex whitespace-nowrap rounded-md bg-[var(--deshazo-blue)] px-2 py-2 text-[11px] font-black text-white transition hover:bg-[var(--deshazo-blue-deep)]"
                                  >
                                    Edit Quote
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setOpenItemSettingsId((currentId) => currentId === item.id ? null : item.id)}
                                    disabled={deletingItemIds.has(item.id)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#bdc4d3] bg-white text-[15px] font-black leading-none text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-60"
                                    aria-label="Quote settings"
                                    title="Quote settings"
                                  >
                                    ⚙
                                  </button>
                                </div>
                                <div className="mt-1 text-[11px] font-black uppercase text-[#747b8a]">
                                  {itemResults[item.id]?.winStatus ?? 'pending'}
                                  {itemResults[item.id]?.amountWon != null ? ` • ${formatMoney(itemResults[item.id].amountWon ?? 0)}` : ''}
                                </div>
                                {openItemSettingsId === item.id ? (
                                  <div className="mt-2 w-[150px] rounded-md border border-[#d3dbea] bg-white p-2 text-left shadow-[0_14px_34px_-28px_rgba(15,23,42,0.5)]">
                                    <button
                                      type="button"
                                      onClick={() => openMarkResultModal(item)}
                                      disabled={deletingItemIds.has(item.id)}
                                      className="mb-2 w-full rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-left text-[12px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Mark Result
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteQuoteItem(item)}
                                      disabled={deletingItemIds.has(item.id)}
                                      className="w-full rounded-md border border-[#f0c4bd] bg-[#fff7f5] px-3 py-2 text-left text-[12px] font-black text-[#a2472f] transition hover:bg-[#ffece8] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {deletingItemIds.has(item.id) ? 'Deleting...' : 'Delete Quote'}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>

                {!jobsListLoading && sortedJobGroups.length === 0 ? (
                  <div className="px-5 py-16 text-center">
                    <p className="text-base font-black text-[var(--deshazo-text)]">
                      {searchQuery.trim()
                        ? 'No matching quote reports.'
                        : selectedJobSectionId === allJobsSectionId && quoteJobListScope === 'current'
                          ? 'No current job selected yet.'
                          : 'No repair jobs yet.'}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[#747b8a]">
                      {searchQuery.trim()
                        ? 'Try searching another D-number or job number.'
                        : selectedJobSectionId === allJobsSectionId && quoteJobListScope === 'current'
                          ? 'Import a job to show it here, or switch to All to browse every quote job.'
                        : 'Upload a report, then check Extend once splitting and extraction are complete.'}
                    </p>
                  </div>
                ) : null}

                {!jobsListLoading && sortedJobGroups.length > 0 ? (
                  <div className="flex flex-col gap-3 border-t border-[#d3dbea] bg-[#f8fbff] px-5 py-4 text-[12px] font-bold text-[#747b8a] sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Showing jobs {pageFirstJob}-{pageLastJob} of {sortedJobGroups.length} ({filteredItems.length} inspection report{filteredItems.length === 1 ? '' : 's'})
                    </span>
                    {sortedJobGroups.length > reportsPerPage ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={safeCurrentPage === 1}
                          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                          className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Previous
                        </button>
                        <span className="min-w-[88px] text-center text-[#4d5360]">
                          Page {safeCurrentPage} of {pageCount}
                        </span>
                        <button
                          type="button"
                          disabled={safeCurrentPage === pageCount}
                          onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                          className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#e8eefb] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
        </section>
      </main>
    </div>
  )
}
