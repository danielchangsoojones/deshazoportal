import { useEffect, useMemo, useState } from 'react'
import {
  type DeshazoScheduleEvent,
  type DeshazoScheduleResource,
  type DeshazoScheduleTooltipData,
  getDeshazoSchedule,
} from '../lib/deshazoSchedule'
import { getDeshazoWorkOrderStatuses } from '../lib/deshazoWorkOrders'

type ScheduleMode = 'week' | 'two-weeks' | 'month'

type WorkOrdersScheduleProps = {
  serviceLocationId: number | null
  onOpenWorkOrder: (workOrderId: number) => void
}

type LegendFilter = {
  label: string
  color: string
  jobType?: string
  statusName?: string
}

const legendFilters: LegendFilter[] = [
  { label: 'Any Status', color: '#818181' },
  { label: 'Other', color: '#333333', jobType: 'Other' },
  { label: 'Days Off', color: '#3b7ddd', jobType: 'Days Off' },
  { label: 'Installation - Scheduled', color: '#f8c8dc', jobType: 'Installation', statusName: 'Scheduled' },
  { label: 'Installation - In Progress', color: '#c3b1e1', jobType: 'Installation', statusName: 'In Progress' },
  { label: 'SC - Pending', color: '#dc3545', jobType: 'Service Call', statusName: 'Pending' },
  { label: 'SC - In Progress', color: '#3b8c6b', jobType: 'Service Call', statusName: 'In Progress' },
  { label: 'SC - Scheduled', color: '#fdb914', jobType: 'Service Call', statusName: 'Scheduled' },
  { label: 'Inspection', color: '#fd7e14', jobType: 'Inspection' },
]

function startOfWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayFromMonday = (result.getDay() + 6) % 7
  result.setDate(result.getDate() - dayFromMonday)
  return result
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseDate(value?: string) {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function dayDifference(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.round((endUtc - startUtc) / 86_400_000)
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).format(value)
}

function formatShortDate(value?: string) {
  const date = parseDate(value)
  return date ? formatDate(date) : '-'
}

function getRange(anchor: Date, mode: ScheduleMode) {
  if (mode === 'month') return { start: startOfMonth(anchor), end: endOfMonth(anchor) }
  const start = startOfWeek(anchor)
  return { start, end: addDays(start, mode === 'two-weeks' ? 13 : 6) }
}

function eventTooltip(event: DeshazoScheduleEvent) {
  return event.extendedProps?.tooltipData || event.tooltipData
}

function eventWorkOrderId(event: DeshazoScheduleEvent) {
  const tooltip = eventTooltip(event)
  return tooltip?.workOrderTrip?.workOrderId || tooltip?.workOrderTrip?.workOrder?.id || null
}

function eventLabel(event: DeshazoScheduleEvent) {
  if (event.title) return event.title
  const tooltip = eventTooltip(event)
  if (tooltip?.isDayOff) return tooltip.reason || 'Day Off'
  const jobNo = tooltip?.workOrderTrip?.workOrder?.jobNo
  const trip = tooltip?.workOrderTrip?.tripNumber
  return [tooltip?.customerName, jobNo ? `#${jobNo}` : '', trip ? `Trip ${trip}` : ''].filter(Boolean).join(' | ') || 'Scheduled work'
}

function eventResources(event: DeshazoScheduleEvent) {
  if (event.resourceIds?.length) return event.resourceIds.map(String)
  return event.resourceId == null ? [] : [String(event.resourceId)]
}

function resourceGroup(resource: DeshazoScheduleResource) {
  return resource.group?.trim() || resource.extendedProps?.group?.trim() || 'Without group'
}

function resourceLabel(resource: DeshazoScheduleResource) {
  return resource.title?.trim()
    || resource.name?.trim()
    || resource.employeeName?.trim()
    || resource.extendedProps?.title?.trim()
    || resource.extendedProps?.name?.trim()
    || resource.extendedProps?.employeeName?.trim()
    || 'Unnamed technician'
}

function resourceCellStyle(resource: DeshazoScheduleResource): React.CSSProperties {
  const backgroundColor = resource.backgroundColor || resource.extendedProps?.backgroundColor || '#ffffff'
  const textColor = resource.textColor
    || resource.extendedProps?.textColor
    || (backgroundColor === '#ffffff' ? '#112920' : resource.color || resource.extendedProps?.color || '#ffffff')
  return { backgroundColor, color: textColor }
}

