export type CompactResource = {
  id: string
  name?: string
  group?: string
  serviceLocationName?: string
}

export type CompactEvent = {
  id: string
  resourceIds?: string[]
  title?: string
  start?: string
  end?: string
  isDayOff?: boolean
  customerName?: string
  location?: string
  workOrderId?: string
  jobNo?: string
  jobType?: string
  status?: string
}

export type CompactWorkOrder = {
  id: string
  jobNo?: string
  jobType?: string
  customerName?: string
  address?: string
  serviceRequested?: string
  requestedStart?: string
  requestedEnd?: string
  serviceLocationId?: number | null
  serviceLocationName?: string
  status?: string
}

export type ScheduleSnapshot = {
  range?: { start?: string; end?: string }
  serviceLocationId?: number | null
  resources: CompactResource[]
  events: CompactEvent[]
  pendingWorkOrders: CompactWorkOrder[]
}

export type QueryPlan = {
  needsPlacements: boolean
  dateStart: string
  dateEnd: string
  durationDays: number
  locationTerms: string[]
  workOrderTerms: string[]
  technicianTerms: string[]
  maxCandidates: number
}

export type CandidateSlot = {
  id: string
  resource: CompactResource
  workOrder: CompactWorkOrder
  start: string
  end: string
  score: number
  facts: string[]
  nearbyEvents: Array<Pick<CompactEvent, 'id' | 'title' | 'start' | 'end' | 'customerName' | 'location' | 'workOrderId'>>
}

const DAY_MS = 86_400_000

function parseDay(value: string | undefined) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isNaN(date.getTime()) ? null : date
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, count: number) {
  return new Date(date.getTime() + count * DAY_MS)
}

function normalizedTokens(value: string | undefined) {
  return new Set((value || '').toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length > 2) || [])
}

function overlapCount(left: string | undefined, right: string | undefined) {
  const leftTokens = normalizedTokens(left)
  const rightTokens = normalizedTokens(right)
  let count = 0
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) count += 1
  })
  return count
}

function includesTerms(value: string, terms: string[]) {
  const normalized = value.toLowerCase()
  return terms.some((term) => normalized.includes(term.toLowerCase()))
}

function eventInterval(event: CompactEvent) {
  const start = parseDay(event.start)
  if (!start) return null
  const parsedEnd = parseDay(event.end)
  const end = parsedEnd && parsedEnd > start ? parsedEnd : addDays(start, 1)
  return { start, end }
}

function intervalsOverlap(leftStart: Date, leftEnd: Date, rightStart: Date, rightEnd: Date) {
  return leftStart < rightEnd && rightStart < leftEnd
}

function clampRange(schedule: ScheduleSnapshot, plan: QueryPlan) {
  const scheduleStart = parseDay(schedule.range?.start) || new Date()
  const scheduleEnd = parseDay(schedule.range?.end) || addDays(scheduleStart, 31)
  const requestedStart = parseDay(plan.dateStart)
  const requestedEnd = parseDay(plan.dateEnd)
  const start = requestedStart && requestedStart > scheduleStart ? requestedStart : scheduleStart
  const end = requestedEnd && requestedEnd < scheduleEnd ? requestedEnd : scheduleEnd
  return end > start ? { start, end } : { start: scheduleStart, end: scheduleEnd }
}

function workOrderText(workOrder: CompactWorkOrder) {
  return [workOrder.id, workOrder.jobNo, workOrder.jobType, workOrder.customerName, workOrder.address, workOrder.serviceRequested, workOrder.serviceLocationName, workOrder.status].filter(Boolean).join(' ')
}

function resourceText(resource: CompactResource) {
  return [resource.id, resource.name, resource.group, resource.serviceLocationName].filter(Boolean).join(' ')
}

