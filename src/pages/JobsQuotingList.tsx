import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { supabase, isConfigured } from '../lib/supabase'
import {
  getJobsQuotingItemsForRuns,
  getJobsQuotingItemPdfUrl,
  getJobsQuotingRuns,
  syncJobsQuotingRun,
  uploadExtractOnlyInspectionForQuoting,
  uploadInspectionForQuoting,
  type JobsQuotingItem,
  type JobsQuotingRun,
} from '../lib/jobsQuoting'
import { getCurrentUserTag, type UserTag } from '../lib/userTags'

const activeStatuses = new Set(['uploading', 'pending', 'processing', 'needs_review'])
const inspectionRunsCollapsedStorageKey = 'deshazo-jobs-quoting-inspection-runs-collapsed'
const extractOnlyUploadMaxFilesPerRequest = 25
const extractOnlyUploadMaxBytesPerRequest = 60 * 1024 * 1024
const runGroupWindowMs = 10 * 60 * 1000
const allReportsRunId = 'all-reports'
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
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

function getRunGroupPdfCount(group: JobsQuotingRunGroup) {
  return group.runs.length
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

function getItemSearchText(item: JobsQuotingItem) {
  return [
    item.documentName,
    item.splitIdentifier,
    item.pdfFileName,
    getExtractionValue(item.extractionData, 'd_number'),
    getExtractionValue(item.extractionData, 'job_number'),
  ]
    .join(' ')
    .toLowerCase()
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

export default function JobsQuotingList() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [userTag, setUserTag] = useState<UserTag | null>(null)
  const [runs, setRuns] = useState<JobsQuotingRun[]>([])
  const [items, setItems] = useState<JobsQuotingItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string>(allReportsRunId)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [openingItemId, setOpeningItemId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [inspectionRunsCollapsed, setInspectionRunsCollapsed] = useState(
    () => window.localStorage.getItem(inspectionRunsCollapsedStorageKey) !== 'false',
  )
  const extractPdfInputRef = useRef<HTMLInputElement>(null)
  const splitFolderInputRef = useRef<HTMLInputElement>(null)
  const giantPdfInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const runGroups = useMemo(() => buildRunGroups(runs), [runs])
  const selectedRunGroup = runGroups.find((group) => group.id === selectedRunId)
  const canUseExtendControls = userTag === 'developer'
  const visibleItems = useMemo(() => {
    if (selectedRunId === allReportsRunId || !selectedRunGroup) return sortItemsByNewest(items)

    const selectedRunIds = new Set(selectedRunGroup.runIds)
    return sortItemsByPriority(items.filter((item) => selectedRunIds.has(item.runId)))
  }, [items, selectedRunGroup, selectedRunId])
  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) return visibleItems
    return visibleItems.filter((item) => getItemSearchText(item).includes(normalizedQuery))
  }, [searchQuery, visibleItems])
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / reportsPerPage))
  const safeCurrentPage = Math.min(currentPage, pageCount)
  const pageStartIndex = (safeCurrentPage - 1) * reportsPerPage
  const paginatedItems = filteredItems.slice(pageStartIndex, pageStartIndex + reportsPerPage)
  const pageFirstItem = filteredItems.length === 0 ? 0 : pageStartIndex + 1
  const pageLastItem = Math.min(pageStartIndex + paginatedItems.length, filteredItems.length)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedRunId])

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount))
  }, [pageCount])

  useEffect(() => {
    if (!isConfigured || !supabase) {
      navigate('/login')
      return
    }

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate('/login')
      } else {
        setUser(data.user)
      }
      setAuthLoading(false)
    })
  }, [navigate])

  const loadQuotingData = useCallback(async (runId?: string) => {
    setLoading(true)
    setItemsLoading(true)
    setMessage('')

    try {
      const nextRuns = await getJobsQuotingRuns()
      const nextRunGroups = buildRunGroups(nextRuns)
      const nextSelectedRunId =
        runId && (runId === allReportsRunId || nextRunGroups.some((group) => group.id === runId))
          ? runId
          : allReportsRunId
      const nextRunIds = nextRunGroups.flatMap((group) => group.runIds)
      const nextItems = nextRunIds.length > 0 ? await getJobsQuotingItemsForRuns(nextRunIds) : []

      setRuns(nextRuns)
      setSelectedRunId(nextSelectedRunId)
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

  const applyUploadResult = (result: Awaited<ReturnType<typeof uploadInspectionForQuoting>>) => {
    const uploadedRuns = result.runs && result.runs.length > 0 ? result.runs : [result.run]
    mergeUploadedRuns(uploadedRuns)
    setSelectedRunId(result.run.id)
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
        setSelectedRunId(result.run.id)

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
      let latestRunId = ''

      for (const [batchIndex, batch] of batches.entries()) {
        setMessage(`Uploading batch ${batchIndex + 1} of ${batches.length} (${batch.length} PDF${batch.length === 1 ? '' : 's'}).`)
        const result = await uploadExtractOnlyInspectionForQuoting(batch, sourceFileName)
        const uploadedRuns = sourceFileName
          ? renameRunsForDisplay(result.runs && result.runs.length > 0 ? result.runs : [result.run], sourceFileName)
          : result.runs && result.runs.length > 0
            ? result.runs
            : [result.run]
        mergeUploadedRuns(uploadedRuns)
        latestRunId = result.run.id

        if (!firstResult) {
          firstResult = result
          setItems((currentItems) => sortItemsByNewest([...result.items, ...currentItems.filter((item) => !result.items.some((nextItem) => nextItem.id === item.id))]))
        }
      }

      if (latestRunId) {
        setSelectedRunId(latestRunId)
      }

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

  const syncRunGroup = async (group: JobsQuotingRunGroup) => {
    setBusy(true)
    setMessage('Checking Extend for extracted repair items.')

    try {
      const results = await Promise.all(group.runIds.map((runId) => syncJobsQuotingRun(runId)))
      const syncedRunsById = new Map(results.map((result) => [result.run.id, result.run]))
      setRuns((currentRuns) =>
        currentRuns.map((run) => syncedRunsById.get(run.id) ?? run),
      )
      await loadQuotingData(group.id)
      setMessage(results.map((result) => result.message).filter(Boolean).join(' ') || 'Quote jobs refreshed.')
    } catch (error) {
      setMessage(getFriendlyErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }


  const getItemPdfUrl = async (item: JobsQuotingItem) => {
    return getJobsQuotingItemPdfUrl(item)
  }

  const openItemPdf = async (item: JobsQuotingItem) => {
    const pdfWindow = window.open('about:blank', '_blank')
    if (!pdfWindow) {
      setMessage('Allow pop-ups for this site, then try opening the PDF again.')
      return
    }

    pdfWindow.opener = null
    setOpeningItemId(item.id)
    setMessage('Getting the saved split PDF.')

    try {
      let nextItem = item

      if (item.runId) {
        const result = await syncJobsQuotingRun(item.runId)
        setRuns((currentRuns) =>
          currentRuns.map((run) => (run.id === result.run.id ? result.run : run)),
        )
        if (selectedRunGroup) {
          const nextRunIds = runGroups.flatMap((group) => group.runIds)
          setItems(nextRunIds.length > 0 ? await getJobsQuotingItemsForRuns(nextRunIds) : [])
        } else {
          setItems((currentItems) => sortItemsByNewest([...result.items, ...currentItems.filter((currentItem) => !result.items.some((nextItem) => nextItem.id === currentItem.id))]))
        }
        nextItem = result.items.find((currentItem) => currentItem.id === item.id) ?? item
      }

      const pdfUrl = await getItemPdfUrl(nextItem)
      if (!pdfUrl) {
        pdfWindow.close()
        setMessage('This report is saved, but the split PDF file is not available yet. Refresh jobs and try again.')
        return
      }

      pdfWindow.location.href = pdfUrl
      setMessage('')
    } catch (error) {
      pdfWindow.close()
      setMessage(getFriendlyErrorMessage(error))
    } finally {
      setOpeningItemId(null)
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
          <div className="hidden rounded-md border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold md:block">
            {user.email}
          </div>
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
              <div className="rounded-md border border-[#dfe4ef] bg-[#fbfcff] p-2">
                <div className="text-[12px] font-black uppercase text-[#273f7a]">Upload Inspection Reports</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => extractPdfInputRef.current?.click()}
                    className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[#273f7a] transition hover:bg-[#edf2fb] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Upload PDF
                  </button>
                  {canUseExtendControls ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => splitFolderInputRef.current?.click()}
                        className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[#273f7a] transition hover:bg-[#edf2fb] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Choose Folder
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => giantPdfInputRef.current?.click()}
                        className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[#273f7a] transition hover:bg-[#edf2fb] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Giant PDF
                      </button>
                    </>
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
              aria-label="Open inspection runs"
              title="Open inspection runs"
            >
              <span className="[writing-mode:vertical-rl] rotate-180 text-[12px] font-black uppercase tracking-[0.12em]">
                Inspection Runs
              </span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleInspectionRunsCollapsed}
                className="absolute right-[-15px] top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[#d4dbea] bg-white text-[17px] font-black text-[#273f7a] shadow-sm transition hover:bg-[#f5f7ff]"
                aria-label="Hide inspection runs"
                title="Hide inspection runs"
              >
                ‹
              </button>
              <div className="border-b border-[#d9dce5] px-4 py-5">
                <p className="text-[16px] font-black text-[#1f2430]">Inspection Runs</p>
                <p className="mt-1 text-[12px] font-semibold leading-tight text-[#747b8a]">
                  Select a report to review extracted quote jobs.
                </p>
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => loadQuotingData(selectedRunId)}
                  className="mt-4 flex w-full items-center justify-center rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[#273f7a] transition hover:bg-[#edf2fb] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reload Runs
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRunId(allReportsRunId)}
                    className={`w-full rounded-md border px-3 py-3 text-left shadow-[0_8px_20px_-18px_rgba(31,36,48,0.45)] transition ${
                      selectedRunId === allReportsRunId
                        ? 'border-[#9bb0dc] bg-[#f5f7ff]'
                        : 'border-[#dde3ef] bg-white hover:border-[#9bb0dc] hover:bg-[#f5f7ff]'
                    }`}
                  >
                    <span className="block text-[13px] font-black leading-tight text-[#273f7a]">
                      All Reports
                    </span>
                    <span className="mt-2 flex items-center justify-between gap-2 text-[12px] font-bold text-[#747b8a]">
                      <span>Recently changed first</span>
                      <span className="rounded-sm bg-[#eef3ff] px-2 py-1 text-[10px] font-black uppercase text-[#273f7a]">
                        {items.length}
                      </span>
                    </span>
                  </button>

                  {runGroups.map((runGroup) => (
                    <button
                      key={runGroup.id}
                      type="button"
                      onClick={() => setSelectedRunId(runGroup.id)}
                      className={`w-full rounded-md border px-3 py-3 text-left shadow-[0_8px_20px_-18px_rgba(31,36,48,0.45)] transition ${
                        selectedRunId === runGroup.id
                          ? 'border-[#9bb0dc] bg-[#f5f7ff]'
                          : 'border-[#dde3ef] bg-white hover:border-[#9bb0dc] hover:bg-[#f5f7ff]'
                      }`}
                    >
                      <span className="block truncate text-[13px] font-black leading-tight text-[#273f7a]">
                        {runGroup.sourceFileName}
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-2 text-[12px] font-bold text-[#747b8a]">
                        <span>
                          {formatDate(runGroup.createdAt)}
                          {getRunGroupPdfCount(runGroup) > 1 ? ` • ${getRunGroupPdfCount(runGroup)} PDFs` : ''}
                        </span>
                        <span className="rounded-sm bg-[#eef3ff] px-2 py-1 text-[10px] font-black uppercase text-[#273f7a]">
                          {formatStatus(runGroup.status)}
                        </span>
                      </span>
                    </button>
                  ))}

                  {!loading && runGroups.length === 0 ? (
                    <div className="rounded-md border border-dashed border-[#cfd6e5] bg-white px-3 py-8 text-center text-[12px] font-bold text-[#747b8a]">
                      No inspection reports uploaded yet.
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
                <h2 className="text-[15px] font-black text-[#1f2430]">Inspection Runs</h2>
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => loadQuotingData(selectedRunId)}
                  className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[#273f7a] transition hover:bg-[#edf2fb] disabled:opacity-60"
                >
                  Reload
                </button>
              </div>
              <select
                value={selectedRunId}
                onChange={(event) => setSelectedRunId(event.currentTarget.value)}
                className="w-full rounded-md border border-[#cfd6e5] bg-white px-3 py-2 text-[13px] font-bold text-[#1f2430] outline-none focus:border-[#273f7a]"
              >
                <option value={allReportsRunId}>All Reports - Recently changed first</option>
                {runGroups.map((runGroup) => (
                  <option key={runGroup.id} value={runGroup.id}>
                    {runGroup.sourceFileName} - {formatStatus(runGroup.status)}
                  </option>
                ))}
              </select>
            </section>
          </div>

          <section className="min-w-0 overflow-hidden rounded-md border border-[#dfe4ef] bg-white shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
              <div className="flex flex-col justify-between gap-3 border-b border-[#dfe4ef] bg-[#fbfcff] px-5 py-4 lg:flex-row lg:items-center">
                <div className="min-w-0">
                  <h2 className="text-[20px] font-black tracking-normal text-[#1f2430]">
                    {selectedRunId === allReportsRunId ? 'All Quote Reports' : selectedRunGroup?.sourceFileName ?? 'Quote Reports'}
                  </h2>
                  <p className="mt-1 text-[13px] font-semibold text-[#747b8a]">
                    {selectedRunId === allReportsRunId
                      ? 'All uploaded quote reports, sorted by newest changed first.'
                      : 'Showing reports from the selected inspection run, sorted by highest repair and safety count first.'}
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
                    placeholder="Search D-number, job number, or file name..."
                    className="w-full rounded-md border border-[#cfd6e5] bg-white px-3 py-2 text-[13px] font-bold text-[#1f2430] outline-none transition placeholder:text-[#8b91a1] focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                  />
                  {selectedRunGroup && canUseExtendControls ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      {selectedRunGroup.extendWorkflowUrl ? (
                        <a
                          href={selectedRunGroup.extendWorkflowUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-xs font-black text-[#273f7a] transition hover:bg-[#edf2fb]"
                        >
                          Open Extend
                        </a>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => syncRunGroup(selectedRunGroup)}
                        className="rounded-md bg-[#273f7a] px-3 py-2 text-xs font-black text-white transition hover:bg-[#1f3262] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {activeStatuses.has(selectedRunGroup.status) ? 'Check Extend' : 'Refresh Selected'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="overflow-x-hidden">
                <table className="w-full table-fixed border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#dfe4ef] bg-[#f4f6fb] text-[11px] font-black uppercase text-[#747b8a]">
                      <th className="w-[45%] px-3 py-3">Job PDF</th>
                      <th className="w-[7%] px-1 py-3 text-center">Repairs</th>
                      <th className="w-[7%] px-1 py-3 text-center">Safety</th>
                      <th className="w-[7%] px-1 py-3 text-center">Total</th>
                      <th className="w-[34%] px-3 py-3 text-center">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobsListLoading ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-16">
                          <div className="mx-auto flex max-w-xs flex-col items-center justify-center text-center">
                            <div className="h-9 w-9 animate-spin rounded-full border-4 border-[#dfe4ef] border-t-[#273f7a]" />
                            <p className="mt-4 text-sm font-black text-[#1f2430]">Loading quote jobs...</p>
                            <p className="mt-1 text-xs font-semibold text-[#747b8a]">
                              Preparing the selected report list.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : paginatedItems.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-[#e4e8f1] transition hover:bg-[#fbfcff] last:border-b-0"
                      >
                        <td className="px-3 py-4 align-top">
                          <p className="whitespace-normal break-words text-sm font-black leading-snug text-[#1f2430]">
                            {item.documentName}
                          </p>
                          {item.splitIdentifier ? (
                            <p className="mt-1 whitespace-normal break-words text-xs font-semibold leading-snug text-[#747b8a]">
                              {item.splitIdentifier}
                            </p>
                          ) : null}
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
                          {item.pdfStoragePath || item.pdfUrl ? (
                            <div className="flex flex-nowrap justify-center gap-2">
                              <button
                                type="button"
                                disabled={openingItemId === item.id}
                                onClick={() => openItemPdf(item)}
                                className="inline-flex whitespace-nowrap rounded-md border border-[#bdc4d3] bg-white px-2 py-2 text-[11px] font-black text-[#273f7a] transition hover:bg-[#edf2fb] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {openingItemId === item.id ? 'Opening...' : 'Open PDF'}
                              </button>
                              <button
                                type="button"
                                onClick={() => navigate(`/editable-inspection-report?jobsQuotingItemId=${encodeURIComponent(item.id)}`)}
                                className="inline-flex whitespace-nowrap rounded-md bg-[#273f7a] px-2 py-2 text-[11px] font-black text-white transition hover:bg-[#1f3262]"
                              >
                                Edit Quote
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-[#747b8a]">Saved</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!jobsListLoading && filteredItems.length === 0 ? (
                  <div className="px-5 py-16 text-center">
                    <p className="text-base font-black text-[#1f2430]">{searchQuery.trim() ? 'No matching quote reports.' : 'No repair jobs yet.'}</p>
                    <p className="mt-2 text-sm font-semibold text-[#747b8a]">
                      {searchQuery.trim()
                        ? 'Try searching another D-number, job number, or file name.'
                        : 'Upload a report, then check Extend once splitting and extraction are complete.'}
                    </p>
                  </div>
                ) : null}

                {!jobsListLoading && filteredItems.length > 0 ? (
                  <div className="flex flex-col gap-3 border-t border-[#dfe4ef] bg-[#fbfcff] px-5 py-4 text-[12px] font-bold text-[#747b8a] sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Showing {pageFirstItem}-{pageLastItem} of {filteredItems.length} reports
                    </span>
                    {filteredItems.length > reportsPerPage ? (
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
