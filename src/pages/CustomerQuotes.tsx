import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DeveloperBadge } from '../components/DeveloperBadge'
import { useCustomerPath } from '../lib/customerRouting'

const quoteStages = [
  { id: 'pending', label: 'Pending', description: 'New quotes awaiting review' },
  { id: 'waiting-for-parts', label: 'Waiting for Parts', description: 'Parts or pricing information needed' },
  { id: 'scheduled', label: 'Scheduled', description: 'Approved work with a service date' },
  { id: 'completed', label: 'Completed', description: 'Completed customer work' },
  { id: 'invoice', label: 'Invoiced', description: 'Invoices ready for customer review' },
] as const

type QuoteStage = (typeof quoteStages)[number]['id']

type Quote = {
  id: string
  customer: string
  title: string
  location: string
  amount: string
  updated: string
  stage: QuoteStage | 'declined'
  lineItems: QuoteLineItem[]
  acceptedLineItemIds?: string[]
}

type QuoteDocument = {
  label: string
  fileName: string
  url: string
}

type QuoteLineItem = {
  id: string
  description: string
  category: string
  amount: number
}

type PartialAcceptQuote = Quote & {
  selectedLineItemIds: Set<string>
}

const originalQuoteDocument: QuoteDocument = {
  label: 'Original Quote',
  fileName: 'hi.pdf',
  url: '/mock-pdfs/original-quote.pdf',
}

const invoiceDocument: QuoteDocument = {
  label: 'Invoice',
  fileName: 'INV# 0322222.pdf',
  url: '/mock-pdfs/invoice-0322222.pdf',
}

const quoteLineItemsById: Record<string, QuoteLineItem[]> = {
  '420116': [
    { id: 'bridge-brake-pads', description: 'Bridge brake pads and hardware', category: 'Parts', amount: 2340 },
    { id: 'wheel-bearing-service', description: 'Wheel bearing inspection and service', category: 'Labor', amount: 1860 },
    { id: 'runway-alignment', description: 'Runway alignment correction', category: 'Service', amount: 4260 },
  ],
  '420114': [
    { id: 'hoist-brake-kit', description: 'Hoist brake kit', category: 'Parts', amount: 1420 },
    { id: 'technician-install', description: 'Technician installation labor', category: 'Labor', amount: 1340 },
    { id: 'load-test', description: 'Operational load test', category: 'Testing', amount: 520 },
  ],
  '420109': [
    { id: 'radio-transmitter', description: 'Radio transmitter and receiver kit', category: 'Parts', amount: 3850 },
    { id: 'controls-wiring', description: 'Controls wiring and programming', category: 'Labor', amount: 2145 },
    { id: 'travel', description: 'Travel and service truck', category: 'Service', amount: 720 },
  ],
  '420107': [
    { id: 'alignment-labor', description: 'Runway alignment labor', category: 'Labor', amount: 8450 },
    { id: 'survey-equipment', description: 'Survey equipment rental', category: 'Rental', amount: 1850 },
    { id: 'project-management', description: 'Project management and reporting', category: 'Service', amount: 2600 },
  ],
  '420103': [
    { id: 'inspection-service', description: 'Annual crane inspection', category: 'Service', amount: 1640 },
    { id: 'inspection-report', description: 'Inspection documentation package', category: 'Report', amount: 500 },
  ],
  '420098': [
    { id: 'wire-rope', description: 'Replacement wire rope', category: 'Parts', amount: 2290 },
    { id: 'rope-install', description: 'Remove and install wire rope', category: 'Labor', amount: 2160 },
    { id: 'disposal', description: 'Material disposal', category: 'Service', amount: 440 },
  ],
  '420094': [
    { id: 'festoon-cable', description: 'Festoon cable and clamps', category: 'Parts', amount: 820 },
    { id: 'festoon-labor', description: 'Repair labor', category: 'Labor', amount: 1140 },
  ],
  '420091': [
    { id: 'pendant-station', description: 'Pendant station assembly', category: 'Parts', amount: 1575 },
    { id: 'pendant-install', description: 'Install and test pendant station', category: 'Labor', amount: 1150 },
  ],
  '420087': [
    { id: 'end-truck-wheel', description: 'End truck wheel', category: 'Parts', amount: 2780 },
    { id: 'wheel-replacement', description: 'Wheel replacement labor', category: 'Labor', amount: 2100 },
    { id: 'freight', description: 'Freight', category: 'Freight', amount: 600 },
  ],
  '420083': [
    { id: 'controls-diagnostic', description: 'Controls diagnostic labor', category: 'Labor', amount: 1460 },
    { id: 'replacement-relays', description: 'Replacement relays and consumables', category: 'Parts', amount: 900 },
  ],
}

