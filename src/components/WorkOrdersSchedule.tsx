import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  type DeshazoScheduleEvent,
  type DeshazoScheduleResource,
  type DeshazoScheduleTooltipData,
  getDeshazoSchedule,
} from '../lib/deshazoSchedule'
import { type DeshazoWorkOrder, getDeshazoWorkOrders, getDeshazoWorkOrderStatuses } from '../lib/deshazoWorkOrders'
import type { ScheduleSuggestion } from '../lib/schedulingAssistant'
import ScheduleAssistant from './ScheduleAssistant'

type ScheduleMode = 'week' | 'two-weeks' | 'month'

type WorkOrdersScheduleProps = {
  sampleMode?: boolean
  localAssistantDemo?: boolean
  serviceLocationId: number | null
  onOpenWorkOrder: (workOrderId: number) => void
}

type LegendFilter = {
  label: string
  color: string
  jobType?: string
  statusName?: string
}

type DemoDropTarget = {
  resourceId: string
  dayIndex: number
}

type ScheduleEditorState = {
  eventId: string
  event: DeshazoScheduleEvent
}

type TaskEditorFields = {
  name: string
  project: string
  resourceId: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  allDay: boolean
  repeat: boolean
  utilization: string
  busyDays: string
  busyHours: string
  duration: string
  description: string
  officeNote: string
  fieldNote: string
  jobNumber: string
  status: string
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

function formatInputDate(value?: string) {
  const date = parseDate(value)
  return date ? toIsoDate(date) : ''
}

function formatInputTime(value?: string) {
  if (!value) return ''
  const match = value.match(/T(\d{2}):(\d{2})/)
  return match ? `${match[1]}:${match[2]}` : ''
}

function combineDateAndTime(date: string, time: string) {
  if (!date) return ''
  return time ? `${date}T${time}:00` : date
}

function getRange(anchor: Date, mode: ScheduleMode) {
  if (mode === 'month') return { start: startOfMonth(anchor), end: endOfMonth(anchor) }
  const start = startOfWeek(anchor)
  return { start, end: addDays(start, mode === 'two-weeks' ? 13 : 6) }
}

function eventTooltip(event: DeshazoScheduleEvent) {
  return event.extendedProps?.tooltipData || event.tooltipData
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

function getEditorFields(event: DeshazoScheduleEvent, resources: DeshazoScheduleResource[]): TaskEditorFields {
  const tooltip = eventTooltip(event)
  const workOrder = tooltip?.workOrderTrip?.workOrder
  const resourceId = eventResources(event)[0] || String(resources[0]?.id || '')
  const start = event.start || tooltip?.startDate || tooltip?.workOrderTrip?.startDate || ''
  const end = event.end || tooltip?.endDate || tooltip?.workOrderTrip?.endDate || start

  return {
    name: eventLabel(event),
    project: workOrder?.jobType || '',
    resourceId,
    startDate: formatInputDate(start),
    startTime: formatInputTime(start),
    endDate: formatInputDate(end),
    endTime: formatInputTime(end),
    allDay: !formatInputTime(start) && !formatInputTime(end),
    repeat: false,
    utilization: '100',
    busyDays: '1',
    busyHours: '0:0 h:m',
    duration: '1 d',
    description: workOrder?.svcCommentText || workOrder?.comment || '',
    officeNote: '',
    fieldNote: tooltip?.location || '',
    jobNumber: workOrder?.jobNo || '',
    status: workOrder?.status?.name || '',
  }
}

function applyEditorFieldsToEvent(
  event: DeshazoScheduleEvent,
  fields: TaskEditorFields,
  resources: DeshazoScheduleResource[],
): DeshazoScheduleEvent {
  const tooltip = eventTooltip(event)
  const targetResource = resources.find((resource) => String(resource.id) === fields.resourceId)
  const start = combineDateAndTime(fields.startDate, fields.allDay ? '' : fields.startTime)
  const end = combineDateAndTime(fields.endDate || fields.startDate, fields.allDay ? '' : fields.endTime)
  const nextWorkOrder = {
    ...tooltip?.workOrderTrip?.workOrder,
    jobNo: fields.jobNumber,
    jobType: fields.project,
    svcCommentText: fields.description,
    status: { ...tooltip?.workOrderTrip?.workOrder?.status, name: fields.status },
  }
  const nextTooltip: DeshazoScheduleTooltipData | undefined = tooltip
    ? {
        ...tooltip,
        employeeName: targetResource ? resourceLabel(targetResource) : tooltip.employeeName,
        startDate: start,
        endDate: end,
        location: fields.fieldNote,
        workOrderTrip: tooltip.workOrderTrip
          ? {
              ...tooltip.workOrderTrip,
              startDate: start,
              endDate: end,
              workOrder: nextWorkOrder,
            }
          : {
              startDate: start,
              endDate: end,
              workOrder: nextWorkOrder,
            },
      }
    : {
        employeeName: targetResource ? resourceLabel(targetResource) : '',
        startDate: start,
        endDate: end,
        location: fields.fieldNote,
        workOrderTrip: {
          startDate: start,
          endDate: end,
          workOrder: nextWorkOrder,
        },
      }

  return {
    ...event,
    title: fields.name,
    resourceId: fields.resourceId,
    resourceIds: [fields.resourceId],
    start,
    end,
    tooltipData: event.tooltipData || !event.extendedProps ? nextTooltip : event.tooltipData,
    extendedProps: event.extendedProps
      ? { ...event.extendedProps, tooltipData: nextTooltip }
      : event.extendedProps,
  }
}

function demoResourceIsNamedTechnician(resource: DeshazoScheduleResource) {
  const name = resource.title?.trim()
    || resource.name?.trim()
    || resource.employeeName?.trim()
    || resource.extendedProps?.title?.trim()
    || resource.extendedProps?.name?.trim()
    || resource.extendedProps?.employeeName?.trim()
    || ''
  const group = resource.group?.trim() || resource.extendedProps?.group?.trim() || ''
  return /[a-z][a-z'’-]*[\s,]+[a-z]/i.test(name) && !/\bunassigned\b|\binstallations?\b/i.test(`${group} ${name}`)
}

function eventContainsOneillSteel(event: DeshazoScheduleEvent) {
  const tooltip = eventTooltip(event)
  const value = `${tooltip?.customerName || ''} ${event.title || ''}`.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]/g, '')
  return value.includes('oneillsteel')
}

function addLocalOneillDemoVisit(
  resources: DeshazoScheduleResource[],
  events: DeshazoScheduleEvent[],
  start: Date,
  end: Date,
) {
  const eligibleResources = resources.filter(demoResourceIsNamedTechnician)
  if (!eligibleResources.length) return events

  const tomorrow = addDays(new Date(), 1)
  tomorrow.setHours(12, 0, 0, 0)
  const firstDay = start > tomorrow ? new Date(start) : tomorrow
  const usedResourceIds = new Set(events.filter(eventContainsOneillSteel).flatMap(eventResources))
  const placements: Array<{ resource: DeshazoScheduleResource; date: Date }> = []
  const workingEvents = [...events]
  for (let date = new Date(firstDay); date <= end && placements.length < 3; date = addDays(date, 1)) {
    if (date.getDay() === 0 || date.getDay() === 6) continue
    const iso = toIsoDate(date)
    const resource = eligibleResources.find((candidate) => !usedResourceIds.has(String(candidate.id)) && !workingEvents.some((event) => {
      if (!eventResources(event).includes(String(candidate.id))) return false
      const eventStart = parseDate(event.start || eventTooltip(event)?.startDate || eventTooltip(event)?.workOrderTrip?.startDate)
      const eventEnd = parseDate(event.end || eventTooltip(event)?.endDate || eventTooltip(event)?.workOrderTrip?.endDate) || eventStart
      return Boolean(eventStart && eventEnd && iso >= toIsoDate(eventStart) && iso <= toIsoDate(eventEnd))
    }))
    if (!resource) continue
    usedResourceIds.add(String(resource.id))
    placements.push({ resource, date: new Date(date) })
  }
  const startHours = [7, 8, 10]
  const demoEvents = placements.map((placement, index): DeshazoScheduleEvent => {
    const iso = toIsoDate(placement.date)
    const technician = resourceLabel(placement.resource)
    const startHour = startHours[index]
    const endHour = startHour + 3
    const startTime = `${iso}T${String(startHour).padStart(2, '0')}:00:00`
    const endTime = `${iso}T${String(endHour).padStart(2, '0')}:00:00`
    return {
      id: `local-oneill-anchor-${String(placement.resource.id)}-${iso}`,
      resourceId: placement.resource.id,
      resourceIds: [placement.resource.id],
      title: "O'Neill Steel · Existing Visit",
      start: startTime,
      end: endTime,
      backgroundColor: '#2f7d68',
      borderColor: '#236451',
      tooltipData: {
        customerName: "O'Neill Steel",
        employeeName: technician,
        location: 'O’Neill Steel facility',
        startDate: startTime,
        endDate: endTime,
        workOrderTrip: {
          tripNumber: 1,
          startDate: startTime,
          endDate: endTime,
          workOrder: { jobNo: `DEMO-ONEILL-${index + 1}`, jobType: 'Existing Service Visit', status: { name: 'Scheduled' } },
        },
      },
    }
  })
  return [...events, ...demoEvents]
}

function TaskEditorPanel({
  editor,
  resources,
  onClose,
  onSave,
  onDelete,
  onOpenWorkOrder,
}: {
  editor: ScheduleEditorState
  resources: DeshazoScheduleResource[]
  onClose: () => void
  onSave: (eventId: string, fields: TaskEditorFields) => void
  onDelete: (eventId: string) => void
  onOpenWorkOrder: (id: number) => void
}) {
  const data = eventTooltip(editor.event)
  const workOrder = data?.workOrderTrip?.workOrder
  const workOrderId = data?.workOrderTrip?.workOrderId || workOrder?.id
  const fields = getEditorFields(editor.event, resources)

  const readFields = (form: HTMLFormElement): TaskEditorFields => {
    const formData = new FormData(form)
    return {
      name: String(formData.get('name') || '').trim() || 'Scheduled work',
      project: String(formData.get('project') || '').trim(),
      resourceId: String(formData.get('resourceId') || fields.resourceId),
      startDate: String(formData.get('startDate') || '').trim(),
      startTime: String(formData.get('startTime') || '').trim(),
      endDate: String(formData.get('endDate') || '').trim(),
      endTime: String(formData.get('endTime') || '').trim(),
      allDay: formData.get('allDay') === 'on',
      repeat: formData.get('repeat') === 'on',
      utilization: String(formData.get('utilization') || '').trim(),
      busyDays: String(formData.get('busyDays') || '').trim(),
      busyHours: String(formData.get('busyHours') || '').trim(),
      duration: String(formData.get('duration') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      officeNote: String(formData.get('officeNote') || '').trim(),
      fieldNote: String(formData.get('fieldNote') || '').trim(),
      jobNumber: String(formData.get('jobNumber') || '').trim(),
      status: String(formData.get('status') || '').trim(),
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSave(editor.eventId, readFields(event.currentTarget))
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] border-t-4 border-[#ed1c24] bg-white shadow-[0_-24px_80px_-36px_rgba(15,23,42,0.72)]">
      <form onSubmit={handleSubmit}>
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#d3dbea] bg-[#f8fbff] px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={onClose} aria-label="Close task editor" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#bdc4d3] bg-white text-xl font-black text-[var(--deshazo-blue)]">‹</button>
            <h2 id="schedule-event-title" className="truncate text-[18px] font-black text-[var(--deshazo-text)]">Task</h2>
            <button type="submit" name="action" value="save" className="rounded-md bg-[var(--deshazo-blue)] px-4 py-2 text-[12px] font-black text-white hover:bg-[var(--deshazo-blue-deep)]">Save</button>
            <button type="button" onClick={() => onDelete(editor.eventId)} className="rounded-md border border-[#e3b4ac] bg-white px-3 py-2 text-[12px] font-black text-[#a2472f] hover:bg-[#fff7f5]">Delete</button>
          </div>
          <div className="flex items-center gap-2">
            {workOrderId ? <button type="button" onClick={() => onOpenWorkOrder(workOrderId)} className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[var(--deshazo-blue)] hover:bg-[#eef4ff]">Open Work Order</button> : null}
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-md border border-[#bdc4d3] bg-white text-xl font-black text-[var(--deshazo-blue)]">×</button>
          </div>
        </div>

        <div className="max-h-[42vh] overflow-auto px-4 py-3">
          <div className="grid gap-3 text-[11px] font-bold text-[#4d596c] lg:grid-cols-[minmax(170px,1.15fr)_minmax(130px,0.8fr)_minmax(130px,0.8fr)_minmax(160px,0.9fr)_minmax(160px,0.9fr)]">
            <label className="flex flex-col gap-1">
              Name
              <input name="name" defaultValue={fields.name} className="h-8 rounded-sm border border-[#c7d1e2] px-2 text-[12px] font-semibold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]" />
            </label>
            <label className="flex flex-col gap-1">
              Technician
              <select name="resourceId" defaultValue={fields.resourceId} className="h-8 rounded-sm border border-[#c7d1e2] bg-white px-2 text-[12px] font-semibold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]">
                {resources.map((resource) => <option key={String(resource.id)} value={String(resource.id)}>{resourceLabel(resource)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Project
              <input name="project" defaultValue={fields.project} className="h-8 rounded-sm border border-[#c7d1e2] px-2 text-[12px] font-semibold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]" />
            </label>
            <label className="flex flex-col gap-1">
              Description
              <input name="description" defaultValue={fields.description} className="h-8 rounded-sm border border-[#c7d1e2] px-2 text-[12px] font-semibold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]" />
            </label>
            <label className="flex flex-col gap-1">
              Office Note
              <input name="officeNote" defaultValue={fields.officeNote} className="h-8 rounded-sm border border-[#c7d1e2] px-2 text-[12px] font-semibold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]" />
            </label>
          </div>

          <div className="mt-3 grid gap-3 text-[11px] font-bold text-[#4d596c] sm:grid-cols-2 lg:grid-cols-[120px_96px_120px_96px_80px_72px_92px_92px_120px_140px]">
            <label className="flex flex-col gap-1">
              Start
              <input type="date" name="startDate" defaultValue={fields.startDate} className="h-8 rounded-sm border border-[#c7d1e2] px-2 text-[12px] font-semibold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]" />
            </label>
            <label className="flex flex-col gap-1">
              Time
              <input type="time" name="startTime" defaultValue={fields.startTime} className="h-8 rounded-sm border border-[#c7d1e2] px-2 text-[12px] font-semibold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]" />
            </label>
            <label className="flex flex-col gap-1">
              End
              <input type="date" name="endDate" defaultValue={fields.endDate} className="h-8 rounded-sm border border-[#c7d1e2] px-2 text-[12px] font-semibold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]" />
            </label>
            <label className="flex flex-col gap-1">
              Time
              <input type="time" name="endTime" defaultValue={fields.endTime} className="h-8 rounded-sm border border-[#c7d1e2] px-2 text-[12px] font-semibold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]" />
            </label>
            <label className="flex flex-col gap-1">
              Utilization
              <input name="utilization" defaultValue={fields.utilization} className="h-8 rounded-sm border border-[#c7d1e2] px-2 text-[12px] font-semibold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]" />
            </label>
            <label className="flex flex-col gap-1">
              Busy
              <input name="busyDays" defaultValue={fields.busyDays} className="h-8 rounded-sm border border-[#c7d1e2] px-2 text-[12px] font-semibold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]" />
            </label>
            <label className="flex flex-col gap-1">
              Busy Time
              <input name="busyHours" defaultValue={fields.busyHours} className="h-8 rounded-sm border border-[#c7d1e2] px-2 text-[12px] font-semibold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]" />
            </label>
            <label className="flex flex-col gap-1">
              Duration
              <input name="duration" defaultValue={fields.duration} className="h-8 rounded-sm border border-[#c7d1e2] px-2 text-[12px] font-semibold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]" />
            </label>
            <label className="flex flex-col gap-1">
              Job Number
              <input name="jobNumber" defaultValue={fields.jobNumber} className="h-8 rounded-sm border border-[#c7d1e2] px-2 text-[12px] font-semibold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]" />
            </label>
            <label className="flex flex-col gap-1">
              Status
              <select name="status" defaultValue={fields.status} className="h-8 rounded-sm border border-[#c7d1e2] bg-white px-2 text-[12px] font-semibold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]">
                {['', 'To Be Assigned', 'Pending', 'Scheduled', 'Assigned', 'In Progress', 'Waiting for parts', 'Completed', 'Needs Review', 'Tentative'].map((status) => <option key={status} value={status}>{status || '-'}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-3 grid gap-3 text-[11px] font-bold text-[#4d596c] lg:grid-cols-[120px_120px_1fr]">
            <label className="flex h-8 items-center gap-2">
              <input type="checkbox" name="allDay" defaultChecked={fields.allDay} className="h-4 w-4 accent-[var(--deshazo-blue)]" />
              All day
            </label>
            <label className="flex h-8 items-center gap-2">
              <input type="checkbox" name="repeat" defaultChecked={fields.repeat} className="h-4 w-4 accent-[var(--deshazo-blue)]" />
              Repeat
            </label>
            <label className="flex flex-col gap-1">
              Field Note
              <input name="fieldNote" defaultValue={fields.fieldNote} className="h-8 rounded-sm border border-[#c7d1e2] px-2 text-[12px] font-semibold text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]" />
            </label>
          </div>
          <p className="mt-2 text-[10px] font-semibold text-[#747b8a]">Demo only. Saved edits update this browser view and are not sent to DeShazo.</p>
        </div>
      </form>
    </div>
  )
}

export default function WorkOrdersSchedule({ sampleMode = false, localAssistantDemo = false, serviceLocationId, onOpenWorkOrder }: WorkOrdersScheduleProps) {
  const [mode, setMode] = useState<ScheduleMode>('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [resources, setResources] = useState<DeshazoScheduleResource[]>([])
  const [events, setEvents] = useState<DeshazoScheduleEvent[]>([])
  const [selectedFilter, setSelectedFilter] = useState<LegendFilter>(legendFilters[0])
  const [statusesByName, setStatusesByName] = useState<Record<string, number>>({})
  const [pendingWorkOrders, setPendingWorkOrders] = useState<DeshazoWorkOrder[]>([])
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([])
  const [focusedSuggestionId, setFocusedSuggestionId] = useState('')
  const [selectedEditor, setSelectedEditor] = useState<ScheduleEditorState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [demoChanges, setDemoChanges] = useState(0)
  const [draggedEventId, setDraggedEventId] = useState('')
  const [dropTarget, setDropTarget] = useState<DemoDropTarget | null>(null)
  const [demoNotice, setDemoNotice] = useState('')
  const scheduleScrollRef = useRef<HTMLDivElement | null>(null)
  const resourceRowsRef = useRef(new Map<string, HTMLDivElement>())
  const originalEventsRef = useRef<DeshazoScheduleEvent[]>([])
  const suppressEventClickRef = useRef(false)
  const range = useMemo(() => getRange(anchor, mode), [anchor, mode])
  const days = useMemo(() => Array.from({ length: dayDifference(range.start, range.end) + 1 }, (_, index) => addDays(range.start, index)), [range])
  const selectedStatusId = selectedFilter.statusName ? statusesByName[selectedFilter.statusName] : null

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
    const pendingStatusId = Object.entries(statusesByName).find(([name]) => name.toLowerCase() === 'pending')?.[1]
    if (!pendingStatusId) {
      setPendingWorkOrders([])
      return
    }

    let cancelled = false
    getDeshazoWorkOrders({
      page: 0,
      pageSize: 200,
      sortBy: 'startDate',
      direction: 'asc',
      statusId: pendingStatusId,
      serviceLocationId,
    }).then((result) => {
      if (!cancelled) setPendingWorkOrders(result.data)
    }).catch(() => {
      if (!cancelled) setPendingWorkOrders([])
    })
    return () => { cancelled = true }
  }, [refreshKey, serviceLocationId, statusesByName])

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
          statusId: selectedStatusId,
        })
        if (cancelled) return
        const filteredEvents = selectedFilter.jobType === 'Days Off' ? data.events.filter((event) => eventTooltip(event)?.isDayOff) : data.events
        const nextEvents = localAssistantDemo ? addLocalOneillDemoVisit(data.resources, filteredEvents, range.start, range.end) : filteredEvents
        setResources(data.resources)
        setEvents(nextEvents)
        originalEventsRef.current = nextEvents
        setDemoChanges(0)
        setDemoNotice('')
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
  }, [localAssistantDemo, range, refreshKey, selectedFilter, selectedStatusId, serviceLocationId])

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

  const suggestionPosition = (suggestion: ScheduleSuggestion) => {
    const suggestionStart = parseDate(suggestion.start) || range.start
    const suggestionEnd = parseDate(suggestion.end) || addDays(suggestionStart, 1)
    const startIndex = Math.max(0, dayDifference(range.start, suggestionStart))
    const exclusiveEndIndex = Math.min(days.length, Math.max(startIndex + 1, dayDifference(range.start, suggestionEnd)))
    return { left: `${(startIndex / days.length) * 100}%`, width: `${((exclusiveEndIndex - startIndex) / days.length) * 100}%` }
  }

  const focusSuggestion = useCallback((suggestion: ScheduleSuggestion) => {
    setFocusedSuggestionId(suggestion.id)
    const row = resourceRowsRef.current.get(String(suggestion.resourceId))
    row?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    const suggestionDate = parseDate(suggestion.start)
    const scrollContainer = scheduleScrollRef.current
    if (suggestionDate && scrollContainer) {
      const dayIndex = Math.max(0, dayDifference(range.start, suggestionDate))
      scrollContainer.scrollTo({
        left: Math.max(0, 200 + dayIndex * 72 - scrollContainer.clientWidth / 2),
        behavior: 'smooth',
      })
    }
    window.setTimeout(() => setFocusedSuggestionId((current) => current === suggestion.id ? '' : current), 4_000)
  }, [range.start])

  const moveRange = (direction: -1 | 1) => {
    setAnchor((current) => mode === 'month' ? addMonths(current, direction) : addDays(current, direction * (mode === 'two-weeks' ? 14 : 7)))
  }

  const resetDemoChanges = () => {
    setEvents(originalEventsRef.current)
    setSuggestions([])
    setDemoChanges(0)
    setDraggedEventId('')
    setDropTarget(null)
    setDemoNotice('Demo changes reset to the last schedule loaded from DeShazo.')
  }

  const targetDayIndex = (event: React.DragEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0
    return Math.min(days.length - 1, Math.max(0, Math.floor(ratio * days.length)))
  }

  const handleEventDrop = (resourceId: string, dayIndex: number) => {
    const sourceEvent = events.find((event) => String(event.id) === draggedEventId)
    const targetResource = resources.find((resource) => String(resource.id) === resourceId)
    const targetDate = days[dayIndex]
    if (!sourceEvent || !targetResource || !targetDate) return

    const tooltip = eventTooltip(sourceEvent)
    const sourceVisualStart = parseDate(sourceEvent.start) || parseDate(tooltip?.startDate) || parseDate(tooltip?.workOrderTrip?.startDate) || targetDate
    const sourceVisualEnd = parseDate(sourceEvent.end) || addDays(sourceVisualStart, 1)
    const visualDuration = Math.max(1, dayDifference(sourceVisualStart, sourceVisualEnd))
    const sourceDetailStart = parseDate(tooltip?.workOrderTrip?.startDate || tooltip?.startDate) || sourceVisualStart
    const sourceDetailEnd = parseDate(tooltip?.workOrderTrip?.endDate || tooltip?.endDate) || sourceDetailStart
    const detailDuration = Math.max(0, dayDifference(sourceDetailStart, sourceDetailEnd))
    const nextStart = toIsoDate(targetDate)
    const nextVisualEnd = toIsoDate(addDays(targetDate, visualDuration))
    const nextDetailEnd = toIsoDate(addDays(targetDate, detailDuration))
    const currentResources = eventResources(sourceEvent)
    const samePlacement = currentResources.length === 1 && currentResources[0] === resourceId && toIsoDate(sourceVisualStart) === nextStart
    if (samePlacement) return

    const nextTooltip: DeshazoScheduleTooltipData | undefined = tooltip
      ? {
          ...tooltip,
          employeeName: resourceLabel(targetResource),
          startDate: nextStart,
          endDate: nextDetailEnd,
          workOrderTrip: tooltip.workOrderTrip
            ? { ...tooltip.workOrderTrip, startDate: nextStart, endDate: nextDetailEnd }
            : tooltip.workOrderTrip,
        }
      : undefined

    setEvents((current) => current.map((event) => {
      if (String(event.id) !== draggedEventId) return event
      return {
        ...event,
        resourceId,
        resourceIds: [resourceId],
        start: nextStart,
        end: nextVisualEnd,
        tooltipData: event.tooltipData ? nextTooltip : event.tooltipData,
        extendedProps: event.extendedProps
          ? { ...event.extendedProps, tooltipData: nextTooltip }
          : event.extendedProps,
      }
    }))
    setSuggestions([])
    setDemoChanges((count) => count + 1)
    setDemoNotice(`${eventLabel(sourceEvent)} moved to ${resourceLabel(targetResource)} on ${formatDate(targetDate)}. Demo only—nothing was sent to DeShazo.`)
    suppressEventClickRef.current = true
    window.setTimeout(() => { suppressEventClickRef.current = false }, 250)
  }

  const saveTaskEditor = (eventId: string, fields: TaskEditorFields) => {
    let savedEvent: DeshazoScheduleEvent | null = null
    setEvents((current) => current.map((event) => {
      if (String(event.id) !== eventId) return event
      savedEvent = applyEditorFieldsToEvent(event, fields, resources)
      return savedEvent
    }))
    setSuggestions([])
    setDemoChanges((count) => count + 1)
    setDemoNotice(`${fields.name} updated locally. Demo only—nothing was sent to DeShazo.`)
    setSelectedEditor(savedEvent ? { eventId, event: savedEvent } : null)
  }

  const deleteTaskEditor = (eventId: string) => {
    const sourceEvent = events.find((event) => String(event.id) === eventId)
    setEvents((current) => current.filter((event) => String(event.id) !== eventId))
    setSuggestions([])
    setDemoChanges((count) => count + 1)
    setDemoNotice(`${sourceEvent ? eventLabel(sourceEvent) : 'Task'} removed locally. Demo only—nothing was sent to DeShazo.`)
    setSelectedEditor(null)
  }

  return (
    <div className="flex min-h-screen flex-col px-5 py-5 lg:px-7">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[clamp(24px,2.4vw,34px)] font-black text-[var(--deshazo-text)]">Work Orders Schedule</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] font-bold text-[#747b8a]"><span className="rounded-md border border-[#d3dbea] bg-white px-3 py-2">{formatDate(range.start)}</span><span>to</span><span className="rounded-md border border-[#d3dbea] bg-white px-3 py-2">{formatDate(range.end)}</span><span className="rounded-sm bg-[#e6efff] px-2.5 py-1 text-[10px] font-black text-[var(--deshazo-blue)]">Showing {selectedFilter.label}</span></div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${editMode ? 'border-[#e5bd68] bg-[#fff7df] text-[#8a5b00]' : 'border-[#c8d5ea] bg-[#eef4ff] text-[var(--deshazo-blue)]'}`}>
            {editMode ? `Demo editing${demoChanges ? ` · ${demoChanges} change${demoChanges === 1 ? '' : 's'}` : ''}` : 'Read-only schedule'}
          </span>
          <button
            type="button"
            onClick={() => {
              setEditMode((current) => !current)
              setDraggedEventId('')
              setDropTarget(null)
              setDemoNotice('')
            }}
            className={`rounded-md border px-4 py-2 text-[11px] font-black transition ${editMode ? 'border-[#d5a849] bg-[#fff7df] text-[#805400] hover:bg-[#ffefbd]' : 'border-[var(--deshazo-blue)] bg-white text-[var(--deshazo-blue)] hover:bg-[#eef4ff]'}`}
          >
            {editMode ? 'Done Editing' : 'Edit Schedule'}
          </button>
        </div>
      </header>

      <section className="relative mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[#d3dbea] bg-white shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
        {editMode ? (
          <div className="flex flex-col gap-2 border-b border-[#e7c46f] bg-[#fff8df] px-4 py-3 text-[11px] font-bold text-[#76520b] sm:flex-row sm:items-center sm:justify-between">
            <p><strong>Demo edit mode:</strong> drag an item left or right to change its date, or drop it on another technician. Changes stay only in this browser tab and are also visible to the AI assistant.</p>
            {demoChanges ? <button type="button" onClick={resetDemoChanges} className="shrink-0 rounded-md border border-[#d5a849] bg-white px-3 py-1.5 font-black text-[#805400] hover:bg-[#fff2c7]">Reset demo changes</button> : null}
          </div>
        ) : null}
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
        {demoNotice ? <p className="mx-4 mt-3 rounded-md border border-[#b8dece] bg-[#edf8f3] px-4 py-2 text-[11px] font-bold text-[#367861]">{demoNotice}</p> : null}

        {loading ? (
          <div className="absolute inset-x-0 bottom-0 top-[64px] z-50 flex items-center justify-center bg-[#f8fbff]/90 backdrop-blur-[1px]" role="status" aria-live="polite" aria-label="Loading schedule">
            <div className="rounded-md border border-[#d3dbea] bg-white px-8 py-6 text-center shadow-[0_24px_70px_-34px_rgba(17,24,39,0.38)]">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#d3dbea] border-t-[var(--deshazo-blue)]" />
              <p className="mt-4 text-[13px] font-black text-[var(--deshazo-text)]">Loading schedule...</p>
              <p className="mt-1 text-[11px] font-semibold text-[#747b8a]">Fetching technicians and work orders</p>
            </div>
          </div>
        ) : null}

        <div ref={scheduleScrollRef} className="min-h-[560px] flex-1 overflow-auto">
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
                    <div
                      key={String(resource.id)}
                      ref={(node) => {
                        if (node) resourceRowsRef.current.set(String(resource.id), node)
                        else resourceRowsRef.current.delete(String(resource.id))
                      }}
                      className={`flex border-b border-[#e2e8f2] hover:bg-[#f8fbff] ${localAssistantDemo ? 'min-h-[78px]' : 'min-h-[44px]'}`}
                    >
                      <div className="sticky left-0 z-10 flex w-[200px] shrink-0 items-center border-r border-[#d3dbea] px-3 py-2 text-[11px] font-bold" style={resourceCellStyle(resource)}>{resourceLabel(resource)}</div>
                      <div
                        className={`relative flex-1 bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc((100%_/_var(--schedule-days))_-_1px),#e2e8f2_calc((100%_/_var(--schedule-days))_-_1px),#e2e8f2_calc(100%_/_var(--schedule-days)))] ${editMode && draggedEventId ? 'transition-shadow' : ''}`}
                        style={{ '--schedule-days': days.length } as React.CSSProperties}
                        onDragOver={(dragEvent) => {
                          if (!editMode || !draggedEventId) return
                          dragEvent.preventDefault()
                          dragEvent.dataTransfer.dropEffect = 'move'
                          const dayIndex = targetDayIndex(dragEvent)
                          setDropTarget((current) => current?.resourceId === String(resource.id) && current.dayIndex === dayIndex ? current : { resourceId: String(resource.id), dayIndex })
                        }}
                        onDrop={(dragEvent) => {
                          if (!editMode || !draggedEventId) return
                          dragEvent.preventDefault()
                          const dayIndex = targetDayIndex(dragEvent)
                          handleEventDrop(String(resource.id), dayIndex)
                          setDraggedEventId('')
                          setDropTarget(null)
                        }}
                      >
                        {dropTarget?.resourceId === String(resource.id) ? (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-y-0 z-[1] border-2 border-dashed border-[#b77a00] bg-[#ffd66b]/30"
                            style={{ left: `${(dropTarget.dayIndex / days.length) * 100}%`, width: `${100 / days.length}%` }}
                          />
                        ) : null}
                        {resourceEvents.map((event) => (
                          <button
                            key={String(event.id)}
                            type="button"
                            draggable={editMode}
                            aria-grabbed={editMode && draggedEventId === String(event.id)}
                            title={editMode ? `Drag ${eventLabel(event)} to a demo schedule slot` : eventLabel(event)}
                            onDragStart={(dragEvent) => {
                              if (!editMode) return
                              dragEvent.dataTransfer.effectAllowed = 'move'
                              dragEvent.dataTransfer.setData('text/plain', String(event.id))
                              setDraggedEventId(String(event.id))
                              setDemoNotice('')
                            }}
                            onDragEnd={() => {
                              setDraggedEventId('')
                              setDropTarget(null)
                            }}
                            onClick={() => {
                              if (suppressEventClickRef.current) return
                              setSelectedEditor({ eventId: String(event.id), event })
                            }}
                            className={`absolute top-1.5 z-[2] h-8 truncate rounded-sm border px-2 text-left text-[10px] font-black text-white shadow-sm transition hover:z-[3] hover:brightness-95 ${editMode ? 'cursor-grab ring-1 ring-white/70 active:cursor-grabbing' : ''} ${draggedEventId === String(event.id) ? 'opacity-45' : ''}`}
                            style={{ ...eventPosition(event), backgroundColor: event.backgroundColor || event.color || '#818181', borderColor: event.borderColor || event.backgroundColor || event.color || '#818181', color: '#ffffff' }}
                          >{eventLabel(event)}</button>
                        ))}
                        {suggestions.filter((suggestion) => String(suggestion.resourceId) === String(resource.id)).map((suggestion) => (
                          <button
                            key={suggestion.id}
                            type="button"
                            onClick={() => focusSuggestion(suggestion)}
                            aria-label={`AI suggestion: ${suggestion.label}`}
                            className={`group absolute z-[4] h-8 overflow-visible rounded-sm border-2 border-dashed px-2 text-left text-[10px] font-black shadow-sm transition hover:z-[25] hover:brightness-95 focus:z-[25] focus:outline-none ${localAssistantDemo ? 'top-10' : 'top-1.5'} ${focusedSuggestionId === suggestion.id ? 'animate-pulse ring-4 ring-[#d8c8f4]' : ''}`}
                            style={{ ...suggestionPosition(suggestion), backgroundColor: 'rgba(126,87,194,0.24)', borderColor: '#6c43b5', color: '#3c1f73' }}
                          >
                            <span className="block truncate">✦ {suggestion.label}</span>
                            <span className="pointer-events-none absolute left-0 top-9 hidden w-72 whitespace-normal rounded-md border border-[#cbbbe8] bg-white p-3 text-left text-[11px] font-semibold leading-4 text-[var(--deshazo-text)] shadow-[0_18px_45px_-18px_rgba(15,23,42,0.7)] group-hover:block group-focus:block">
                              <strong className="mb-1 block font-black text-[#5a369c]">Why Fable recommends this slot</strong>
                              {suggestion.rationale.map((reason) => <span key={reason} className="mt-1 block">• {reason}</span>)}
                              {suggestion.warnings.map((warning) => <span key={warning} className="mt-1 block text-[#9a5a18]">Warning: {warning}</span>)}
                            </span>
                          </button>
                        ))}
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

      <ScheduleAssistant
        sampleMode={sampleMode}
        localDemo={localAssistantDemo}
        range={{ start: toIsoDate(range.start), end: toIsoDate(range.end) }}
        serviceLocationId={serviceLocationId}
        resources={resources}
        events={events}
        pendingWorkOrders={pendingWorkOrders}
        onSuggestionsChange={setSuggestions}
        onFocusSuggestion={focusSuggestion}
      />

      {selectedEditor ? (
        <TaskEditorPanel
          key={selectedEditor.eventId}
          editor={selectedEditor}
          resources={resources}
          onClose={() => setSelectedEditor(null)}
          onSave={saveTaskEditor}
          onDelete={deleteTaskEditor}
          onOpenWorkOrder={onOpenWorkOrder}
        />
      ) : null}
    </div>
  )
}
