import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { DeshazoScheduleEvent, DeshazoScheduleResource } from '../lib/deshazoSchedule'
import type { DeshazoWorkOrder } from '../lib/deshazoWorkOrders'
import {
  type ScheduleAssistantChatMessage,
  type ScheduleAssistantResponse,
  type ScheduleSuggestion,
  requestScheduleAssistant,
} from '../lib/schedulingAssistant'

type ScheduleAssistantProps = {
  sampleMode?: boolean
  localDemo?: boolean
  range: { start: string; end: string }
  serviceLocationId: number | null
  resources: DeshazoScheduleResource[]
  events: DeshazoScheduleEvent[]
  pendingWorkOrders: DeshazoWorkOrder[]
  onSuggestionsChange: (suggestions: ScheduleSuggestion[]) => void
  onFocusSuggestion: (suggestion: ScheduleSuggestion) => void
}

type ChatEntry = ScheduleAssistantChatMessage & {
  id: string
  suggestions?: ScheduleSuggestion[]
  costLabel?: string
}

function suggestionDates(suggestion: ScheduleSuggestion) {
  const format = (value: string) => {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!match) return value
    return `${match[2]}/${match[3]}/${match[1]}`
  }
  return `${format(suggestion.start)} - ${format(suggestion.end)}`
}

function parseLocalDate(value?: string) {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
}

function toLocalIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addLocalDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function localResourceName(resource: DeshazoScheduleResource) {
  return resource.title?.trim()
    || resource.name?.trim()
    || resource.employeeName?.trim()
    || resource.extendedProps?.title?.trim()
    || resource.extendedProps?.name?.trim()
    || 'Field technician'
}

function isNamedLocalTechnician(resource: DeshazoScheduleResource) {
  const name = resource.title?.trim()
    || resource.name?.trim()
    || resource.employeeName?.trim()
    || resource.extendedProps?.title?.trim()
    || resource.extendedProps?.name?.trim()
    || resource.extendedProps?.employeeName?.trim()
    || ''
  const group = resource.group?.trim() || resource.extendedProps?.group?.trim() || ''
  const combined = `${group} ${name}`.toLowerCase()
  const excludedCategory = /\bunassigned\b|\binstallations?\b/.test(combined)
  const genericResource = /^(field technician|technician|resource|open|available|unknown|unnamed)$/i.test(name)
  const looksLikeAName = /[a-z][a-z'’-]*[\s,]+[a-z]/i.test(name)
  return Boolean(name) && looksLikeAName && !excludedCategory && !genericResource
}

function localEventResourceIds(event: DeshazoScheduleEvent) {
  if (event.resourceIds?.length) return event.resourceIds.map(String)
  return event.resourceId == null ? [] : [String(event.resourceId)]
}

function localEventDates(event: DeshazoScheduleEvent) {
  const tooltip = event.extendedProps?.tooltipData || event.tooltipData
  return {
    start: parseLocalDate(event.start || tooltip?.startDate || tooltip?.workOrderTrip?.startDate),
    end: parseLocalDate(event.end || tooltip?.endDate || tooltip?.workOrderTrip?.endDate),
  }
}

function localEventRawDates(event: DeshazoScheduleEvent) {
  const tooltip = event.extendedProps?.tooltipData || event.tooltipData
  return {
    start: event.start || tooltip?.startDate || tooltip?.workOrderTrip?.startDate || '',
    end: event.end || tooltip?.endDate || tooltip?.workOrderTrip?.endDate || '',
  }
}

function localEventCustomer(event: DeshazoScheduleEvent) {
  const tooltip = event.extendedProps?.tooltipData || event.tooltipData
  return tooltip?.customerName?.trim() || event.title?.trim() || ''
}

function normalizedCustomer(value: string) {
  return value.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]/g, '')
}

