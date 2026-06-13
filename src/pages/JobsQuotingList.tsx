import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { supabase, isConfigured } from '../lib/supabase'
import { DeveloperBadge } from '../components/DeveloperBadge'
import {
  createJobQuotingItemsFromExternalInspectionReports,
  deleteJobsQuotingItem,
  getJobsQuotingItemsForRuns,
  getJobsQuotingRuns,
  syncJobsQuotingRun,
  uploadExtractOnlyInspectionForQuoting,
  uploadInspectionForQuoting,
  type JobsQuotingItem,
  type JobsQuotingRun,
} from '../lib/jobsQuoting'
import { getCurrentUserTag, getUserDisplayNames, type UserTag } from '../lib/userTags'

const activeStatuses = new Set(['uploading', 'pending', 'processing', 'needs_review'])
const inspectionRunsCollapsedStorageKey = 'deshazo-jobs-quoting-inspection-runs-collapsed'
const extractOnlyUploadMaxFilesPerRequest = 25
const extractOnlyUploadMaxBytesPerRequest = 60 * 1024 * 1024
const runGroupWindowMs = 10 * 60 * 1000
const allJobsSectionId = 'all-jobs'
const reportsPerPage = 50

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
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
    ...getSearchVariants(getItemJobNumber(item)),
  ]
    .join(' ')
}

function getItemJobNumber(item: JobsQuotingItem) {
  return (item.jobNumber || getExtractionValue(item.extractionData, 'job_number')).trim()
}

function normalizeJobNumberForMatch(jobNumber: string) {
  return jobNumber.trim().toLowerCase()
}

function getItemDNumber(item: JobsQuotingItem) {
  return (item.dNumber || getExtractionValue(item.extractionData, 'd_number')).trim()
}

function getItemFileName(item: JobsQuotingItem) {
  return (item.pdfFileName || item.sourceDocumentName || item.documentName).trim()
}

function getItemJobGroupKey(item: JobsQuotingItem) {
  const jobNumber = getItemJobNumber(item)
  if (jobNumber) return `job:${jobNumber.toLowerCase()}`

  const dNumber = getItemDNumber(item)
  if (dNumber) return `d-number:${dNumber.toLowerCase()}`

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
    items: sortItemsByNewest(group.items),
  }))
}

