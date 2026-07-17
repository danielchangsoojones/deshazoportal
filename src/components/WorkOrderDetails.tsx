import { useEffect, useMemo, useState } from 'react'
import {
  type DeshazoCraneInspection,
  type DeshazoEmployeeWorkDay,
  type DeshazoWorkOrder,
  type DeshazoWorkOrderEmployee,
  type DeshazoWorkOrderTrip,
  type DeshazoWorkOrderStatus,
  getDeshazoCraneInspections,
  getDeshazoWorkOrderById,
  getDeshazoWorkOrderStatuses,
} from '../lib/deshazoWorkOrders'

type WorkOrderDetailsProps = {
  workOrderId: number
  onBack: () => void
}

type DetailsTab = 'job-details' | 'work-performed'

type WorkDayRecord = {
  day: DeshazoEmployeeWorkDay
  assignment: DeshazoWorkOrderEmployee
  trip: DeshazoWorkOrderTrip
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
    <section className="overflow-x-auto border-t border-[#d3dbea] px-5 pb-6 pt-5">
      <h2 className="text-center text-[18px] font-semibold text-[var(--deshazo-text)]">Work Order Status</h2>
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
                <span className={`h-6 w-6 rounded-full border-4 border-white shadow ${active ? 'bg-[var(--deshazo-blue)]' : 'bg-[#d3dbea]'}`} />
                <span className={`mt-2 rounded-full px-2.5 py-1 text-[10px] font-bold ${active ? 'bg-[var(--deshazo-blue)] text-white' : 'bg-[#eef2f8] text-[#747b8a]'}`}>{status.name}</span>
                {date ? <span className="mt-2 text-[10px] leading-4 text-[#747b8a]">{formatDateTime(date)}{log ? <><br />By {personName(author)}</> : null}</span> : null}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function CraneIcon() {
  return <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7 text-[var(--deshazo-blue)]" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 27V5h10M5 9h20M17 9v6m0 0h5m-2 0v7a3 3 0 0 1-6 0" /><path d="m10 5 4 4M25 9l-4 4" /></svg>
}

function hours(value?: number | string | null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function workDayHours(day: DeshazoEmployeeWorkDay) {
  if (day.workTimes?.length) {
    return day.workTimes.reduce(
      (totals, time) => ({ regular: totals.regular + hours(time.hours), overtime: totals.overtime + hours(time.overtimeHours) }),
      { regular: 0, overtime: 0 },
    )
  }
  return { regular: hours(day.hours), overtime: hours(day.overtimeHours) }
}

function formatTime(value?: string | null) {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'N/A'
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
}

function employeeLabel(assignment: DeshazoWorkOrderEmployee) {
  return [assignment.employee?.preferredName || assignment.employee?.firstName, assignment.employee?.lastName].filter(Boolean).join(' ') || 'Unknown technician'
}

function CraneInspections({ workOrder, trip, date }: { workOrder: DeshazoWorkOrder; trip: DeshazoWorkOrderTrip; date: string }) {
  const [inspections, setInspections] = useState<DeshazoCraneInspection[]>([])
  const [loading, setLoading] = useState(Boolean(trip.id))

  useEffect(() => {
    if (!trip.id) return
    let cancelled = false
    getDeshazoCraneInspections({ workOrderTripId: trip.id, date })
      .then((data) => { if (!cancelled) setInspections(data) })
      .catch(() => { if (!cancelled) setInspections([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [date, trip.id])

  const cranes = new Map((workOrder.workOrderCranes ?? []).map((item) => [item.id, item.crane]))

  return (
    <section className="mt-3 overflow-hidden rounded-md border border-[#d3dbea]">
      <h4 className="bg-[#eef2f8] px-4 py-2 text-[11px] font-bold text-[var(--deshazo-text)]">Cranes Inspected</h4>
      {loading ? <p className="px-4 py-3 text-[11px] text-[#747b8a]">Loading inspections...</p> : inspections.length ? (
        <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {inspections.map((inspection) => {
            const crane = cranes.get(inspection.workOrderCraneId)
            const employee = inspection.employeeWorkDay?.workOrderEmployee?.employee
            return (
              <div key={inspection.id} className="flex items-center gap-3 rounded-md border border-[#c7d1e2] bg-white px-3 py-2">
                <CraneIcon />
                <div className="min-w-0 text-[10px]">
                  <p className="font-black text-[var(--deshazo-text)]">{crane?.ContactCode || crane?.contactCode || crane?.description || 'Crane'}</p>
                  <p className="truncate text-[#747b8a]">{[employee?.firstName, employee?.lastName].filter(Boolean).join(' ') || inspection.type || 'Inspection'}</p>
                  {inspection.status ? <p className="mt-0.5 font-bold text-[var(--deshazo-blue)]">{inspection.status.replaceAll('_', ' ')}</p> : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : <p className="px-4 py-3 text-[11px] text-[#747b8a]">No cranes inspected</p>}
    </section>
  )
}

function WorkPerformedPanel({ workOrder, recordsByDate }: { workOrder: DeshazoWorkOrder; recordsByDate: Array<[string, WorkDayRecord[]]> }) {
  const [openDate, setOpenDate] = useState(() => recordsByDate[0]?.[0] || '')
  const closeOut = workOrder.postContract

  const closeOutAnswer = (answer?: string | null) => {
    if (answer === 'True') return 'YES'
    if (answer === 'False') return 'NO'
    return answer?.toUpperCase() || '-'
  }

  return (
    <section className="border border-t-0 border-[#d3dbea] bg-white px-5 py-5">
      <div className="flex items-center justify-between border-b border-[#d3dbea] pb-2">
        <h2 className="text-[18px] font-semibold text-[var(--deshazo-text)]">Work Performed</h2>
        <button type="button" disabled title="Read-only view" className="cursor-not-allowed rounded-md bg-[#4d9b73] px-3 py-1.5 text-[11px] font-bold text-white opacity-55">＋ Add Time</button>
      </div>

      {recordsByDate.length ? (
        <div className="mt-4 space-y-3">
          {recordsByDate.map(([date, records]) => {
            const isOpen = openDate === date
            const tripsForDate = Array.from(new Map(records.map((record) => [record.trip.id ?? record.trip.tripNumber, record.trip])).values())
            return (
              <article key={date} className="overflow-hidden rounded-md border border-[#c8d5ea]">
                <button type="button" aria-expanded={isOpen} onClick={() => setOpenDate((current) => current === date ? '' : date)} className="flex w-full items-center justify-between bg-[var(--deshazo-blue)] px-4 py-3 text-left text-[12px] font-bold text-white">
                  <span>{formatDate(date)}</span>
                  <span aria-hidden="true">{isOpen ? '⌃' : '⌄'}</span>
                </button>
                {isOpen ? (
                  <div className="px-4 pb-5 pt-4">
                    <h3 className="border-b border-[#d3dbea] pb-2 text-[14px] font-semibold text-[var(--deshazo-text)]">Service Requested</h3>
                    <p className="mt-3 rounded-md bg-[#f1f5fa] px-4 py-3 text-[12px] text-[#4d5360]">{workOrder.svcCommentText || workOrder.comment || 'Not Provided'}</p>

                    {tripsForDate.map((trip, tripIndex) => {
                      const tripRecords = records.filter((record) => record.trip === trip)
                      const serviceNotes = tripRecords.flatMap(({ day }) => day.workOrderServiceNotes ?? []).filter((note) => note.note || note.serviceNote)
                      const attachments = tripRecords.flatMap(({ day }) => day.attachments ?? [])
                      const materials = tripRecords.flatMap(({ day }) => [...(day.workOrderMaterials ?? []), ...(day.materialsOrdered ?? [])])
                      const dailySignOff = tripRecords.map(({ day }) => day).find((day) => day.signatureURL || day.signatureCustomerName || day.signatureNotProvidedReason)
                      return (
                        <section key={trip.id ?? tripIndex} className="mt-5">
                          <h3 className="border-b border-[#d3dbea] pb-2 text-[14px] font-semibold text-[var(--deshazo-text)]">Trip {trip.tripNumber ?? tripIndex + 1}</h3>
                          <section className="mt-3 overflow-hidden rounded-md border border-[#d3dbea]">
                            <h4 className="bg-[#eef2f8] px-4 py-2 text-[11px] font-bold text-[var(--deshazo-text)]">Job Safety Analysis</h4>
                            {tripRecords.map(({ day, assignment }, recordIndex) => {
                              const completed = day.jsa?.status === 'COMPLETED' || Boolean(day.jsaAnswers?.length)
                              const author = day.jsa?.author || day.jsaAnswers?.[0]?.author
                              const completedAt = day.jsa?.updatedAt || day.jsaAnswers?.map((answer) => answer.createdAt).filter(Boolean).sort().at(-1)
                              return (
                                <div key={day.id ?? recordIndex} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e2e8f2] px-4 py-3 first:border-t-0">
                                  <p className={`text-[11px] font-semibold ${completed ? 'text-[#367861]' : 'text-[#a96d09]'}`}>{completed ? `✓ Completed${completedAt ? ` on ${formatDateTime(completedAt)}` : ''}${author ? ` by ${personName(author)}` : ''}` : 'Not Complete'}</p>
                                  <div className="flex items-center gap-2 text-[10px] font-bold">
                                    {day.isLeadDay ? <span className="rounded-full bg-[var(--deshazo-blue)] px-2 py-0.5 text-white">Lead</span> : null}
                                    <span className="rounded-full border border-[var(--deshazo-blue)] bg-white px-2 py-0.5 text-[var(--deshazo-blue)]">{employeeLabel(assignment)}</span>
                                  </div>
                                </div>
                              )
                            })}
                          </section>

                          <section className="mt-3 overflow-hidden rounded-md border border-[#d3dbea]">
                            <h4 className="bg-[#eef2f8] px-4 py-2 text-[11px] font-bold text-[var(--deshazo-text)]">Technicians</h4>
                            {tripRecords.map(({ day, assignment }, recordIndex) => {
                              const totals = workDayHours(day)
                              const firstTime = day.workTimes?.[0]
                              const totalNewHours = firstTime?.startTime && firstTime.endTime ? Math.max(0, (new Date(firstTime.endTime).getTime() - new Date(firstTime.startTime).getTime()) / 3_600_000) : 0
                              return (
                                <div key={day.id ?? recordIndex} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e2e8f2] px-4 py-3 first:border-t-0">
                                  <div className="flex items-center gap-2 text-[11px] font-bold text-[var(--deshazo-text)]">
                                    <span>{employeeLabel(assignment)}</span>
                                    {day.isLeadDay ? <span className="rounded-full bg-[var(--deshazo-blue)] px-2 py-0.5 text-[9px] text-white">Lead</span> : null}
                                  </div>
                                  {day.workTimes?.length ? <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-[#4d5360]">
                                    {workOrder.isNewTimeEntry ? <><span>{formatTime(firstTime?.startTime)}</span><span>/</span><span>{formatTime(firstTime?.endTime)}</span>{totalNewHours ? <span className="rounded-full bg-[#eef2f8] px-2 py-1 font-bold">Total Hours: {Number(totalNewHours.toFixed(2))}</span> : null}</> : <><span>{totals.regular.toFixed(2)}</span><span>/</span><span>{totals.overtime.toFixed(2)}</span></>}
                                  </div> : <span className="text-[10px] text-[#747b8a]">No work recorded</span>}
                                </div>
                              )
                            })}
                          </section>

                          <section className="mt-4">
                            <h4 className="border-b border-[#d3dbea] pb-2 text-[13px] font-semibold text-[var(--deshazo-text)]">General Service Work</h4>
                            <div className="mt-3 overflow-hidden rounded-md border border-[#d3dbea]">
                              <h5 className="bg-[#eef2f8] px-4 py-2 text-[11px] font-bold text-[var(--deshazo-text)]">Service Performed</h5>
                              {serviceNotes.length ? serviceNotes.map((note, noteIndex) => <p key={note.id ?? noteIndex} className="border-t border-[#e2e8f2] bg-[#fff8e8] px-4 py-3 text-[11px] text-[#4d5360] first:border-t-0">{note.note || note.serviceNote}</p>) : <p className="px-4 py-3 text-[11px] text-[#747b8a]">No information to show</p>}
                              {attachments.length || materials.length ? <p className="border-t border-[#e2e8f2] px-4 py-2 text-[10px] font-semibold text-[#747b8a]">{materials.length} material record{materials.length === 1 ? '' : 's'} · {attachments.length} attachment{attachments.length === 1 ? '' : 's'}</p> : null}
                            </div>
                          </section>

                          <CraneInspections workOrder={workOrder} trip={trip} date={date} />

                          <section className="mt-3 overflow-hidden rounded-md border border-[#d3dbea]">
                            <div className="flex items-center justify-between bg-[#eef2f8] px-4 py-2 text-[11px] font-bold text-[var(--deshazo-text)]"><span>Daily Customer Sign Off</span>{!dailySignOff?.signatureURL ? <span className="rounded-full bg-[#fdf1f1] px-2 py-0.5 text-[9px] text-[#b23b3b]">Signature not provided</span> : null}</div>
                            {dailySignOff?.signatureNotProvidedReason ? <p className="px-4 py-3 text-[11px] text-[#4d5360]">Reason: {dailySignOff.signatureNotProvidedReason}</p> : dailySignOff?.signatureURL ? <div className="flex flex-wrap items-start justify-between gap-3 p-4"><div><img src={dailySignOff.signatureURL} alt={dailySignOff.signatureCustomerName || 'Customer signature'} className="max-h-28 max-w-[260px]" /><p className="mt-1 text-[10px] italic text-[#747b8a]">{dailySignOff.signatureCustomerName}</p></div><span className="rounded-md bg-[#e6efff] px-2 py-1 text-[10px] text-[var(--deshazo-blue)]">{formatDateTime(dailySignOff.signatureDate || dailySignOff.updatedAt)}</span></div> : null}
                          </section>
                        </section>
                      )
                    })}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : <p className="py-8 text-center text-[12px] text-[#747b8a]">No data has been recorded</p>}

      {closeOut?.postContractQuestions?.length ? (
        <section className="mt-4 overflow-hidden rounded-md border border-[#d3dbea]">
          <h3 className="bg-[#eef2f8] px-4 py-2 text-[11px] font-bold text-[var(--deshazo-text)]">Work Order Close Out</h3>
          {closeOut.postContractQuestions.map((question, index) => <div key={question.id ?? index} className="grid grid-cols-[1fr_auto] gap-4 border-t border-[#e2e8f2] px-4 py-3 text-[11px]"><span className="text-[#4d5360]">{question.name || '-'}</span><span className="min-w-[70px] rounded-md bg-[#647688] px-3 py-1 text-center font-bold text-white">{closeOutAnswer(question.postContractAnswer?.answer)}</span></div>)}
          <div className="grid grid-cols-[1fr_minmax(160px,1fr)] gap-4 border-t border-[#e2e8f2] px-4 py-3 text-[11px]"><span className="text-[#4d5360]">Notes about this Job:</span><span className="rounded-md border border-[#c7d1e2] bg-white px-3 py-2 text-[#747b8a]">{closeOut.note || ''}</span></div>
        </section>
      ) : null}

      {closeOut ? (
        <section className="mt-3 overflow-hidden rounded-md border border-[#d3dbea]">
          <div className="flex items-center justify-between bg-[#eef2f8] px-4 py-2 text-[11px] font-bold text-[var(--deshazo-text)]"><span>Customer Approval</span>{closeOut.customerNotPresent ? <span className="rounded-full bg-[#fdf1f1] px-2 py-0.5 text-[9px] text-[#b23b3b]">Signature not provided</span> : null}</div>
          {closeOut.customerNotPresent ? <p className="px-4 py-3 text-[11px] text-[#4d5360]">Reason: {closeOut.customerNotPresentReason || 'Not provided'}</p> : <div className="flex flex-wrap items-start justify-between gap-3 p-4"><div>{closeOut.signatureUrl ? <img src={closeOut.signatureUrl} alt={closeOut.signatureName || 'Customer signature'} className="max-h-28 max-w-[260px]" /> : null}<p className="mt-1 text-[10px] italic text-[#747b8a]">{closeOut.signatureName}</p></div><span className="rounded-md bg-[#e6efff] px-2 py-1 text-[10px] text-[var(--deshazo-blue)]">{formatDateTime(closeOut.signatureDate || closeOut.updatedAt)}</span></div>}
        </section>
      ) : null}
    </section>
  )
}

export default function WorkOrderDetails({ workOrderId, onBack }: WorkOrderDetailsProps) {
  const [workOrder, setWorkOrder] = useState<DeshazoWorkOrder | null>(null)
  const [statuses, setStatuses] = useState<DeshazoWorkOrderStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<DetailsTab>('job-details')

  useEffect(() => {
    let cancelled = false
    Promise.all([getDeshazoWorkOrderById(workOrderId), getDeshazoWorkOrderStatuses()])
      .then(([nextWorkOrder, nextStatuses]) => {
        if (cancelled) return
        setWorkOrder(nextWorkOrder)
        setStatuses(nextStatuses)
        setActiveTab(nextWorkOrder.status?.name === 'Pending' || nextWorkOrder.status?.name === 'Scheduled' ? 'job-details' : 'work-performed')
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

  const workDaysByDate = useMemo(() => {
    const grouped = new Map<string, WorkDayRecord[]>()
    trips.forEach((trip) => {
      ;(trip.workOrderEmployees ?? []).forEach((assignment) => {
        ;(assignment.employeeWorkDays ?? []).forEach((day) => {
          if (!day.date) return
          const date = day.date.slice(0, 10)
          const records = grouped.get(date) ?? []
          records.push({ day, assignment, trip })
          grouped.set(date, records)
        })
      })
    })
    return Array.from(grouped.entries()).sort(([left], [right]) => right.localeCompare(left))
  }, [trips])

  if (loading) return <div className="flex min-h-[70vh] items-center justify-center text-[13px] font-semibold text-[#747b8a]">Loading work order...</div>

  if (!workOrder || error) {
    return <div className="p-7"><button type="button" onClick={onBack} className="rounded-md bg-[var(--deshazo-blue)] px-4 py-2 text-[12px] font-bold text-white">← Back</button><p className="mt-4 rounded-md border border-[#f0c8c8] bg-[#fdf1f1] px-4 py-3 text-[13px] font-semibold text-[#b23b3b]">{error || 'Work order not found.'}</p></div>
  }

  return (
    <div className="px-5 py-5 lg:px-7">
      <header className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--deshazo-text)]">Work Order Information</h1>
          <button type="button" onClick={onBack} className="mt-2 rounded-md bg-[var(--deshazo-blue)] px-3 py-1.5 text-[11px] font-bold text-white">← Back</button>
        </div>
        <span className="rounded-full border border-[#b8dece] bg-[#edf8f3] px-3 py-1 text-[11px] font-bold text-[#367861]">Read-only view</span>
      </header>

      <section className="overflow-hidden rounded-sm border border-[#d3dbea] bg-white shadow-[0_10px_28px_rgba(55,78,108,0.05)]">
        <div className="flex flex-col justify-between gap-5 px-5 py-5 lg:flex-row">
          <div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[18px] font-semibold text-[var(--deshazo-text)]">
              <span>Customer: <span className="text-[var(--deshazo-blue)]">{workOrder.customerWorkOrder?.customerName || '-'}</span></span>
              {workOrder.customerWorkOrder && 'customerNo' in workOrder.customerWorkOrder ? <span className="text-[13px] text-[#88939e]">{String(workOrder.customerWorkOrder.customerNo || '')}</span> : null}
            </div>
            <p className="mt-2 text-[12px] text-[#4d5360]">Customer Location: <span className="text-[#747b8a]">{formatAddress(workOrder)}</span></p>
            {workOrder.quotedJob ? <span className="mt-3 inline-flex rounded-full bg-[var(--deshazo-blue)] px-3 py-1 text-[10px] font-bold text-white">Quoted Job</span> : null}
          </div>
          <div className="text-left lg:text-right">
            <p className="text-[18px] font-semibold text-[var(--deshazo-text)]">Work Order #: <span className="text-[#747b8a]">{workOrder.jobNo || `Without WO# (${workOrder.id})`}</span></p>
            <p className="mt-2 text-[12px] text-[#4d5360]">Service Location: <span className="text-[#747b8a]">{workOrder.serviceLocation?.name || '-'}</span></p>
          </div>
        </div>

        <StatusTimeline workOrder={workOrder} statuses={statuses} />
      </section>

      <nav className="mt-4 flex border-b border-[#d3dbea] text-[12px] font-semibold text-[#747b8a]" aria-label="Work order detail sections">
        <button type="button" onClick={() => setActiveTab('job-details')} className={`px-4 py-3 ${activeTab === 'job-details' ? 'border-b-2 border-[var(--deshazo-blue)] text-[var(--deshazo-blue)]' : ''}`}>Job Details</button>
        <button type="button" onClick={() => setActiveTab('work-performed')} className={`px-4 py-3 ${activeTab === 'work-performed' ? 'border-b-2 border-[var(--deshazo-blue)] text-[var(--deshazo-blue)]' : ''}`}>Work Performed</button>
        <span className="px-4 py-3">Reports</span>
      </nav>

      {activeTab === 'work-performed' ? <WorkPerformedPanel workOrder={workOrder} recordsByDate={workDaysByDate} /> : <section className="border border-t-0 border-[#d3dbea] bg-white px-5 py-5">
        <div>
          <h2 className="border-b border-[#d3dbea] pb-2 text-[18px] font-semibold text-[var(--deshazo-text)]">Work Order Schedule</h2>
          <div className="mt-4 flex items-center gap-5 text-[12px]"><span className="w-[150px] font-semibold underline">WO Dates</span><span className="rounded-md border border-[#c7d1e2] bg-[#f8fbff] px-4 py-2 font-semibold text-[#4d5360]">{formatDate(workOrder.startDate)} <span className="px-2 text-[#99a3ad]">to</span> {formatDate(workOrder.endDate)}</span></div>

          {trips.map((trip, index) => (
            <article key={trip.id ?? index} className="mt-4 overflow-hidden rounded-md border border-[#c8d5ea]">
              <h3 className="bg-[var(--deshazo-blue)] px-4 py-2.5 text-[12px] font-bold text-white">Trip {trip.tripNumber ?? index + 1}</h3>
              <div className="bg-[#f8fbff] px-4 py-4">
                <div className="flex items-center gap-5 text-[12px]"><span className="w-[130px] font-semibold underline">Trip Dates</span><span className="rounded-md border border-[#c7d1e2] bg-white px-4 py-2">{formatDate(trip.startDate)} <span className="px-2 text-[#99a3ad]">to</span> {formatDate(trip.endDate)}</span></div>
                <div className="mt-4 flex items-start gap-5 text-[12px]"><span className="w-[130px] shrink-0 font-semibold underline">Assigned Techs</span><div className="flex flex-wrap gap-2">{(trip.workOrderEmployees ?? []).filter((employee) => !employee.disabledAt).map((assignment, employeeIndex) => <span key={assignment.id ?? employeeIndex} className="rounded-md border border-[#c7d1e2] bg-white px-3 py-2 text-[#4d5360]">{assignment.isLead ? '★ ' : ''}{[assignment.employee?.firstName, assignment.employee?.lastName].filter(Boolean).join(' ') || 'Unknown technician'}</span>)}</div></div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-7">
          <h2 className="border-b border-[#d3dbea] pb-2 text-[18px] font-semibold text-[var(--deshazo-text)]">Work Order Details</h2>
          <dl className="mt-5 grid grid-cols-[150px_minmax(0,1fr)] gap-x-5 gap-y-6 text-[12px]">
            <dt className="font-semibold underline">Service Requested</dt><dd className="text-[#4d5360]">{workOrder.svcCommentText || workOrder.comment || 'Not Provided'}</dd>
            <dt className="font-semibold underline">PO#</dt><dd className="text-[#4d5360]">{workOrder.customerPONo || '-'}</dd>
            <dt className="font-semibold underline">Cranes</dt><dd className="flex flex-wrap gap-2">{workOrder.workOrderCranes?.length ? workOrder.workOrderCranes.map((item, index) => <span key={item.id ?? index} className="flex min-w-[92px] flex-col items-center rounded-md border border-[#c7d1e2] bg-[#f8fbff] px-3 py-2 text-[10px] font-semibold text-[#4d5360]"><CraneIcon />{item.crane?.ContactCode || item.crane?.contactCode || item.crane?.description || 'D# Not Set'}</span>) : <span className="text-[#747b8a]">No Cranes</span>}</dd>
            <dt className="border-b border-[#d3dbea] pb-5 font-semibold underline">Job Type</dt><dd className="border-b border-[#d3dbea] pb-5"><span className="rounded-full bg-[var(--deshazo-blue)] px-3 py-1 text-[10px] font-bold text-white">{workOrder.jobType || '-'}</span></dd>
            <dt className="font-semibold underline">Customer Location</dt><dd className="text-[#4d5360]">{formatAddress(workOrder)}</dd>
            <dt className="font-semibold underline">Customer Contacts</dt><dd className="flex flex-wrap gap-3">{workOrder.customerContacts?.length ? workOrder.customerContacts.map((contact, index) => <div key={contact.id ?? index} className="min-w-[190px] overflow-hidden rounded-md border border-[#c7d1e2] text-center"><p className="bg-[#eef2f8] px-3 py-2 font-semibold text-[var(--deshazo-text)]">{contact.name || '-'}</p><p className="px-3 pt-2 text-[10px] text-[#747b8a]">{contact.email || '-'}</p><p className="px-3 pb-2 text-[10px] text-[#747b8a]">{contact.phone || '-'}</p></div>) : <span className="text-[#747b8a]">No Contacts</span>}</dd>
          </dl>
        </div>
      </section>}
    </div>
  )
}