function EventInfo({ data, onClose, onOpenWorkOrder }: { data: DeshazoScheduleTooltipData; onClose: () => void; onOpenWorkOrder: (id: number) => void }) {
  const workOrder = data.workOrderTrip?.workOrder
  const workOrderId = data.workOrderTrip?.workOrderId || workOrder?.id
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#111827]/45 px-4" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="schedule-event-title" className="w-full max-w-md rounded-md border border-[#d3dbea] bg-white shadow-[0_28px_90px_-38px_rgba(15,23,42,0.7)]">
        <div className="flex items-center justify-between border-b border-[#d3dbea] px-5 py-4">
          <h2 id="schedule-event-title" className="text-[17px] font-black text-[var(--deshazo-text)]">{data.isDayOff ? 'Day Off' : 'Work Order Details'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-md border border-[#c7d1e2] text-lg font-black text-[var(--deshazo-blue)]">×</button>
        </div>
        <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 px-5 py-5 text-[12px]">
          {data.isDayOff ? <><dt className="font-black text-[#747b8a]">Employee</dt><dd className="font-bold text-[var(--deshazo-text)]">{data.employeeName || '-'}</dd><dt className="font-black text-[#747b8a]">Reason</dt><dd className="font-bold text-[var(--deshazo-text)]">{data.reason || '-'}</dd></> : <><dt className="font-black text-[#747b8a]">Work Order #</dt><dd className="font-bold text-[var(--deshazo-text)]">{workOrder?.jobNo || '-'}</dd><dt className="font-black text-[#747b8a]">Customer</dt><dd className="font-bold text-[var(--deshazo-text)]">{data.customerName || '-'}</dd><dt className="font-black text-[#747b8a]">Trip</dt><dd className="font-bold text-[var(--deshazo-text)]">{data.workOrderTrip?.tripNumber || '-'}</dd><dt className="font-black text-[#747b8a]">Status</dt><dd className="font-bold text-[var(--deshazo-text)]">{workOrder?.status?.name || '-'}</dd><dt className="font-black text-[#747b8a]">Service Requested</dt><dd className="font-bold text-[var(--deshazo-text)]">{workOrder?.svcCommentText || workOrder?.comment || '-'}</dd><dt className="font-black text-[#747b8a]">Location</dt><dd className="font-bold text-[var(--deshazo-text)]">{data.location || '-'}</dd></>}
          <dt className="font-black text-[#747b8a]">Dates</dt><dd className="font-bold text-[var(--deshazo-text)]">{formatShortDate(data.startDate || data.workOrderTrip?.startDate)} to {formatShortDate(data.endDate || data.workOrderTrip?.endDate)}</dd>
        </dl>
        <div className="flex justify-end gap-2 border-t border-[#d3dbea] bg-[#f8fbff] px-5 py-3">
          {workOrderId ? <button type="button" onClick={() => onOpenWorkOrder(workOrderId)} className="rounded-md bg-[var(--deshazo-blue)] px-4 py-2 text-[12px] font-black text-white hover:bg-[var(--deshazo-blue-deep)]">Open Work Order</button> : null}
          <button type="button" onClick={onClose} className="rounded-md border border-[#bdc4d3] bg-white px-4 py-2 text-[12px] font-black text-[var(--deshazo-blue)]">Close</button>
        </div>
      </div>
    </div>
  )
}

export default function WorkOrdersSchedule({ serviceLocationId, onOpenWorkOrder }: WorkOrdersScheduleProps) {
  const [mode, setMode] = useState<ScheduleMode>('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [resources, setResources] = useState<DeshazoScheduleResource[]>([])
  const [events, setEvents] = useState<DeshazoScheduleEvent[]>([])
  const [selectedFilter, setSelectedFilter] = useState<LegendFilter>(legendFilters[0])
  const [statusesByName, setStatusesByName] = useState<Record<string, number>>({})
  const [selectedEvent, setSelectedEvent] = useState<DeshazoScheduleTooltipData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const range = useMemo(() => getRange(anchor, mode), [anchor, mode])
  const days = useMemo(() => Array.from({ length: dayDifference(range.start, range.end) + 1 }, (_, index) => addDays(range.start, index)), [range])

  useEffect(() => {
    let cancelled = false
    getDeshazoWorkOrderStatuses().then((statuses) => {
      if (!cancelled) setStatusesByName(Object.fromEntries(statuses.map((status) => [status.name, status.id])))
    }).catch(() => {
      if (!cancelled) setStatusesByName({})
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(async () => {
      if (cancelled) return
      setLoading(true)
      setError('')
      try {
        const data = await getDeshazoSchedule({
          startDate: toIsoDate(range.start),
          endDate: toIsoDate(range.end),
          serviceLocationId,
          jobType: selectedFilter.jobType === 'Days Off' ? null : selectedFilter.jobType,
          statusId: selectedFilter.statusName ? statusesByName[selectedFilter.statusName] : null,
        })
        if (cancelled) return
        setResources(data.resources)
        setEvents(selectedFilter.jobType === 'Days Off' ? data.events.filter((event) => eventTooltip(event)?.isDayOff) : data.events)
      } catch (loadError) {
        if (cancelled) return
        setResources([])
        setEvents([])
        setError(loadError instanceof Error ? loadError.message : 'There was an error with your request.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [range, refreshKey, selectedFilter, serviceLocationId, statusesByName])

  const groupedResources = useMemo(() => {
    const groups = new Map<string, DeshazoScheduleResource[]>()
    resources.forEach((resource) => {
      const group = resourceGroup(resource)
      const groupResources = groups.get(group) || []
      groupResources.push(resource)
      groups.set(group, groupResources)
    })
    return Array.from(groups.entries())
  }, [resources])

  const eventPosition = (event: DeshazoScheduleEvent) => {
    const eventStart = parseDate(event.start) || range.start
    const eventEnd = parseDate(event.end) || addDays(eventStart, 1)
    const startIndex = Math.max(0, dayDifference(range.start, eventStart))
    const exclusiveEndIndex = Math.min(days.length, Math.max(startIndex + 1, dayDifference(range.start, eventEnd)))
    return { left: `${(startIndex / days.length) * 100}%`, width: `${((exclusiveEndIndex - startIndex) / days.length) * 100}%` }
  }

  const moveRange = (direction: -1 | 1) => {
    setAnchor((current) => mode === 'month' ? addMonths(current, direction) : addDays(current, direction * (mode === 'two-weeks' ? 14 : 7)))
  }

  return (
    <div className="flex min-h-screen flex-col px-5 py-5 lg:px-7">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[clamp(24px,2.4vw,34px)] font-black text-[var(--deshazo-text)]">Work Orders Schedule</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] font-bold text-[#747b8a]"><span className="rounded-md border border-[#d3dbea] bg-white px-3 py-2">{formatDate(range.start)}</span><span>to</span><span className="rounded-md border border-[#d3dbea] bg-white px-3 py-2">{formatDate(range.end)}</span><span className="rounded-sm bg-[#e6efff] px-2.5 py-1 text-[10px] font-black text-[var(--deshazo-blue)]">Showing {selectedFilter.label}</span></div>
        </div>
        <span className="rounded-full border border-[#c8d5ea] bg-[#eef4ff] px-3 py-1 text-[11px] font-black text-[var(--deshazo-blue)]">Read-only schedule</span>
      </header>

      <section className="relative mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[#d3dbea] bg-white shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
        <div className="flex flex-col gap-3 border-b border-[#d3dbea] bg-[#f8fbff] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <select value={mode} onChange={(event) => { const nextMode = event.target.value as ScheduleMode; setMode(nextMode); setAnchor(new Date()) }} className="h-9 rounded-md border border-[#c7d1e2] bg-white px-3 text-[12px] font-black text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]">
            <option value="week">This Week</option>
            <option value="two-weeks">This Week and Next Week</option>
            <option value="month">This Month</option>
          </select>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => moveRange(-1)} aria-label="Previous period" className="h-9 rounded-md border border-[#bdc4d3] bg-white px-4 text-lg font-black text-[var(--deshazo-blue)] hover:bg-[#e8eefb]">‹</button>
            <h2 className="min-w-[170px] text-center text-[17px] font-black text-[var(--deshazo-text)]">{new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(range.start)}</h2>
            <button type="button" onClick={() => moveRange(1)} aria-label="Next period" className="h-9 rounded-md border border-[#bdc4d3] bg-white px-4 text-lg font-black text-[var(--deshazo-blue)] hover:bg-[#e8eefb]">›</button>
            <button type="button" onClick={() => setRefreshKey((value) => value + 1)} aria-label="Refresh schedule" className="h-9 rounded-md bg-[var(--deshazo-blue)] px-3 text-base font-black text-white hover:bg-[var(--deshazo-blue-deep)]">↻</button>
          </div>
        </div>

        {error ? <p className="m-4 rounded-md border border-[#f0c4bd] bg-[#fff7f5] px-4 py-3 text-[13px] font-bold text-[#a2472f]">{error}</p> : null}

        {loading ? (
          <div className="absolute inset-x-0 bottom-0 top-[64px] z-50 flex items-center justify-center bg-[#f8fbff]/90 backdrop-blur-[1px]" role="status" aria-live="polite" aria-label="Loading schedule">
            <div className="rounded-md border border-[#d3dbea] bg-white px-8 py-6 text-center shadow-[0_24px_70px_-34px_rgba(17,24,39,0.38)]">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#d3dbea] border-t-[var(--deshazo-blue)]" />
              <p className="mt-4 text-[13px] font-black text-[var(--deshazo-text)]">Loading schedule...</p>
              <p className="mt-1 text-[11px] font-semibold text-[#747b8a]">Fetching technicians and work orders</p>
            </div>
          </div>
        ) : null}

        <div className="min-h-[560px] flex-1 overflow-auto">
          <div style={{ minWidth: `${200 + days.length * 72}px` }}>
            <div className="sticky top-0 z-30 flex border-b border-[#d3dbea] bg-[#eef2f8]">
              <div className="sticky left-0 z-40 flex w-[200px] shrink-0 items-center border-r border-[#d3dbea] bg-[#eef2f8] px-3 py-3 text-[11px] font-black uppercase text-[#747b8a]">Technicians</div>
              <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(72px, 1fr))` }}>
                {days.map((day) => <div key={toIsoDate(day)} className={`border-r border-[#d3dbea] px-1 py-2 text-center text-[10px] font-black ${day.getDay() === 0 || day.getDay() === 6 ? 'bg-[#e8eefb] text-[var(--deshazo-blue)]' : 'text-[#747b8a]'}`}>{new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: '2-digit' }).format(day)}</div>)}
              </div>
            </div>

            {groupedResources.length ? groupedResources.map(([group, groupResources]) => (
              <section key={group}>
                <div className="sticky left-0 z-20 flex border-b border-[#c8d5ea] bg-[#e6efff]">
                  <div className="sticky left-0 z-20 w-[200px] shrink-0 border-r border-[#c8d5ea] bg-[#e6efff] px-3 py-2 text-[11px] font-black text-[var(--deshazo-blue)]">⌄ &nbsp;{group}</div>
                  <div className="flex-1" />
                </div>
                {groupResources.map((resource) => {
                  const resourceEvents = events.filter((event) => eventResources(event).includes(String(resource.id)))
                  return (
                    <div key={String(resource.id)} className="flex min-h-[44px] border-b border-[#e2e8f2] hover:bg-[#f8fbff]">
                      <div className="sticky left-0 z-10 flex w-[200px] shrink-0 items-center border-r border-[#d3dbea] px-3 py-2 text-[11px] font-bold" style={resourceCellStyle(resource)}>{resourceLabel(resource)}</div>
                      <div className="relative flex-1 bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc((100%_/_var(--schedule-days))_-_1px),#e2e8f2_calc((100%_/_var(--schedule-days))_-_1px),#e2e8f2_calc(100%_/_var(--schedule-days)))]" style={{ '--schedule-days': days.length } as React.CSSProperties}>
                        {resourceEvents.map((event) => {
                          const tooltip = eventTooltip(event)
                          const workOrderId = eventWorkOrderId(event)
                          return <button key={String(event.id)} type="button" title={eventLabel(event)} onClick={() => tooltip ? setSelectedEvent(tooltip) : workOrderId ? onOpenWorkOrder(workOrderId) : undefined} className="absolute top-1.5 z-[2] h-8 truncate rounded-sm border px-2 text-left text-[10px] font-black text-white shadow-sm transition hover:z-[3] hover:brightness-95" style={{ ...eventPosition(event), backgroundColor: event.backgroundColor || event.color || '#818181', borderColor: event.borderColor || event.backgroundColor || event.color || '#818181', color: '#ffffff' }}>{eventLabel(event)}</button>
                        })}
                      </div>
                    </div>
                  )
                })}
              </section>
            )) : <div className="flex min-h-[460px] items-center justify-center text-[13px] font-bold text-[#747b8a]">There is no data to show</div>}
          </div>
        </div>

        <div className="border-t border-[#d3dbea] bg-[#f8fbff] p-3">
          <p className="mb-2 text-center text-[11px] font-black uppercase text-[var(--deshazo-text)]">Filter By Calendar Color Indicators</p>
          <div className="flex flex-wrap justify-center gap-1.5">{legendFilters.map((filter) => <button key={filter.label} type="button" onClick={() => setSelectedFilter(filter)} className={`rounded-sm border-2 px-3 py-2 text-[10px] font-black text-white transition ${selectedFilter.label === filter.label ? 'border-[var(--deshazo-blue)] ring-2 ring-[#dbe5ff]' : 'border-transparent'}`} style={{ backgroundColor: filter.color }}>{filter.label}</button>)}</div>
        </div>
      </section>

      {selectedEvent ? <EventInfo data={selectedEvent} onClose={() => setSelectedEvent(null)} onOpenWorkOrder={onOpenWorkOrder} /> : null}
    </div>
  )
}