const sampleQuotes: Quote[] = [
  { id: '420116', customer: 'Wabash', title: 'Bridge crane inspection repairs', location: 'Lafayette, IN', amount: '$8,460', updated: 'Today', stage: 'pending', lineItems: quoteLineItemsById['420116'] },
  { id: '420114', customer: 'Wabash', title: 'Hoist brake replacement', location: 'Little Rock, AR', amount: '$3,280', updated: 'Yesterday', stage: 'pending', lineItems: quoteLineItemsById['420114'] },
  { id: '420109', customer: 'Wabash', title: 'Radio control upgrade', location: 'Harrison, AR', amount: '$6,715', updated: 'Jul 11', stage: 'waiting-for-parts', lineItems: quoteLineItemsById['420109'], acceptedLineItemIds: quoteLineItemsById['420109'].map((item) => item.id) },
  { id: '420107', customer: 'Wabash', title: 'Runway alignment service', location: 'Danville, IL', amount: '$12,900', updated: 'Jul 10', stage: 'waiting-for-parts', lineItems: quoteLineItemsById['420107'], acceptedLineItemIds: quoteLineItemsById['420107'].map((item) => item.id) },
  { id: '420103', customer: 'Wabash', title: 'Annual crane inspection', location: 'Cadiz, KY', amount: '$2,140', updated: 'Jul 9', stage: 'scheduled', lineItems: quoteLineItemsById['420103'], acceptedLineItemIds: quoteLineItemsById['420103'].map((item) => item.id) },
  { id: '420098', customer: 'Wabash', title: 'Wire rope replacement', location: 'Goshen, IN', amount: '$4,890', updated: 'Jul 7', stage: 'scheduled', lineItems: quoteLineItemsById['420098'], acceptedLineItemIds: quoteLineItemsById['420098'].map((item) => item.id) },
  { id: '420094', customer: 'Wabash', title: 'Festoon cable repair', location: 'Lebanon, IN', amount: '$1,960', updated: 'Jul 3', stage: 'completed', lineItems: quoteLineItemsById['420094'], acceptedLineItemIds: quoteLineItemsById['420094'].map((item) => item.id) },
  { id: '420091', customer: 'Wabash', title: 'Pendant station replacement', location: 'Frankfort, KY', amount: '$2,725', updated: 'Jun 30', stage: 'completed', lineItems: quoteLineItemsById['420091'], acceptedLineItemIds: quoteLineItemsById['420091'].map((item) => item.id) },
  { id: '420087', customer: 'Wabash', title: 'End truck wheel replacement', location: 'Lafayette, IN', amount: '$5,480', updated: 'Jun 27', stage: 'invoice', lineItems: quoteLineItemsById['420087'], acceptedLineItemIds: quoteLineItemsById['420087'].map((item) => item.id) },
  { id: '420083', customer: 'Wabash', title: 'Control panel troubleshooting', location: 'Danville, IL', amount: '$2,360', updated: 'Jun 24', stage: 'invoice', lineItems: quoteLineItemsById['420083'], acceptedLineItemIds: quoteLineItemsById['420083'].map((item) => item.id) },
]

const formatMoney = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)