function parseLocalDateTime(value: string, fallbackHour: number) {
  const day = parseLocalDate(value)
  if (!day) return null
  const parsed = value.includes('T') ? new Date(value) : null
  if (parsed && Number.isFinite(parsed.getTime())) return parsed
  day.setHours(fallbackHour, 0, 0, 0)
  return day
}

function formatLocalTime(value: Date) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(value)
}

function findAdjacentLocalSlot(
  anchorEvent: DeshazoScheduleEvent,
  resourceId: string,
  durationHours: number,
  events: DeshazoScheduleEvent[],
) {
  const anchorRaw = localEventRawDates(anchorEvent)
  const anchorStart = parseLocalDateTime(anchorRaw.start, 8)
  const anchorEnd = parseLocalDateTime(anchorRaw.end || anchorRaw.start, anchorRaw.end.includes('T') ? 12 : 13)
  if (!anchorStart || !anchorEnd) return null

  let slotStart = new Date(anchorEnd)
  if (!anchorRaw.end.includes('T')) slotStart.setHours(13, 0, 0, 0)
  slotStart.setMinutes(Math.ceil(slotStart.getMinutes() / 30) * 30, 0, 0)

  const workdayEnd = new Date(slotStart)
  workdayEnd.setHours(17, 0, 0, 0)
  while (slotStart < workdayEnd) {
    const slotEnd = new Date(slotStart.getTime() + durationHours * 60 * 60 * 1_000)
    if (slotEnd > workdayEnd) return null
    const conflicts = events.some((event) => {
      if (event === anchorEvent || !localEventResourceIds(event).includes(resourceId)) return false
      const raw = localEventRawDates(event)
      const start = parseLocalDateTime(raw.start, 7)
      const end = parseLocalDateTime(raw.end || raw.start, raw.end.includes('T') ? 17 : 17)
      if (!start || !end) return false
      return start < slotEnd && end > slotStart
    })
    if (!conflicts) return { start: slotStart, end: slotEnd, anchorStart, anchorEnd }
    slotStart = new Date(slotStart.getTime() + 30 * 60 * 1_000)
  }
  return null
}

function extractDemoDetails(message: string) {
  const durationMatch = message.match(/(\d+(?:\.\d+)?)\s*[- ]?hours?/i)
  const customerMatch = message.match(/\bat\s+(.+?)(?=[?.!,]|\s+(?:what|where|when|which|for)\b|$)/i)
  return {
    hours: durationMatch ? Number(durationMatch[1]) : 2,
    customer: customerMatch?.[1]?.trim() || "O'Neill Steel",
  }
}

