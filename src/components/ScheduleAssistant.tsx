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
  const tomorrow = addLocalDays(today, 1)
  const firstDay = rangeStart > tomorrow ? rangeStart : tomorrow
  const resourceLoad = new Map(resources.map((resource) => [String(resource.id), 0]))
  events.forEach((event) => localEventResourceIds(event).forEach((id) => resourceLoad.set(id, (resourceLoad.get(id) || 0) + 1)))

  const candidates: Array<{ resource: DeshazoScheduleResource; date: Date; dayLoad: number; totalLoad: number }> = []
  for (let date = new Date(firstDay); date <= rangeEnd && candidates.length < 240; date = addLocalDays(date, 1)) {
    if (date.getDay() === 0 || date.getDay() === 6) continue
    const iso = toLocalIso(date)
    resources.forEach((resource) => {
      const resourceId = String(resource.id)
      const dayLoad = events.filter((event) => {
        if (!localEventResourceIds(event).includes(resourceId)) return false
        const dates = localEventDates(event)
        if (!dates.start) return false
        const startIso = toLocalIso(dates.start)
        const endIso = toLocalIso(dates.end || dates.start)
        return iso >= startIso && iso <= endIso
      }).length
      if (dayLoad < 2) candidates.push({ resource, date: new Date(date), dayLoad, totalLoad: resourceLoad.get(resourceId) || 0 })
    })
  }

  candidates.sort((left, right) => left.dayLoad - right.dayLoad || left.totalLoad - right.totalLoad || left.date.getTime() - right.date.getTime())
  const chosen: typeof candidates = []
  for (const candidate of candidates) {
    if (chosen.some((item) => String(item.resource.id) === String(candidate.resource.id) || toLocalIso(item.date) === toLocalIso(candidate.date))) continue
    chosen.push(candidate)
    if (chosen.length === 3) break
  }
  for (const candidate of candidates) {
    if (chosen.length === 3) break
    if (!chosen.includes(candidate)) chosen.push(candidate)
  }

  const timeWindows = ['8:00–10:00 AM', '10:00 AM–12:00 PM', '1:00–3:00 PM']
  const suggestions: ScheduleSuggestion[] = chosen.map((candidate, index) => {
    const technician = localResourceName(candidate.resource)
    const start = toLocalIso(candidate.date)
    const group = candidate.resource.group || candidate.resource.extendedProps?.group || candidate.resource.serviceLocationName
    return {
      id: `local-ai-${String(candidate.resource.id)}-${start}-${index}`,
      resourceId: String(candidate.resource.id),
      workOrderId: 'local-demo-oneill-steel',
      start,
      end: start,
      label: `${details.customer} · ${technician} · ${timeWindows[index]}`,
      confidence: [0.96, 0.92, 0.88][index] || 0.85,
      rationale: [
        candidate.dayLoad === 0
          ? `${technician} has no conflicting work on the visible schedule that day.`
          : `${technician} has room around only ${candidate.dayLoad} existing scheduled item that day.`,
        `The ${details.hours}-hour window preserves capacity for another service call later in the day.`,
        group ? `${group} coverage keeps the placement aligned with the current field team.` : 'The placement keeps the visible technician workload balanced.',
      ],
      warnings: [],
      evidence: [{ kind: 'live-read-only-schedule', label: 'Current calendar availability', referenceId: `${String(candidate.resource.id)}-${start}` }],
    }
  })

  if (!suggestions.length) {
    return {
      answer: `I checked the visible calendar for ${details.customer}, but there are no open technician slots in this date range. Try moving the calendar to another week or month and ask again.`,
      summary: 'This check ran locally against the schedule currently loaded on screen.',
      suggestions,
    }
  }

  return {
    answer: `I found ${suggestions.length} strong options for the ${details.hours}-hour job at ${details.customer}. My top choice is ${localResourceName(chosen[0].resource)} on ${new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(chosen[0].date)} from ${timeWindows[0]}.`,
    summary: `I ranked these using the real schedule currently on screen: open capacity, each technician’s visible workload, and room around existing jobs. The purple placements are read-only suggestions—nothing was added or changed. Select an option below to jump to it on the calendar.`,
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