export default function JobsQuotingList() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [userTag, setUserTag] = useState<UserTag | null>(null)
  const [runs, setRuns] = useState<JobsQuotingRun[]>([])
  const [items, setItems] = useState<JobsQuotingItem[]>([])
  const [userDisplayNames, setUserDisplayNames] = useState<Record<string, string>>({})
  const [itemsLoading, setItemsLoading] = useState(false)
  const [selectedJobSectionId, setSelectedJobSectionId] = useState<string>(allJobsSectionId)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false)
  const [openItemSettingsId, setOpenItemSettingsId] = useState<string | null>(null)
  const [deletingItemIds, setDeletingItemIds] = useState<Set<string>>(() => new Set())
  const [externalJobNumberInput, setExternalJobNumberInput] = useState('')
  const [externalJobImporting, setExternalJobImporting] = useState(false)
  const [pinnedImportedJobNumbers, setPinnedImportedJobNumbers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [inspectionRunsCollapsed, setInspectionRunsCollapsed] = useState(
    () => window.localStorage.getItem(inspectionRunsCollapsedStorageKey) !== 'false',
  )
  const extractPdfInputRef = useRef<HTMLInputElement>(null)
  const splitFolderInputRef = useRef<HTMLInputElement>(null)
  const giantPdfInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const runsById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs])
  const jobSectionGroups = useMemo(
    () => buildJobGroups(items).sort((firstGroup, secondGroup) => new Date(secondGroup.modifiedAt).getTime() - new Date(firstGroup.modifiedAt).getTime()),
    [items],
  )
  const selectedJobSection = jobSectionGroups.find((group) => group.id === selectedJobSectionId)
  const canUseExtendControls = userTag === 'developer'
  const getRunUploaderName = useCallback(
    (run: JobsQuotingRun | undefined) => (run?.userId ? userDisplayNames[run.userId] || '' : 'Shared'),
    [userDisplayNames],
  )
  const visibleItems = useMemo(() => {
    if (selectedJobSectionId === allJobsSectionId || !selectedJobSection) return sortItemsByNewest(items)

    return sortItemsByPriority(selectedJobSection.items)
  }, [items, selectedJobSection, selectedJobSectionId])
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
    const pinnedJobNumbers = new Set(pinnedImportedJobNumbers.map(normalizeJobNumberForMatch))
    const comparePinnedGroups = (firstGroup: JobsQuotingJobGroup, secondGroup: JobsQuotingJobGroup) => {
      const firstGroupPinned = firstGroup.jobNumber ? pinnedJobNumbers.has(normalizeJobNumberForMatch(firstGroup.jobNumber)) : false
      const secondGroupPinned = secondGroup.jobNumber ? pinnedJobNumbers.has(normalizeJobNumberForMatch(secondGroup.jobNumber)) : false

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

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedJobSectionId])

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

  const loadQuotingData = useCallback(async (sectionId?: string) => {
    setLoading(true)
    setItemsLoading(true)
    setMessage('')

    try {
      const nextRuns = await getJobsQuotingRuns()
      const nextRunGroups = buildRunGroups(nextRuns)
      const nextRunIds = nextRunGroups.flatMap((group) => group.runIds)
      const nextItems = nextRunIds.length > 0 ? await getJobsQuotingItemsForRuns(nextRunIds) : []
      const nextJobSections = buildJobGroups(nextItems)
      const nextSelectedSectionId =
        sectionId && (sectionId === allJobsSectionId || nextJobSections.some((group) => group.id === sectionId))
          ? sectionId
          : allJobsSectionId

      setRuns(nextRuns)
      setSelectedJobSectionId(nextSelectedSectionId)
      setItems(nextItems)
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
      getCurrentUserTag(user.id)
        .then(setUserTag)
        .catch(() => setUserTag(null))
    }
  }, [loadQuotingData, user])

  useEffect(() => {
    if (runs.length === 0) {
      setUserDisplayNames({})
      return
    }

    let cancelled = false
    getUserDisplayNames(runs.map((run) => run.userId).filter((userId): userId is string => Boolean(userId)))
      .then((displayNames) => {
        if (!cancelled) setUserDisplayNames(displayNames)
      })
      .catch(() => {
        if (!cancelled) setUserDisplayNames({})
      })

    return () => {
      cancelled = true
    }
  }, [runs])

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
          setItems(nextRunIds.length > 0 ? await getJobsQuotingItemsForRuns(nextRunIds) : [])
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

  const applyUploadResult = (result: Awaited<ReturnType<typeof uploadInspectionForQuoting>>) => {
    const uploadedRuns = result.runs && result.runs.length > 0 ? result.runs : [result.run]
    mergeUploadedRuns(uploadedRuns)
    setSelectedJobSectionId(allJobsSectionId)
    setItems((currentItems) => sortItemsByNewest([...result.items, ...currentItems.filter((item) => !result.items.some((nextItem) => nextItem.id === item.id))]))
    setMessage(result.message ?? 'Inspection report sent to Extend.')
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

      for (const [fileIndex, file] of files.entries()) {
        setMessage(`Sending PDF ${fileIndex + 1} of ${files.length} through the split workflow.`)
        const result = await uploadInspectionForQuoting(file, folderName)
        const uploadedRuns = renameRunsForDisplay(result.runs && result.runs.length > 0 ? result.runs : [result.run], folderName)
        mergeUploadedRuns(uploadedRuns)
        setSelectedJobSectionId(allJobsSectionId)

        if (!firstResult) {
          firstResult = result
          setItems((currentItems) => sortItemsByNewest([...result.items, ...currentItems.filter((item) => !result.items.some((nextItem) => nextItem.id === item.id))]))
        }
      }

      setMessage(`${files.length} PDFs from ${folderName} sent through the split workflow. Runs will refresh as Extend finishes.`)
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
      for (const [batchIndex, batch] of batches.entries()) {
        setMessage(`Uploading batch ${batchIndex + 1} of ${batches.length} (${batch.length} PDF${batch.length === 1 ? '' : 's'}).`)
        const result = await uploadExtractOnlyInspectionForQuoting(batch, sourceFileName)
        const uploadedRuns = sourceFileName
          ? renameRunsForDisplay(result.runs && result.runs.length > 0 ? result.runs : [result.run], sourceFileName)
          : result.runs && result.runs.length > 0
            ? result.runs
            : [result.run]
        mergeUploadedRuns(uploadedRuns)

        if (!firstResult) {
          firstResult = result
          setItems((currentItems) => sortItemsByNewest([...result.items, ...currentItems.filter((item) => !result.items.some((nextItem) => nextItem.id === item.id))]))
        }
      }

      setSelectedJobSectionId(allJobsSectionId)

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
    setMessage(`Importing quote items for ${jobNumbers.join(', ')} from synced inspection reports.`)

    try {
      const result = await createJobQuotingItemsFromExternalInspectionReports(jobNumbers)
      const createdCount = result.results.reduce((total, item) => total + (item.createdOrUpdated ?? 0), 0)
      const existingCount = result.results.reduce((total, item) => total + (item.existingQuoteItems?.length ?? 0), 0)
      const importedJobNumbers = result.results
        .filter((item) => (item.createdOrUpdated ?? 0) > 0 || (item.existingQuoteItems?.length ?? 0) > 0)
        .map((item) => item.jobNumber || '')
        .filter(Boolean)
      const importErrors = result.results
        .filter((item) => item.error)
        .map((item) => `${item.jobNumber || item.workOrderId || 'Report'}: ${item.error}`)
      const importWarnings = result.results
        .filter((item) => item.warning)
        .map((item) => `${item.jobNumber || item.workOrderId || 'Report'}: ${item.warning}`)
      const finalImportMessage =
        importErrors.length > 0
          ? importErrors.join(' ')
          : importWarnings.length > 0
          ? importWarnings.join(' ')
          : createdCount > 0
          ? `Imported ${createdCount} created quote item${createdCount === 1 ? '' : 's'} for ${jobNumbers.join(', ')}${existingCount > 0 ? `; ${existingCount} existing quote item${existingCount === 1 ? '' : 's'} moved to the top.` : '.'}`
          : existingCount > 0
          ? `That job has already been imported. See the section below.`
          : `No quote items were created for ${jobNumbers.join(', ')}. Check that the synced reports have at least one repair or safety issue.`

      if (createdCount > 0 || existingCount > 0) {
        setMessage(`Imported ${createdCount + existingCount} quote item${createdCount + existingCount === 1 ? '' : 's'}. Refreshing jobs...`)
        if (createdCount > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 3000))
        }
        setPinnedImportedJobNumbers(importedJobNumbers.length > 0 ? importedJobNumbers : jobNumbers)
        setSelectedJobSectionId(allJobsSectionId)
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

  const toggleInspectionRunsCollapsed = () => {
    setInspectionRunsCollapsed((currentCollapsed) => {
      const nextCollapsed = !currentCollapsed
      window.localStorage.setItem(inspectionRunsCollapsedStorageKey, String(nextCollapsed))
      return nextCollapsed
    })
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#e8eaef] px-4">
        <div className="rounded-md border border-[#dfe4ef] bg-white px-6 py-4 text-sm font-black text-[#273f7a] shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
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
    <div className="min-h-screen bg-[#e8eaef] text-[#111]">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-[linear-gradient(90deg,#3cb9c5_0%,#7a35e8_100%)] px-4 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="text-[22px] font-black leading-none transition hover:text-white/80"
            aria-label="Home"
          >
            ⌂
          </button>
          <div className="hidden rounded-md border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold md:block">
            Jobs Quoting
          </div>
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
              className="h-9 w-[132px] rounded-md border border-white/30 bg-white/95 px-3 text-xs font-black text-[#1f2430] outline-none transition placeholder:text-[#7a808e] focus:border-white focus:ring-2 focus:ring-white/30 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !externalJobNumberInput.trim()}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-white/30 bg-white px-3 text-xs font-black text-[#35245f] transition hover:bg-[#f3efff] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {externalJobImporting ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#d6cbed] border-t-[#35245f]" />
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
            className="rounded-md bg-white px-4 py-2 text-sm font-black text-[#35245f] transition hover:bg-[#f3efff] disabled:cursor-not-allowed disabled:opacity-60"
            aria-expanded={uploadMenuOpen}
          >
            Upload
          </button>
          {uploadMenuOpen ? (
            <div className="absolute right-0 top-[calc(100%+14px)] z-50 w-[340px] rounded-md border border-[#dfe4ef] bg-white p-2 text-[#111] shadow-[0_24px_70px_-34px_rgba(15,23,42,0.55)]">
              <form
                className="mb-2 rounded-md border border-[#dfe4ef] bg-[#fbfcff] p-2 md:hidden"
                onSubmit={(event) => {
                  event.preventDefault()
                  importExternalInspectionReportsForJob()
                }}
              >
                <div className="text-[12px] font-black uppercase text-[#273f7a]">Import Synced Job</div>
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
                    className="min-w-0 flex-1 rounded-md border border-[#cfd6e5] bg-white px-3 py-2 text-[12px] font-bold text-[#1f2430] outline-none focus:border-[#273f7a]"
                  />
                  <button
                    type="submit"
                    disabled={busy || !externalJobNumberInput.trim()}
                    className="inline-flex items-center gap-2 rounded-md bg-[#273f7a] px-3 py-2 text-[12px] font-black text-white transition hover:bg-[#1f3262] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {externalJobImporting ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : null}
                    Import
                  </button>
                </div>
              </form>
              <div className="rounded-md border border-[#dfe4ef] bg-[#fbfcff] p-2">
                <div className="text-[12px] font-black uppercase text-[#273f7a]">Upload Inspection Reports</div>
                <div className={`mt-2 grid gap-2 ${canUseExtendControls ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => extractPdfInputRef.current?.click()}
                    className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[#273f7a] transition hover:bg-[#edf2fb] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Upload PDF
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => splitFolderInputRef.current?.click()}
                    className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[#273f7a] transition hover:bg-[#edf2fb] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Choose Folder
                  </button>
                  {canUseExtendControls ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => giantPdfInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[#273f7a] transition hover:bg-[#edf2fb] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span>Giant PDF</span>
                      <DeveloperBadge />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <main className="flex h-[calc(100vh-56px)] overflow-hidden bg-[#f3f4f8]">
        <aside
          className={`relative hidden shrink-0 flex-col border-r border-[#d9dce5] bg-[#fbfcff] shadow-sm transition-[width] duration-200 lg:flex ${
            inspectionRunsCollapsed ? 'w-[42px]' : 'w-[300px]'
          }`}
        >
          {inspectionRunsCollapsed ? (
            <button
              type="button"
              onClick={toggleInspectionRunsCollapsed}
              className="flex h-full w-full items-center justify-center bg-white text-[#273f7a] transition hover:bg-[#f5f7ff]"
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
                className="absolute right-[-15px] top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[#d4dbea] bg-white text-[17px] font-black text-[#273f7a] shadow-sm transition hover:bg-[#f5f7ff]"
                aria-label="Hide job sections"
                title="Hide job sections"
              >
                ‹
              </button>
              <div className="border-b border-[#d9dce5] px-4 py-5">
                <p className="text-[16px] font-black text-[#1f2430]">Job Sections</p>
                <p className="mt-1 text-[12px] font-semibold leading-tight text-[#747b8a]">
                  Select all jobs or one job section.
                </p>
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => loadQuotingData(selectedJobSectionId)}
                  className="mt-4 flex w-full items-center justify-center rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[#273f7a] transition hover:bg-[#edf2fb] disabled:cursor-not-allowed disabled:opacity-60"
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
                        ? 'border-[#9bb0dc] bg-[#f5f7ff]'
                        : 'border-[#dde3ef] bg-white hover:border-[#9bb0dc] hover:bg-[#f5f7ff]'
                    }`}
                  >
                    <span className="block text-[13px] font-black leading-tight text-[#273f7a]">
                      All Jobs
                    </span>
                    <span className="mt-2 flex items-center justify-between gap-2 text-[12px] font-bold text-[#747b8a]">
                      <span>Recently changed first</span>
                      <span className="rounded-sm bg-[#eef3ff] px-2 py-1 text-[10px] font-black uppercase text-[#273f7a]">
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
                          ? 'border-[#9bb0dc] bg-[#f5f7ff]'
                          : 'border-[#dde3ef] bg-white hover:border-[#9bb0dc] hover:bg-[#f5f7ff]'
                      }`}
                    >
                      <span className="block truncate text-[13px] font-black leading-tight text-[#273f7a]">
                        {jobSection.jobNumber ? `Job ${jobSection.jobNumber}` : 'Job number not found'}
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-2 text-[12px] font-bold text-[#747b8a]">
                        <span>
                          {jobSection.items.length} report{jobSection.items.length === 1 ? '' : 's'}
                          {jobSection.dNumber ? ` • ${jobSection.dNumber}` : ''}
                        </span>
                        <span className="rounded-sm bg-[#eef3ff] px-2 py-1 text-[10px] font-black uppercase text-[#273f7a]">
                          {jobSection.repairCount + jobSection.safetyCount}
                        </span>
                      </span>
                    </button>
                  ))}

                  {!loading && jobSectionGroups.length === 0 ? (
                    <div className="rounded-md border border-dashed border-[#cfd6e5] bg-white px-3 py-8 text-center text-[12px] font-bold text-[#747b8a]">
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
              <h1 className="text-[clamp(24px,2.4vw,34px)] font-black leading-tight tracking-normal text-[#1f2430]">
                Jobs Quoting List
              </h1>
              <p className="mt-2 max-w-[72ch] text-[15px] font-semibold leading-6 text-[#5b606b]">
                Upload a full Deshazo inspection reports, then edit only the reports that contain repair or safety items.
              </p>
            </div>

            <div className="grid min-w-[280px] grid-cols-2 overflow-hidden rounded-md border border-[#dfe4ef] bg-white shadow-[0_16px_44px_-36px_rgba(15,23,42,0.55)]">
              <div className="border-r border-[#dfe4ef] px-4 py-3">
                <p className="text-[11px] font-black uppercase text-[#747b8a]">Repairs</p>
                <p className="mt-1 text-2xl font-black text-[#273f7a]">{jobsListLoading ? '...' : totalRepairItems}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] font-black uppercase text-[#747b8a]">Safety</p>
                <p className="mt-1 text-2xl font-black text-[#a2472f]">{jobsListLoading ? '...' : totalSafetyItems}</p>
              </div>
            </div>
          </div>

          {message ? (
            <div className="mb-4 rounded-md border border-[#cfd9ef] bg-[#f4f7ff] px-4 py-3 text-[13px] font-bold text-[#273f7a]">
              {message}
            </div>
          ) : null}

          <div className="lg:hidden">
            <section className="mb-4 rounded-md border border-[#dfe4ef] bg-[#fbfcff] p-3 shadow-[0_16px_44px_-36px_rgba(15,23,42,0.45)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-black text-[#1f2430]">Job Sections</h2>
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => loadQuotingData(selectedJobSectionId)}
                  className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[#273f7a] transition hover:bg-[#edf2fb] disabled:opacity-60"
                >
                  Reload
                </button>
              </div>
              <select
                value={selectedJobSectionId}
                onChange={(event) => setSelectedJobSectionId(event.currentTarget.value)}
                className="w-full rounded-md border border-[#cfd6e5] bg-white px-3 py-2 text-[13px] font-bold text-[#1f2430] outline-none focus:border-[#273f7a]"
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

          <section className="min-w-0 overflow-hidden rounded-md border border-[#dfe4ef] bg-white shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
              <div className="flex flex-col justify-between gap-3 border-b border-[#dfe4ef] bg-[#fbfcff] px-5 py-4 lg:flex-row lg:items-center">
                <div className="min-w-0">
                  <h2 className="text-[20px] font-black tracking-normal text-[#1f2430]">
                    {selectedJobSectionId === allJobsSectionId
                      ? 'All Quote Jobs'
                      : selectedJobSection?.jobNumber
                        ? `Job ${selectedJobSection.jobNumber}`
                        : 'Job number not found'}
                  </h2>
                  <p className="mt-1 text-[13px] font-semibold text-[#747b8a]">
                    {selectedJobSectionId === allJobsSectionId
                      ? 'All quote jobs, sorted by newest changed first.'
                      : 'Showing quote reports from the selected job section.'}
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:min-w-[360px]">
                  <label className="sr-only" htmlFor="quote-report-search">
                    Search quote reports
                  </label>
                  <input
                    id="quote-report-search"
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.currentTarget.value)}
                    placeholder="Search D-number or job number..."
                    className="w-full rounded-md border border-[#cfd6e5] bg-white px-3 py-2 text-[13px] font-bold text-[#1f2430] outline-none transition placeholder:text-[#8b91a1] focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                  />
                </div>
              </div>

              <div className="overflow-x-hidden">
                <table className="w-full table-fixed border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#dfe4ef] bg-[#f4f6fb] text-[11px] font-black uppercase text-[#747b8a]">
                      <th className="w-[12%] px-3 py-3">D-number</th>
                      <th className="w-[24%] px-3 py-3">File Name</th>
                      <th className="w-[11%] px-2 py-3 text-center">Date Modified</th>
                      <th className="w-[10%] px-2 py-3 text-center">Uploaded By</th>
                      <th className="w-[7%] px-1 py-3 text-center">Repairs</th>
                      <th className="w-[7%] px-1 py-3 text-center">Safety</th>
                      <th className="w-[7%] px-1 py-3 text-center">Total</th>
                      <th className="w-[22%] px-3 py-3 text-center">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobsListLoading ? (
                      <tr>
                        <td colSpan={8} className="px-5 py-16">
                          <div className="mx-auto flex max-w-xs flex-col items-center justify-center text-center">
                            <div className="h-9 w-9 animate-spin rounded-full border-4 border-[#dfe4ef] border-t-[#273f7a]" />
                            <p className="mt-4 text-sm font-black text-[#1f2430]">Loading quote jobs...</p>
                            <p className="mt-1 text-xs font-semibold text-[#747b8a]">
                              Preparing the selected report list.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : paginatedJobGroups.map((jobGroup) => (
                      <Fragment key={jobGroup.id}>
                        <tr className="border-y border-[#d7deeb] bg-[#f7f9fd]">
                          <td className="px-3 py-3 align-middle" colSpan={4}>
                            <div className="min-w-0">
                              <p className="text-[15px] font-black leading-tight text-[#1f2430]">
                                {jobGroup.jobNumber ? `Job ${jobGroup.jobNumber}` : 'Job number not found'}
                              </p>
                              <p className="mt-1 text-[12px] font-bold text-[#747b8a]">
                                {jobGroup.items.length} inspection report{jobGroup.items.length === 1 ? '' : 's'}
                                {jobGroup.dNumber ? ` • D-number ${jobGroup.dNumber}` : ''}
                              </p>
                            </div>
                          </td>
                          <td className="px-1 py-3 text-center align-middle text-lg font-black text-[#273f7a]">
                            {jobGroup.repairCount}
                          </td>
                          <td className="px-1 py-3 text-center align-middle text-lg font-black text-[#a2472f]">
                            {jobGroup.safetyCount}
                          </td>
                          <td className="px-1 py-3 text-center align-middle text-lg font-black text-[#111]">
                            {jobGroup.priorityCount}
                          </td>
                          <td className="px-3 py-3 text-center align-middle text-[12px] font-bold text-[#4d5360]">
                            Modified {formatDate(jobGroup.modifiedAt)}
                          </td>
                        </tr>
                        {jobGroup.items.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b border-[#e4e8f1] transition hover:bg-[#fbfcff] last:border-b-0"
                          >
                            <td className="px-3 py-4 align-top">
                              <span className="block whitespace-normal break-words text-sm font-black leading-snug text-[#1f2430]">
                                {getItemDNumber(item) || '-'}
                              </span>
                            </td>
                            <td className="px-3 py-4 align-top">
                              <div className="border-l-4 border-[#dfe6f5] pl-3">
                                <p className="whitespace-normal break-words text-sm font-black leading-snug text-[#1f2430]">
                                  {getItemFileName(item) || '-'}
                                </p>
                                {item.splitIdentifier ? (
                                  <p className="mt-1 whitespace-normal break-words text-xs font-semibold leading-snug text-[#747b8a]">
                                    {item.splitIdentifier}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-2 py-4 text-center align-top text-xs font-bold leading-snug text-[#4d5360]">
                              {formatDate(item.updatedAt)}
                            </td>
                            <td className="px-2 py-4 text-center align-top text-sm font-bold text-[#4d5360]">
                              <span className="block truncate" title={getRunUploaderName(runsById.get(item.runId))}>
                                {getRunUploaderName(runsById.get(item.runId)) || '-'}
                              </span>
                            </td>
                            <td className="px-1 py-4 text-center align-top text-lg font-black text-[#273f7a]">
                              {item.repairCount}
                            </td>
                            <td className="px-1 py-4 text-center align-top text-lg font-black text-[#a2472f]">
                              {item.safetyCount}
                            </td>
                            <td className="px-1 py-4 text-center align-top text-lg font-black text-[#111]">
                              {item.priorityCount}
                            </td>
                            <td className="px-3 py-4 text-center align-top">
                              <div className="inline-flex flex-col items-center justify-center">
                                <div className="inline-flex items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/editable-inspection-report?jobsQuotingItemId=${encodeURIComponent(item.id)}`)}
                                    className="inline-flex whitespace-nowrap rounded-md bg-[#273f7a] px-2 py-2 text-[11px] font-black text-white transition hover:bg-[#1f3262]"
                                  >
                                    Edit Quote
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setOpenItemSettingsId((currentId) => currentId === item.id ? null : item.id)}
                                    disabled={deletingItemIds.has(item.id)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#bdc4d3] bg-white text-[15px] font-black leading-none text-[#273f7a] transition hover:bg-[#edf2fb] disabled:cursor-not-allowed disabled:opacity-60"
                                    aria-label="Quote settings"
                                    title="Quote settings"
                                  >
                                    ⚙
                                  </button>
                                </div>
                                {openItemSettingsId === item.id ? (
                                  <div className="mt-2 w-[140px] rounded-md border border-[#dfe4ef] bg-white p-2 text-left shadow-[0_14px_34px_-28px_rgba(15,23,42,0.5)]">
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
                    <p className="text-base font-black text-[#1f2430]">{searchQuery.trim() ? 'No matching quote reports.' : 'No repair jobs yet.'}</p>
                    <p className="mt-2 text-sm font-semibold text-[#747b8a]">
                      {searchQuery.trim()
                        ? 'Try searching another D-number or job number.'
                        : 'Upload a report, then check Extend once splitting and extraction are complete.'}
                    </p>
                  </div>
                ) : null}

                {!jobsListLoading && sortedJobGroups.length > 0 ? (
                  <div className="flex flex-col gap-3 border-t border-[#dfe4ef] bg-[#fbfcff] px-5 py-4 text-[12px] font-bold text-[#747b8a] sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Showing jobs {pageFirstJob}-{pageLastJob} of {sortedJobGroups.length} ({filteredItems.length} inspection report{filteredItems.length === 1 ? '' : 's'})
                    </span>
                    {sortedJobGroups.length > reportsPerPage ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={safeCurrentPage === 1}
                          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                          className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[#273f7a] transition hover:bg-[#edf2fb] disabled:cursor-not-allowed disabled:opacity-50"
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
                          className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[#273f7a] transition hover:bg-[#edf2fb] disabled:cursor-not-allowed disabled:opacity-50"
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
