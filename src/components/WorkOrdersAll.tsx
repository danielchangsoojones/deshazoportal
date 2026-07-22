import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type DeshazoWorkOrder,
  type DeshazoWorkOrderKpis,
  getDeshazoWorkOrderKpis,
  getDeshazoWorkOrderStatuses,
  getDeshazoWorkOrders,
} from '../lib/deshazoWorkOrders'

const DEFAULT_PAGE_SIZE = 25

type WorkOrdersAllProps = {
  serviceLocationId: number | null
  onOpenWorkOrder: (workOrderId: number) => void
  recent?: boolean
  statusName?: string
  listLabel?: string
}

function formatCount(value: number | undefined) {
  return new Intl.NumberFormat('en-US').format(value ?? 0)
}

function formatDate(value?: string | null) {
  if (!value) return 'N/A'
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value)
  if (!Number.isFinite(date.getTime())) return 'N/A'
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(date)
}

function formatDateRange(workOrder: DeshazoWorkOrder) {
  const start = formatDate(workOrder.startDate)
  return workOrder.endDate ? `${start} - ${formatDate(workOrder.endDate)}` : start
}

function formatAddress(workOrder: DeshazoWorkOrder) {
  const location = workOrder.customerLocation
  if (!location) return '-'
  const street = [location.shipToAddress1, location.shipToAddress2, location.shipToAddress3]
    .filter(Boolean)
    .join(', ')
  const cityState = [location.shipToCity, location.shipToState].filter(Boolean).join(', ')
  const locality = [cityState, location.shipToZipCode].filter(Boolean).join(', ')
  return street && locality ? `${street} - ${locality}` : street || locality || '-'
}

function assignedEmployees(workOrder: DeshazoWorkOrder) {
  return (workOrder.workOrderTrips ?? [])
    .slice()
    .sort((left, right) => (left.tripNumber ?? 0) - (right.tripNumber ?? 0))
    .map((trip) => ({
      tripNumber: trip.tripNumber,
      employees: (trip.workOrderEmployees ?? [])
        .filter((assignment) => !assignment.disabledAt)
        .map((assignment) => {
          const employee = assignment.employee
          if (!employee) return ''
          const first = employee.preferredName || employee.firstName || ''
          return [first, employee.lastName].filter(Boolean).join(' ')
        })
        .filter(Boolean),
    }))
}

function typeBadgeClass(jobType?: string | null) {
  const type = (jobType || '').toLowerCase()
  if (type.includes('inspection')) return 'border-[#b8c9f5] bg-[#eef3ff] text-[var(--deshazo-blue)]'
  if (type.includes('warranty')) return 'border-[#d3d8e2] bg-[#f4f6fa] text-[#616a78]'
  if (type.includes('service')) return 'border-[#b8dece] bg-[#edf8f3] text-[#367861]'
  return 'border-[#f6d58e] bg-[#fff7e8] text-[#a96d09]'
}

function paginationPages(currentPage: number, totalPages: number) {
  const pages = new Set([1, totalPages])
  for (let page = Math.max(1, currentPage - 2); page <= Math.min(totalPages, currentPage + 2); page += 1) {
    pages.add(page)
  }
  return Array.from(pages).sort((left, right) => left - right)
}

