import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

type SteelQuoteStatus = 'won' | 'lost' | 'pending'

type SteelAnalyticsRow = {
  id: string
  status: SteelQuoteStatus
  jobNumber: string
  dNumber: string
  quoteItem: string
  jobType: string
  quoteTotalAmount: number
  amountWon: number | null
  updatedAt: string
}

const steelAnalyticsRows: SteelAnalyticsRow[] = [
  {
    id: 'steel-analytics-crossmember',
    status: 'pending',
    jobNumber: 'ST-270357',
    dNumber: 'D200235',
    quoteItem: 'Crossmember 94in DOMEX 700MCE.pdf',
    jobType: 'Laser cut and form',
    quoteTotalAmount: 5964,
    amountWon: null,
    updatedAt: '2026-06-15T18:30:00.000Z',
  },
  {
    id: 'steel-analytics-bracket',
    status: 'won',
    jobNumber: 'ST-270357',
    dNumber: 'D200241',
    quoteItem: 'Mounting bracket set rev B.pdf',
    jobType: 'Bracket kit',
    quoteTotalAmount: 5055,
    amountWon: 5055,
    updatedAt: '2026-06-15T17:40:00.000Z',
  },
  {
    id: 'steel-analytics-guard-panel',
    status: 'won',
    jobNumber: 'ST-270411',
    dNumber: 'D200318',
    quoteItem: 'Guard rail panel assembly.pdf',
    jobType: 'Guard rail assembly',
    quoteTotalAmount: 7416,
    amountWon: 7416,
    updatedAt: '2026-06-15T15:25:00.000Z',
  },
  {
    id: 'steel-analytics-access-plate',
    status: 'lost',
    jobNumber: 'ST-270428',
    dNumber: 'D200326',
    quoteItem: 'Access plate nest drawing.pdf',
    jobType: 'Plate nesting',
    quoteTotalAmount: 5292,
    amountWon: null,
    updatedAt: '2026-06-14T18:05:00.000Z',
  },
  {
    id: 'steel-analytics-lift-arm',
    status: 'pending',
    jobNumber: 'ST-270512',
    dNumber: 'D200352',
    quoteItem: 'Lift arm weldment drawing.pdf',
    jobType: 'Weldment',
    quoteTotalAmount: 12840,
    amountWon: null,
    updatedAt: '2026-06-13T20:15:00.000Z',
  },
]

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

function formatStatus(status: SteelQuoteStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function getStatusClassName(status: SteelQuoteStatus) {
  if (status === 'won') return 'border-[#b9e4c6] bg-[#eaf8ef] text-[#17652b]'
  if (status === 'lost') return 'border-[#f0c4bd] bg-[#fff2ef] text-[#a2472f]'
  return 'border-[#d7deeb] bg-[#f4f6fb] text-[#5b606b]'
}

export default function SteelQuoteAnalytics() {
  const [statusFilter, setStatusFilter] = useState<'all' | SteelQuoteStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()

  const filteredRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return steelAnalyticsRows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (!normalizedQuery) return true

      return [
        row.jobNumber,
        row.dNumber,
        row.quoteItem,
        row.jobType,
        row.status,
      ].join(' ').toLowerCase().includes(normalizedQuery)
    })
  }, [searchQuery, statusFilter])

  const summary = useMemo(() => {
    const wonRows = steelAnalyticsRows.filter((row) => row.status === 'won')
    const lostRows = steelAnalyticsRows.filter((row) => row.status === 'lost')
    const pendingRows = steelAnalyticsRows.filter((row) => row.status === 'pending')
    const amountWon = wonRows.reduce((total, row) => total + (row.amountWon ?? 0), 0)
    const quotedWon = wonRows.reduce((total, row) => total + row.quoteTotalAmount, 0)
    const quotedLost = lostRows.reduce((total, row) => total + row.quoteTotalAmount, 0)

    return {
      wonCount: wonRows.length,
      lostCount: lostRows.length,
      pendingCount: pendingRows.length,
      amountWon,
      quotedWon,
      quotedLost,
    }
  }, [])

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--deshazo-text)]">
      <header className="sticky top-0 z-40 bg-[var(--deshazo-blue)] px-5 py-3 shadow-sm">
        <div className="flex w-full items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/steel-demo-dashboard')}
            className="rounded-md border border-white/30 bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-normal text-white transition hover:bg-white/20"
            aria-label="Home"
          >
            Home
          </button>

          <div className="text-sm font-black tracking-wide text-white">Steel Quote Analytics</div>

          <button
            type="button"
            onClick={() => navigate('/steel-quoting-list')}
            className="rounded-md bg-white px-4 py-2 text-sm font-black text-[var(--deshazo-blue)] transition hover:bg-[#edf2fb]"
          >
            Quotes
          </button>
        </div>
      </header>

      <main className="flex w-full items-stretch">
        <section className="min-w-0 flex-1 px-5 py-5 sm:px-8 lg:px-10">
          <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-[13px] font-black uppercase tracking-[0.02em] text-[#7d8391]">Steel Demo Tools</p>
              <h1 className="mt-1 text-[clamp(28px,3vw,42px)] font-black leading-tight text-[var(--deshazo-text)]">
                Steel Quote Analytics
              </h1>
            </div>
          </div>

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
                <p className={`mt-1 text-[22px] font-black ${color}`}>{value}</p>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-md border border-[var(--deshazo-border)] bg-white shadow-[0_24px_70px_-46px_rgba(17,24,39,0.35)]">
            <div className="flex flex-col justify-between gap-3 border-b border-[var(--deshazo-border)] bg-[#fbfcff] px-5 py-4 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-[20px] font-black text-[var(--deshazo-text)]">Steel Quote Items</h2>
                <p className="mt-1 text-[13px] font-semibold text-[#747b8a]">
                  Dummy won, lost, and pending steel quote results.
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
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-[#e4e8f1] transition hover:bg-[#fbfcff] last:border-b-0">
                      <td className="px-4 py-3 align-top">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[12px] font-black ${getStatusClassName(row.status)}`}>
                          {formatStatus(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-[13px] font-black text-[var(--deshazo-text)]">{row.jobNumber}</td>
                      <td className="px-4 py-3 align-top text-[13px] font-black text-[var(--deshazo-text)]">{row.dNumber}</td>
                      <td className="max-w-[360px] px-4 py-3 align-top">
                        <p className="truncate text-[13px] font-bold text-[var(--deshazo-text)]" title={row.quoteItem}>
                          {row.quoteItem}
                        </p>
                        <p className="mt-1 text-[12px] font-semibold text-[#747b8a]">{row.jobType}</p>
                      </td>
                      <td className="px-4 py-3 text-right align-top text-[13px] font-black text-[var(--deshazo-blue)]">
                        {formatMoney(row.quoteTotalAmount)}
                      </td>
                      <td className="px-4 py-3 text-right align-top text-[13px] font-black text-[#17652b]">
                        {formatMoney(row.amountWon)}
                      </td>
                      <td className="px-4 py-3 align-top text-[12px] font-bold text-[#5b606b]">
                        {formatDate(row.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredRows.length === 0 ? (
                <div className="px-5 py-16 text-center">
                  <p className="text-base font-black text-[var(--deshazo-text)]">No steel quote items found.</p>
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
