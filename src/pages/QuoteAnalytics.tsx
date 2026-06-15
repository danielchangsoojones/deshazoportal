import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import DNumberSearchBar from '../components/DNumberSearchBar'
import ProfileMenu from '../components/ProfileMenu'
import { isConfigured, supabase } from '../lib/supabase'
import {
  getJobsQuotingItemResults,
  getJobsQuotingItemsForRuns,
  getJobsQuotingRuns,
  type JobsQuotingItem,
  type JobsQuotingItemResult,
  type JobsQuotingItemResultStatus,
} from '../lib/jobsQuoting'

type AnalyticsRow = {
  item: JobsQuotingItem
  result: JobsQuotingItemResult | null
  status: JobsQuotingItemResultStatus
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

function formatMoney(value: number | null | undefined) {
  if (value == null) return '-'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

function getExtractionValue(data: Record<string, unknown>, key: string) {
  const field = data[key]
  if (field && typeof field === 'object' && 'value' in field) {
    const value = (field as { value?: unknown }).value
    return value == null ? '' : String(value)
  }

  return field == null ? '' : String(field)
}

function getItemJobNumber(item: JobsQuotingItem) {
  return (item.jobNumber || getExtractionValue(item.extractionData, 'job_number')).trim()
}

function getItemDNumber(item: JobsQuotingItem) {
  return (item.dNumber || getExtractionValue(item.extractionData, 'd_number')).trim()
}

function getItemFileName(item: JobsQuotingItem) {
  return (item.pdfFileName || item.sourceDocumentName || item.documentName).trim()
}

function formatStatus(status: JobsQuotingItemResultStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function getStatusClassName(status: JobsQuotingItemResultStatus) {
  if (status === 'won') return 'border-[#b9e4c6] bg-[#eaf8ef] text-[#17652b]'
  if (status === 'lost') return 'border-[#f0c4bd] bg-[#fff2ef] text-[#a2472f]'
  return 'border-[#d7deeb] bg-[#f4f6fb] text-[#5b606b]'
}

function getFriendlyErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Quote analytics could not be loaded.'
  const lowerMessage = message.toLowerCase()

  if (
    lowerMessage.includes('schema cache') ||
    lowerMessage.includes('could not find the table') ||
    lowerMessage.includes('jobs_quoting_item_results')
  ) {
    return 'Quote analytics tables are not installed yet. Apply supabase/jobs_quoting.sql to enable quote result reporting.'
  }

  return message
}

export default function QuoteAnalytics() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [rows, setRows] = useState<AnalyticsRow[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | JobsQuotingItemResultStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()

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
    })
  }, [navigate])

  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    setMessage('')

    try {
      const runs = await getJobsQuotingRuns()
      const runIds = runs.map((run) => run.id)
      const items = runIds.length > 0 ? await getJobsQuotingItemsForRuns(runIds) : []
      const results = items.length > 0 ? await getJobsQuotingItemResults(items.map((item) => item.id)) : []
      const resultsByItemId = new Map(results.map((result) => [result.jobQuoteItemId, result]))
      setRows(
        items.map((item) => {
          const result = resultsByItemId.get(item.id) ?? null
          return {
            item,
            result,
            status: result?.winStatus ?? 'pending',
          }
        }),
      )
    } catch (error) {
      setMessage(getFriendlyErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) loadAnalytics()
  }, [loadAnalytics, user])

  const filteredRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (!normalizedQuery) return true

      const haystack = [
        getItemJobNumber(row.item),
        getItemDNumber(row.item),
        getItemFileName(row.item),
        row.item.jobType,
        row.status,
      ].join(' ').toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [rows, searchQuery, statusFilter])

  const summary = useMemo(() => {
    const wonRows = rows.filter((row) => row.status === 'won')
    const lostRows = rows.filter((row) => row.status === 'lost')
    const pendingRows = rows.filter((row) => row.status === 'pending')
    const amountWon = wonRows.reduce((total, row) => total + (row.result?.amountWon ?? 0), 0)
    const quotedWon = wonRows.reduce((total, row) => total + (row.result?.quoteTotalAmount ?? 0), 0)
    const quotedLost = lostRows.reduce((total, row) => total + (row.result?.quoteTotalAmount ?? 0), 0)

    return {
      wonCount: wonRows.length,
      lostCount: lostRows.length,
      pendingCount: pendingRows.length,
      amountWon,
      quotedWon,
      quotedLost,
    }
  }, [rows])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/quotelogin')
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--deshazo-text)]">
      <header className="sticky top-0 z-40 bg-[var(--deshazo-blue)] px-5 py-3 shadow-sm">
        <div className="flex w-full items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/deshazo-internal-dashboard')}
            className="rounded-md border border-white/30 bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-normal text-white transition hover:bg-white/20"
            aria-label="Home"
          >
            Home
          </button>

          <DNumberSearchBar />

          <ProfileMenu user={user} onSignOut={handleSignOut} />
        </div>
      </header>

      <main className="flex w-full items-stretch">
        <section className="min-w-0 flex-1 px-5 py-5 sm:px-8 lg:px-10">
          <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-[13px] font-black uppercase tracking-[0.02em] text-[#7d8391]">Internal Quote Tools</p>
              <h1 className="mt-1 text-[clamp(28px,3vw,42px)] font-black leading-tight text-[var(--deshazo-text)]">
                Quote Analytics
              </h1>
            </div>
            <button
              type="button"
              onClick={loadAnalytics}
              disabled={loading}
              className="inline-flex rounded-md border border-[var(--deshazo-border)] bg-white px-4 py-2 text-[13px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#edf2fb] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reload
            </button>
          </div>

          {message ? (
            <div className="mb-4 rounded-md border border-[#cfd9ef] bg-[#f4f7ff] px-4 py-3 text-[13px] font-bold text-[var(--deshazo-blue)]">
              {message}
            </div>
          ) : null}

          <section className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              ['Won', String(summary.wonCount), 'text-[#17652b]'],
              ['Lost', String(summary.lostCount), 'text-[#a2472f]'],
              ['Pending', String(summary.pendingCount), 'text-[#5b606b]'],
              ['Amount Won', formatMoney(summary.amountWon), 'text-[#17652b]'],
              ['Quoted Won', formatMoney(summary.quotedWon), 'text-[var(--deshazo-blue)]'],
              ['Quoted Lost', formatMoney(summary.quotedLost), 'text-[#a2472f]'],
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-md border border-[var(--deshazo-border)] bg-white px-4 py-3 shadow-[0_14px_34px_-30px_rgba(47,86,166,0.35)]">
                <p className="text-[11px] font-black uppercase text-[#747b8a]">{label}</p>
                <p className={`mt-1 text-[22px] font-black ${color}`}>{loading ? '...' : value}</p>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-md border border-[var(--deshazo-border)] bg-white shadow-[0_24px_70px_-46px_rgba(17,24,39,0.35)]">
            <div className="flex flex-col justify-between gap-3 border-b border-[var(--deshazo-border)] bg-[#fbfcff] px-5 py-4 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-[20px] font-black text-[var(--deshazo-text)]">Quote Items</h2>
                <p className="mt-1 text-[13px] font-semibold text-[#747b8a]">
                  Won, lost, and pending quote result records.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.currentTarget.value as typeof statusFilter)}
                  className="rounded-md border border-[#cfd6e5] bg-white px-3 py-2 text-[13px] font-bold text-[#1f2430] outline-none focus:border-[var(--deshazo-blue)]"
                >
                  <option value="all">All statuses</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                  <option value="pending">Pending</option>
                </select>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.currentTarget.value)}
                  placeholder="Search job, D-number, file..."
                  className="min-w-[250px] rounded-md border border-[#cfd6e5] bg-white px-3 py-2 text-[13px] font-bold text-[#1f2430] outline-none transition placeholder:text-[#8b91a1] focus:border-[var(--deshazo-blue)] focus:ring-2 focus:ring-[#dbe5ff]"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--deshazo-border)] bg-[#f4f6fb] text-[11px] font-black uppercase text-[#747b8a]">
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Job</th>
                    <th className="px-4 py-3">D-number</th>
                    <th className="px-4 py-3">Quote Item</th>
                    <th className="px-4 py-3 text-right">Quote Total</th>
                    <th className="px-4 py-3 text-right">Amount Won</th>
                    <th className="px-4 py-3">Result Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-16 text-center">
                        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-[#dfe4ef] border-t-[var(--deshazo-blue)]" />
                        <p className="mt-4 text-sm font-black text-[var(--deshazo-text)]">Loading quote analytics...</p>
                      </td>
                    </tr>
                  ) : filteredRows.map((row) => (
                    <tr key={row.item.id} className="border-b border-[#e4e8f1] transition hover:bg-[#fbfcff] last:border-b-0">
                      <td className="px-4 py-3 align-top">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[12px] font-black ${getStatusClassName(row.status)}`}>
                          {formatStatus(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-[13px] font-black text-[var(--deshazo-text)]">
                        {getItemJobNumber(row.item) || '-'}
                      </td>
                      <td className="px-4 py-3 align-top text-[13px] font-black text-[var(--deshazo-text)]">
                        {getItemDNumber(row.item) || '-'}
                      </td>
                      <td className="max-w-[360px] px-4 py-3 align-top">
                        <p className="truncate text-[13px] font-bold text-[var(--deshazo-text)]" title={getItemFileName(row.item)}>
                          {getItemFileName(row.item)}
                        </p>
                        <p className="mt-1 text-[12px] font-semibold text-[#747b8a]">
                          {row.item.jobType || 'Inspection'} • {row.item.priorityCount} item{row.item.priorityCount === 1 ? '' : 's'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right align-top text-[13px] font-black text-[var(--deshazo-blue)]">
                        {formatMoney(row.result?.quoteTotalAmount)}
                      </td>
                      <td className="px-4 py-3 text-right align-top text-[13px] font-black text-[#17652b]">
                        {formatMoney(row.result?.amountWon)}
                      </td>
                      <td className="px-4 py-3 align-top text-[12px] font-bold text-[#5b606b]">
                        {row.result ? formatDate(row.result.updatedAt) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!loading && filteredRows.length === 0 ? (
                <div className="px-5 py-16 text-center">
                  <p className="text-base font-black text-[var(--deshazo-text)]">No quote items found.</p>
                  <p className="mt-2 text-sm font-semibold text-[#747b8a]">
                    Try another status filter or search term.
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}
