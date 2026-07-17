import { useEffect, useMemo, useState } from 'react'
import {
  type DeshazoWorkOrder,
  type DeshazoWorkOrderStatus,
  getDeshazoWorkOrderById,
  getDeshazoWorkOrderStatuses,
} from '../lib/deshazoWorkOrders'

type WorkOrderDetailsProps = {
  workOrderId: number
  onBack: () => void
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value)
  if (!Number.isFinite(date.getTime())) return '-'
  return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).format(date)
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '-'
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date).replace(',', ' at')
}

function formatAddress(workOrder: DeshazoWorkOrder) {
  const location = workOrder.customerLocation
  if (!location) return '-'
  const street = [location.shipToAddress1, location.shipToAddress2, location.shipToAddress3].filter(Boolean).join(', ')
  const cityState = [location.shipToCity, location.shipToState].filter(Boolean).join(', ')
  const locality = [cityState, location.shipToZipCode].filter(Boolean).join(', ')
  return street && locality ? `${street} - ${locality}` : street || locality || '-'
}

function personName(person?: { firstName?: string; lastName?: string } | null) {
  return [person?.firstName, person?.lastName].filter(Boolean).join(' ') || 'N/A'
}

function StatusTimeline({ workOrder, statuses }: { workOrder: DeshazoWorkOrder; statuses: DeshazoWorkOrderStatus[] }) {
  const visibleStatuses = statuses.length
    ? statuses
    : ['Pending', 'Scheduled', 'In Progress', 'Waiting for parts', 'Completed', 'Ready to Invoice', 'Invoiced'].map((name, index) => ({ id: index, name }))

  return (
    <section className="overflow-x-auto border-t border-[#e1e7ed] px-5 pb-6 pt-5">
      <h2 className="text-center text-[18px] font-semibold text-[#35414d]">Work Order Status</h2>
      <div className="mt-6 min-w-[880px]">
        <div className="mx-8 border-t-2 border-[#d9e1e8]" />
        <div className="-mt-[13px] flex justify-between">
          {visibleStatuses.map((status) => {
            const log = (workOrder.statusLog ?? []).find((entry) => entry.status?.name === status.name)
            const isPending = status.name.toLowerCase() === 'pending'
            const date = log?.isManualUpdate || log?.createdAt || (isPending ? workOrder.createdAt : null)
            const author = log?.updateAuthor || log?.author
            const active = workOrder.status?.name === status.name
            return (
              <div key={status.id} className="flex w-[120px] flex-col items-center text-center">
                <span className={`h-6 w-6 rounded-full border-4 border-white shadow ${active ? 'bg-[#3b8c6b]' : 'bg-[#e4e9ee]'}`} />
                <span className={`mt-2 rounded-full px-2.5 py-1 text-[10px] font-bold ${active ? 'bg-[#3b8c6b] text-white' : 'bg-[#eef1f4] text-[#7c8792]'}`}>{status.name}</span>
                {date ? <span className="mt-2 text-[10px] leading-4 text-[#7c8792]">{formatDateTime(date)}{log ? <><br />By {personName(author)}</> : null}</span> : null}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function CraneIcon() {
  return <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7 text-[#0a3b2a]" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 27V5h10M5 9h20M17 9v6m0 0h5m-2 0v7a3 3 0 0 1-6 0" /><path d="m10 5 4 4M25 9l-4 4" /></svg>
}

export default function WorkOrderDetails({ workOrderId, onBack }: WorkOrderDetailsProps) {
  const [workOrder, setWorkOrder] = useState<DeshazoWorkOrder | null>(null)
  const [statuses, setStatuses] = useState<DeshazoWorkOrderStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([getDeshazoWorkOrderById(workOrderId), getDeshazoWorkOrderStatuses()])
      .then(([nextWorkOrder, nextStatuses]) => {
        if (cancelled) return
        setWorkOrder(nextWorkOrder)
        setStatuses(nextStatuses)
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'There was an error with your request.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workOrderId])

  const trips = useMemo(
    () => (workOrder?.workOrderTrips ?? []).slice().sort((left, right) => (left.tripNumber ?? 0) - (right.tripNumber ?? 0)),
    [workOrder],
  )

  if (loading) return <div className="flex min-h-[70vh] items-center justify-center text-[13px] font-semibold text-[#6d7884]">Loading work order...</div>

  if (!workOrder || error) {
    return <div className="p-7"><button type="button" onClick={onBack} className="rounded-md bg-[#0a3b2a] px-4 py-2 text-[12px] font-bold text-white">← Back</button><p className="mt-4 rounded-md border border-[#f0c8c8] bg-[#fdf1f1] px-4 py-3 text-[13px] font-semibold text-[#b23b3b]">{error || 'Work order not found.'}</p></div>
  }

  return (
    <div className="px-5 py-5 lg:px-7">
      <header className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-[#35414d]">Work Order Information</h1>
          <button type="button" onClick={onBack} className="mt-2 rounded-md bg-[#0a3b2a] px-3 py-1.5 text-[11px] font-bold text-white">← Back</button>
        </div>
        <span className="rounded-full border border-[#b8dece] bg-[#edf8f3] px-3 py-1 text-[11px] font-bold text-[#367861]">Read-only view</span>
      </header>

      <section className="overflow-hidden rounded-sm border border-[#d7e1eb] bg-white shadow-[0_10px_28px_rgba(55,78,108,0.05)]">
        <div className="flex flex-col justify-between gap-5 px-5 py-5 lg:flex-row">
          <div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[18px] font-semibold text-[#35414d]">
              <span>Customer: <span className="text-[#315d87]">{workOrder.customerWorkOrder?.customerName || '-'}</span></span>
              {workOrder.customerWorkOrder && 'customerNo' in workOrder.customerWorkOrder ? <span className="text-[13px] text-[#88939e]">{String(workOrder.customerWorkOrder.customerNo || '')}</span> : null}
            </div>
            <p className="mt-2 text-[12px] text-[#53606d]">Customer Location: <span className="text-[#7c8792]">{formatAddress(workOrder)}</span></p>
            {workOrder.quotedJob ? <span className="mt-3 inline-flex rounded-full bg-[#0a3b2a] px-3 py-1 text-[10px] font-bold text-white">Quoted Job</span> : null}
          </div>
          <div className="text-left lg:text-right">
            <p className="text-[18px] font-semibold text-[#35414d]">Work Order #: <span className="text-[#7c8792]">{workOrder.jobNo || `Without WO# (${workOrder.id})`}</span></p>
            <p className="mt-2 text-[12px] text-[#53606d]">Service Location: <span className="text-[#7c8792]">{workOrder.serviceLocation?.name || '-'}</span></p>
          </div>
        </div>

        <StatusTimeline workOrder={workOrder} statuses={statuses} />
      </section>

      <nav className="mt-4 flex border-b border-[#d7e1eb] text-[12px] font-semibold text-[#697581]" aria-label="Work order detail sections">
        <span className="border-b-2 border-[#0a3b2a] px-4 py-3 text-[#0a3b2a]">Job Details</span>
        <span className="px-4 py-3">Work Performed</span>
        <span className="px-4 py-3">Reports</span>
      </nav>

      <section className="border border-t-0 border-[#d7e1eb] bg-white px-5 py-5">
        <div>
          <h2 className="border-b border-[#dfe5eb] pb-2 text-[18px] font-semibold text-[#35414d]">Work Order Schedule</h2>
          <div className="mt-4 flex items-center gap-5 text-[12px]"><span className="w-[150px] font-semibold underline">WO Dates</span><span className="rounded-md border border-[#d8e1ea] bg-[#f6faff] px-4 py-2 font-semibold text-[#53606d]">{formatDate(workOrder.startDate)} <span className="px-2 text-[#99a3ad]">to</span> {formatDate(workOrder.endDate)}</span></div>

          {trips.map((trip, index) => (
            <article key={trip.id ?? index} className="mt-4 overflow-hidden rounded-md border border-[#cad8e5]">
              <h3 className="bg-[#0a3b2a] px-4 py-2.5 text-[12px] font-bold text-white">Trip {trip.tripNumber ?? index + 1}</h3>
              <div className="bg-[#f8fafc] px-4 py-4">
                <div className="flex items-center gap-5 text-[12px]"><span className="w-[130px] font-semibold underline">Trip Dates</span><span className="rounded-md border border-[#d8e1ea] bg-white px-4 py-2">{formatDate(trip.startDate)} <span className="px-2 text-[#99a3ad]">to</span> {formatDate(trip.endDate)}</span></div>
                <div className="mt-4 flex items-start gap-5 text-[12px]"><span className="w-[130px] shrink-0 font-semibold underline">Assigned Techs</span><div className="flex flex-wrap gap-2">{(trip.workOrderEmployees ?? []).filter((employee) => !employee.disabledAt).map((assignment, employeeIndex) => <span key={assignment.id ?? employeeIndex} className="rounded-md border border-[#d8e1ea] bg-white px-3 py-2 text-[#53606d]">{assignment.isLead ? '★ ' : ''}{[assignment.employee?.firstName, assignment.employee?.lastName].filter(Boolean).join(' ') || 'Unknown technician'}</span>)}</div></div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-7">
          <h2 className="border-b border-[#dfe5eb] pb-2 text-[18px] font-semibold text-[#35414d]">Work Order Details</h2>
          <dl className="mt-5 grid grid-cols-[150px_minmax(0,1fr)] gap-x-5 gap-y-6 text-[12px]">
            <dt className="font-semibold underline">Service Requested</dt><dd className="text-[#53606d]">{workOrder.svcCommentText || workOrder.comment || 'Not Provided'}</dd>
            <dt className="font-semibold underline">PO#</dt><dd className="text-[#53606d]">{workOrder.customerPONo || '-'}</dd>
            <dt className="font-semibold underline">Cranes</dt><dd className="flex flex-wrap gap-2">{workOrder.workOrderCranes?.length ? workOrder.workOrderCranes.map((item, index) => <span key={item.id ?? index} className="flex min-w-[92px] flex-col items-center rounded-md border border-[#d8e1ea] bg-[#f8fafc] px-3 py-2 text-[10px] font-semibold text-[#53606d]"><CraneIcon />{item.crane?.ContactCode || item.crane?.contactCode || item.crane?.description || 'D# Not Set'}</span>) : <span className="text-[#7c8792]">No Cranes</span>}</dd>
            <dt className="border-b border-[#e1e7ed] pb-5 font-semibold underline">Job Type</dt><dd className="border-b border-[#e1e7ed] pb-5"><span className="rounded-full bg-[#315d87] px-3 py-1 text-[10px] font-bold text-white">{workOrder.jobType || '-'}</span></dd>
            <dt className="font-semibold underline">Customer Location</dt><dd className="text-[#53606d]">{formatAddress(workOrder)}</dd>
            <dt className="font-semibold underline">Customer Contacts</dt><dd className="flex flex-wrap gap-3">{workOrder.customerContacts?.length ? workOrder.customerContacts.map((contact, index) => <div key={contact.id ?? index} className="min-w-[190px] overflow-hidden rounded-md border border-[#d8e1ea] text-center"><p className="bg-[#f0f4f7] px-3 py-2 font-semibold text-[#35414d]">{contact.name || '-'}</p><p className="px-3 pt-2 text-[10px] text-[#697581]">{contact.email || '-'}</p><p className="px-3 pb-2 text-[10px] text-[#697581]">{contact.phone || '-'}</p></div>) : <span className="text-[#7c8792]">No Contacts</span>}</dd>
          </dl>
        </div>
      </section>
    </div>
  )
}