export default function CustomerQuotes() {
  const customerPath = useCustomerPath()
  const [quotes, setQuotes] = useState(sampleQuotes)
  const [activeStage, setActiveStage] = useState<QuoteStage>('pending')
  const [selectedDocument, setSelectedDocument] = useState<(QuoteDocument & { quoteId: string; quoteTitle: string }) | null>(null)
  const [partialAcceptQuote, setPartialAcceptQuote] = useState<PartialAcceptQuote | null>(null)

  const counts = useMemo(
    () => Object.fromEntries(quoteStages.map(({ id }) => [id, quotes.filter((quote) => quote.stage === id).length])) as Record<QuoteStage, number>,
    [quotes],
  )

  const selectedPartialItems = useMemo(
    () =>
      partialAcceptQuote
        ? partialAcceptQuote.lineItems.filter((lineItem) => partialAcceptQuote.selectedLineItemIds.has(lineItem.id))
        : [],
    [partialAcceptQuote],
  )
  const selectedPartialTotal = useMemo(
    () => selectedPartialItems.reduce((total, lineItem) => total + lineItem.amount, 0),
    [selectedPartialItems],
  )

  const getAcceptedLineItems = (quote: Quote) => {
    const acceptedIds = new Set(quote.acceptedLineItemIds ?? quote.lineItems.map((lineItem) => lineItem.id))
    return quote.lineItems.filter((lineItem) => acceptedIds.has(lineItem.id))
  }

  const getAcceptedQuoteAmount = (quote: Quote) =>
    getAcceptedLineItems(quote).reduce((total, lineItem) => total + lineItem.amount, 0)

  const moveQuote = (id: string, direction: -1 | 1) => {
    const quoteToMove = quotes.find((quote) => quote.id === id)
    if (!quoteToMove) return

    const currentIndex = quoteStages.findIndex((stage) => stage.id === quoteToMove.stage)
    const nextStage = quoteStages[currentIndex + direction]
    if (!nextStage) return

    setActiveStage(nextStage.id)
    setQuotes((currentQuotes) =>
      currentQuotes.map((quote) => {
        if (quote.id !== id) return quote
        return { ...quote, stage: nextStage.id, updated: 'Just now' }
      }),
    )
  }

  const declineQuote = (id: string) => {
    setQuotes((currentQuotes) =>
      currentQuotes.map((quote) =>
        quote.id === id ? { ...quote, stage: 'declined', updated: 'Just now' } : quote,
      ),
    )
  }

  const openPartialAcceptModal = (quote: Quote) => {
    setPartialAcceptQuote({
      ...quote,
      selectedLineItemIds: new Set(quote.lineItems.map((lineItem) => lineItem.id)),
    })
  }

  const togglePartialAcceptLineItem = (lineItemId: string) => {
    setPartialAcceptQuote((currentQuote) => {
      if (!currentQuote) return currentQuote

      const selectedLineItemIds = new Set(currentQuote.selectedLineItemIds)
      if (selectedLineItemIds.has(lineItemId)) {
        selectedLineItemIds.delete(lineItemId)
      } else {
        selectedLineItemIds.add(lineItemId)
      }

      return { ...currentQuote, selectedLineItemIds }
    })
  }

  const setAllPartialAcceptLineItems = (checked: boolean) => {
    setPartialAcceptQuote((currentQuote) => {
      if (!currentQuote) return currentQuote

      return {
        ...currentQuote,
        selectedLineItemIds: checked
          ? new Set(currentQuote.lineItems.map((lineItem) => lineItem.id))
          : new Set(),
      }
    })
  }

  const confirmPartialAcceptQuote = () => {
    if (!partialAcceptQuote || partialAcceptQuote.selectedLineItemIds.size === 0) return

    const nextStage = quoteStages[1]
    setActiveStage(nextStage.id)
    setQuotes((currentQuotes) =>
      currentQuotes.map((quote) => {
        if (quote.id !== partialAcceptQuote.id) return quote
        return {
          ...quote,
          stage: nextStage.id,
          amount: formatMoney(selectedPartialTotal),
          updated: 'Just now',
          acceptedLineItemIds: Array.from(partialAcceptQuote.selectedLineItemIds),
        }
      }),
    )
    setPartialAcceptQuote(null)
  }

  const activeStageDetails = quoteStages.find((stage) => stage.id === activeStage)!
  const visibleQuotes = quotes.filter((quote) => quote.stage === activeStage)
  const activeIndex = quoteStages.findIndex((stage) => stage.id === activeStage)

  const documentsForQuote = (quote: Quote) =>
    quote.stage === 'invoice' ? [originalQuoteDocument, invoiceDocument] : [originalQuoteDocument]

  return (
    <main className="min-h-screen bg-[var(--bg)] px-5 py-6 text-[var(--deshazo-text)] sm:px-8 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 border-b border-[var(--deshazo-border)] pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link
                to={customerPath('/dashboard')}
                className="text-sm font-extrabold text-[var(--deshazo-blue)] no-underline hover:text-[var(--deshazo-blue-deep)]"
              >
                ← Dashboard
              </Link>
              <DeveloperBadge />
            </div>
            <h1 className="mt-4 text-[clamp(32px,4vw,48px)] font-black tracking-[-0.05em] text-[var(--deshazo-text)]">Customer Quotes</h1>
            <p className="mt-2 text-base text-[rgba(21,24,33,0.66)]">Track quotes as they move from review through completed work.</p>
          </div>
          <div className="rounded-2xl border border-[var(--deshazo-border)] bg-white px-5 py-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[rgba(21,24,33,0.5)]">All quotes</p>
            <p className="mt-1 text-3xl font-black tracking-[-0.05em] text-[var(--deshazo-blue)]">{quotes.length}</p>
          </div>
        </div>

        <nav aria-label="Quote status" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {quoteStages.map((stage, index) => {
            const isActive = stage.id === activeStage
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setActiveStage(stage.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  isActive
                    ? 'border-[var(--deshazo-blue)] bg-[var(--deshazo-blue)] text-white shadow-[0_18px_36px_-26px_rgba(47,86,166,0.75)]'
                    : 'border-[var(--deshazo-border)] bg-white text-[var(--deshazo-text)] hover:-translate-y-0.5 hover:border-[rgba(47,86,166,0.4)]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-xs font-black uppercase tracking-[0.08em] ${isActive ? 'text-white/70' : 'text-[rgba(21,24,33,0.48)]'}`}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-black ${isActive ? 'bg-white/15 text-white' : 'bg-[var(--deshazo-surface)] text-[var(--deshazo-blue)]'}`}>
                    {counts[stage.id]}
                  </span>
                </div>
                <p className="mt-5 text-lg font-extrabold tracking-[-0.03em]">{stage.label}</p>
              </button>
            )
          })}
        </nav>

        <section className="mt-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-extrabold uppercase tracking-[0.08em] text-[var(--deshazo-blue)]">Stage {activeIndex + 1} of {quoteStages.length}</p>
              <h2 className="mt-1 text-3xl font-black tracking-[-0.045em]">{activeStageDetails.label}</h2>
              <p className="mt-1 text-[rgba(21,24,33,0.64)]">{activeStageDetails.description}</p>
            </div>
            <p className="text-sm font-bold text-[rgba(21,24,33,0.55)]">{visibleQuotes.length} quote{visibleQuotes.length === 1 ? '' : 's'}</p>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {visibleQuotes.map((quote) => (
              <article key={quote.id} className="rounded-[24px] border border-[var(--deshazo-border)] bg-white p-5 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)] sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-extrabold text-[var(--deshazo-blue)]">Job Number {quote.id}</p>
                    <h3 className="mt-1 text-xl font-extrabold tracking-[-0.03em]">{quote.title}</h3>
                    <p className="mt-2 text-sm font-semibold text-[rgba(21,24,33,0.6)]">{quote.customer} · {quote.location}</p>
                  </div>
                  <p className="text-xl font-black tracking-[-0.04em] text-[var(--deshazo-text)]">{quote.amount}</p>
                </div>
                <div className="mt-5 rounded-2xl border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-[0.08em] text-[rgba(21,24,33,0.52)]">
                      {quote.acceptedLineItemIds ? 'Accepted line items' : 'Quote line items'}
                    </p>
                    <p className="text-sm font-black text-[var(--deshazo-blue)]">
                      {quote.acceptedLineItemIds
                        ? `${getAcceptedLineItems(quote).length} of ${quote.lineItems.length} accepted`
                        : `${quote.lineItems.length} item${quote.lineItems.length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {getAcceptedLineItems(quote).slice(0, 3).map((lineItem) => (
                      <div key={lineItem.id} className="flex items-start justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-extrabold text-[var(--deshazo-text)]">{lineItem.description}</p>
                          <p className="mt-0.5 text-xs font-bold uppercase tracking-[0.06em] text-[rgba(21,24,33,0.46)]">{lineItem.category}</p>
                        </div>
                        <p className="shrink-0 font-black text-[var(--deshazo-text)]">{formatMoney(lineItem.amount)}</p>
                      </div>
                    ))}
                  </div>
                  {quote.acceptedLineItemIds && quote.acceptedLineItemIds.length < quote.lineItems.length ? (
                    <p className="mt-3 text-xs font-bold text-[rgba(21,24,33,0.58)]">
                      Partial quote accepted for {formatMoney(getAcceptedQuoteAmount(quote))}.
                    </p>
                  ) : null}
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--deshazo-border)] pt-4">
                  <div>
                    <p className="text-sm font-semibold text-[rgba(21,24,33,0.54)]">Updated {quote.updated}</p>
                    <div className="mt-3 flex max-w-full snap-x gap-2 overflow-x-auto pb-1" aria-label={`${quote.id} documents`}>
                      {documentsForQuote(quote).map((document) => (
                        <button
                          key={document.label}
                          type="button"
                          onClick={() => setSelectedDocument({ ...document, quoteId: quote.id, quoteTitle: quote.title })}
                          className="group/document flex min-w-[172px] snap-start items-center gap-3 rounded-xl border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] px-3 py-2.5 text-left transition hover:border-[rgba(47,86,166,0.42)] hover:bg-white"
                        >
                          <span className="flex h-10 w-8 shrink-0 items-end rounded-sm border border-[#e7b7b2] bg-white p-1 shadow-sm">
                            <span className="h-1 w-full bg-[#d92d20]" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[12px] font-extrabold text-[var(--deshazo-text)]">{document.label}</span>
                            <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(21,24,33,0.48)]">PDF · View</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {activeIndex === 0 ? (
                      <>
                        <button type="button" onClick={() => declineQuote(quote.id)} className="rounded-xl border border-[#e7b7b2] px-3 py-2 text-sm font-extrabold text-[#b42318] transition hover:bg-[#fff5f4]">Decline</button>
                        <button type="button" onClick={() => openPartialAcceptModal(quote)} className="rounded-xl bg-[var(--deshazo-blue)] px-3 py-2 text-sm font-extrabold text-white transition hover:bg-[var(--deshazo-blue-deep)]">Accept quote</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => moveQuote(quote.id, -1)} className="rounded-xl border border-[var(--deshazo-border)] px-3 py-2 text-sm font-extrabold text-[var(--deshazo-blue)] transition hover:bg-[var(--deshazo-surface)]">← Back</button>
                        {activeIndex < quoteStages.length - 1 ? <button type="button" onClick={() => moveQuote(quote.id, 1)} className="rounded-xl bg-[var(--deshazo-blue)] px-3 py-2 text-sm font-extrabold text-white transition hover:bg-[var(--deshazo-blue-deep)]">Move to {quoteStages[activeIndex + 1].label} →</button> : null}
                      </>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      {selectedDocument ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(21,24,33,0.64)] p-4" role="dialog" aria-modal="true" aria-label={`${selectedDocument.label} preview`}>
          <div className="flex h-[min(860px,calc(100vh-2rem))] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_28px_80px_-24px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--deshazo-border)] px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--deshazo-blue)]">Job Number {selectedDocument.quoteId}</p>
                <h2 className="truncate text-lg font-extrabold tracking-[-0.03em]">{selectedDocument.label}: {selectedDocument.quoteTitle}</h2>
              </div>
              <button type="button" onClick={() => setSelectedDocument(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--deshazo-border)] text-xl font-black text-[var(--deshazo-blue)] transition hover:bg-[var(--deshazo-surface)]" aria-label="Close document preview">×</button>
            </div>
            <iframe className="min-h-0 flex-1 bg-[#525659]" src={selectedDocument.url} title={`${selectedDocument.fileName} preview`} />
          </div>
        </div>
      ) : null}

      {partialAcceptQuote ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(21,24,33,0.64)] p-4" role="dialog" aria-modal="true" aria-label={`Accept quote ${partialAcceptQuote.id}`}>
          <div className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_28px_80px_-24px_rgba(0,0,0,0.5)]">
            <div className="border-b border-[var(--deshazo-border)] px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--deshazo-blue)]">Job Number {partialAcceptQuote.id}</p>
                  <h2 className="mt-1 text-xl font-black tracking-[-0.035em] text-[var(--deshazo-text)]">Accept quote line items</h2>
                  <p className="mt-1 text-sm font-semibold text-[rgba(21,24,33,0.62)]">{partialAcceptQuote.title}</p>
                </div>
                <button type="button" onClick={() => setPartialAcceptQuote(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--deshazo-border)] text-xl font-black text-[var(--deshazo-blue)] transition hover:bg-[var(--deshazo-surface)]" aria-label="Close partial quote acceptance">×</button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-5 sm:px-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] px-4 py-3">
                <label className="flex cursor-pointer items-center gap-3 text-sm font-extrabold text-[var(--deshazo-text)]">
                  <input
                    type="checkbox"
                    checked={partialAcceptQuote.selectedLineItemIds.size === partialAcceptQuote.lineItems.length}
                    onChange={(event) => setAllPartialAcceptLineItems(event.currentTarget.checked)}
                    className="h-5 w-5 accent-[var(--deshazo-blue)]"
                  />
                  Select all line items
                </label>
                <div className="text-right">
                  <p className="text-xs font-black uppercase tracking-[0.08em] text-[rgba(21,24,33,0.5)]">Selected total</p>
                  <p className="text-xl font-black tracking-[-0.04em] text-[var(--deshazo-blue)]">{formatMoney(selectedPartialTotal)}</p>
                </div>
              </div>

              <div className="grid gap-3">
                {partialAcceptQuote.lineItems.map((lineItem) => {
                  const isSelected = partialAcceptQuote.selectedLineItemIds.has(lineItem.id)

                  return (
                    <label
                      key={lineItem.id}
                      className={`flex cursor-pointer items-start gap-4 rounded-2xl border px-4 py-3 transition ${
                        isSelected
                          ? 'border-[rgba(47,86,166,0.55)] bg-[#f4f7ff]'
                          : 'border-[var(--deshazo-border)] bg-white hover:bg-[var(--deshazo-surface)]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePartialAcceptLineItem(lineItem.id)}
                        className="mt-1 h-5 w-5 shrink-0 accent-[var(--deshazo-blue)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-extrabold text-[var(--deshazo-text)]">{lineItem.description}</span>
                        <span className="mt-1 block text-xs font-black uppercase tracking-[0.08em] text-[rgba(21,24,33,0.48)]">{lineItem.category}</span>
                      </span>
                      <span className="shrink-0 text-base font-black text-[var(--deshazo-text)]">{formatMoney(lineItem.amount)}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-[var(--deshazo-border)] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-sm font-bold text-[rgba(21,24,33,0.6)]">
                {selectedPartialItems.length} of {partialAcceptQuote.lineItems.length} line item{partialAcceptQuote.lineItems.length === 1 ? '' : 's'} selected
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setPartialAcceptQuote(null)} className="rounded-xl border border-[var(--deshazo-border)] px-4 py-2.5 text-sm font-extrabold text-[var(--deshazo-blue)] transition hover:bg-[var(--deshazo-surface)]">Cancel</button>
                <button
                  type="button"
                  onClick={confirmPartialAcceptQuote}
                  disabled={selectedPartialItems.length === 0}
                  className="rounded-xl bg-[var(--deshazo-blue)] px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[var(--deshazo-blue-deep)] disabled:cursor-not-allowed disabled:bg-[#9aa5bd]"
                >
                  Accept selected
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
