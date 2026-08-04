import { useEffect, useMemo, useState } from 'react'
import {
  getDeshazoSchedule,
  type DeshazoScheduleEvent,
  type DeshazoScheduleResource,
} from '../lib/deshazoSchedule'
import {
  getDeshazoWorkOrders,
  getDeshazoWorkOrderStatuses,
  type DeshazoWorkOrder,
} from '../lib/deshazoWorkOrders'
import { requestScheduleAssistant, type ScheduleSuggestion } from '../lib/schedulingAssistant'

type AIScheduleProps = {
  sampleMode?: boolean
  serviceLocationId: number | null
  onOpenSchedule: () => void
  onOpenWorkOrder: (workOrderId: number) => void
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const displayDate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  )
}

const resourceName = (resource: DeshazoScheduleResource) =>
  resource.title || resource.name || resource.employeeName || resource.extendedProps?.title || resource.extendedProps?.name || 'Available technician'

const workOrderName = (workOrder: DeshazoWorkOrder) => workOrder.jobNo || `Work order ${workOrder.id}`

function sampleSuggestions(
  workOrders: DeshazoWorkOrder[],
  resources: DeshazoScheduleResource[],
  rangeStart: string,
): ScheduleSuggestion[] {
  return workOrders.slice(0, 4).map((workOrder, index) => {
    const resource = resources[index % Math.max(resources.length, 1)]
    const start = toIsoDate(addDays(new Date(`${rangeStart}T12:00:00`), index + 1))
    return {
      id: `sample-ai-${workOrder.id}`,
      resourceId: String(resource?.id || `team-${index + 1}`),
      workOrderId: String(workOrder.id),
      start,
      end: start,
      label: `${workOrderName(workOrder)} · ${resource ? resourceName(resource) : 'Field service team'}`,
      confidence: [0.94, 0.91, 0.87, 0.84][index],
      rationale: [
        `${resource ? resourceName(resource) : 'The selected team'} has capacity in the requested window.`,
        `${workOrder.serviceLocation?.name || 'Service location'} coverage and job requirements are aligned.`,
      ],
      warnings: index === 2 ? ['Confirm customer access before dispatch.'] : [],
      evidence: [{ kind: 'local-sample', label: 'Schedule availability', referenceId: String(workOrder.id) }],
    }
  })
}

