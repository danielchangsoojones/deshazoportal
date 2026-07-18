import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDeshazoCranes, type DeshazoCrane } from '../lib/deshazoCranes'
import { getDeshazoCraneWorkOrders, type DeshazoWorkOrder } from '../lib/deshazoWorkOrders'

type CranesListProps = {
  serviceLocationId: number | null
  onOpenWorkOrder: (workOrderId: number) => void
}

function paginationPages(currentPage: number, totalPages: number) {
  const pages = new Set([1, 2, totalPages - 1, totalPages])
  for (let page = Math.max(1, currentPage - 2); page <= Math.min(totalPages, currentPage + 2); page += 1) pages.add(page)
  return Array.from(pages).filter((page) => page >= 1 && page <= totalPages).sort((left, right) => left - right)
}

function formatAddress(crane: DeshazoCrane) {
  const location = crane.customerLocation
  if (!location) return '-'
  const street = [location.shipToAddress1, location.shipToAddress2, location.shipToAddress3].filter(Boolean).join(', ')
  const cityState = [location.shipToCity, location.shipToState].filter(Boolean).join(', ')
  const locality = [cityState, location.shipToZipCode].filter(Boolean).join(', ')
  return street && locality ? `${street} - ${locality}` : street || locality || '-'
}

function serviceRequested(workOrder: DeshazoWorkOrder) {
  return workOrder.svcCommentText || workOrder.comment || '-'
}

function jobTypeClass(jobType?: string | null) {
  const value = (jobType || '').toLowerCase()
  if (value.includes('inspection')) return 'border-[#b8c9f5] bg-[#eef3ff] text-[var(--deshazo-blue)]'
  if (value.includes('service')) return 'border-[#b8dece] bg-[#edf8f3] text-[#367861]'
  return 'border-[#f6d58e] bg-[#fff7e8] text-[#a96d09]'
}