function buildLocalDemoResponse(
  message: string,
  range: { start: string; end: string },
  resources: DeshazoScheduleResource[],
  events: DeshazoScheduleEvent[],
) {
  const details = extractDemoDetails(message)
  const rangeStart = parseLocalDate(range.start) || new Date()
  const rangeEnd = parseLocalDate(range.end) || addLocalDays(rangeStart, 30)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const namedTechnicians = resources.filter(isNamedLocalTechnician)
  const namedById = new Map(namedTechnicians.map((resource) => [String(resource.id), resource]))
  const customerKey = normalizedCustomer(details.customer)
  const matchedVisits = events.flatMap((event) => {
    if (!normalizedCustomer(localEventCustomer(event)).includes(customerKey)) return []
    const eventDate = localEventDates(event).end || localEventDates(event).start
    if (!eventDate || eventDate < today || eventDate < rangeStart || eventDate > rangeEnd) return []
    return localEventResourceIds(event).flatMap((resourceId) => {
      const resource = namedById.get(resourceId)
      if (!resource) return []
      const slot = findAdjacentLocalSlot(event, resourceId, details.hours, events)
      return slot ? [{ event, resource, resourceId, slot }] : []
    })
  }).sort((left, right) => left.slot.start.getTime() - right.slot.start.getTime())

  const chosen = matchedVisits.filter((candidate, index, all) =>
    all.findIndex((item) => item.resourceId === candidate.resourceId && toLocalIso(item.slot.start) === toLocalIso(candidate.slot.start)) === index,
  ).slice(0, 3)

  const suggestions: ScheduleSuggestion[] = chosen.map((candidate, index) => {
    const technician = localResourceName(candidate.resource)
    const start = toLocalIso(candidate.slot.start)
    const timeWindow = `${formatLocalTime(candidate.slot.start)}–${formatLocalTime(candidate.slot.end)}`
    return {
      id: `local-ai-${String(candidate.resource.id)}-${start}-${index}`,
      resourceId: String(candidate.resource.id),
      workOrderId: 'local-demo-oneill-steel',
      start,
      end: start,
      label: `${details.customer} add-on · ${technician} · ${timeWindow}`,
      confidence: [0.99, 0.96, 0.93][index] || 0.9,
      rationale: [
        `${technician} is already scheduled at ${details.customer} immediately beforehand.`,
        `The ${details.hours}-hour opening from ${timeWindow} is clear on ${technician}’s current calendar.`,
        'Keeping the same technician on site avoids a second trip, setup, and customer handoff.',
      ],
      warnings: [],
      evidence: [{ kind: 'same-site-schedule-match', label: `Existing ${details.customer} visit`, referenceId: String(candidate.event.id) }],
    }
  })

  if (!suggestions.length) {
    return {
      answer: `I checked the visible calendar for ${details.customer}, but I couldn’t find a named technician who is already going there and has a clear ${details.hours}-hour opening immediately afterward.`,
      summary: 'I did not recommend an unrelated technician or use the Unassigned or Installations categories. Move the calendar to a range containing an existing O’Neill Steel visit and ask again.',
      suggestions,
    }
  }

  const top = chosen[0]
  const topTechnician = localResourceName(top.resource)
  const topDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(top.slot.start)
  const topWindow = `${formatLocalTime(top.slot.start)}–${formatLocalTime(top.slot.end)}`
  return {
    answer: `I found ${suggestions.length} same-site add-on options. My top choice is ${topTechnician}, who is already scheduled at ${details.customer} on ${topDate} and has a clear ${details.hours}-hour opening immediately afterward from ${topWindow}.`,
    summary: `Each option is a separate new job placed directly after an existing ${details.customer} visit. That avoids extra travel, setup, and customer handoff. I only considered named technicians; Unassigned and Installations were excluded. The purple placements are read-only and nothing was changed.`,
    suggestions,
  }
}