function preselectWorkOrders(workOrders: CompactWorkOrder[], message: string, plan: QueryPlan) {
  const messageTokens = [...normalizedTokens(message)]
  return workOrders
    .map((workOrder, index) => {
      const text = workOrderText(workOrder)
      const explicitId = message.includes(workOrder.id) || Boolean(workOrder.jobNo && message.toLowerCase().includes(workOrder.jobNo.toLowerCase()))
      const plannedMatch = includesTerms(text, [...plan.workOrderTerms, ...plan.locationTerms])
      const tokenMatches = messageTokens.filter((token) => text.toLowerCase().includes(token)).length
      const dated = parseDay(workOrder.requestedStart) ? 1 : 0
      return { workOrder, index, score: (explicitId ? 100 : 0) + (plannedMatch ? 20 : 0) + tokenMatches * 4 + dated }
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 24)
    .map(({ workOrder }) => workOrder)
}

function eligibleResources(resources: CompactResource[], plan: QueryPlan) {
  if (!plan.technicianTerms.length) return resources
  const matched = resources.filter((resource) => includesTerms(resourceText(resource), plan.technicianTerms))
  return matched.length ? matched : resources
}

export function fallbackQueryPlan(schedule: ScheduleSnapshot, message: string): QueryPlan {
  const placementPattern = /\b(find|open|slot|schedule|assign|place|placement|available|availability|recommend|suggest)\b/i
  const durationMatch = message.match(/\b(\d{1,2})[ -]day\b/i)
  return {
    needsPlacements: placementPattern.test(message),
    dateStart: schedule.range?.start || '',
    dateEnd: schedule.range?.end || '',
    durationDays: durationMatch ? Math.min(14, Math.max(1, Number(durationMatch[1]))) : 0,
    locationTerms: [],
    workOrderTerms: [],
    technicianTerms: [],
    maxCandidates: 36,
  }
}

export function normalizeQueryPlan(value: unknown, schedule: ScheduleSnapshot, message: string): QueryPlan {
  const fallback = fallbackQueryPlan(schedule, message)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
  const plan = value as Record<string, unknown>
  const stringArray = (item: unknown) => Array.isArray(item) ? item.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim().slice(0, 80)).filter(Boolean).slice(0, 8) : []
  return {
    needsPlacements: fallback.needsPlacements || plan.needsPlacements === true,
    dateStart: typeof plan.dateStart === 'string' ? plan.dateStart : fallback.dateStart,
    dateEnd: typeof plan.dateEnd === 'string' ? plan.dateEnd : fallback.dateEnd,
    durationDays: Number.isInteger(plan.durationDays) ? Math.min(14, Math.max(0, Number(plan.durationDays))) : fallback.durationDays,
    locationTerms: stringArray(plan.locationTerms),
    workOrderTerms: stringArray(plan.workOrderTerms),
    technicianTerms: stringArray(plan.technicianTerms),
    maxCandidates: Number.isInteger(plan.maxCandidates) ? Math.min(48, Math.max(12, Number(plan.maxCandidates))) : fallback.maxCandidates,
  }
}

