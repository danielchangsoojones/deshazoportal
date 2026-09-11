import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import DNumberSearchBar from '../components/DNumberSearchBar'
import ProfileMenu from '../components/ProfileMenu'
import { useCustomerPath } from '../lib/customerRouting'
import { isConfigured, supabase } from '../lib/supabase'
import {
  getWabashLocationMismatchReport,
  type WabashLocationMismatchJob,
  type WabashLocationMismatchReport,
} from '../lib/wabashLocationMismatch'

type JobFilter = 'phoenix_branch' | 'phoenix_location' | 'phoenix_jonestown' | 'mismatches' | 'all'

function formatDate(value: string) {
  if (!value) return '-'
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function getJobDate(job: WabashLocationMismatchJob) {
  return job.startDate || job.endDate || job.completedAt
}

function getMismatchLabel(type: WabashLocationMismatchJob['mismatchType']) {
  if (type === 'phoenix_az_location') return 'Phoenix, AZ ship-to'
  if (type === 'phoenix_jonestown') return 'Phoenix / Jonestown'
  if (type === 'phoenix_non_arizona') return 'Phoenix branch, non-AZ site'
  if (type === 'branch_city_differs') return 'Branch/location differ'
  return 'Same city'
}

function getMismatchClassName(type: WabashLocationMismatchJob['mismatchType']) {
  if (type === 'phoenix_az_location') return 'border-[#b9e4c6] bg-[#eaf8ef] text-[#17652b]'
  if (type === 'phoenix_jonestown') return 'border-[#f0b9b2] bg-[#fff0ed] text-[#9f2f1f]'
  if (type === 'phoenix_non_arizona') return 'border-[#f4d28b] bg-[#fff7e6] text-[#8d5b00]'
  if (type === 'branch_city_differs') return 'border-[#ccd6e6] bg-[#f4f7fb] text-[#556070]'
  return 'border-[#b9e4c6] bg-[#eaf8ef] text-[#17652b]'
}

function downloadCsv(rows: WabashLocationMismatchJob[]) {
  const columns = [
    'work_order_id',
    'job_no',
    'sales_order_no',
    'job_type',
    'status',
    'branch',
    'customer_location',
    'ship_to_city',
    'ship_to_state',
    'bill_to_location',
    'customer_po',
    'comment',
    'start_date',
    'end_date',
    'completed_at',
    'mismatch_type',
  ]
  const escapeValue = (value: unknown) => {
    const text = value == null ? '' : String(value)
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const csv = [
    columns.join(','),
    ...rows.map((row) =>
      [
        row.workOrderId,
        row.jobNo,
        row.salesOrderNo,
        row.jobType,
        row.statusName,
        row.branchName,
        row.locationName,
        row.locationCity,
        row.locationState,
        row.billToLocation,
        row.customerPoNo,
        row.comment,
        row.startDate,
        row.endDate,
        row.completedAt,
        row.mismatchType,
      ].map(escapeValue).join(','),
    ),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `wabash-location-mismatch-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export default function WabashLocationMismatch() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [report, setReport] = useState<WabashLocationMismatchReport | null>(null)
  const [filter, setFilter] = useState<JobFilter>('phoenix_branch')
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()
  const customerPath = useCustomerPath()

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

  const loadReport = useCallback(async () => {
    setLoading(true)
    setMessage('')

    try {
      const nextReport = await getWabashLocationMismatchReport()
      setReport(nextReport)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Wabash location dashboard could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) void loadReport()
  }, [loadReport, user])

  const filteredJobs = useMemo(() => {
    const rows = report?.jobs ?? []
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return rows.filter((job) => {
      if (filter === 'phoenix_branch' && !job.branchKey.includes('phoenix')) return false
      if (filter === 'phoenix_location' && !job.isPhoenixAzLocation) return false
      if (filter === 'phoenix_jonestown' && job.mismatchType !== 'phoenix_jonestown') return false
      if (filter === 'mismatches' && job.mismatchType === 'same_city') return false
      if (normalizedQuery) {
        const haystack = [
          job.workOrderId,
          job.jobNo,
          job.salesOrderNo,
          job.jobType,
          job.statusName,
          job.branchName,
          job.locationName,
          job.locationCity,
          job.locationState,
          job.customerPoNo,
          job.comment,
        ].join(' ').toLowerCase()
        if (!haystack.includes(normalizedQuery)) return false
      }
      return true
    })
  }, [filter, report?.jobs, searchQuery])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/quotelogin')
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="rounded-2xl border border-[var(--deshazo-border)] bg-white px-6 py-4 text-sm font-semibold text-[var(--deshazo-blue)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
          Loading Wabash location dashboard...
        </div>
      </div>
    )
  }

  if (!user) return null

  const generatedAt = report?.generatedAt ? new Date(report.generatedAt).toLocaleString() : ''

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--deshazo-text)]">
      <header className="sticky top-0 z-40 bg-[var(--deshazo-blue)] px-5 py-3 shadow-sm">
        <div className="flex w-full items-center justify-between gap-4">
          <div className="rounded-md border border-white/30 bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-normal text-white">
            Wabash Location Audit
          </div>

          <DNumberSearchBar />

          <ProfileMenu user={user} onSignOut={handleSignOut} />
        </div>
      </header>

      <main className="px-5 py-5 sm:px-8 lg:px-10">
        <div className="mb-7 flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.02em] text-[#8b92a4]">Wabash location audit</p>
            <h1 className="mt-2 text-[clamp(32px,4vw,52px)] font-black leading-[0.96] text-[var(--deshazo-text)]">
              Branch vs Job City
            </h1>
            <p className="mt-3 max-w-[76ch] text-base leading-7 text-[rgba(21,24,33,0.72)]">
              Focused on Wabash data tied to Phoenix: true Phoenix, AZ ship-to locations first, then jobs assigned to DeShazo branch 040 Phoenix.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={loadReport}
              className="rounded-md border border-[var(--deshazo-border)] bg-white px-4 py-2 text-sm font-black text-[var(--deshazo-blue)] transition hover:bg-[#edf2fb]"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => downloadCsv(filteredJobs)}
              disabled={filteredJobs.length === 0}
              className="rounded-md bg-[var(--deshazo-blue)] px-4 py-2 text-sm font-black text-white transition hover:bg-[var(--deshazo-blue-deep)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download CSV
            </button>
          </div>
        </div>

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            ['Wabash jobs', report?.totalJobs ?? 0],
            ['Phoenix, AZ ship-to', report?.phoenixAzLocationJobs ?? 0],
            ['040 Phoenix branch jobs', report?.phoenixBranchJobs ?? 0],
            ['Phoenix + Jonestown', report?.phoenixJonestownJobs ?? 0],
            ['Phoenix + non-AZ', report?.phoenixNonArizonaJobs ?? 0],
            ['Branch/city differences', report?.mismatchJobs ?? 0],
          ].map(([label, value]) => (
            <article
              key={label}
              className="rounded-lg border border-[var(--deshazo-border)] bg-white px-5 py-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.22)]"
            >
              <p className="text-[12px] font-black uppercase tracking-[0.04em] text-[#8b92a4]">{label}</p>
              <p className="mt-2 text-3xl font-black text-[var(--deshazo-text)]">{value}</p>
            </article>
          ))}
        </section>

        {message ? (
          <div className="mb-6 rounded-lg border border-[#f0c4bd] bg-[#fff2ef] px-4 py-3 text-sm font-semibold text-[#a2472f]">
            {message}
          </div>
        ) : null}

        {!loading && report?.phoenixAzLocationJobs === 0 ? (
          <div className="mb-6 rounded-lg border border-[#f4d28b] bg-[#fff7e6] px-4 py-3 text-sm font-semibold leading-6 text-[#7a5208]">
            No Wabash work orders in the synced data have a customer ship-to city of Phoenix, AZ. The Phoenix-related records currently come from service branch 040 Phoenix covering Moreno Valley, Perris, and two Jonestown rows.
          </div>
        ) : null}

        <section className="mb-6 grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <article className="overflow-hidden rounded-lg border border-[var(--deshazo-border)] bg-white shadow-[0_18px_40px_-34px_rgba(47,86,166,0.22)]">
            <div className="border-b border-[var(--deshazo-border)] px-5 py-4">
              <h2 className="text-xl font-black">040 Phoenix Branch Pairs</h2>
              <p className="mt-1 text-sm font-semibold text-[rgba(21,24,33,0.62)]">
                {generatedAt ? `Updated ${generatedAt}` : 'Grouped by Phoenix branch and ship-to location.'}
              </p>
            </div>
            <div className="max-h-[360px] overflow-auto">
              {(report?.phoenixPairSummaries ?? []).length === 0 ? (
                <div className="px-5 py-8 text-sm font-semibold text-[rgba(21,24,33,0.62)]">
                  {loading ? 'Loading Phoenix pairs...' : 'No 040 Phoenix branch Wabash jobs found.'}
                </div>
              ) : (
                <table className="min-w-full border-collapse text-left">
                  <thead className="sticky top-0 bg-[var(--deshazo-surface)] text-[11px] font-black uppercase tracking-[0.04em] text-[#6f7788]">
                    <tr>
                      <th className="px-4 py-3">Branch</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3 text-right">Jobs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report?.phoenixPairSummaries ?? []).map((pair) => (
                      <tr key={pair.key} className="border-t border-[var(--deshazo-border)]">
                        <td className="px-4 py-3 text-sm font-extrabold text-[var(--deshazo-text)]">{pair.branchName}</td>
                        <td className="px-4 py-3 text-sm text-[rgba(21,24,33,0.7)]">{pair.locationLabel}</td>
                        <td className="px-4 py-3 text-right text-lg font-black text-[var(--deshazo-blue)]">{pair.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </article>

          <article className="overflow-hidden rounded-lg border border-[var(--deshazo-border)] bg-white shadow-[0_18px_40px_-34px_rgba(47,86,166,0.22)]">
            <div className="border-b border-[var(--deshazo-border)] px-5 py-4">
              <h2 className="text-xl font-black">Largest Difference Groups</h2>
              <p className="mt-1 text-sm font-semibold text-[rgba(21,24,33,0.62)]">
                Branch/location pairs where the service branch city differs from the customer ship-to city.
              </p>
            </div>
            <div className="max-h-[360px] overflow-auto">
              {(report?.branchPairSummaries ?? []).length === 0 ? (
                <div className="px-5 py-8 text-sm font-semibold text-[rgba(21,24,33,0.62)]">
                  {loading ? 'Loading difference groups...' : 'No branch/location differences found.'}
                </div>
              ) : (
                <table className="min-w-full border-collapse text-left">
                  <thead className="sticky top-0 bg-[var(--deshazo-surface)] text-[11px] font-black uppercase tracking-[0.04em] text-[#6f7788]">
                    <tr>
                      <th className="px-4 py-3">Branch</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3 text-right">Jobs</th>
                      <th className="px-4 py-3">Latest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report?.branchPairSummaries ?? []).slice(0, 20).map((pair) => (
                      <tr key={pair.key} className="border-t border-[var(--deshazo-border)]">
                        <td className="px-4 py-3 text-sm font-extrabold text-[var(--deshazo-text)]">{pair.branchName}</td>
                        <td className="px-4 py-3 text-sm text-[rgba(21,24,33,0.7)]">{pair.locationLabel}</td>
                        <td className="px-4 py-3 text-right text-lg font-black text-[var(--deshazo-blue)]">{pair.count}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-[rgba(21,24,33,0.62)]">{formatDate(pair.latestDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </article>
        </section>

        <section className="overflow-hidden rounded-lg border border-[var(--deshazo-border)] bg-white shadow-[0_18px_40px_-34px_rgba(47,86,166,0.22)]">
          <div className="flex flex-col gap-4 border-b border-[var(--deshazo-border)] px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-xl font-black">Work Orders</h2>
              <p className="mt-1 text-sm font-semibold text-[rgba(21,24,33,0.62)]">
                Showing {filteredJobs.length} matching rows.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ['phoenix_branch', '040 Phoenix branch'],
                ['phoenix_location', 'Phoenix, AZ ship-to'],
                ['phoenix_jonestown', 'Phoenix/Jonestown'],
                ['mismatches', 'All differences'],
                ['all', 'All Wabash'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value as JobFilter)}
                  className={`rounded-md border px-3 py-2 text-xs font-black uppercase tracking-normal transition ${
                    filter === value
                      ? 'border-[var(--deshazo-blue)] bg-[var(--deshazo-blue)] text-white'
                      : 'border-[var(--deshazo-border)] bg-white text-[var(--deshazo-blue)] hover:bg-[#edf2fb]'
                  }`}
                >
                  {label}
                </button>
              ))}
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                placeholder="Search jobs"
                className="min-h-9 w-full rounded-md border border-[var(--deshazo-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)] sm:w-[220px]"
              />
            </div>
          </div>

          {loading ? (
            <div className="px-6 py-10 text-center text-sm font-semibold text-[var(--deshazo-blue)]">
              Loading Wabash work orders...
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm font-semibold text-[rgba(21,24,33,0.64)]">
              No work orders match the selected filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left">
                <thead className="bg-[var(--deshazo-surface)] text-[11px] font-black uppercase tracking-[0.04em] text-[#6f7788]">
                  <tr>
                    <th className="min-w-[120px] px-5 py-4">Job</th>
                    <th className="min-w-[150px] px-5 py-4">Branch</th>
                    <th className="min-w-[180px] px-5 py-4">Ship-To</th>
                    <th className="min-w-[150px] px-5 py-4">Date</th>
                    <th className="min-w-[140px] px-5 py-4">Type</th>
                    <th className="min-w-[160px] px-5 py-4">Flag</th>
                    <th className="min-w-[260px] px-5 py-4">Comment</th>
                    <th className="min-w-[150px] px-5 py-4 text-right">Document</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((job) => {
                    const documentPath = customerPath(`/deshazo-work-orders?search=${encodeURIComponent(job.jobNo || String(job.workOrderId))}`)

                    return (
                      <tr key={job.workOrderId} className="border-t border-[var(--deshazo-border)]">
                        <td className="px-5 py-4">
                          <p className="font-black text-[var(--deshazo-text)]">{job.jobNo || job.workOrderId}</p>
                          <p className="mt-1 text-xs font-semibold text-[rgba(21,24,33,0.58)]">WO {job.workOrderId}</p>
                        </td>
                        <td className="px-5 py-4 text-sm font-extrabold text-[var(--deshazo-text)]">{job.branchName}</td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-extrabold text-[var(--deshazo-text)]">{job.locationName}</p>
                          <p className="mt-1 text-xs font-semibold text-[rgba(21,24,33,0.58)]">
                            {[job.locationCity, job.locationState].filter(Boolean).join(', ') || 'No ship-to city'}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-[rgba(21,24,33,0.72)]">{formatDate(getJobDate(job))}</td>
                        <td className="px-5 py-4 text-sm font-semibold text-[rgba(21,24,33,0.72)]">{job.jobType || '-'}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-normal ${getMismatchClassName(job.mismatchType)}`}>
                            {getMismatchLabel(job.mismatchType)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-[rgba(21,24,33,0.7)]">
                          <span className="line-clamp-2">{job.comment || '-'}</span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => navigate(documentPath)}
                            className="inline-flex items-center rounded-md border border-[var(--deshazo-border)] bg-white px-3 py-2 text-[12px] font-black uppercase tracking-normal text-[var(--deshazo-blue)] transition hover:bg-[#edf2fb]"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