export default function ScheduleAssistant({
  sampleMode = false,
  localDemo = false,
  range,
  serviceLocationId,
  resources,
  events,
  pendingWorkOrders,
  onSuggestionsChange,
  onFocusSuggestion,
}: ScheduleAssistantProps) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<ChatEntry[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: localDemo
        ? "I’m ready to analyze the live schedule locally. Try: “We have a two-hour job at O'Neill Steel. What are the best options?” I’ll find open spots and explain each choice without changing the calendar."
        : 'Ask me to review this schedule, find openings, or suggest placements for pending work. Suggestions stay read-only until you decide what to do.',
    },
  ])

  const visibleContext = useMemo(
    () => `${resources.length} technicians, ${events.length} scheduled items, and ${pendingWorkOrders.length} pending work orders`,
    [events.length, pendingWorkOrders.length, resources.length],
  )

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const message = input.trim()
    if (!message || loading) return

    const userEntry: ChatEntry = { id: `user-${Date.now()}`, role: 'user', content: message }
    const history = messages.filter((item) => item.id !== 'welcome').map(({ role, content }) => ({ role, content }))
    setMessages((current) => [...current, userEntry])
    setInput('')
    setError('')
    setLoading(true)

    try {
      const sampleWorkOrder = pendingWorkOrders[0]
      const sampleResource = resources[0]
      const response: ScheduleAssistantResponse = localDemo ? await new Promise<ReturnType<typeof buildLocalDemoResponse>>((resolve) => {
        window.setTimeout(() => resolve(buildLocalDemoResponse(message, range, resources, events)), 850)
      }) : sampleMode ? {
        answer: `I reviewed the local sample schedule. ${sampleWorkOrder ? `${sampleWorkOrder.jobNo || `Work order ${sampleWorkOrder.id}`} has a good opening with ${sampleResource?.title || sampleResource?.name || 'the Richmond field team'}.` : 'The current sample schedule has balanced coverage across the visible teams.'}`,
        summary: 'This answer and its suggestion were generated entirely from local fixture data.',
        suggestions: sampleWorkOrder && sampleResource ? [{
          id: `local-sample-${sampleWorkOrder.id}`,
          resourceId: String(sampleResource.id),
          workOrderId: String(sampleWorkOrder.id),
          start: range.start,
          end: range.start,
          label: `${sampleWorkOrder.jobNo || sampleWorkOrder.id} · ${sampleResource.title || sampleResource.name || 'Sample technician'}`,
          confidence: 0.91,
          rationale: ['Technician capacity is available in the sample schedule.', 'The service location matches the sample work order.'],
          warnings: [],
          evidence: [{ kind: 'local-sample', label: 'Local schedule fixture', referenceId: String(sampleWorkOrder.id) }],
        }] : [],
      } : await requestScheduleAssistant({
          message,
          history,
          range,
          serviceLocationId,
          resources,
          events,
          pendingWorkOrders,
        })
      const content = [response.answer, response.summary && response.summary !== response.answer ? response.summary : ''].filter(Boolean).join('\n\n')
      const assistantEntry: ChatEntry = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content,
        suggestions: response.suggestions,
        costLabel: response.meta
          ? `${response.meta.candidateCount} candidates reviewed · estimated AI cost $${response.meta.estimatedCostUsd.toFixed(3)}`
          : undefined,
      }
      setMessages((current) => [...current, assistantEntry])
      onSuggestionsChange(response.suggestions)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The scheduling assistant is unavailable.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open AI scheduling assistant"
      className={`fixed bottom-5 right-5 z-[90] flex h-14 w-14 items-center justify-center rounded-full border-2 border-white text-white shadow-[0_18px_45px_-14px_rgba(47,86,166,0.78)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[#cbd9fb] ${localDemo ? 'bg-gradient-to-br from-[#7654d8] to-[var(--deshazo-blue)] before:absolute before:inset-[-5px] before:-z-10 before:animate-pulse before:rounded-full before:bg-[#896ee8]/25' : 'bg-[var(--deshazo-blue)] hover:bg-[var(--deshazo-blue-deep)]'}`}
      >
        <span aria-hidden="true" className="text-[20px] font-black">AI</span>
      </button>
    )
  }

  return (
    <aside
      aria-label="AI scheduling assistant"
      className="fixed bottom-5 right-5 z-[90] flex h-[min(680px,calc(100vh-2.5rem))] w-[min(410px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl border border-[#b9c9e4] bg-white shadow-[0_28px_90px_-24px_rgba(15,23,42,0.58)]"
    >
      <header className={`flex items-center justify-between border-b border-[#d3dbea] px-4 py-3 text-white ${localDemo ? 'bg-gradient-to-r from-[#5b3eb1] via-[#142969] to-[var(--deshazo-blue)]' : 'bg-[var(--deshazo-blue)]'}`}>
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-white/15 px-2 py-1 text-[10px] font-black tracking-wide">{localDemo ? 'LOCAL AI' : sampleMode ? 'LOCAL SAMPLE' : 'FABLE'}</span>
            <h2 className="text-[14px] font-black">{localDemo ? 'AI Schedule Assistant' : 'Scheduling Assistant'}</h2>
          </div>
          <p className="mt-1 text-[10px] font-semibold text-white/75">{visibleContext}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Minimize scheduling assistant"
          className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-xl font-black hover:bg-white/20"
        >
          -
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto bg-[#f6f9ff] px-3 py-4" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-xl px-3 py-2.5 text-[12px] leading-5 shadow-sm ${message.role === 'user' ? 'rounded-br-sm bg-[var(--deshazo-blue)] text-white' : 'rounded-bl-sm border border-[#d3dbea] bg-white text-[var(--deshazo-text)]'}`}>
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.suggestions?.length ? (
                <div className="mt-3 space-y-2 border-t border-[#e2e8f2] pt-3">
                  {message.suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => onFocusSuggestion(suggestion)}
                      className="block w-full rounded-md border border-[#b8c9f5] bg-[#f1f5ff] px-3 py-2 text-left transition hover:border-[var(--deshazo-blue)] hover:bg-[#e7efff]"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-black text-[var(--deshazo-blue)]">{index + 1}. {suggestion.label}</span>
                        <span aria-hidden="true" className="text-[var(--deshazo-blue)]">-&gt;</span>
                      </span>
                      <span className="mt-1 block text-[10px] font-bold text-[#647188]">{suggestionDates(suggestion)} · {Math.round(suggestion.confidence * 100)}% confidence</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {message.costLabel ? <p className="mt-2 border-t border-[#e2e8f2] pt-2 text-[9px] font-bold text-[#778399]">{message.costLabel}</p> : null}
            </div>
          </div>
        ))}
        {loading ? (
          <div className="flex justify-start">
            <div className={`rounded-xl rounded-bl-sm border bg-white px-4 py-3 text-[11px] font-bold text-[#647188] shadow-sm ${localDemo ? 'border-[#cbbcf0]' : 'border-[#d3dbea]'}`}>
              <span className="flex items-center gap-2">
                {localDemo ? <span className="flex gap-1" aria-hidden="true"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#7452cd] [animation-delay:-0.3s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#7452cd] [animation-delay:-0.15s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#7452cd]" /></span> : null}
                {localDemo ? 'Scanning the live calendar for the best openings…' : 'Reviewing schedule and pending work...'}
              </span>
            </div>
          </div>
        ) : null}
        {error ? <p className="rounded-md border border-[#f0c4bd] bg-[#fff7f5] px-3 py-2 text-[11px] font-bold text-[#a2472f]">{error}</p> : null}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[#d3dbea] bg-white p-3">
        {localDemo ? (
          <button
            type="button"
            onClick={() => setInput("We have a two-hour job at O'Neill Steel. What are the best options?")}
            className="mb-2 w-full rounded-md border border-[#d2c6ee] bg-[#f5f1ff] px-3 py-2 text-left text-[10px] font-black text-[#5a3ca8] transition hover:border-[#8f73d1] hover:bg-[#eee8ff]"
          >
            ✦ Try the O'Neill Steel demo question
          </button>
        ) : null}
        <label className="block">
          <span className="sr-only">Ask about the schedule</span>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={2_000}
            rows={3}
            placeholder={localDemo ? "We have a two-hour job at O'Neill Steel. What are the best options?" : 'Example: Find the best open slots for pending inspections this month...'}
            className="w-full resize-none rounded-md border border-[#c7d1e2] px-3 py-2 text-[12px] leading-5 text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)] focus:ring-2 focus:ring-[#dbe5ff]"
          />
        </label>
        <div className="mt-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onSuggestionsChange([])}
            className="text-[10px] font-black text-[#6c7788] hover:text-[var(--deshazo-blue)]"
          >
            Clear suggestions
          </button>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-md bg-[var(--deshazo-blue)] px-4 py-2 text-[11px] font-black text-white transition hover:bg-[var(--deshazo-blue-deep)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? 'Thinking...' : localDemo ? 'Find best options' : 'Ask Fable'}
          </button>
        </div>
        <p className="mt-2 text-center text-[9px] font-semibold text-[#8a94a4]">{localDemo ? 'Runs locally against the live read-only schedule · no AI API request.' : sampleMode ? 'Local sample response · no API request is made.' : 'Suggestions are read-only and may require dispatcher verification.'}</p>
      </form>
    </aside>
  )
}