export function buildCandidateSlots(schedule: ScheduleSnapshot, message: string, plan: QueryPlan): CandidateSlot[] {
  const range = clampRange(schedule, plan)
  const durationDays = plan.durationDays || 1
  const resources = eligibleResources(schedule.resources, plan)
  const workOrders = preselectWorkOrders(schedule.pendingWorkOrders, message, plan)
  const eventsByResource = new Map<string, Array<CompactEvent & { interval: { start: Date; end: Date } }>>()
  const loadByResource = new Map<string, number>()

  schedule.events.forEach((event) => {
    const interval = eventInterval(event)
    if (!interval) return
    ;(event.resourceIds || []).forEach((resourceId) => {
      const current = eventsByResource.get(resourceId) || []
      current.push({ ...event, interval })
      eventsByResource.set(resourceId, current)
      loadByResource.set(resourceId, (loadByResource.get(resourceId) || 0) + 1)
    })
  })

  const perWorkOrder = workOrders.map((workOrder) => {
    const requestedStart = parseDay(workOrder.requestedStart)
    const requestedEnd = parseDay(workOrder.requestedEnd)
    const candidates: CandidateSlot[] = []

    resources.forEach((resource) => {
      const resourceEvents = eventsByResource.get(resource.id) || []
      for (let start = range.start; addDays(start, durationDays) <= range.end; start = addDays(start, 1)) {
        const end = addDays(start, durationDays)
        if (resourceEvents.some((event) => intervalsOverlap(start, end, event.interval.start, event.interval.end))) continue

        const nearby = resourceEvents
          .filter((event) => {
            const distanceBefore = Math.abs(event.interval.end.getTime() - start.getTime()) / DAY_MS
            const distanceAfter = Math.abs(event.interval.start.getTime() - end.getTime()) / DAY_MS
            return Math.min(distanceBefore, distanceAfter) <= 2
          })
          .sort((left, right) => Math.abs(left.interval.start.getTime() - start.getTime()) - Math.abs(right.interval.start.getTime() - start.getTime()))
          .slice(0, 2)

        const locationMatches = nearby.reduce((total, event) => total + overlapCount(event.location, workOrder.address), 0)
        const customerMatches = nearby.reduce((total, event) => total + overlapCount(event.customerName, workOrder.customerName), 0)
        const serviceLocationMatch = Boolean(resource.serviceLocationName && workOrder.serviceLocationName && overlapCount(resource.serviceLocationName, workOrder.serviceLocationName))
        const requestedWindowMatch = Boolean(requestedStart && start >= requestedStart && (!requestedEnd || start < requestedEnd))
        const load = loadByResource.get(resource.id) || 0
        const score = 10 + locationMatches * 8 + customerMatches * 5 + (nearby.length ? 3 : 0) + (serviceLocationMatch ? 3 : 0) + (requestedWindowMatch ? 4 : 0) - Math.min(5, load / 20)
        const facts = [`No supplied event overlaps ${isoDay(start)} through ${isoDay(end)} for ${resource.name || resource.id}.`]
        if (locationMatches) facts.push('A nearby scheduled event shares location terms with the pending work order.')
        if (customerMatches) facts.push('A nearby scheduled event shares customer terms with the pending work order.')
        if (serviceLocationMatch) facts.push('The technician and work order share the supplied service-location name.')
        if (requestedWindowMatch) facts.push('The candidate falls within the work order requested date window.')
        if (!plan.durationDays) facts.push('No duration was stated; this is a one-day calendar-cell opportunity, not a confirmed job duration.')

        candidates.push({
          id: `candidate-${workOrder.id}-${resource.id}-${isoDay(start)}`,
          resource,
          workOrder,
          start: isoDay(start),
          end: isoDay(end),
          score: Number(score.toFixed(2)),
          facts,
          nearbyEvents: nearby.map(({ interval: _interval, resourceIds: _resourceIds, isDayOff: _isDayOff, jobNo: _jobNo, jobType: _jobType, status: _status, ...event }) => event),
        })
      }
    })

    return candidates.sort((left, right) => right.score - left.score || left.start.localeCompare(right.start)).slice(0, 4)
  })

  const result: CandidateSlot[] = []
  for (let rank = 0; rank < 4 && result.length < plan.maxCandidates; rank += 1) {
    perWorkOrder.forEach((candidates) => {
      if (candidates[rank] && result.length < plan.maxCandidates) result.push(candidates[rank])
    })
  }
  return result
}

export function scheduleSummary(schedule: ScheduleSnapshot, candidates: CandidateSlot[]) {
  return {
    visibleRange: schedule.range || null,
    selectedServiceLocationId: schedule.serviceLocationId || null,
    resourceCount: schedule.resources.length,
    scheduledEventCount: schedule.events.length,
    pendingWorkOrderCount: schedule.pendingWorkOrders.length,
    candidateCount: candidates.length,
    note: 'Candidates were checked deterministically against all supplied event intervals. Only the bounded shortlist and nearby evidence are sent to Fable.',
  }
}