export default function AISchedule({ sampleMode = false, serviceLocationId, onOpenSchedule, onOpenWorkOrder }: AIScheduleProps) {
  const today = useMemo(() => new Date(), [])
  const range = useMemo(() => ({ start: toIsoDate(today), end: toIsoDate(addDays(today, 30)) }), [today])
  const [resources, setResources] = useState<DeshazoScheduleResource[]>([])
  const [events, setEvents] = useState<DeshazoScheduleEvent[]>([])
  const [pendingWorkOrders, setPendingWorkOrders] = useState<DeshazoWorkOrder[]>([])
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([])
  const [selectedSuggestionId, setSelectedSuggestionId] = useState('')
  const [prompt, setPrompt] = useState('Build the best 30-day schedule for pending work. Prioritize urgent service calls, travel efficiency, and balanced technician workload.')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    Promise.all([
      getDeshazoSchedule({ startDate: range.start, endDate: range.end, serviceLocationId }),
      getDeshazoWorkOrderStatuses().then(async (statuses) => {
        const pendingId = statuses.find((status) => status.name.toLowerCase() === 'pending')?.id
        if (!pendingId) return []
        const response = await getDeshazoWorkOrders({ page: 0, pageSize: 100, statusId: pendingId, serviceLocationId, sortBy: 'startDate', direction: 'asc' })
        return response.data
      }),
    ]).then(([schedule, workOrders]) => {
      if (cancelled) return
      setResources(schedule.resources)
      setEvents(schedule.events)
      setPendingWorkOrders(workOrders)
      setSuggestions([])
      setSummary('')
    }).catch((loadError) => {
      if (cancelled) return
      setError(loadError instanceof Error ? loadError.message : 'AI Schedule could not load the scheduling data.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [range.end, range.start, serviceLocationId])

  const runSchedule = async () => {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setError('')
    setSelectedSuggestionId('')
    try {
      if (sampleMode) {
        await new Promise((resolve) => window.setTimeout(resolve, 700))
        const generated = sampleSuggestions(pendingWorkOrders, resources, range.start)
        setSuggestions(generated)
        setSummary(`I reviewed ${pendingWorkOrders.length} pending work orders against ${resources.length} technicians and the next 30 days of availability. These ${generated.length} placements offer the strongest balance of urgency, location, and team capacity.`)
      } else {
        const response = await requestScheduleAssistant({
          message: prompt.trim(),
          history: [],
          range,
          serviceLocationId,
          resources,
          events,
          pendingWorkOrders,
        })
        setSuggestions(response.suggestions)
        setSummary(response.summary || response.answer)
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The AI schedule could not be generated.')
    } finally {
      setGenerating(false)
    }
  }

  const scheduledWorkOrderIds = useMemo(() => new Set(events.map((event) => {
    const tooltip = event.extendedProps?.tooltipData || event.tooltipData
    return String(tooltip?.workOrderTrip?.workOrderId || tooltip?.workOrderTrip?.workOrder?.id || '')
  }).filter(Boolean)), [events])

  return (
    <div className="min-h-full bg-[#f4f7fb] px-5 py-5 lg:px-7 lg:py-7">
      <header className="overflow-hidden rounded-xl bg-[var(--deshazo-blue)] text-white shadow-[0_24px_60px_-34px_rgba(6,24,73,0.8)]">
        <div className="relative px-6 py-7 lg:px-8">
          <div aria-hidden="true" className="absolute -right-16 -top-24 h-64 w-64 rounded-full border-[36px] border-white/[0.05]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#aecaef]">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 text-[14px] text-white">✦</span>
                DeShazo Flow Intelligence
              </div>
              <h1 className="text-[clamp(26px,3vw,38px)] font-semibold tracking-[-0.035em] text-white">AI Schedule</h1>
              <p className="mt-2 max-w-xl text-[13px] font-semibold leading-5 text-white/70">Turn pending work into a smarter, balanced plan. AI compares urgency, team capacity, service location, and the schedule already in place.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-white/80">Planning horizon · 30 days</span>
              <button type="button" onClick={onOpenSchedule} className="rounded-md bg-white px-4 py-2.5 text-[11px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#eef4ff]">Open calendar →</button>
            </div>
          </div>
        </div>
      </header>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="AI schedule overview">
        {[
          ['Pending work', pendingWorkOrders.length, 'Ready for review'],
          ['Technicians', resources.length, 'In visible teams'],
          ['Scheduled items', events.length, 'Next 30 days'],
          ['AI recommendations', suggestions.length, suggestions.length ? 'Generated now' : 'Awaiting a run'],
        ].map(([label, value, detail], index) => (
          <article key={String(label)} className="rounded-lg border border-[#d5dfed] bg-white p-4 shadow-[0_10px_30px_-26px_rgba(15,23,42,0.45)]">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[10px] font-black uppercase tracking-[0.1em] text-[#788497]">{label}</p><p className="mt-1 text-[27px] font-semibold tracking-[-0.04em] text-[var(--deshazo-text)]">{loading ? '—' : value}</p></div>
              <span className={`h-2.5 w-2.5 rounded-full ${index === 3 && suggestions.length ? 'bg-[#23a36d]' : 'bg-[#b7c6dd]'}`} />
            </div>
            <p className="mt-2 text-[10px] font-bold text-[#8a94a4]">{detail}</p>
          </article>
        ))}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">
        <section className="overflow-hidden rounded-xl border border-[#d5dfed] bg-white shadow-[0_18px_46px_-36px_rgba(15,23,42,0.45)]">
          <header className="border-b border-[#e0e6ef] px-5 py-4">
            <div className="flex items-center justify-between gap-4"><div><h2 className="text-[16px] font-semibold text-[var(--deshazo-text)]">Build a schedule plan</h2><p className="mt-1 text-[11px] font-semibold text-[#7b8697]">Tell AI what matters most for this scheduling run.</p></div><span className="rounded-full bg-[#edf3ff] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.1em] text-[var(--deshazo-blue)]">Human review required</span></div>
          </header>
          <div className="p-5">
            <label className="block"><span className="sr-only">Scheduling instructions</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} maxLength={2_000} className="w-full resize-none rounded-lg border border-[#c8d4e5] bg-[#fbfcfe] px-4 py-3 text-[12px] font-semibold leading-5 text-[var(--deshazo-text)] outline-none transition focus:border-[var(--deshazo-blue)] focus:bg-white focus:ring-3 focus:ring-[#e2eaff]" /></label>
            <div className="mt-3 flex flex-wrap gap-2">
              {['Prioritize urgent calls', 'Reduce travel time', 'Balance team workload'].map((instruction) => <button key={instruction} type="button" onClick={() => setPrompt((current) => `${current.replace(/\s+$/, '')} ${instruction}.`)} className="rounded-full border border-[#d2dceb] bg-white px-3 py-1.5 text-[10px] font-black text-[#627086] transition hover:border-[#9fb4d7] hover:bg-[#f3f7ff] hover:text-[var(--deshazo-blue)]">+ {instruction}</button>)}
            </div>
            {error ? <p className="mt-4 rounded-md border border-[#f0c8c1] bg-[#fff6f4] px-3 py-2 text-[11px] font-bold text-[#a2472f]">{error}</p> : null}
            <div className="mt-5 flex flex-col gap-3 border-t border-[#e5eaf1] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[10px] font-semibold text-[#8490a2]">AI suggestions never change the live schedule automatically.</p>
              <button type="button" disabled={loading || generating || !prompt.trim()} onClick={runSchedule} className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-md bg-[var(--deshazo-blue)] px-5 py-3 text-[11px] font-black text-white transition hover:bg-[var(--deshazo-blue-deep)] disabled:cursor-not-allowed disabled:opacity-50"><span aria-hidden="true">✦</span>{generating ? 'Building plan…' : 'Generate AI schedule'}</button>
            </div>
          </div>

          <div className="border-t border-[#dce4ef] bg-[#f8faff]">
            <div className="flex items-center justify-between px-5 py-4"><div><h2 className="text-[15px] font-semibold text-[var(--deshazo-text)]">Recommended placements</h2><p className="mt-1 text-[10px] font-semibold text-[#7e899a]">Select a recommendation to inspect it before opening the calendar.</p></div>{suggestions.length ? <span className="text-[10px] font-black text-[#24815d]">● Plan ready</span> : null}</div>
            {summary ? <p className="mx-5 mb-4 rounded-lg border border-[#cbd9f0] bg-white px-4 py-3 text-[11px] font-semibold leading-5 text-[#5f6b7d]">{summary}</p> : null}
            <div className="space-y-2 px-5 pb-5">
              {generating ? <div className="flex min-h-44 items-center justify-center rounded-lg border border-dashed border-[#bdcae0] bg-white"><div className="text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-[#dbe3f0] border-t-[var(--deshazo-blue)]" /><p className="mt-3 text-[11px] font-black text-[var(--deshazo-text)]">Comparing work, teams, and open capacity…</p></div></div> : suggestions.length ? suggestions.map((suggestion, index) => {
                const selected = selectedSuggestionId === suggestion.id
                return <button key={suggestion.id} type="button" onClick={() => setSelectedSuggestionId(selected ? '' : suggestion.id)} className={`w-full rounded-lg border bg-white px-4 py-3 text-left transition ${selected ? 'border-[var(--deshazo-blue)] ring-2 ring-[#dce6ff]' : 'border-[#d9e1ec] hover:border-[#aebed6]'}`}>
                  <span className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#eaf1ff] text-[11px] font-black text-[var(--deshazo-blue)]">{index + 1}</span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center justify-between gap-2"><strong className="text-[12px] text-[var(--deshazo-text)]">{suggestion.label}</strong><span className="rounded-full bg-[#e9f7f1] px-2 py-1 text-[9px] font-black text-[#247b59]">{Math.round(suggestion.confidence * 100)}% match</span></span><span className="mt-1 block text-[10px] font-bold text-[#7b8798]">{displayDate(suggestion.start)} · {suggestion.rationale[0]}</span>{selected ? <span className="mt-3 block border-t border-[#e5eaf1] pt-3"><span className="block text-[10px] font-black uppercase tracking-[0.08em] text-[#68758a]">Why this placement</span>{suggestion.rationale.map((reason) => <span key={reason} className="mt-1.5 block text-[10px] font-semibold leading-4 text-[#667286]">• {reason}</span>)}{suggestion.warnings.map((warning) => <span key={warning} className="mt-2 block rounded bg-[#fff6df] px-2 py-1.5 text-[10px] font-bold text-[#93620c]">Attention: {warning}</span>)}</span> : null}</span></span>
                </button>
              }) : <div className="flex min-h-44 items-center justify-center rounded-lg border border-dashed border-[#c6d1e1] bg-white px-6 text-center"><div><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#edf3ff] text-[18px] text-[var(--deshazo-blue)]">✦</span><p className="mt-3 text-[12px] font-black text-[var(--deshazo-text)]">Your recommendations will appear here</p><p className="mt-1 text-[10px] font-semibold text-[#8792a3]">Generate a plan to compare the strongest scheduling options.</p></div></div>}
            </div>
          </div>
        </section>

        <aside className="h-fit overflow-hidden rounded-xl border border-[#d5dfed] bg-white shadow-[0_18px_46px_-36px_rgba(15,23,42,0.45)]">
          <header className="flex items-center justify-between border-b border-[#e0e6ef] px-5 py-4"><div><h2 className="text-[15px] font-semibold text-[var(--deshazo-text)]">Pending queue</h2><p className="mt-1 text-[10px] font-semibold text-[#7d8899]">Work AI can place next</p></div><span className="rounded-full bg-[#edf3ff] px-2.5 py-1 text-[9px] font-black text-[var(--deshazo-blue)]">{pendingWorkOrders.length}</span></header>
          <div className="divide-y divide-[#e7ebf1]">
            {loading ? <p className="px-5 py-12 text-center text-[11px] font-bold text-[#8792a3]">Loading scheduling context…</p> : pendingWorkOrders.length ? pendingWorkOrders.slice(0, 7).map((workOrder) => {
              const location = [workOrder.customerLocation?.shipToCity, workOrder.customerLocation?.shipToState].filter(Boolean).join(', ')
              return <button key={workOrder.id} type="button" onClick={() => onOpenWorkOrder(workOrder.id)} className="block w-full px-5 py-3 text-left transition hover:bg-[#f6f9ff]"><span className="flex items-center justify-between gap-3"><strong className="text-[11px] text-[var(--deshazo-blue)]">{workOrderName(workOrder)}</strong><span className="rounded bg-[#fff2d8] px-2 py-1 text-[8px] font-black uppercase tracking-[0.06em] text-[#956410]">Pending</span></span><span className="mt-1 block truncate text-[11px] font-bold text-[var(--deshazo-text)]">{workOrder.customerWorkOrder?.customerName || 'Customer not listed'}</span><span className="mt-1 flex items-center justify-between gap-3 text-[9px] font-semibold text-[#8792a3]"><span>{workOrder.jobType || 'Service work'} · {location || workOrder.serviceLocation?.name || 'Location pending'}</span><span>{scheduledWorkOrderIds.has(String(workOrder.id)) ? 'On calendar' : ''}</span></span></button>
            }) : <p className="px-5 py-12 text-center text-[11px] font-bold text-[#8792a3]">No pending work orders were found.</p>}
          </div>
          {pendingWorkOrders.length > 7 ? <footer className="border-t border-[#e0e6ef] bg-[#fafbfc] px-5 py-3 text-center text-[10px] font-black text-[#748094]">Showing 7 of {pendingWorkOrders.length} pending work orders</footer> : null}
        </aside>
      </div>
    </div>
  )
}
