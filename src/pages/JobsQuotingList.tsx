import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { supabase, isConfigured } from '../lib/supabase'
import {
  getJobsQuotingItems,
  getJobsQuotingItemPdfUrl,
  getJobsQuotingRuns,
  syncJobsQuotingRun,
  uploadInspectionForQuoting,
  type JobsQuotingItem,
  type JobsQuotingRun,
} from '../lib/jobsQuoting'
import {
  deleteEditableInspectionReport,
  getEditableInspectionReports,
  type EditableInspectionReport,
} from '../lib/editableInspectionReports'
import { getCurrentUserTag, type UserTag } from '../lib/userTags'

const activeStatuses = new Set(['uploading', 'pending', 'processing', 'needs_review'])
const inspectionRunsCollapsedStorageKey = 'deshazo-jobs-quoting-inspection-runs-collapsed'
const savedReportsCollapsedStorageKey = 'deshazo-jobs-quoting-saved-reports-collapsed'

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

  if (
    lowerMessage.includes('schema cache') ||
    lowerMessage.includes('could not find the table') ||
    lowerMessage.includes('relation "public.jobs_quoting_')
  ) {
    return 'Jobs quoting tables are not installed yet. Apply supabase/jobs_quoting.sql to enable saved quote runs.'
  }

  return message
}

function removeReportValueLabel(value: string) {
  return value.includes(':') ? value.split(':').slice(1).join(':').trim() : value.trim()
}

function getDNumberFromReport(reportData: Record<string, string>) {
  const reportText = Object.values(reportData).join(' ')
  const match = reportText.match(/\bD[\s-]*\d{3,}\b/i)
  return match ? match[0].replace(/[\s-]+/g, '').toUpperCase() : ''
}

