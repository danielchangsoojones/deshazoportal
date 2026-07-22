import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { DeshazoScheduleEvent, DeshazoScheduleResource } from '../lib/deshazoSchedule'
import type { DeshazoWorkOrder } from '../lib/deshazoWorkOrders'
import {
  type ScheduleAssistantChatMessage,
  type ScheduleSuggestion,
  requestScheduleAssistant,
} from '../lib/schedulingAssistant'

type ScheduleAssistantProps = {
  sampleMode?: boolean
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

export default function ScheduleAssistant({
  sampleMode = false,
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
      content: 'Ask me to review this schedule, find openings, or suggest placements for pending work. Suggestions stay read-only until you decide what to do.',
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
      const response = sampleMode ? {
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
        className="fixed bottom-5 right-5 z-[90] flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-[var(--deshazo-blue)] text-white shadow-[0_18px_45px_-14px_rgba(47,86,166,0.78)] transition hover:-translate-y-0.5 hover:bg-[var(--deshazo-blue-deep)] focus:outline-none focus:ring-4 focus:ring-[#cbd9fb]"
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
      <header className="flex items-center justify-between border-b border-[#d3dbea] bg-[var(--deshazo-blue)] px-4 py-3 text-white">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-white/15 px-2 py-1 text-[10px] font-black tracking-wide">{sampleMode ? 'LOCAL SAMPLE' : 'FABLE'}</span>
            <h2 className="text-[14px] font-black">Scheduling Assistant</h2>
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
            <div className="rounded-xl rounded-bl-sm border border-[#d3dbea] bg-white px-4 py-3 text-[11px] font-bold text-[#647188] shadow-sm">
              Reviewing schedule and pending work...
            </div>
          </div>
        ) : null}
        {error ? <p className="rounded-md border border-[#f0c4bd] bg-[#fff7f5] px-3 py-2 text-[11px] font-bold text-[#a2472f]">{error}</p> : null}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[#d3dbea] bg-white p-3">
        <label className="block">
          <span className="sr-only">Ask about the schedule</span>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={2_000}
            rows={3}
            placeholder="Example: Find the best open slots for pending inspections this month..."
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
            {loading ? 'Thinking...' : 'Ask Fable'}
          </button>
        </div>
        <p className="mt-2 text-center text-[9px] font-semibold text-[#8a94a4]">{sampleMode ? 'Local sample response · no API request is made.' : 'Suggestions are read-only and may require dispatcher verification.'}</p>
      </form>
    </aside>
  )
}
