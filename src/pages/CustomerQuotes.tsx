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
}

type QuoteDocument = {
  label: string
  fileName: string
  url: string
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

const sampleQuotes: Quote[] = [
  { id: '420116', customer: 'Wabash', title: 'Bridge crane inspection repairs', location: 'Lafayette, IN', amount: '$8,460', updated: 'Today', stage: 'pending' },
  { id: '420114', customer: 'Wabash', title: 'Hoist brake replacement', location: 'Little Rock, AR', amount: '$3,280', updated: 'Yesterday', stage: 'pending' },
  { id: '420109', customer: 'Wabash', title: 'Radio control upgrade', location: 'Harrison, AR', amount: '$6,715', updated: 'Jul 11', stage: 'waiting-for-parts' },
  { id: '420107', customer: 'Wabash', title: 'Runway alignment service', location: 'Danville, IL', amount: '$12,900', updated: 'Jul 10', stage: 'waiting-for-parts' },
  { id: '420103', customer: 'Wabash', title: 'Annual crane inspection', location: 'Cadiz, KY', amount: '$2,140', updated: 'Jul 9', stage: 'scheduled' },
  { id: '420098', customer: 'Wabash', title: 'Wire rope replacement', location: 'Goshen, IN', amount: '$4,890', updated: 'Jul 7', stage: 'scheduled' },
  { id: '420094', customer: 'Wabash', title: 'Festoon cable repair', location: 'Lebanon, IN', amount: '$1,960', updated: 'Jul 3', stage: 'completed' },
  { id: '420091', customer: 'Wabash', title: 'Pendant station replacement', location: 'Frankfort, KY', amount: '$2,725', updated: 'Jun 30', stage: 'completed' },
  { id: '420087', customer: 'Wabash', title: 'End truck wheel replacement', location: 'Lafayette, IN', amount: '$5,480', updated: 'Jun 27', stage: 'invoice' },
  { id: '420083', customer: 'Wabash', title: 'Control panel troubleshooting', location: 'Danville, IL', amount: '$2,360', updated: 'Jun 24', stage: 'invoice' },
]

export default function CustomerQuotes() {
  const customerPath = useCustomerPath()
  const [quotes, setQuotes] = useState(sampleQuotes)
  const [activeStage, setActiveStage] = useState<QuoteStage>('pending')
  const [selectedDocument, setSelectedDocument] = useState<(QuoteDocument & { quoteId: string; quoteTitle: string }) | null>(null)

  const counts = useMemo(
    () => Object.fromEntries(quoteStages.map(({ id }) => [id, quotes.filter((quote) => quote.stage === id).length])) as Record<QuoteStage, number>,
    [quotes],
  )

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
                        <button type="button" onClick={() => moveQuote(quote.id, 1)} className="rounded-xl bg-[var(--deshazo-blue)] px-3 py-2 text-sm font-extrabold text-white transition hover:bg-[var(--deshazo-blue-deep)]">Accept quote</button>
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
    </main>
  )
}