export default function WorkOrdersAll({ serviceLocationId, onOpenWorkOrder, recent = false, statusName, listLabel }: WorkOrdersAllProps) {
  const [workOrders, setWorkOrders] = useState<DeshazoWorkOrder[]>([])
  const [count, setCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [sortBy, setSortBy] = useState<string | null>('startDate')
  const [direction, setDirection] = useState<'asc' | 'desc' | null>('desc')
  const [kpis, setKpis] = useState<DeshazoWorkOrderKpis>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedAssignment, setSelectedAssignment] = useState<DeshazoWorkOrder | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1)
      setSubmittedSearch(search)
    }, 800)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [serviceLocationId, pageSize])

  useEffect(() => {
    let cancelled = false
    getDeshazoWorkOrderKpis(serviceLocationId)
      .then((data) => {
        if (!cancelled) setKpis(data)
      })
      .catch(() => {
        if (!cancelled) setKpis({})
      })
    return () => {
      cancelled = true
    }
  }, [serviceLocationId, refreshKey])

  const loadWorkOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Keep the status lookup in the read path to match production and warm the session data.
      const statuses = await getDeshazoWorkOrderStatuses()
      const statusId = statusName ? statuses.find((status) => status.name.toLowerCase() === statusName.toLowerCase())?.id : null
      if (statusName && !statusId) throw new Error(`${statusName} work order status was not found.`)
      const result = await getDeshazoWorkOrders({
        search: submittedSearch,
        page: page - 1,
        pageSize,
        sortBy,
        direction,
        statusId,
        recent,
        serviceLocationId,
      })
      setWorkOrders(result.data)
      setCount(result.count)
      setTotalPages(result.totalPages)
      if (page > result.totalPages) setPage(result.totalPages)
    } catch (loadError) {
      setWorkOrders([])
      setCount(0)
      setTotalPages(1)
      setError(loadError instanceof Error ? loadError.message : 'There was an error with your request.')
    } finally {
      setLoading(false)
    }
  }, [direction, page, pageSize, recent, serviceLocationId, sortBy, statusName, submittedSearch])

  useEffect(() => {
    void loadWorkOrders()
  }, [loadWorkOrders, refreshKey])

  const visiblePages = useMemo(() => paginationPages(page, totalPages), [page, totalPages])
  const assignmentGroups = selectedAssignment ? assignedEmployees(selectedAssignment) : []

  const changeSort = (nextSortBy: string) => {
    setPage(1)
    if (sortBy === nextSortBy) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(nextSortBy)
      setDirection('asc')
    }
  }

  return (
    <div className="px-5 py-5 lg:px-7">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Work order status totals">
        {[
          ['To Be Scheduled', kpis.pending],
          ['Scheduled', kpis.scheduled],
          ['Waiting On Parts', kpis.waitingOnParts],
          ['In Progress', kpis.inProgress],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-sm border border-[#d3dbea] bg-white px-4 pt-4 shadow-[0_8px_24px_rgba(55,78,108,0.04)]">
            <p className="border-b border-[#d3dbea] pb-2 text-center text-[11px] font-semibold uppercase tracking-[0.02em] text-[#4b5662]">{label}</p>
            <p className="py-3 text-center text-[20px] font-medium text-[var(--deshazo-text)]">{formatCount(value as number | undefined)}</p>
          </div>
        ))}
      </section>

      <section className="mt-5 overflow-hidden rounded-sm border border-[#d3dbea] bg-white shadow-[0_10px_28px_rgba(55,78,108,0.05)]">
        <header className="flex flex-col gap-4 border-b border-[#d3dbea] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-semibold text-[var(--deshazo-text)]">Work Orders</h1>
              <span className="text-[12px] text-[#747b8a]">({loading ? '' : formatCount(count)})</span>
            </div>
            <span className="mt-1 inline-flex rounded-full bg-[var(--deshazo-blue)] px-3 py-0.5 text-[11px] font-bold text-white">{listLabel || (recent ? 'Recently Added' : statusName || 'All')}</span>
          </div>

          <div className="flex items-center gap-3">
            <label className="relative block w-full min-w-0 sm:w-[330px]">
              <span className="sr-only">Search work orders</span>
              <input
                value={search}
                maxLength={50}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search for a work order number.."
                className="h-9 w-full rounded-md border border-[#c7d1e2] bg-white pl-3 pr-10 text-[12px] text-[var(--deshazo-text)] outline-none transition focus:border-[var(--deshazo-blue)]"
              />
              <span aria-hidden="true" className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-r-md bg-[#647688] text-white">⌕</span>
            </label>
            <button
              type="button"
              aria-label="Refresh work orders"
              onClick={() => setRefreshKey((value) => value + 1)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#647688] text-[18px] font-bold text-white transition hover:bg-[#536576]"
            >
              ↻
            </button>
          </div>
        </header>

        {error ? <p className="m-4 rounded-md border border-[#f0c8c8] bg-[#fdf1f1] px-4 py-3 text-[13px] font-semibold text-[#b23b3b]">{error}</p> : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-[#d3dbea] bg-white text-[11px] font-semibold text-[#747b8a]">
                {[
                  ['jobNo', 'Work Order #'],
                  ['jobType', 'Type'],
                  [null, 'Customer'],
                  [null, 'Customer Location'],
                  [null, 'Comment'],
                  [null, 'Service Location'],
                  ['startDate', 'Dates'],
                  [null, 'Assigned To'],
                ].map(([field, label]) => (
                  <th key={String(label)} className="whitespace-nowrap px-4 py-3">
                    {field ? (
                      <button type="button" onClick={() => changeSort(String(field))} className="font-semibold hover:text-[var(--deshazo-blue)]">
                        {label} {sortBy === field ? (direction === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    ) : label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center font-semibold text-[#747b8a]">Loading work orders...</td></tr>
              ) : workOrders.length ? (
                workOrders.map((workOrder) => (
                  <tr
                    key={workOrder.id}
                    onClick={() => onOpenWorkOrder(workOrder.id)}
                    className="cursor-pointer border-b border-[#e2e8f2] odd:bg-[#f8fbff] hover:bg-[#eef4ff]"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-[var(--deshazo-blue)]">
                      <button type="button" className="font-semibold hover:underline" onClick={(event) => { event.stopPropagation(); onOpenWorkOrder(workOrder.id) }}>
                        {workOrder.jobNo || '-'}
                      </button>
                    </td>
                    <td className="px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold ${typeBadgeClass(workOrder.jobType)}`}>{workOrder.jobType || '-'}</span></td>
                    <td className="max-w-[230px] truncate px-4 py-3 text-[var(--deshazo-text)]">{workOrder.customerWorkOrder?.customerName || '-'}</td>
                    <td className="max-w-[280px] truncate px-4 py-3 text-[var(--deshazo-text)]" title={formatAddress(workOrder)}>{formatAddress(workOrder)}</td>
                    <td className="max-w-[300px] truncate px-4 py-3 text-[var(--deshazo-text)]" title={workOrder.svcCommentText || workOrder.comment || '-'}>{workOrder.svcCommentText || workOrder.comment || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--deshazo-text)]">{workOrder.serviceLocation?.name || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--deshazo-text)]">{formatDateRange(workOrder)}</td>
                    <td className="px-4 py-3"><button type="button" onClick={(event) => { event.stopPropagation(); setSelectedAssignment(workOrder) }} className="whitespace-nowrap rounded-md bg-[var(--deshazo-blue)] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[var(--deshazo-blue-deep)]">Show Assigned</button></td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-[#747b8a]">No results</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-col gap-3 border-t border-[#d3dbea] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <select
            aria-label="Rows per page"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className="h-8 w-[76px] rounded-md border border-[#c7d1e2] bg-white px-2 text-[12px] text-[var(--deshazo-text)]"
          >
            {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>

          <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1">
            <button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="h-8 rounded-md border border-[#bdc4d3] px-3 text-[12px] disabled:opacity-40">‹</button>
            {visiblePages.map((visiblePage, index) => {
              const previous = visiblePages[index - 1]
              return (
                <span key={visiblePage} className="contents">
                  {previous && visiblePage - previous > 1 ? <span className="px-1 text-[#747b8a]">…</span> : null}
                  <button type="button" aria-current={visiblePage === page ? 'page' : undefined} onClick={() => setPage(visiblePage)} className={`h-8 min-w-8 rounded-md border px-2 text-[12px] ${visiblePage === page ? 'border-[var(--deshazo-blue)] bg-[var(--deshazo-blue)] font-bold text-white' : 'border-[#bdc4d3] bg-white text-[#4d5360]'}`}>{visiblePage}</button>
                </span>
              )
            })}
            <button type="button" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="h-8 rounded-md border border-[#bdc4d3] px-3 text-[12px] disabled:opacity-40">›</button>
          </nav>
        </footer>
      </section>

      {selectedAssignment ? (
        <div role="dialog" aria-modal="true" aria-labelledby="assignment-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1c2733]/45 px-4" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedAssignment(null) }}>
          <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#d3dbea] px-5 py-4">
              <h2 id="assignment-title" className="text-[16px] font-bold text-[var(--deshazo-text)]">Work Order Assignations</h2>
              <button type="button" aria-label="Close" onClick={() => setSelectedAssignment(null)} className="text-[24px] leading-none text-[#747b8a]">×</button>
            </div>
            <div className="max-h-[55vh] overflow-auto px-5 py-4 text-[13px]">
              {assignmentGroups.length ? assignmentGroups.map((group, index) => (
                <section key={`${group.tripNumber ?? 'trip'}-${index}`} className="mb-4 last:mb-0">
                  <h3 className="bg-[#eef2f8] px-3 py-2 font-bold text-[var(--deshazo-text)]">Trip {group.tripNumber ?? index + 1}</h3>
                  {group.employees.length ? group.employees.map((employee) => <p key={employee} className="border-b border-[#e2e8f2] px-3 py-2 text-[#4d5360]">{employee}</p>) : <p className="px-3 py-2 text-[#747b8a]">No active assignments</p>}
                </section>
              )) : <p className="text-[#747b8a]">No assignments found.</p>}
            </div>
            <div className="flex justify-end border-t border-[#d3dbea] px-5 py-3"><button type="button" onClick={() => setSelectedAssignment(null)} className="rounded-md bg-[var(--deshazo-blue)] px-4 py-2 text-[12px] font-bold text-white">Close</button></div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