export default function CranesList({ serviceLocationId, onOpenWorkOrder }: CranesListProps) {
  const [cranes, setCranes] = useState<DeshazoCrane[]>([])
  const [count, setCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [photoCrane, setPhotoCrane] = useState<DeshazoCrane | null>(null)
  const [workOrderCrane, setWorkOrderCrane] = useState<DeshazoCrane | null>(null)
  const [associatedWorkOrders, setAssociatedWorkOrders] = useState<DeshazoWorkOrder[]>([])
  const [workOrdersLoading, setWorkOrdersLoading] = useState(false)
  const [workOrdersError, setWorkOrdersError] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1)
      setSubmittedSearch(search)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => setPage(1), [pageSize])

  const loadCranes = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getDeshazoCranes({ search: submittedSearch, page: page - 1, pageSize, sortBy: 'ContactCode', direction })
      setCranes(result.data)
      setCount(result.count)
      setTotalPages(result.totalPages)
      if (page > result.totalPages) setPage(result.totalPages)
    } catch (loadError) {
      setCranes([])
      setCount(0)
      setTotalPages(1)
      setError(loadError instanceof Error ? loadError.message : 'There was an error with your request.')
    } finally {
      setLoading(false)
    }
  }, [direction, page, pageSize, submittedSearch])

  useEffect(() => { void loadCranes() }, [loadCranes, refreshKey])

  const openWorkOrders = async (crane: DeshazoCrane) => {
    setWorkOrderCrane(crane)
    setAssociatedWorkOrders([])
    setWorkOrdersError('')
    setWorkOrdersLoading(true)
    try {
      setAssociatedWorkOrders(await getDeshazoCraneWorkOrders({ craneId: crane.id, serviceLocationId }))
    } catch (loadError) {
      setWorkOrdersError(loadError instanceof Error ? loadError.message : 'There was an error with your request.')
    } finally {
      setWorkOrdersLoading(false)
    }
  }

  const visiblePages = useMemo(() => paginationPages(page, totalPages), [page, totalPages])

  return (
    <div className="px-5 py-5 lg:px-7">
      <section className="overflow-hidden rounded-sm border border-[#d3dbea] bg-white shadow-[0_10px_28px_rgba(55,78,108,0.05)]">
        <header className="flex flex-col gap-4 border-b border-[#d3dbea] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2"><h1 className="text-[22px] font-semibold text-[var(--deshazo-text)]">Cranes</h1><span className="text-[12px] text-[#747b8a]">({loading ? '' : new Intl.NumberFormat('en-US').format(count)})</span></div>
          <div className="flex items-center gap-3">
            <label className="relative block w-full min-w-0 sm:w-[330px]"><span className="sr-only">Search cranes</span><input value={search} maxLength={50} onChange={(event) => setSearch(event.target.value)} placeholder="Search for.." className="h-9 w-full rounded-md border border-[#c7d1e2] bg-white pl-3 pr-10 text-[12px] text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]" /><span aria-hidden="true" className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-r-md bg-[#647688] text-white">⌕</span></label>
            <button type="button" aria-label="Refresh cranes" onClick={() => setRefreshKey((value) => value + 1)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#647688] text-[18px] font-bold text-white hover:bg-[#536576]">↻</button>
          </div>
        </header>
        {error ? <p className="m-4 rounded-md border border-[#f0c8c8] bg-[#fdf1f1] px-4 py-3 text-[13px] font-semibold text-[#b23b3b]">{error}</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] border-collapse text-left text-[12px]">
            <thead><tr className="border-b border-[#d3dbea] text-[11px] font-semibold text-[#747b8a]">
              <th className="px-4 py-3"><button type="button" onClick={() => { setPage(1); setDirection((value) => value === 'asc' ? 'desc' : 'asc') }} className="font-semibold hover:text-[var(--deshazo-blue)]">Crane D# {direction === 'asc' ? '↑' : '↓'}</button></th>
              {['Customer', 'Customer Address', 'Equip. Descr.', 'Equip. Loc.', 'Photos', 'Status', ''].map((label, index) => <th key={`${label}-${index}`} className={`px-4 py-3 ${label === 'Photos' ? 'text-center' : ''}`}>{label}</th>)}
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="px-4 py-12 text-center font-semibold text-[#747b8a]">Loading cranes...</td></tr> : cranes.length ? cranes.map((crane) => {
                const status = crane.serviceStatus === 'OUT_OF_SERVICE' ? 'OUT OF SERVICE' : 'IN SERVICE'
                return <tr key={crane.id} className="border-b border-[#e2e8f2] odd:bg-[#f8fbff] hover:bg-[#eef4ff]">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-[var(--deshazo-blue)]">{crane.ContactCode || 'Not Set'}</td>
                  <td className="max-w-[210px] truncate px-4 py-3 text-[var(--deshazo-text)]">{crane.customer?.customerName || '-'}</td>
                  <td className="max-w-[300px] truncate px-4 py-3 text-[var(--deshazo-text)]" title={formatAddress(crane)}>{formatAddress(crane)}</td>
                  <td className="max-w-[170px] truncate px-4 py-3 text-[var(--deshazo-text)]">{crane.UDF_EQ_DESCR || '-'}</td>
                  <td className="max-w-[170px] truncate px-4 py-3 text-[var(--deshazo-text)]">{crane.UDF_EQ_LOC || '-'}</td>
                  <td className="px-4 py-3 text-center"><button type="button" onClick={() => setPhotoCrane(crane)} className="rounded-md border border-[#bdc4d3] bg-white px-3 py-1.5 text-[11px] font-bold text-[var(--deshazo-blue)] hover:bg-[#eef4ff]">See Photos</button></td>
                  <td className="px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${status === 'IN SERVICE' ? 'bg-[var(--deshazo-blue)] text-white' : 'bg-[#f1a23b] text-white'}`}>{status}</span></td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => void openWorkOrders(crane)} className="rounded-md bg-[var(--deshazo-blue)] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[var(--deshazo-blue-deep)]">Work Orders</button></td>
                </tr>
              }) : <tr><td colSpan={8} className="px-4 py-12 text-center text-[#747b8a]">No results</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-col gap-3 border-t border-[#d3dbea] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <select aria-label="Rows per page" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 w-[76px] rounded-md border border-[#c7d1e2] bg-white px-2 text-[12px] text-[var(--deshazo-text)]">{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select>
          <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1"><button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="h-8 rounded-md border border-[#bdc4d3] px-3 text-[12px] disabled:opacity-40">‹</button>{visiblePages.map((visiblePage, index) => <span key={visiblePage} className="contents">{visiblePages[index - 1] && visiblePage - visiblePages[index - 1] > 1 ? <span className="px-1 text-[#747b8a]">…</span> : null}<button type="button" aria-current={visiblePage === page ? 'page' : undefined} onClick={() => setPage(visiblePage)} className={`h-8 min-w-8 rounded-md border px-2 text-[12px] ${visiblePage === page ? 'border-[var(--deshazo-blue)] bg-[var(--deshazo-blue)] font-bold text-white' : 'border-[#bdc4d3] bg-white text-[#4d5360]'}`}>{visiblePage}</button></span>)}<button type="button" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="h-8 rounded-md border border-[#bdc4d3] px-3 text-[12px] disabled:opacity-40">›</button></nav>
        </footer>
      </section>

      {photoCrane ? <div role="dialog" aria-modal="true" aria-labelledby="crane-photos-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1c2733]/50 px-4" onMouseDown={(event) => { if (event.currentTarget === event.target) setPhotoCrane(null) }}><div className="w-full max-w-3xl rounded-lg bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-[#d3dbea] px-5 py-4"><h2 id="crane-photos-title" className="text-[17px] font-bold text-[var(--deshazo-text)]">Crane Photos</h2><button type="button" aria-label="Close" onClick={() => setPhotoCrane(null)} className="text-2xl text-[#747b8a]">×</button></div><div className="grid max-h-[65vh] grid-cols-1 gap-4 overflow-auto p-5 sm:grid-cols-2">{photoCrane.craneAttachments?.some((attachment) => attachment.contentUrl) ? photoCrane.craneAttachments.map((attachment, index) => attachment.contentUrl ? <img key={attachment.id ?? index} src={attachment.contentUrl} alt={`Crane ${photoCrane.ContactCode || ''} photo ${index + 1}`} className="h-64 w-full rounded-md border border-[#d3dbea] object-contain" /> : null) : <p className="col-span-full py-10 text-center text-[#747b8a]">No photos</p>}</div><div className="flex justify-end border-t border-[#d3dbea] px-5 py-3"><button type="button" onClick={() => setPhotoCrane(null)} className="rounded-md bg-[var(--deshazo-blue)] px-4 py-2 text-[12px] font-bold text-white">Close</button></div></div></div> : null}

      {workOrderCrane ? <div role="dialog" aria-modal="true" aria-labelledby="crane-work-orders-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1c2733]/50 px-4" onMouseDown={(event) => { if (event.currentTarget === event.target) setWorkOrderCrane(null) }}><div className="w-full max-w-2xl rounded-lg bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-[#d3dbea] px-5 py-4"><h2 id="crane-work-orders-title" className="text-[17px] font-bold text-[var(--deshazo-text)]">Work Orders Associated</h2><button type="button" aria-label="Close" onClick={() => setWorkOrderCrane(null)} className="text-2xl text-[#747b8a]">×</button></div><div className="max-h-[65vh] overflow-auto p-5">{workOrdersError ? <p className="rounded-md bg-[#fdf1f1] p-3 text-[#b23b3b]">{workOrdersError}</p> : workOrdersLoading ? <p className="py-10 text-center text-[#747b8a]">Loading work orders...</p> : associatedWorkOrders.length ? <table className="w-full text-left text-[12px]"><thead><tr className="border-b border-[#d3dbea] text-[#747b8a]"><th className="px-3 py-2">WO #</th><th className="px-3 py-2">Service Requested</th><th className="px-3 py-2">Type</th></tr></thead><tbody>{associatedWorkOrders.map((workOrder) => <tr key={workOrder.id} onClick={() => onOpenWorkOrder(workOrder.id)} className="cursor-pointer border-b border-[#e2e8f2] hover:bg-[#eef4ff]"><td className="px-3 py-3 font-semibold text-[var(--deshazo-blue)]">{workOrder.jobNo ? `#${workOrder.jobNo}` : `Without WO# (${workOrder.id})`}</td><td className="max-w-[320px] truncate px-3 py-3">{serviceRequested(workOrder)}</td><td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${jobTypeClass(workOrder.jobType)}`}>{workOrder.jobType || '-'}</span></td></tr>)}</tbody></table> : <p className="py-10 text-center text-[#747b8a]">No work orders</p>}</div><div className="flex justify-end border-t border-[#d3dbea] px-5 py-3"><button type="button" onClick={() => setWorkOrderCrane(null)} className="rounded-md bg-[var(--deshazo-blue)] px-4 py-2 text-[12px] font-bold text-white">Close</button></div></div></div> : null}
    </div>
  )
}