function getEditableReportDisplayName(report: EditableInspectionReport) {
  const dNumber = getDNumberFromReport(report.reportData)
  const jobNumber = removeReportValueLabel(report.reportData.jobNumber ?? '').replace(/^#\s*/, '')
  const nameParts = [dNumber, jobNumber ? `Job #${jobNumber}` : ''].filter(Boolean)
  return nameParts.length > 0 ? nameParts.join(' - ') : report.reportName
}

export default function JobsQuotingList() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [userTag, setUserTag] = useState<UserTag | null>(null)
  const [runs, setRuns] = useState<JobsQuotingRun[]>([])
  const [items, setItems] = useState<JobsQuotingItem[]>([])
  const [savedReports, setSavedReports] = useState<EditableInspectionReport[]>([])
  const [savedReportsLoading, setSavedReportsLoading] = useState(false)
  const [savedReportsMessage, setSavedReportsMessage] = useState('')
  const [selectedRunId, setSelectedRunId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [openingItemId, setOpeningItemId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [inspectionRunsCollapsed, setInspectionRunsCollapsed] = useState(
    () => window.localStorage.getItem(inspectionRunsCollapsedStorageKey) === 'true',
  )
  const [savedReportsCollapsed, setSavedReportsCollapsed] = useState(
    () => window.localStorage.getItem(savedReportsCollapsedStorageKey) === 'true',
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const selectedRun = runs.find((run) => run.id === selectedRunId)
  const canUseExtendControls = userTag === 'developer'

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

  const loadQuotingData = useCallback(async (runId = selectedRunId) => {
    setLoading(true)
    setMessage('')

    try {
      const [nextRuns, nextItems] = await Promise.all([
        getJobsQuotingRuns(),
        getJobsQuotingItems(runId || undefined),
      ])

      setRuns(nextRuns)
      setItems(nextItems)

      if (!runId && nextRuns[0]?.id) {
        setSelectedRunId(nextRuns[0].id)
      }
    } catch (error) {
      setMessage(getFriendlyErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [selectedRunId])

  const loadSavedReports = useCallback(async () => {
    setSavedReportsLoading(true)
    setSavedReportsMessage('')

    try {
      const reports = await getEditableInspectionReports()
      setSavedReports(reports)
      setSavedReportsMessage(reports.length > 0 ? `${reports.length} saved editable report${reports.length === 1 ? '' : 's'}.` : 'No saved editable reports yet.')
    } catch (error) {
      setSavedReportsMessage(error instanceof Error ? error.message : 'Saved reports could not be loaded.')
    } finally {
      setSavedReportsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) {
      loadQuotingData()
      loadSavedReports()
      getCurrentUserTag(user.id)
        .then(setUserTag)
        .catch(() => setUserTag(null))
    }
  }, [loadQuotingData, loadSavedReports, user])

  useEffect(() => {
    if (user) {
      getJobsQuotingItems(selectedRunId || undefined)
        .then(setItems)
        .catch((error) => setMessage(getFriendlyErrorMessage(error)))
    }
  }, [selectedRunId, user])

  useEffect(() => {
    if (!user || !selectedRun || !activeStatuses.has(selectedRun.status) || busy) return

    let syncing = false
    let cancelled = false

    const refreshInterval = window.setInterval(async () => {
      if (syncing) return
      syncing = true

      try {
        const result = await syncJobsQuotingRun(selectedRun.id)
        if (cancelled) return

        setRuns((currentRuns) =>
          currentRuns.map((run) => (run.id === result.run.id ? result.run : run)),
        )
        setItems(result.items)
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
  }, [busy, selectedRun, selectedRunId, user])

  const uploadPdf = async (fileList: FileList | null) => {
    const file = Array.from(fileList ?? []).find((currentFile) => currentFile.name.toLowerCase().endsWith('.pdf'))
    if (!file) {
      setMessage('Choose a PDF inspection report to upload.')
      return
    }

    setBusy(true)
    setMessage(`Sending ${file.name} to Extend for splitting.`)

    try {
      const result = await uploadInspectionForQuoting(file)
      setRuns((currentRuns) => [result.run, ...currentRuns.filter((run) => run.id !== result.run.id)])
      setSelectedRunId(result.run.id)
      setItems(result.items)
      setMessage(result.message ?? 'Inspection report sent to Extend.')
    } catch (error) {
      setMessage(getFriendlyErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const syncRun = async (runId: string) => {
    setBusy(true)
    setMessage('Checking Extend for split reports and extracted repair items.')

    try {
      const result = await syncJobsQuotingRun(runId)
      setRuns((currentRuns) =>
        currentRuns.map((run) => (run.id === result.run.id ? result.run : run)),
      )
      setItems(result.items)
      setMessage(result.message ?? 'Quote jobs refreshed.')
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

      if (selectedRun?.id) {
        const result = await syncJobsQuotingRun(selectedRun.id)
        setRuns((currentRuns) =>
          currentRuns.map((run) => (run.id === result.run.id ? result.run : run)),
        )
        setItems(result.items)
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

  const openSavedReport = (report: EditableInspectionReport) => {
    navigate(`/editable-inspection-report?editableReportId=${encodeURIComponent(report.id)}`)
  }

  const deleteSavedReport = async (report: EditableInspectionReport) => {
    const reportName = getEditableReportDisplayName(report)
    if (!window.confirm(`Delete saved report "${reportName}"?`)) return

    setSavedReportsLoading(true)
    setSavedReportsMessage(`Deleting ${reportName}.`)

    try {
      await deleteEditableInspectionReport(report.id)
      setSavedReports((currentReports) => currentReports.filter((currentReport) => currentReport.id !== report.id))
      setSavedReportsMessage(`Deleted ${reportName}.`)
    } catch (error) {
      setSavedReportsMessage(error instanceof Error ? error.message : 'Saved report could not be deleted.')
    } finally {
      setSavedReportsLoading(false)
    }
  }

  const toggleInspectionRunsCollapsed = () => {
    setInspectionRunsCollapsed((currentCollapsed) => {
      const nextCollapsed = !currentCollapsed
      window.localStorage.setItem(inspectionRunsCollapsedStorageKey, String(nextCollapsed))
      return nextCollapsed
    })
  }

  const toggleSavedReportsCollapsed = () => {
    setSavedReportsCollapsed((currentCollapsed) => {
      const nextCollapsed = !currentCollapsed
      window.localStorage.setItem(savedReportsCollapsedStorageKey, String(nextCollapsed))
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

  const totalRepairItems = items.reduce((total, item) => total + item.repairCount, 0)
  const totalSafetyItems = items.reduce((total, item) => total + item.safetyCount, 0)

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

        <div className="flex items-center gap-2">
          <div className="hidden rounded-md border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold md:block">
            {user.email}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => {
              uploadPdf(event.currentTarget.files)
              event.currentTarget.value = ''
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md bg-white px-4 py-2 text-sm font-black text-[#35245f] transition hover:bg-[#f3efff] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Upload PDF
          </button>
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
                  {runs.map((run) => (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => setSelectedRunId(run.id)}
                      className={`w-full rounded-md border px-3 py-3 text-left shadow-[0_8px_20px_-18px_rgba(31,36,48,0.45)] transition ${
                        selectedRunId === run.id
                          ? 'border-[#9bb0dc] bg-[#f5f7ff]'
                          : 'border-[#dde3ef] bg-white hover:border-[#9bb0dc] hover:bg-[#f5f7ff]'
                      }`}
                    >
                      <span className="block truncate text-[13px] font-black leading-tight text-[#273f7a]">
                        {run.sourceFileName}
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-2 text-[12px] font-bold text-[#747b8a]">
                        <span>{formatDate(run.createdAt)}</span>
                        <span className="rounded-sm bg-[#eef3ff] px-2 py-1 text-[10px] font-black uppercase text-[#273f7a]">
                          {formatStatus(run.status)}
                        </span>
                      </span>
                    </button>
                  ))}

                  {!loading && runs.length === 0 ? (
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
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => {
              uploadPdf(event.currentTarget.files)
              event.currentTarget.value = ''
            }}
          />

          <div className="mb-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-[clamp(24px,2.4vw,34px)] font-black leading-tight tracking-normal text-[#1f2430]">
                Jobs Quoting List
              </h1>
              <p className="mt-2 max-w-[72ch] text-[15px] font-semibold leading-6 text-[#5b606b]">
                Upload a full Deshazo inspection report, send it to Extend for splitting and extraction, then review only the split reports that contain repair or safety items.
              </p>
            </div>

            <div className="grid min-w-[280px] grid-cols-2 overflow-hidden rounded-md border border-[#dfe4ef] bg-white shadow-[0_16px_44px_-36px_rgba(15,23,42,0.55)]">
              <div className="border-r border-[#dfe4ef] px-4 py-3">
                <p className="text-[11px] font-black uppercase text-[#747b8a]">Repairs</p>
                <p className="mt-1 text-2xl font-black text-[#273f7a]">{totalRepairItems}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] font-black uppercase text-[#747b8a]">Safety</p>
                <p className="mt-1 text-2xl font-black text-[#a2472f]">{totalSafetyItems}</p>
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
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.sourceFileName} - {formatStatus(run.status)}
                  </option>
                ))}
              </select>
            </section>
          </div>

          <section className="min-w-0 overflow-hidden rounded-md border border-[#dfe4ef] bg-white shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
              <div className="flex flex-col justify-between gap-3 border-b border-[#dfe4ef] bg-[#fbfcff] px-5 py-4 lg:flex-row lg:items-center">
                <div className="min-w-0">
                  <h2 className="truncate text-[20px] font-black tracking-normal text-[#1f2430]">
                    {selectedRun?.sourceFileName ?? 'Repair and Safety Jobs'}
                  </h2>
                  <p className="mt-1 text-[13px] font-semibold text-[#747b8a]">
                    Sorted by the split reports with the most repair and safety items.
                  </p>
                </div>

                {selectedRun && canUseExtendControls ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedRun.extendWorkflowUrl ? (
                      <a
                        href={selectedRun.extendWorkflowUrl}
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
                      onClick={() => syncRun(selectedRun.id)}
                      className="rounded-md bg-[#273f7a] px-3 py-2 text-xs font-black text-white transition hover:bg-[#1f3262] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {activeStatuses.has(selectedRun.status) ? 'Check Extend' : 'Refresh Jobs'}
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="overflow-x-hidden">
                <table className="w-full table-fixed border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#dfe4ef] bg-[#f4f6fb] text-[11px] font-black uppercase text-[#747b8a]">
                      <th className="w-[31%] px-3 py-3">Job PDF</th>
                      <th className="w-[17%] px-2 py-3">Type</th>
                      <th className="w-[9%] px-2 py-3 text-right">Repairs</th>
                      <th className="w-[9%] px-2 py-3 text-right">Safety</th>
                      <th className="w-[8%] px-2 py-3 text-right">Total</th>
                      <th className="w-[26%] px-3 py-3">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-[#e4e8f1] transition hover:bg-[#fbfcff] last:border-b-0"
                      >
                        <td className="px-3 py-4 align-top">
                          <p className="whitespace-normal break-words text-sm font-black leading-snug text-[#1f2430]">
                            {item.documentName}
                          </p>
                          <p className="mt-1 whitespace-normal break-words text-xs font-semibold leading-snug text-[#747b8a]">
                            {item.splitIdentifier || 'No split identifier'}
                          </p>
                        </td>
                        <td className="px-2 py-4 align-top text-sm font-bold text-[#4d5360]">
                          {item.splitType || 'Inspection split'}
                        </td>
                        <td className="px-2 py-4 text-right align-top text-lg font-black text-[#273f7a]">
                          {item.repairCount}
                        </td>
                        <td className="px-2 py-4 text-right align-top text-lg font-black text-[#a2472f]">
                          {item.safetyCount}
                        </td>
                        <td className="px-2 py-4 text-right align-top text-lg font-black text-[#111]">
                          {item.priorityCount}
                        </td>
                        <td className="px-3 py-4 align-top">
                          {item.pdfStoragePath || item.pdfUrl ? (
                            <div className="flex flex-nowrap gap-2">
                              <button
                                type="button"
                                disabled={openingItemId === item.id}
                                onClick={() => openItemPdf(item)}
                                className="inline-flex whitespace-nowrap rounded-md border border-[#bdc4d3] bg-white px-2.5 py-2 text-xs font-black text-[#273f7a] transition hover:bg-[#edf2fb] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {openingItemId === item.id ? 'Opening...' : 'Open PDF'}
                              </button>
                              <button
                                type="button"
                                onClick={() => navigate(`/editable-inspection-report?jobsQuotingItemId=${encodeURIComponent(item.id)}`)}
                                className="inline-flex whitespace-nowrap rounded-md bg-[#273f7a] px-2.5 py-2 text-xs font-black text-white transition hover:bg-[#1f3262]"
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

                {!loading && items.length === 0 ? (
                  <div className="px-5 py-16 text-center">
                    <p className="text-base font-black text-[#1f2430]">No repair jobs yet.</p>
                    <p className="mt-2 text-sm font-semibold text-[#747b8a]">
                      Upload a report, then check Extend once splitting and extraction are complete.
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
        </section>
        <aside
          className={`relative hidden shrink-0 flex-col border-l border-[#d9dce5] bg-[#fbfcff] shadow-sm transition-[width] duration-200 xl:flex ${
            savedReportsCollapsed ? 'w-[42px]' : 'w-[320px]'
          }`}
        >
          {savedReportsCollapsed ? (
            <button
              type="button"
              onClick={toggleSavedReportsCollapsed}
              className="flex h-full w-full items-center justify-center bg-white text-[#273f7a] transition hover:bg-[#f5f7ff]"
              aria-label="Open saved reports"
              title="Open saved reports"
            >
              <span className="[writing-mode:vertical-rl] rotate-180 text-[12px] font-black uppercase tracking-[0.12em]">
                Saved Reports
              </span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleSavedReportsCollapsed}
                className="absolute left-[-15px] top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[#d4dbea] bg-white text-[17px] font-black text-[#273f7a] shadow-sm transition hover:bg-[#f5f7ff]"
                aria-label="Hide saved reports"
                title="Hide saved reports"
              >
                ›
              </button>
              <div className="border-b border-[#dfe4ef] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[15px] font-black text-[#1f2430]">Saved Reports</h2>
                    <p className="mt-0.5 text-[11px] font-semibold text-[#747b8a]">Editable quote drafts</p>
                  </div>
                  <button
                    type="button"
                    onClick={loadSavedReports}
                    disabled={savedReportsLoading}
                    className="rounded-md border border-[#bdc4d3] bg-white px-2.5 py-1.5 text-[11px] font-black text-[#273f7a] transition hover:bg-[#edf2fb] disabled:cursor-wait disabled:opacity-60"
                  >
                    Reload
                  </button>
                </div>
                <div
                  className={`mt-3 rounded-md border px-3 py-2 text-[11px] font-bold leading-tight ${
                    savedReportsMessage.toLowerCase().includes('could not') || savedReportsMessage.toLowerCase().includes('failed')
                      ? 'border-[#f3c7c7] bg-[#fff5f5] text-[#9f1d1d]'
                      : 'border-[#cfe6d5] bg-[#f3fbf5] text-[#286239]'
                  }`}
                >
                  {savedReportsLoading ? 'Loading saved editable reports.' : savedReportsMessage || 'Saved editable reports will appear here.'}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
                {savedReportsLoading && savedReports.length === 0 ? (
                  <div className="rounded-md border border-[#dfe4ef] bg-white px-3 py-5 text-center text-[12px] font-bold text-[#747b8a]">
                    Loading saved reports...
                  </div>
                ) : savedReports.length > 0 ? (
                  <div className="space-y-2">
                    {savedReports.map((savedReport) => {
                      const displayName = getEditableReportDisplayName(savedReport)

                      return (
                        <div
                          key={savedReport.id}
                          className="relative rounded-md border border-[#dfe4ef] bg-white transition hover:bg-[#f4f6fb]"
                        >
                          <button
                            type="button"
                            onClick={() => openSavedReport(savedReport)}
                            disabled={savedReportsLoading}
                            className="w-full px-3 py-2 pr-10 text-left disabled:cursor-wait disabled:opacity-65"
                          >
                            <span className="block whitespace-normal break-words text-[13px] font-black leading-snug text-[#1f2430]">
                              {displayName}
                            </span>
                            <span className="mt-1 block whitespace-normal break-words text-[11px] font-semibold leading-snug text-[#747b8a]">
                              {savedReport.sourceDocumentName}
                            </span>
                            <span className="mt-2 block text-[10px] font-black uppercase text-[#8b91a1]">
                              {formatDate(savedReport.updatedAt)}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSavedReport(savedReport)}
                            disabled={savedReportsLoading}
                            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md border border-[#e0b8b8] bg-white text-[13px] font-black leading-none text-[#a82727] transition hover:border-[#d98b8b] hover:bg-[#fff5f5] disabled:cursor-wait disabled:opacity-60"
                            aria-label={`Delete ${displayName}`}
                            title={`Delete ${displayName}`}
                          >
                            x
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
            </>
          )}
        </aside>
      </main>
    </div>
  )
}
