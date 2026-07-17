import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type DeshazoRecurringWorkOrder,
  type DeshazoRecurringWorkOrderAssignment,
  getDeshazoRecurringWorkOrders,
} from '../lib/deshazoRecurringWorkOrders'

type RecurringWorkOrdersProps = {
  serviceLocationId: number | null
  onOpenWorkOrder: (workOrderId: number) => void
}

function paginationPages(currentPage: number, totalPages: number) {
  const pages = new Set([1, totalPages])
  for (let page = Math.max(1, currentPage - 2); page <= Math.min(totalPages, currentPage + 2); page += 1) pages.add(page)
  return Array.from(pages).sort((left, right) => left - right)
}

function linkedWorkOrder(row: DeshazoRecurringWorkOrder, month: number) {
  const quarter = Math.floor((month - 1) / 3) + 1
  return (row.recurringWorkOrders ?? []).find((assignment) =>
    row.type === 'MONTHLY' ? assignment.month === month : assignment.quarter === quarter,
  )
}

function statusClass(status?: string | null) {
  const value = (status || '').toLowerCase()
  if (value.includes('invoice')) return 'border-[#b8c9f5] bg-[#eef3ff] text-[var(--deshazo-blue)]'
  if (value.includes('complete')) return 'border-[#b8dece] bg-[#edf8f3] text-[#367861]'
  if (value.includes('progress')) return 'border-[#d2c4ea] bg-[#f3effb] text-[#6d5298]'
  if (value.includes('scheduled')) return 'border-[#f6d58e] bg-[#fff7e8] text-[#a96d09]'
  return 'border-[#d3d8e2] bg-[#f4f6fa] text-[#616a78]'
}

function assignmentId(assignment?: DeshazoRecurringWorkOrderAssignment) {
  return assignment?.workOrder?.id || assignment?.workOrderId || null
}

