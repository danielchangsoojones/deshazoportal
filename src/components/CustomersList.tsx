import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDeshazoCustomers, type DeshazoCustomer } from '../lib/deshazoCustomers'

type CustomersListProps = {
  serviceLocationId: number | null
  roleId?: number
}

function paginationPages(currentPage: number, totalPages: number) {
  const pages = new Set([1, 2, totalPages - 1, totalPages])
  for (let page = Math.max(1, currentPage - 2); page <= Math.min(totalPages, currentPage + 2); page += 1) pages.add(page)
  return Array.from(pages).filter((page) => page >= 1 && page <= totalPages).sort((left, right) => left - right)
}

function countWorkOrders(customer: DeshazoCustomer, roleId: number | undefined, serviceLocationId: number | null) {
  const workOrders = customer.workOrders ?? []
  if (roleId === 2 && serviceLocationId) return workOrders.filter((workOrder) => workOrder.serviceLocationId === serviceLocationId).length
  return workOrders.length
}

export default function CustomersList({ serviceLocationId, roleId }: CustomersListProps) {
  const [customers, setCustomers] = useState<DeshazoCustomer[]>([])
  const [count, setCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [sortBy, setSortBy] = useState<'customerName' | 'customerNo'>('customerName')
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1)
      setSubmittedSearch(search)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => setPage(1), [pageSize])

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getDeshazoCustomers({ search: submittedSearch, page: page - 1, pageSize, sortBy, direction })
      setCustomers(result.data)
      setCount(result.count)
      setTotalPages(result.totalPages)
      if (page > result.totalPages) setPage(result.totalPages)
    } catch (loadError) {
      setCustomers([])
      setCount(0)
      setTotalPages(1)
      setError(loadError instanceof Error ? loadError.message : 'There was an error with your request.')
    } finally {
      setLoading(false)
    }
  }, [direction, page, pageSize, sortBy, submittedSearch])

  useEffect(() => { void loadCustomers() }, [loadCustomers, refreshKey])

  const visiblePages = useMemo(() => paginationPages(page, totalPages), [page, totalPages])
  const changeSort = (field: 'customerName' | 'customerNo') => {
    setPage(1)
    if (sortBy === field) setDirection((current) => current === 'asc' ? 'desc' : 'asc')
    else {
      setSortBy(field)
      setDirection('asc')
    }
  }

  return (
    <div className="px-5 py-5 lg:px-7">
      <section className="overflow-hidden rounded-sm border border-[#d3dbea] bg-white shadow-[0_10px_28px_rgba(55,78,108,0.05)]">
        <header className="flex flex-col gap-4 border-b border-[#d3dbea] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-semibold text-[var(--deshazo-text)]">Customers</h1>
            <span className="text-[12px] text-[#747b8a]">({loading ? '' : new Intl.NumberFormat('en-US').format(count)})</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="relative block w-full min-w-0 sm:w-[330px]">
              <span className="sr-only">Search customers</span>
              <input value={search} maxLength={50} onChange={(event) => setSearch(event.target.value)} placeholder="Search for.." className="h-9 w-full rounded-md border border-[#c7d1e2] bg-white pl-3 pr-10 text-[12px] text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]" />
              <span aria-hidden="true" className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-r-md bg-[#647688] text-white">⌕</span>
            </label>
            <button type="button" aria-label="Refresh customers" onClick={() => setRefreshKey((value) => value + 1)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#647688] text-[18px] font-bold text-white hover:bg-[#536576]">↻</button>
          </div>
        </header>

        {error ? <p className="m-4 rounded-md border border-[#f0c8c8] bg-[#fdf1f1] px-4 py-3 text-[13px] font-semibold text-[#b23b3b]">{error}</p> : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-[12px]">
            <thead><tr className="border-b border-[#d3dbea] text-[11px] font-semibold text-[#747b8a]">
              <th className="px-4 py-3"><button type="button" onClick={() => changeSort('customerName')} className="font-semibold hover:text-[var(--deshazo-blue)]">Name {sortBy === 'customerName' ? direction === 'asc' ? '↑' : '↓' : ''}</button></th>
              <th className="px-4 py-3"><button type="button" onClick={() => changeSort('customerNo')} className="font-semibold hover:text-[var(--deshazo-blue)]">Customer No. {sortBy === 'customerNo' ? direction === 'asc' ? '↑' : '↓' : ''}</button></th>
              <th className="px-4 py-3 text-center">Locations</th>
              <th className="px-4 py-3 text-center">Cranes</th>
              <th className="px-4 py-3 text-center">Work Orders</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="px-4 py-12 text-center font-semibold text-[#747b8a]">Loading customers...</td></tr> : customers.length ? customers.map((customer) => <tr key={customer.id} className="border-b border-[#e2e8f2] odd:bg-[#f8fbff] hover:bg-[#eef4ff]">
                <td className="max-w-[340px] truncate px-4 py-3 font-medium text-[var(--deshazo-text)]">{customer.customerName || '-'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-[var(--deshazo-text)]">{customer.customerNo || '-'}</td>
                <td className="px-4 py-3 text-center text-[var(--deshazo-text)]">{customer.locations?.length ?? 0}</td>
                <td className="px-4 py-3 text-center text-[var(--deshazo-text)]">{customer.craneCustomer?.length ?? 0}</td>
                <td className="px-4 py-3 text-center text-[var(--deshazo-text)]">{countWorkOrders(customer, roleId, serviceLocationId)}</td>
              </tr>) : <tr><td colSpan={5} className="px-4 py-12 text-center text-[#747b8a]">No results</td></tr>}
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