export default function RecurringWorkOrders({ serviceLocationId, onOpenWorkOrder }: RecurringWorkOrdersProps) {
  const [rows, setRows] = useState<DeshazoRecurringWorkOrder[]>([])
  const [count, setCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [monthAnchor, setMonthAnchor] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1)
      setSubmittedSearch(search)
    }, 800)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => setPage(1), [pageSize, serviceLocationId])

  const loadRows = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getDeshazoRecurringWorkOrders({
        serviceLocationId,
        search: submittedSearch,
        page: page - 1,
        pageSize,
      })
      setRows(result.data)
      setCount(result.count)
      setTotalPages(result.totalPages)
      if (page > result.totalPages) setPage(result.totalPages)
    } catch (loadError) {
      setRows([])
      setCount(0)
      setTotalPages(1)
      setError(loadError instanceof Error ? loadError.message : 'There was an error with your request.')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, serviceLocationId, submittedSearch])

  useEffect(() => { void loadRows() }, [loadRows, refreshKey])

  const month = monthAnchor.getMonth() + 1
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(monthAnchor)
  const visiblePages = useMemo(() => paginationPages(page, totalPages), [page, totalPages])
  const moveMonth = (amount: number) => setMonthAnchor((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1))

  return (
    <div className="px-5 py-5 lg:px-7">
      <section className="overflow-hidden rounded-sm border border-[#d3dbea] bg-white shadow-[0_10px_28px_rgba(55,78,108,0.05)]">
        <header className="flex flex-col gap-4 border-b border-[#d3dbea] px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-semibold text-[var(--deshazo-text)]">Recurring Work Orders</h1>
            <span className="text-[12px] text-[#747b8a]">({loading ? '' : new Intl.NumberFormat('en-US').format(count)})</span>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block w-full sm:w-[280px]">
              <span className="sr-only">Search recurring work orders</span>
              <input value={search} maxLength={50} onChange={(event) => setSearch(event.target.value)} placeholder="Search for.." className="h-9 w-full rounded-md border border-[#c7d1e2] bg-white pl-3 pr-10 text-[12px] text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]" />
              <span aria-hidden="true" className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-r-md bg-[#647688] text-white">⌕</span>
            </label>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#bdc4d3] bg-white text-lg font-bold text-[var(--deshazo-blue)]">‹</button>
              <div className="flex h-9 min-w-[120px] items-center justify-center rounded-md border border-[#c7d1e2] bg-white px-4 text-[12px] font-semibold text-[var(--deshazo-text)]">{monthLabel}</div>
              <button type="button" aria-label="Next month" onClick={() => moveMonth(1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#bdc4d3] bg-white text-lg font-bold text-[var(--deshazo-blue)]">›</button>
            </div>
            <button type="button" aria-label="Refresh recurring work orders" onClick={() => setRefreshKey((value) => value + 1)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#647688] text-[18px] font-bold text-white hover:bg-[#536576]">↻</button>
          </div>
        </header>

        {error ? <p className="m-4 rounded-md border border-[#f0c8c8] bg-[#fdf1f1] px-4 py-3 text-[13px] font-semibold text-[#b23b3b]">{error}</p> : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] border-collapse text-left text-[12px]">
            <thead><tr className="border-b border-[#d3dbea] text-[11px] font-semibold text-[#747b8a]">
              {['Customer', 'Customer Location', 'Service Location', 'Job Type', 'Work Order #', 'Status', 'Actions'].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>)}
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="px-4 py-12 text-center font-semibold text-[#747b8a]">Loading recurring work orders...</td></tr> : rows.length ? rows.map((row) => {
                const assignment = linkedWorkOrder(row, month)
                const workOrder = assignment?.workOrder
                const workOrderId = assignmentId(assignment)
                return <tr key={row.id} className="border-b border-[#e2e8f2] odd:bg-[#f8fbff] hover:bg-[#eef4ff]">
                  <td className="max-w-[250px] truncate px-4 py-3 text-[var(--deshazo-text)]">{row.customer?.customerName || '-'}</td>
                  <td className="max-w-[300px] truncate px-4 py-3 text-[var(--deshazo-text)]">{row.customerLocation?.shipToAddress1 || '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--deshazo-text)]">{row.serviceLocation?.name || '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--deshazo-text)]">Inspection / {row.type === 'QUARTERLY' ? 'Quarterly' : 'Monthly'}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-[var(--deshazo-blue)]">{workOrderId ? <button type="button" onClick={() => onOpenWorkOrder(workOrderId)} className="hover:underline">{workOrder?.jobNo ? `#${workOrder.jobNo}` : `Without WO# (${workOrderId})`}</button> : '-'}</td>
                  <td className="px-4 py-3">{workOrder?.status?.name ? <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(workOrder.status.name)}`}>{workOrder.status.name}</span> : '-'}</td>
                  <td className="px-4 py-3">{workOrderId ? <button type="button" onClick={() => onOpenWorkOrder(workOrderId)} className="rounded-md bg-[var(--deshazo-blue)] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[var(--deshazo-blue-deep)]">Open</button> : <span className="text-[#747b8a]">-</span>}</td>
                </tr>
              }) : <tr><td colSpan={7} className="px-4 py-12 text-center text-[#747b8a]">No results</td></tr>}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-col gap-3 border-t border-[#d3dbea] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <select aria-label="Rows per page" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 w-[76px] rounded-md border border-[#c7d1e2] bg-white px-2 text-[12px] text-[var(--deshazo-text)]">
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
          <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1">
            <button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="h-8 rounded-md border border-[#bdc4d3] px-3 text-[12px] disabled:opacity-40">‹</button>
            {visiblePages.map((visiblePage, index) => <span key={visiblePage} className="contents">
              {visiblePages[index - 1] && visiblePage - visiblePages[index - 1] > 1 ? <span className="px-1 text-[#747b8a]">…</span> : null}
              <button type="button" aria-current={visiblePage === page ? 'page' : undefined} onClick={() => setPage(visiblePage)} className={`h-8 min-w-8 rounded-md border px-2 text-[12px] ${visiblePage === page ? 'border-[var(--deshazo-blue)] bg-[var(--deshazo-blue)] font-bold text-white' : 'border-[#bdc4d3] bg-white text-[#4d5360]'}`}>{visiblePage}</button>
            </span>)}
            <button type="button" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="h-8 rounded-md border border-[#bdc4d3] px-3 text-[12px] disabled:opacity-40">›</button>
          </nav>
        </footer>
      </section>
    </div>
  )
}
