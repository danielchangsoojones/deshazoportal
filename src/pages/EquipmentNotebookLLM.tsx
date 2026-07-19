import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { isConfigured, supabase } from '../lib/supabase'
import { usePortalMenu } from '../lib/usePortalMenu'
import { useDeveloperMenuItems } from '../lib/useDeveloperMenuItems'
import { DeveloperBadge } from '../components/DeveloperBadge'
import { getEditableInspectionReport, type EditableInspectionReport } from '../lib/editableInspectionReports'
import { useCustomerPath } from '../lib/customerRouting'
import {
  askNotebook,
  deleteNotebookSource,
  getNotebookPdfInfo,
  getNotebookSources,
  notebookApiUrl,
  notebookPdfUrl,
  reindexNotebook,
  uploadNotebookPdf,
  type NotebookCitation,
  type NotebookSource,
} from '../lib/equipmentNotebookApi'
import { getJobsQuotingItem, getJobsQuotingItems, type JobsQuotingItem } from '../lib/jobsQuoting'
import {
  demoCrane,
  findGreenFileManual,
  greenFileManuals,
  greenFileNotebookSources,
  greenFileSections,
  isGreenFileSource,
  type GreenFileEntry,
  type GreenFileManual,
} from '../lib/greenFileDemo'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  kind?: 'overview' | 'chat'
  citations?: NotebookCitation[]
  rankedSources?: RankedSource[]
}

type ChatSession = {
  id: string
  title: string
  createdAt: number
  messages: ChatMessage[]
}

type RankedSource = NotebookSource & {
  score: number
  reasons: string[]
}

type RankedInspection = JobsQuotingItem & {
  score: number
  reasons: string[]
}

const menuItems = [
  { label: 'Home', href: '/dashboard' },
  { label: 'Open Risk Items', href: '/asset-fleet-assets?view=open-risk' },
  { label: 'Asset Fleet', href: '/asset-fleet' },
  { label: 'Spend', href: '/spend' },
  { label: 'Location Comparison', href: '/location-comparison' },
  { label: 'Document Reports', href: '/documents-reports' },
  { label: 'Equipment Notebook LLM', href: '/equipment-notebook-llm' },
  { label: 'Custom Reports', href: '/custom-reports' },
  { label: 'Documents', href: '/deshazo-work-orders' },
  { label: 'Add User', href: '/add-user' },
  { label: 'Contact Us', href: '/contact-us' },
]

const starterSession = (): ChatSession => ({
  id: crypto.randomUUID(),
  title: 'New equipment chat',
  createdAt: Date.now(),
  messages: [
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content:
        'Drop a manual into the source folder, then ask for a parts list, repair plan, or quote package.',
      citations: [],
      rankedSources: [],
    },
  ],
})

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2)

const rankSources = (query: string, sources: NotebookSource[]): RankedSource[] => {
  const tokens = tokenize(query)
  const wantsManual = /\b(part|parts|manual|serial|model|key|fig|figure|purchase|order|replace)\b/i.test(query)

  return sources
    .filter((source) => source.document_type === 'manual')
    .map((source) => {
      const haystack = tokenize(
        `${source.name} ${source.manufacturer} ${source.equipment_id} ${source.document_type} ${source.source}`,
      )
      const haystackSet = new Set(haystack)
      const overlap = tokens.filter((token) => haystackSet.has(token))
      const reasons: string[] = []
      let score = overlap.length * 8

      if (overlap.length > 0) reasons.push(`matches ${overlap.slice(0, 4).join(', ')}`)
      if (wantsManual && source.document_type === 'manual') {
        score += 16
        reasons.push('manual/parts context')
      }
      if (/harrington|hoist|chain|cf4|er|ner|3nf005/i.test(query + source.name + source.source)) {
        score += /harrington|hoist|chain|cf4|er|ner|3nf005/i.test(source.name + source.source) ? 12 : 0
      }
      if (source.source.toLowerCase().includes('uploads')) {
        score += 6
        reasons.push('recently uploaded')
      }

      return { ...source, score, reasons: reasons.length > 0 ? reasons : ['folder candidate'] }
    })
    .sort((left, right) => right.score - left.score)
}

const getInspectionSearchText = (item: JobsQuotingItem) =>
  `${item.documentName} ${item.splitType} ${item.splitIdentifier} ${item.repairCount} repairs ${item.safetyCount} safety ${JSON.stringify(item.extractionData)}`

const rankInspections = (query: string, inspections: JobsQuotingItem[]): RankedInspection[] => {
  const tokens = tokenize(query)

  return inspections
    .map((inspection) => {
      const haystack = tokenize(getInspectionSearchText(inspection))
      const haystackSet = new Set(haystack)
      const overlap = tokens.filter((token) => haystackSet.has(token))
      const reasons: string[] = []
      let score = overlap.length * 10

      if (overlap.length > 0) reasons.push(`matches ${overlap.slice(0, 4).join(', ')}`)
      if (inspection.repairCount > 0) {
        score += 20
        reasons.push(`${inspection.repairCount} repair item${inspection.repairCount === 1 ? '' : 's'}`)
      }
      if (/3nf005|harrington|hoist|cf4|chain|monorail/i.test(getInspectionSearchText(inspection))) {
        score += 18
        reasons.push('equipment match')
      }

      return { ...inspection, score, reasons: reasons.length > 0 ? reasons : ['inspection candidate'] }
    })
    .sort((left, right) => right.score - left.score)
}

const pickSourceForApi = (rankedSources: RankedSource[]) => {
  const backendSources = rankedSources.filter((source) => !isGreenFileSource(source.index))
  if (backendSources.length === 0) return null
  const manual = backendSources.find((source) => source.document_type === 'manual')
  return manual?.index ?? backendSources[0].index
}

const buildInspectionContextPrompt = (query: string, inspections: RankedInspection[], primaryInspection?: JobsQuotingItem) => {
  const selectedInspections = primaryInspection
    ? [primaryInspection as RankedInspection]
    : inspections.slice(0, 2)
  if (selectedInspections.length === 0) return query

  const context = selectedInspections
    .map((inspection, index) => {
      const extraction = JSON.stringify(inspection.extractionData).slice(0, 2500)
      return `Inspection ${index + 1}: ${inspection.documentName}. Repairs: ${inspection.repairCount}. Safety: ${inspection.safetyCount}. Extracted data: ${extraction}`
    })
    .join('\n\n')

  const instruction = primaryInspection
    ? 'Use ONLY this primary Supabase inspection context for defect/repair facts unless the user explicitly asks to compare another inspection. Then choose the most relevant manual from the notebook source folder.'
    : 'Use this Supabase inspection context first, then choose the most relevant manual from the notebook source folder. Do not rely on uploaded inspection files from the notebook source folder. If multiple inspections appear to conflict, ask the user which inspection to continue with before mixing repair facts.'

  return `${query}\n\n${instruction}\n\n${context}`
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return replacements[char]
  })

const renderInline = (value: string) =>
  escapeHtml(value)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())

const linkReferences = (html: string) =>
  html
    .replace(/\[(?:P)?(\d+)\]/g, '<button class="notebook-ref" data-ref="$1" type="button">P$1</button>')
    .replace(
      /(^|[>\s(,;:])P(\d+)(?=([<,\s.;:)]|$))/g,
      '$1<button class="notebook-ref" data-page="$2" type="button">P$2</button>',
    )

const renderMarkdown = (markdown: string) => {
  const lines = markdown.split('\n')
  const html: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (line.trim().startsWith('|') && lines[index + 1]?.includes('---')) {
      const headers = splitRow(line)
      index += 2
      const rows: string[][] = []
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(splitRow(lines[index]))
        index += 1
      }
      index -= 1

      html.push(
        `<table><thead><tr>${headers.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead><tbody>`,
      )
      html.push(rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`).join(''))
      html.push('</tbody></table>')
    } else if (!line.trim()) {
      html.push('<br>')
    } else {
      html.push(`<div>${renderInline(line)}</div>`)
    }
  }

  return linkReferences(html.join(''))
}

const sourceLabel = (source: NotebookSource) => `Manual - ${source.manufacturer}`

const normalizeMatchText = (value: string) =>
  value
    .toLowerCase()
    .replace(/\.pdf\b/g, '')
    .replace(/[^a-z0-9]+/g, '')

const sourceMatchesCitation = (source: NotebookSource, citation: NotebookCitation) => {
  const sourcePath = normalizeMatchText(source.source)
  const sourceName = normalizeMatchText(source.name)
  const citationPath = normalizeMatchText(citation.source)
  const citationTitle = normalizeMatchText(citation.title)

  return (
    source.source === citation.source ||
    source.name === citation.title ||
    sourcePath.includes(citationPath) ||
    citationPath.includes(sourcePath) ||
    sourceName.includes(citationTitle) ||
    citationTitle.includes(sourceName)
  )
}

const buildQuotePrompt = (inspection: JobsQuotingItem) =>
  `Use the quote or inspection report "${inspection.documentName}" (${inspection.splitIdentifier || inspection.splitType || 'no split identifier'}) as the primary inspection context. Find the most relevant equipment manual and make a purchase-focused table of parts, repair actions, and citations for the ${inspection.repairCount} repair item${inspection.repairCount === 1 ? '' : 's'} and ${inspection.safetyCount} safety item${inspection.safetyCount === 1 ? '' : 's'}. Avoid slash-heavy labels in the answer; write plain phrases like "action and part" instead of "action / part".`

const buildEditableReportPrompt = (report: EditableInspectionReport) =>
  `Use the saved quote "${report.reportName}" as the primary quote context. Identify part numbers, equipment models, manufacturers, capacities, and repair sections from this quote, then find the most relevant manuals from the notebook folder. Make a purchase-focused table of parts, repair actions, missing information to ask for, and citations. Saved quote data: ${JSON.stringify({
    reportData: report.reportData,
    repairSections: report.repairSections,
    sourceDocumentName: report.sourceDocumentName,
  }).slice(0, 6000)}`

const buildOverviewPrompt = (contextPrompt: string) =>
  `${contextPrompt}

Create an AI Overview for a service coordinator. Keep it practical and concise:

- Start with 3-5 bulleted actionable items.
- Then include a markdown table titled "Recommended Parts and Quotes" with columns: Priority, Repair Need, Recommended Part or Quote, Manual Evidence, Info Needed Before Purchase.
- Use cited references for every manual or inspection claim.
- If the quote or inspection does not provide enough equipment identity to safely select parts, say exactly what must be confirmed before ordering.
- Do not mix repair facts from another inspection unless explicitly asked.`

const buildGreenFileContext = (query: string) => {
  const queryTokens = new Set(tokenize(query))
  const rankedEntries = greenFileSections
    .flatMap((section) =>
      section.manuals.flatMap((manual) =>
        manual.entries.map((entry) => {
          const searchable = tokenize(
            `${section.title} ${manual.title} ${manual.manufacturer} ${manual.documentNumber} ${entry.label} ${entry.partNumber ?? ''} ${entry.details} ${entry.tags.join(' ')}`,
          )
          const score = searchable.reduce((total, token) => total + (queryTokens.has(token) ? 1 : 0), 0)
          return { section, manual, entry, score }
        }),
      ),
    )
    .sort((left, right) => right.score - left.score)

  const selectedEntries = rankedEntries.some((item) => item.score > 0)
    ? rankedEntries.filter((item) => item.score > 0).slice(0, 16)
    : greenFileManuals.map((manual) => {
        const section = greenFileSections.find((candidate) => candidate.manuals.some((item) => item.id === manual.id))!
        return { section, manual, entry: manual.entries[0], score: 0 }
      })

  const indexLines = selectedEntries.map(({ section, manual, entry }) =>
    `- ${section.title} > ${manual.shortTitle} (${manual.manufacturer}, ${manual.documentNumber}) > ${entry.label}, page ${entry.page}${entry.partNumber ? `, part or assembly ${entry.partNumber}` : ''}: ${entry.details}`,
  )

  return `GREEN FILE CONTEXT — use this crane-specific system index as authoritative demo equipment context:
Crane ${demoCrane.id}, ${demoCrane.name}; ${demoCrane.location}; serial ${demoCrane.serialNumber}; ${demoCrane.capacity}; ${demoCrane.span} span; ${demoCrane.serviceClass}; installed ${demoCrane.installed}.
The complete Green File contains ${greenFileManuals.length} controlled manuals across Mechanical Lifting, Structural Framework, Electrical Power, Safe Operation, and Maintenance.
Relevant indexed entries:
${indexLines.join('\n')}
When referring to an indexed item, name its manual and page so the user can open it from the Green File Index. Do not imply demo part numbers are approved for a different crane.`
}

const messageReferencesOverview = (value: string) =>
  /\b(overview|above|that table|recommended|recommendation|action items|parts table|ai summary)\b/i.test(value)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const GreenFileDocument = ({ manual, activePage }: { manual: GreenFileManual; activePage: number }) => {
  const nearbyEntries = manual.entries.filter((entry) => Math.abs(entry.page - activePage) <= 8)
  const visibleEntries = nearbyEntries.length > 0 ? nearbyEntries : manual.entries

  return (
    <div className="h-full overflow-y-auto bg-[#202124] px-6 py-8">
      <article className="mx-auto min-h-full max-w-[820px] border border-[#cfd5dc] bg-white px-10 py-9 shadow-[0_22px_60px_-34px_rgba(15,23,42,0.45)]">
        <div className="border-b-2 border-[#267067] pb-5">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-[#267067]">{demoCrane.id} Green File</div>
          <h2 className="mt-2 text-2xl font-black leading-tight text-[#18202b]">{manual.title}</h2>
          <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-xs font-semibold text-[#637083] sm:grid-cols-4">
            <span>{manual.manufacturer}</span>
            <span>{manual.documentNumber}</span>
            <span>{manual.revision}</span>
            <span>{manual.pages} pages</span>
          </div>
        </div>

        <div className="mt-7 rounded-md border border-[#dbe2e8] bg-[#f7f9fb] px-4 py-3 text-sm leading-6 text-[#465467]">
          <strong className="text-[#18202b]">System assignment:</strong> {demoCrane.name}, {demoCrane.location}. This demo record represents the indexed content available at page {activePage}.
        </div>

        <div className="mt-8 space-y-8">
          {visibleEntries.map((entry) => (
            <section key={entry.id} className={entry.page === activePage ? 'rounded-md ring-4 ring-[#dff1ed]' : ''}>
              <div className="flex items-start justify-between gap-5 border-b border-[#dfe4ea] pb-2">
                <div>
                  <div className="text-xs font-black uppercase tracking-wide text-[#267067]">Section {entry.page}</div>
                  <h3 className="mt-1 text-lg font-black text-[#18202b]">{entry.label}</h3>
                </div>
                <span className="shrink-0 rounded bg-[#edf3f5] px-2 py-1 text-xs font-black text-[#4d6270]">Page {entry.page}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#536173]">{entry.details}</p>
              {entry.partNumber ? (
                <div className="mt-3 inline-flex rounded-md border border-[#c9ddd9] bg-[#eff8f6] px-3 py-2 text-xs font-bold text-[#184d47]">
                  Part or assembly: {entry.partNumber}
                </div>
              ) : null}
            </section>
          ))}
        </div>

        <div className="mt-10 flex items-center justify-between border-t border-[#dfe4ea] pt-4 text-xs font-semibold text-[#798596]">
          <span>Controlled demo document · {manual.documentNumber}</span>
          <span>Page {activePage} of {manual.pages}</span>
        </div>
      </article>
    </div>
  )
}

const GreenFileIndex = ({
  selectedSourceIndex,
  onSelect,
}: {
  selectedSourceIndex: number | null
  onSelect: (manual: GreenFileManual, entry: GreenFileEntry) => void
}) => {
  const [query, setQuery] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(greenFileSections.map((section) => [section.id, true])),
  )
  const [expandedManuals, setExpandedManuals] = useState<Record<string, boolean>>({})
  const normalizedQuery = query.trim().toLowerCase()

  const matchesEntry = (manual: GreenFileManual, entry: GreenFileEntry) =>
    `${manual.title} ${manual.manufacturer} ${manual.documentNumber} ${entry.label} ${entry.partNumber ?? ''} ${entry.details} ${entry.tags.join(' ')}`
      .toLowerCase()
      .includes(normalizedQuery)

  const resultCount = normalizedQuery
    ? greenFileManuals.reduce((count, manual) => count + manual.entries.filter((entry) => matchesEntry(manual, entry)).length, 0)
    : greenFileManuals.reduce((count, manual) => count + manual.entries.length, 0)

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fbfcfe]">
      <div className="border-b border-[#d9dee8] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#267067]">Complete overhead crane system</div>
            <h2 className="mt-1 text-lg font-black text-[#18202b]">{demoCrane.id} Green File</h2>
            <p className="mt-1 text-xs font-semibold text-[#6a7688]">{demoCrane.name} · {greenFileManuals.length} controlled documents</p>
          </div>
          <span className="rounded-full border border-[#a9cec7] bg-[#e8f5f2] px-2.5 py-1 text-[11px] font-black text-[#184d47]">ACTIVE</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-full border border-[#dfe5eb] bg-[#f5f8fa] py-1.5 pl-4 pr-1.5">
          <p className="min-w-0 truncate text-[11px] font-semibold text-[#758193]">
            {resultCount} indexed item{resultCount === 1 ? '' : 's'}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-label={detailsOpen ? 'Close crane details' : 'Open crane details'}
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((open) => !open)}
              className={`flex h-9 w-9 flex-col items-center justify-center gap-[3px] rounded-full border transition ${detailsOpen ? 'border-[#267067] bg-[#267067] text-white shadow-sm' : 'border-[#c7d2dc] bg-white text-[#526170] hover:border-[#77a79f] hover:text-[#184d47]'}`}
            >
              <span className="h-[2px] w-4 rounded-full bg-current" />
              <span className="h-[2px] w-4 rounded-full bg-current" />
              <span className="h-[2px] w-4 rounded-full bg-current" />
            </button>
            <button
              type="button"
              aria-label={searchOpen ? 'Close Green File search' : 'Open Green File search'}
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((open) => !open)}
              className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition ${searchOpen ? 'border-[#267067] bg-[#267067] text-white shadow-sm' : 'border-[#c7d2dc] bg-white text-[#526170] hover:border-[#77a79f] hover:text-[#184d47]'}`}
            >
              <span className="h-3.5 w-3.5 rounded-full border-2 border-current" />
              <span className="absolute left-[22px] top-[22px] h-2 w-[2px] -rotate-45 rounded-full bg-current" />
              {query && !searchOpen ? <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#d59625]" /> : null}
            </button>
          </div>
        </div>

        {detailsOpen ? (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-[#dfe5eb] bg-white p-3 text-xs shadow-[0_14px_30px_-28px_rgba(15,23,42,0.4)]">
            <div><span className="block font-semibold text-[#8590a0]">Capacity</span><strong>{demoCrane.capacity}</strong></div>
            <div><span className="block font-semibold text-[#8590a0]">Span</span><strong>{demoCrane.span}</strong></div>
            <div><span className="block font-semibold text-[#8590a0]">Serial</span><strong>{demoCrane.serialNumber}</strong></div>
            <div><span className="block font-semibold text-[#8590a0]">Service</span><strong>{demoCrane.serviceClass}</strong></div>
          </div>
        ) : null}

        {searchOpen ? (
          <div className="mt-3">
            <label className="flex items-center gap-2 rounded-full border border-[#cbd5df] bg-white px-3 py-2.5 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.4)] focus-within:border-[#76aaa1] focus-within:ring-2 focus-within:ring-[#dff1ee]">
              <span aria-hidden="true" className="text-[#718092]">⌕</span>
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search parts, equipment, or sections"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#18202b] outline-none placeholder:text-[#8995a5]"
              />
              {query ? <button type="button" onClick={() => setQuery('')} className="text-xs font-black text-[#617083]">Clear</button> : null}
            </label>
            <p className="mt-2 px-1 text-[11px] font-semibold text-[#7a8697]">Select a matching item to open its manual page.</p>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {greenFileSections.map((section) => {
            const visibleManuals = section.manuals
              .map((manual) => ({ ...manual, entries: normalizedQuery ? manual.entries.filter((entry) => matchesEntry(manual, entry)) : manual.entries }))
              .filter((manual) => manual.entries.length > 0)
            if (normalizedQuery && visibleManuals.length === 0) return null
            const sectionOpen = normalizedQuery ? true : expandedSections[section.id]

            return (
              <section key={section.id} className="overflow-hidden rounded-md border border-[#dce3ea] bg-white">
                <button
                  type="button"
                  onClick={() => setExpandedSections((current) => ({ ...current, [section.id]: !current[section.id] }))}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-[#f5f8fa]"
                >
                  <span className="h-8 w-1 rounded-full" style={{ backgroundColor: section.accent }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black text-[#18202b]">{section.title}</span>
                    <span className="block truncate text-[11px] font-semibold text-[#7b8797]">{section.subtitle}</span>
                  </span>
                  <span className="text-xs font-black text-[#718092]">{sectionOpen ? '−' : '+'}</span>
                </button>

                {sectionOpen ? (
                  <div className="border-t border-[#e5e9ee] bg-[#f9fafc] px-2 py-2">
                    {visibleManuals.map((manual) => {
                      const manualOpen = normalizedQuery ? true : expandedManuals[manual.id] || manual.sourceIndex === selectedSourceIndex
                      return (
                        <div key={manual.id} className="mb-1 last:mb-0">
                          <button
                            type="button"
                            onClick={() => setExpandedManuals((current) => ({ ...current, [manual.id]: !current[manual.id] }))}
                            className={`flex w-full items-start gap-2 rounded px-2 py-2 text-left transition ${manual.sourceIndex === selectedSourceIndex ? 'bg-[#e8f4f1]' : 'hover:bg-white'}`}
                          >
                            <span className="mt-0.5 text-[#39776f]">▤</span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="block text-xs font-black text-[#273241]">{manual.shortTitle}</span>
                                {manual.officialPdfUrl ? (
                                  <span className="rounded-full bg-[#dcefe9] px-1.5 py-0.5 text-[8px] font-black tracking-wide text-[#176157]">OFFICIAL</span>
                                ) : null}
                              </span>
                              <span className="mt-0.5 block text-[10px] font-semibold text-[#7a8697]">{manual.manufacturer} · {manual.documentNumber}</span>
                            </span>
                            <span className="text-[10px] font-black text-[#718092]">{manualOpen ? '−' : '+'}</span>
                          </button>
                          {manualOpen ? (
                            <div className="ml-5 border-l border-[#cdd9dc] pl-2">
                              {manual.entries.map((entry) => (
                                <button
                                  key={entry.id}
                                  type="button"
                                  onClick={() => onSelect(manual, entry)}
                                  className="group flex w-full items-start justify-between gap-2 rounded px-2 py-2 text-left transition hover:bg-white"
                                >
                                  <span className="min-w-0">
                                    <span className="block text-[11px] font-bold leading-4 text-[#465365] group-hover:text-[#184d47]">{entry.label}</span>
                                    {entry.partNumber ? <span className="mt-0.5 block font-mono text-[9px] font-bold text-[#7c8796]">{entry.partNumber}</span> : null}
                                  </span>
                                  <span className="shrink-0 text-[10px] font-black text-[#39776f]">P{entry.page}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </section>
            )
          })}
          {normalizedQuery && resultCount === 0 ? (
            <div className="rounded-md border border-dashed border-[#c9d2df] bg-white px-4 py-6 text-center text-xs font-semibold leading-5 text-[#667386]">
              No Green File items match “{query}”. Try a part number, component, or manual name.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function EquipmentNotebookLLM() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const [sources, setSources] = useState<NotebookSource[]>(greenFileNotebookSources)
  const [supabaseInspections, setSupabaseInspections] = useState<JobsQuotingItem[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(true)
  const [sourcesError, setSourcesError] = useState('')
  const [contextWarning, setContextWarning] = useState('')
  const [sessions, setSessions] = useState<ChatSession[]>(() => [starterSession()])
  const [activeSessionId, setActiveSessionId] = useState(() => sessions[0]?.id ?? '')
  const [chatView, setChatView] = useState<'history' | 'chat'>('chat')
  const [historyQuery, setHistoryQuery] = useState('')
  const [workspaceView, setWorkspaceView] = useState<'green-file' | 'ai'>('green-file')
  const [message, setMessage] = useState('')
  const [activeSourceIndex, setActiveSourceIndex] = useState<number | null>(greenFileNotebookSources[0]?.index ?? null)
  const [activeExternalPdfUrl, setActiveExternalPdfUrl] = useState('')
  const [activeExternalPdfName, setActiveExternalPdfName] = useState('')
  const [activePage, setActivePage] = useState(1)
  const [activePageCount, setActivePageCount] = useState(1)
  const [activeSourcePreviewError, setActiveSourcePreviewError] = useState<{ sourceIndex: number; message: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [panelWidths, setPanelWidths] = useState({ chats: 250, sources: 280, chat: 460 })
  const [openPanels, setOpenPanels] = useState({ chats: false, sources: false })
  const [composerHeight, setComposerHeight] = useState(96)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const launchedQuoteIdRef = useRef<string | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const customerPath = useCustomerPath()
  const [searchParams] = useSearchParams()
  const jobsQuotingItemId = searchParams.get('jobsQuotingItemId')?.trim() || ''
  const editableReportId = searchParams.get('editableReportId')?.trim() || ''
  const loginPath = location.pathname === '/equipment-notebook-llm' ? '/quotelogin' : customerPath('/login')

  const activeMenuItems = useDeveloperMenuItems(menuItems, 'Equipment Notebook LLM')

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0],
    [activeSessionId, sessions],
  )

  const latestAssistant = [...(activeSession?.messages ?? [])].reverse().find((item) => item.role === 'assistant')
  const latestOverview = [...(activeSession?.messages ?? [])].reverse().find((item) => item.role === 'assistant' && item.kind === 'overview')
  const displayedMessages = activeSession?.messages ?? []
  const filteredSessions = useMemo(() => {
    const query = historyQuery.trim().toLowerCase()
    if (!query) return sessions

    return sessions.filter((session) =>
      `${session.title} ${session.messages.map((item) => item.content).join(' ')}`.toLowerCase().includes(query),
    )
  }, [historyQuery, sessions])
  const latestCitations = latestAssistant?.citations ?? []
  const activeSource = sources.find((source) => source.index === activeSourceIndex) ?? sources[0]
  const activeGreenFileManual = findGreenFileManual(activeSource?.index)
  const activeDocumentPageCount = activeGreenFileManual?.pages ?? activePageCount
  const activeGreenFileManualPosition = activeGreenFileManual
    ? greenFileManuals.findIndex((manual) => manual.id === activeGreenFileManual.id)
    : -1
  const hasKnownPageCount = !!activeGreenFileManual || (!activeExternalPdfUrl && !activeSource?.pdf_url)
  const pdfTitle = activeExternalPdfName || activeSource?.name || 'Source PDF'
  const activeSourcePreviewUnavailable =
    !!activeSource && activeSourcePreviewError?.sourceIndex === activeSource.index
  const hasInvalidContextId =
    (!!jobsQuotingItemId && !isUuid(jobsQuotingItemId)) ||
    (!!editableReportId && !isUuid(editableReportId))
  const uploadedManualSourceCount = sources.filter((source) => source.document_type === 'manual' && !isGreenFileSource(source.index)).length
  const notebookGridColumns = [
    openPanels.chats ? `${panelWidths.chats}px 6px` : '',
    openPanels.sources ? `${panelWidths.sources}px 6px` : '',
    `minmax(420px,1fr) 6px ${panelWidths.chat}px`,
  ]
    .filter(Boolean)
    .join(' ')

  const goToPage = (page: number) => {
    setActivePage(Math.max(1, page))
  }

  const selectGreenFileManual = (manual: GreenFileManual) => {
    setActiveSourceIndex(manual.sourceIndex)
    setActiveExternalPdfUrl('')
    setActiveExternalPdfName('')
    setActivePage(manual.entries[0]?.page ?? 1)
  }

  const stepGreenFileManual = (direction: -1 | 1) => {
    if (greenFileManuals.length === 0) return
    const currentPosition = activeGreenFileManualPosition >= 0 ? activeGreenFileManualPosition : 0
    const nextPosition = (currentPosition + direction + greenFileManuals.length) % greenFileManuals.length
    selectGreenFileManual(greenFileManuals[nextPosition])
  }

  const startColumnResize = (panel: 'chats' | 'sources' | 'chat', event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidths = panelWidths
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      setPanelWidths({
        chats: panel === 'chats' ? clamp(startWidths.chats + delta, 180, 360) : startWidths.chats,
        sources: panel === 'sources' ? clamp(startWidths.sources + delta, 220, 420) : startWidths.sources,
        chat: panel === 'chat' ? clamp(startWidths.chat - delta, 360, 720) : startWidths.chat,
      })
    }

    const stop = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', stop)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', stop)
  }

  const startComposerResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = composerHeight
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)

    const handleMove = (moveEvent: PointerEvent) => {
      setComposerHeight(clamp(startHeight - (moveEvent.clientY - startY), 64, 260))
    }

    const stop = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', stop)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', stop)
  }

  useEffect(() => {
    if (!isConfigured || !supabase) {
      navigate(loginPath)
      return
    }
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate(loginPath)
      } else {
        setUser(data.user)
      }
      setAuthLoading(false)
    })
  }, [loginPath, navigate])

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight })
  }, [activeSession?.messages.length, activeSessionId])

  useEffect(() => {
    const controller = new AbortController()

    async function loadSources() {
      try {
        setSourcesLoading(true)
        setSourcesError('')
        const inspectionPromise = getJobsQuotingItems().catch(() => [])
        const data = await getNotebookSources(controller.signal)
        const inspectionData = await inspectionPromise
        const manualSources = data.filter((source) => source.document_type === 'manual')
        const allSources = [...greenFileNotebookSources, ...manualSources]
        setSources(allSources)
        setSupabaseInspections(inspectionData)
        setActiveSourceIndex((current) =>
          current !== null && allSources.some((source) => source.index === current)
            ? current
            : allSources[0]?.index ?? null,
        )
      } catch (error) {
        if (controller.signal.aborted) return
        setSources(greenFileNotebookSources)
        setSourcesError(
          `${error instanceof Error ? error.message : 'Notebook sources could not be loaded.'} The demo Green File remains available.`,
        )
      } finally {
        if (!controller.signal.aborted) {
          setSourcesLoading(false)
        }
      }
    }

    void loadSources()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    setActiveSourceIndex((current) => {
      if (sources.length === 0) return null
      return current !== null && sources.some((source) => source.index === current)
        ? current
        : sources[0].index
    })
  }, [sources])

  useEffect(() => {
    if (activeExternalPdfUrl || !activeSource || activeSource.pdf_url || isGreenFileSource(activeSource.index)) {
      setActivePageCount(1)
      setActiveSourcePreviewError(null)
      return
    }

    const controller = new AbortController()
    async function checkPreview() {
      try {
        setActiveSourcePreviewError(null)
        const info = await getNotebookPdfInfo(activeSource.index, controller.signal)
        const response = await fetch(notebookPdfUrl(activeSource.index, 1), { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Preview failed with status ${response.status}`)
        }
        setActivePageCount(Math.max(1, info.pages || 1))
        setActivePage((page) => Math.min(Math.max(1, page), Math.max(1, info.pages || 1)))
      } catch (error) {
        if (controller.signal.aborted) return
        setActivePageCount(1)
        setActiveSourcePreviewError({
          sourceIndex: activeSource.index,
          message: error instanceof Error ? error.message : 'Preview is unavailable for this source.',
        })
      }
    }

    void checkPreview()

    return () => controller.abort()
  }, [activeExternalPdfUrl, activeSource?.index, activeSource?.pdf_url])

  const updateActiveSession = (updater: (session: ChatSession) => ChatSession) => {
    setSessions((current) => current.map((session) => (session.id === activeSessionId ? updater(session) : session)))
  }

  const startNewChat = () => {
    const session = starterSession()
    setSessions((current) => [session, ...current])
    setActiveSessionId(session.id)
    setChatView('chat')
    setWorkspaceView('ai')
    setMessage('')
    setContextWarning('')
  }

  const handleReferenceClick = (citationId: number | null, page: number | null, citations: NotebookCitation[] = latestCitations) => {
    const citation = citationId
      ? citations.find((item) => item.id === citationId)
      : citations.find((item) => item.page === page)

    const source = citation
      ? sources.find((item) => sourceMatchesCitation(item, citation)) ?? activeSource
      : activeSource

    if (source) {
      setActiveSourceIndex(source.index)
      goToPage(citation?.page ?? page ?? 1)
      setActiveExternalPdfUrl('')
      setActiveExternalPdfName('')
    }
  }

  const openGreenFileEntry = (manual: GreenFileManual, entry: GreenFileEntry) => {
    setActiveSourceIndex(manual.sourceIndex)
    setActiveExternalPdfUrl('')
    setActiveExternalPdfName('')
    goToPage(entry.page)
  }

  const uploadManuals = async (files: FileList | File[]) => {
    const pdfs = Array.from(files).filter((file) => file.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length === 0) return

    try {
      setUploading(true)
      for (const file of pdfs) {
        await uploadNotebookPdf(file)
      }
      await reindexNotebook()
      const data = (await getNotebookSources()).filter((source) => source.document_type === 'manual')
      setSources([...greenFileNotebookSources, ...data])
      setActiveSourceIndex(data[0]?.index ?? greenFileNotebookSources[0]?.index ?? null)
      setActiveExternalPdfUrl('')
      setActiveExternalPdfName('')
    } catch (error) {
      setSourcesError(error instanceof Error ? error.message : 'PDF upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const removeNotebookSource = async (source: NotebookSource) => {
    try {
      setSourcesError('')
      await deleteNotebookSource(source.index)
      await reindexNotebook()
      const data = (await getNotebookSources()).filter((source) => source.document_type === 'manual')
      setSources([...greenFileNotebookSources, ...data])
      setActiveSourceIndex((current) => {
        if (current !== source.index) return current
        return data[0]?.index ?? null
      })
    } catch (error) {
      setSourcesError(error instanceof Error ? error.message : 'Source could not be removed.')
    }
  }

  const submitQuestion = async (
    trimmed: string,
    preferredInspection?: JobsQuotingItem,
    options: { kind?: 'overview' | 'chat'; hideUserMessage?: boolean; title?: string } = {},
  ) => {
    if (!trimmed || thinking) return

    const rankedSources = rankSources(trimmed, sources)
    const rankedInspections = rankInspections(
      trimmed,
      preferredInspection
        ? [preferredInspection, ...supabaseInspections.filter((inspection) => inspection.id !== preferredInspection.id)]
        : supabaseInspections,
    )
    const sourceIndex = pickSourceForApi(rankedSources)
    const prompt =
      options.kind === 'chat' && latestOverview && messageReferencesOverview(trimmed)
        ? `${trimmed}\n\nThe user is referring to this AI Overview from the current chat. Use it as conversation context, but verify against cited manuals and Supabase inspection records before answering:\n\n${latestOverview.content}`
        : trimmed
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: options.title ?? trimmed,
      kind: options.kind ?? 'chat',
    }
    const pendingId = crypto.randomUUID()
    const pendingMessage: ChatMessage = {
      id: pendingId,
      role: 'assistant',
      content:
        options.kind === 'overview'
          ? 'Building the AI Overview from the quote, inspection context, and relevant manual...'
          : 'Reading Supabase inspection data and selecting the most relevant manuals...',
      kind: options.kind ?? 'chat',
      citations: [],
      rankedSources: rankedSources.slice(0, 4),
    }
    const cleanupPrompt =
      '\n\nWrite clean business language. Avoid unnecessary slash pairs. Prefer "and", "or", or separate words instead of labels like "Action / Required Part", "manual/inspection", or "parts / quotes".'

    updateActiveSession((session) => ({
      ...session,
      title: session.title === 'New equipment chat' ? (options.title ?? trimmed).slice(0, 54) : session.title,
      messages: [...session.messages, ...(options.hideUserMessage ? [] : [userMessage]), pendingMessage],
    }))
    if (sourceIndex !== null) {
      setActiveSourceIndex(sourceIndex)
      goToPage(1)
    }
    setThinking(true)

    try {
      const greenFileContext = buildGreenFileContext(prompt)
      const answer = await askNotebook(
        buildInspectionContextPrompt(`${prompt}${cleanupPrompt}\n\n${greenFileContext}`, rankedInspections, preferredInspection),
        sourceIndex,
      )
      const citations = answer.citations ?? []
      const firstCitationSource = citations[0]
        ? sources.find((source) => sourceMatchesCitation(source, citations[0]))
        : rankedSources[0]

      if (firstCitationSource) {
        setActiveSourceIndex(firstCitationSource.index)
        setActiveExternalPdfUrl('')
        setActiveExternalPdfName('')
        goToPage(citations[0]?.page ?? 1)
      }

      updateActiveSession((session) => ({
        ...session,
        messages: session.messages.map((item) =>
          item.id === pendingId
            ? {
                ...item,
                content: answer.answer_markdown,
                citations,
                rankedSources: rankedSources.slice(0, 4),
              }
            : item,
        ),
      }))
    } catch (error) {
      updateActiveSession((session) => ({
        ...session,
        messages: session.messages.map((item) =>
          item.id === pendingId
            ? {
                ...item,
                content:
                  error instanceof Error
                    ? `The notebook API could not answer yet: ${error.message}`
                    : 'The notebook API could not answer yet.',
                citations: [],
                rankedSources: rankedSources.slice(0, 4),
              }
            : item,
        ),
      }))
    } finally {
      setThinking(false)
    }
  }

  const handleAsk = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setWorkspaceView('ai')
    setChatView('chat')
    await submitQuestion(message.trim(), undefined, { kind: 'chat' })
  }

  useEffect(() => {
    if (!hasInvalidContextId) return

    setContextWarning(
      'This AI chat was opened with a mock or local report id. Save or open a real quote report before building an AI overview from backend inspection data.',
    )
    setChatView('chat')
    setWorkspaceView('ai')
  }, [hasInvalidContextId])

  useEffect(() => {
    if (!jobsQuotingItemId || !isUuid(jobsQuotingItemId) || sourcesLoading || thinking || launchedQuoteIdRef.current === jobsQuotingItemId) return

    launchedQuoteIdRef.current = jobsQuotingItemId
    async function loadQuoteContext() {
      try {
        const quoteItem = await getJobsQuotingItem(jobsQuotingItemId)
        setSupabaseInspections((current) =>
          current.some((inspection) => inspection.id === quoteItem.id) ? current : [quoteItem, ...current],
        )
        const prompt = buildOverviewPrompt(buildQuotePrompt(quoteItem))
        setWorkspaceView('ai')
        setChatView('chat')
        await submitQuestion(prompt, quoteItem, { kind: 'overview', hideUserMessage: true, title: 'AI Overview' })
      } catch (error) {
        setSourcesError(error instanceof Error ? error.message : 'Quote context could not be loaded.')
      }
    }

    void loadQuoteContext()
  }, [jobsQuotingItemId, sourcesLoading, thinking])

  useEffect(() => {
    if (!editableReportId || !isUuid(editableReportId) || jobsQuotingItemId || sourcesLoading || thinking || launchedQuoteIdRef.current === editableReportId) return

    launchedQuoteIdRef.current = editableReportId
    async function loadEditableReportContext() {
      try {
        const report = await getEditableInspectionReport(editableReportId)
        const prompt = buildOverviewPrompt(buildEditableReportPrompt(report))
        setContextWarning(
          'This chat is using a saved quote as the primary context. If source inspections differ from this quote, confirm which one should control repair facts before purchasing parts.',
        )
        setWorkspaceView('ai')
        setChatView('chat')
        await submitQuestion(prompt, undefined, { kind: 'overview', hideUserMessage: true, title: 'AI Overview' })
      } catch (error) {
        setSourcesError(error instanceof Error ? error.message : 'Saved quote context could not be loaded.')
      }
    }

    void loadEditableReportContext()
  }, [editableReportId, jobsQuotingItemId, sourcesLoading, thinking])

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="rounded-2xl border border-[var(--deshazo-border)] bg-white px-6 py-4 text-sm font-semibold text-[var(--deshazo-blue)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
          Loading equipment notebook...
        </div>
      </div>
    )
  }

  if (!user || !activeSession) return null

  const fullName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Portal User'
  const initials =
    fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase())
      .join('') || 'DP'

  return (
    <div className="h-screen overflow-hidden bg-[#eef1f4] text-[#18202b]">
      <header className="sticky top-0 z-40 border-b border-[#d9dee8] bg-white/95 px-5 py-3 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.55)] backdrop-blur">
        <div className="flex w-full items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex h-10 min-w-[112px] items-center justify-center gap-2 rounded-md border border-[#cbd3df] bg-white px-4 text-sm font-black text-[#273f4f] shadow-sm transition hover:border-[#8ba1b5] hover:bg-[#f6f8fb]"
          >
            <span>Menu</span>
            <span aria-hidden="true" className="text-xs">
              {menuOpen ? '^' : 'v'}
            </span>
          </button>

          <div className="text-right">
            <h1 className="!m-0 !text-[22px] !font-black !leading-tight tracking-[0] text-[#18202b]">Equipment Notebook · Green Files</h1>
            <p className="hidden text-xs font-semibold text-[#657183] sm:block">Complete crane-system records, manuals, and AI assistance</p>
          </div>
        </div>
      </header>

      <main className="flex h-[calc(100vh-60px)] min-h-0 w-full items-stretch">
        {menuOpen && (
          <aside className="hidden h-full w-[268px] shrink-0 border-r border-[#d9dee8] bg-[#f8fafc] lg:flex lg:flex-col">
            <div className="flex-1 px-4 py-5">
              <div className="rounded-lg border border-[#dfe5ee] bg-white p-3 shadow-[0_18px_50px_-44px_rgba(15,23,42,0.5)]">
                <nav className="space-y-2">
                  {activeMenuItems.map((item) => (
                    <Link
                      key={item.label}
                      to={item.href}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-[14px] font-bold transition ${
                        item.active
                          ? 'bg-[#e6f4f1] text-[#184d47] shadow-[inset_0_0_0_1px_rgba(24,77,71,0.08)]'
                          : 'text-[#647084] hover:bg-[#f4f7fb] hover:text-[#253241]'
                      }`}
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span className="truncate">{item.label}</span>
                        {item.developerOnly ? <DeveloperBadge /> : null}
                      </span>
                    </Link>
                  ))}
                </nav>
              </div>
            </div>

            <div className="border-t border-[#d9dee8] px-4 py-4">
              <div className="rounded-lg border border-[#dfe5ee] bg-white px-3 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#e6f4f1] text-sm font-black text-[#184d47]">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-black text-[#18202b]">{fullName}</p>
                    <p className="truncate text-[13px] font-semibold text-[#667386]">{user.email}</p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}

        <section
          className="grid min-h-0 flex-1 overflow-hidden"
          style={{
            gridTemplateColumns: notebookGridColumns,
          }}
        >
          {openPanels.chats ? (
            <>
              <aside className="min-h-0 bg-[#fbfcfe]">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="border-b border-[#d9dee8] p-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={startNewChat}
                        className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-[#184d47] px-3 text-sm font-black text-white shadow-sm transition hover:bg-[#123d38]"
                      >
                        + New chat
                      </button>
                      <button
                        type="button"
                        aria-label="Close chat history"
                        onClick={() => setOpenPanels((current) => ({ ...current, chats: false }))}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#d7dee8] bg-white text-lg font-black leading-none text-[#69778a] transition hover:bg-[#f4f7fb] hover:text-[#184d47]"
                      >
                        x
                      </button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    <div className="mb-2 text-xs font-black uppercase text-[#768294]">Chat history</div>
                    <div className="space-y-2">
                      {sessions.map((session) => (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => setActiveSessionId(session.id)}
                          className={`w-full rounded-md border px-3 py-3 text-left transition ${
                            session.id === activeSession.id
                              ? 'border-[#9ccac2] bg-[#edf8f6] text-[#18202b]'
                              : 'border-transparent bg-white text-[#626e7f] hover:border-[#dce3ed] hover:bg-[#f8fafc]'
                          }`}
                        >
                          <span className="block truncate text-sm font-bold">{session.title}</span>
                          <span className="mt-1 block text-xs font-semibold text-[#7a8697]">
                            {new Date(session.createdAt).toLocaleDateString()}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </aside>
              <button
                type="button"
                aria-label="Resize chat history"
                onPointerDown={(event) => startColumnResize('chats', event)}
                className="h-full cursor-col-resize border-x border-[#d9dee8] bg-[#e5eaf0] transition hover:bg-[#cad6e4]"
              />
            </>
          ) : null}

          {openPanels.sources ? (
            <>
              <aside className="min-h-0 bg-[#f8fafc]">
                <div
                  className={`flex h-full min-h-0 flex-col ${dragging ? 'bg-[#e8f5f2]' : ''}`}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDragging(false)
                    void uploadManuals(event.dataTransfer.files)
                  }}
                >
                  <div className="border-b border-[#d9dee8] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-black text-[#18202b]">Manual library</div>
                        <div className="mt-1 text-xs font-semibold text-[#687589]">
                          {sourcesLoading
                            ? 'Loading sources...'
                            : `${greenFileManuals.length} Green File + ${uploadedManualSourceCount} uploaded`}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label="Close source folder"
                        onClick={() => setOpenPanels((current) => ({ ...current, sources: false }))}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#d7dee8] bg-white text-lg font-black leading-none text-[#69778a] transition hover:bg-[#f4f7fb] hover:text-[#184d47]"
                      >
                        x
                      </button>
                    </div>
                    <label className="mt-3 flex cursor-pointer flex-col rounded-md border border-dashed border-[#aebbc9] bg-white px-3 py-3 text-sm font-black text-[#184d47] transition hover:border-[#76aaa1] hover:bg-[#f5fbfa]">
                      <span>{uploading ? 'Uploading...' : '+ Drop or add manual PDF'}</span>
                      <span className="mt-1 text-xs font-semibold text-[#738094]">manuals only</span>
                      <input
                        type="file"
                        accept="application/pdf"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          if (event.target.files) void uploadManuals(event.target.files)
                          event.currentTarget.value = ''
                        }}
                      />
                    </label>
                  </div>

                  {sourcesError ? (
                    <div className="m-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-700">
                      {sourcesError}
                      <div className="mt-2 text-[11px]">API: {notebookApiUrl}</div>
                    </div>
                  ) : null}
                  {contextWarning ? (
                    <div className="m-3 rounded-md border border-[#f0d58b] bg-[#fff9e7] p-3 text-xs font-semibold leading-5 text-[#7a560f]">
                      {contextWarning}
                    </div>
                  ) : null}

                  <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    <div className="mb-2 text-xs font-black uppercase text-[#768294]">Available crane documents</div>
                    <div className="space-y-2">
                      {sources.length === 0 && !sourcesLoading ? (
                        <div className="rounded-md border border-dashed border-[#c9d2df] bg-white/80 px-3 py-4 text-xs font-semibold leading-5 text-[#657183]">
                          No manuals in the source folder yet. Drop or add a manual PDF to start.
                        </div>
                      ) : null}
                      {sources.map((source, index) => {
                        const greenFileSource = isGreenFileSource(source.index)
                        return (
                          <div
                            key={source.index}
                            className={`rounded-md border px-3 py-3 text-left shadow-sm transition ${
                              activeSource?.index === source.index && !activeExternalPdfUrl
                                ? 'border-[#76aaa1] bg-white'
                                : 'border-transparent bg-white/80 hover:border-[#d7dee8]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActiveSourceIndex(source.index)
                                setActiveExternalPdfUrl('')
                                setActiveExternalPdfName('')
                                goToPage(1)
                              }}
                              className="w-full text-left"
                            >
                              <span className="flex items-center justify-between gap-2">
                                <span className="text-xs font-black text-[#184d47]">#{index + 1} {greenFileSource ? 'Green File' : 'manual'}</span>
                                <span className="rounded-full bg-[#e8f5f2] px-2 py-0.5 text-[11px] font-bold text-[#184d47]">
                                  PDF
                                </span>
                              </span>
                              <span className="mt-1 block truncate text-sm font-bold text-[#18202b]">{source.name}</span>
                              <span className="mt-1 block text-xs font-semibold text-[#6d7a8d]">{sourceLabel(source)}</span>
                              <span className="mt-2 block truncate text-xs text-[#7f8a9a]">{source.source}</span>
                            </button>
                            {!greenFileSource ? (
                              <button
                                type="button"
                                disabled={uploading}
                                onClick={() => void removeNotebookSource(source)}
                                className="mt-3 rounded-md border border-[#f1b7b7] bg-white px-2 py-1 text-[10px] font-black uppercase text-[#a2472f] transition hover:bg-[#fff5f5] disabled:opacity-50"
                              >
                                Remove source
                              </button>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </aside>
              <button
                type="button"
                aria-label="Resize sources"
                onPointerDown={(event) => startColumnResize('sources', event)}
                className="h-full cursor-col-resize border-x border-[#d9dee8] bg-[#e5eaf0] transition hover:bg-[#cad6e4]"
              />
            </>
          ) : null}

          <section className="relative min-h-0 overflow-hidden bg-[#202124]">
            {activeGreenFileManual?.officialPdfUrl ? (
              <div className="absolute right-4 top-4 z-20 flex flex-wrap justify-end gap-2">
                {activeGreenFileManual.officialProductUrl ? (
                  <a
                    href={activeGreenFileManual.officialProductUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-[#cdd6e2] bg-white px-3 py-2 text-xs font-black text-[#184d47] shadow-[0_16px_38px_-28px_rgba(15,23,42,0.5)] transition hover:border-[#8fbab2] hover:bg-[#f5fbfa]"
                  >
                    Manufacturer page
                  </a>
                ) : null}
                <a
                  href={activeGreenFileManual.officialPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md bg-[#184d47] px-3 py-2 text-xs font-black text-white shadow-[0_16px_38px_-28px_rgba(15,23,42,0.5)] transition hover:bg-[#123d38]"
                >
                  Open / download PDF
                </a>
              </div>
            ) : null}
            {activeExternalPdfUrl || activeSource ? (
              <>
                {activeExternalPdfUrl ? (
                  <iframe
                    key={activeExternalPdfUrl}
                    src={`${activeExternalPdfUrl}#page=${activePage}`}
                    title={pdfTitle}
                    className="h-full w-full border-0"
                  />
                ) : activeGreenFileManual?.officialPdfUrl ? (
                  <iframe
                    key={`${activeGreenFileManual.id}-${activePage}`}
                    src={`${activeGreenFileManual.officialPdfUrl}#page=${activePage}`}
                    title={activeGreenFileManual.title}
                    className="h-full w-full border-0"
                  />
                ) : activeGreenFileManual ? (
                  <GreenFileDocument manual={activeGreenFileManual} activePage={activePage} />
                ) : activeSourcePreviewUnavailable ? (
                  <div className="flex h-full items-center justify-center px-6 text-center">
                    <div className="max-w-md rounded-lg border border-[#d7dee8] bg-white px-5 py-5 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.55)]">
                      <p className="text-base font-black text-[#18202b]">PDF preview unavailable</p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-[#5f6d80]">
                        {pdfTitle} is available in the source folder for manual search and chat, but the notebook backend did not return a previewable PDF file for this source.
                      </p>
                      <p className="mt-3 text-xs font-semibold text-[#7f8a9a]">
                        {activeSourcePreviewError?.message}
                      </p>
                    </div>
                  </div>
                ) : activeSource ? (
                  <iframe
                    key={`${activeSource.index}-${activePage}`}
                    src={activeSource.pdf_url ? `${activeSource.pdf_url}#page=${activePage}` : notebookPdfUrl(activeSource.index, activePage)}
                    title={pdfTitle}
                    className="h-full w-full border-0"
                  />
                ) : null}
                {!activeSourcePreviewUnavailable ? (
                  <div className="absolute bottom-5 left-1/2 z-20 flex max-w-[calc(100%-40px)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-lg border border-[#55585c] bg-[#292a2d]/95 px-3 py-2 text-xs font-semibold text-[#e8eaed] shadow-[0_18px_44px_-20px_rgba(0,0,0,0.85)] backdrop-blur">
                    {activeGreenFileManual ? (
                      <div className="flex min-w-0 items-center gap-1 border-r border-[#55585c] pr-2">
                        <button
                          type="button"
                          aria-label="Previous manual"
                          onClick={() => stepGreenFileManual(-1)}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-[#5f6368] bg-[#35363a] text-base font-black text-white transition hover:bg-[#4a4b4f]"
                        >
                          ‹
                        </button>
                        <select
                          aria-label="Select manual"
                          value={activeGreenFileManual.id}
                          onChange={(event) => {
                            const manual = greenFileManuals.find((item) => item.id === event.target.value)
                            if (manual) selectGreenFileManual(manual)
                          }}
                          className="h-8 min-w-0 max-w-[250px] rounded-md border border-[#5f6368] bg-[#35363a] px-2 text-xs font-bold text-white outline-none focus:border-[#8ab4f8]"
                        >
                          {greenFileSections.map((section) => (
                            <optgroup key={section.id} label={section.title}>
                              {section.manuals.map((manual) => (
                                <option key={manual.id} value={manual.id}>{manual.shortTitle}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <button
                          type="button"
                          aria-label="Next manual"
                          onClick={() => stepGreenFileManual(1)}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-[#5f6368] bg-[#35363a] text-base font-black text-white transition hover:bg-[#4a4b4f]"
                        >
                          ›
                        </button>
                      </div>
                    ) : <span className="max-w-[220px] truncate border-r border-[#55585c] pr-2">{pdfTitle}</span>}

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Previous page"
                        onClick={() => goToPage(Math.max(1, activePage - 1))}
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-[#5f6368] bg-[#35363a] text-base font-black text-white transition hover:bg-[#4a4b4f]"
                      >
                        −
                      </button>
                      <span className="px-1 text-[#bdc1c6]">Page</span>
                      <input
                        aria-label="Current page"
                        type="number"
                        min={1}
                        max={hasKnownPageCount ? activeDocumentPageCount : undefined}
                        value={activePage}
                        onChange={(event) =>
                          goToPage(Math.min(hasKnownPageCount ? activeDocumentPageCount : Number.MAX_SAFE_INTEGER, Math.max(1, Number(event.target.value || 1))))
                        }
                        className="h-8 w-14 rounded-md border border-[#5f6368] bg-[#202124] px-2 text-center text-sm font-bold text-white outline-none focus:border-[#8ab4f8]"
                      />
                      {hasKnownPageCount ? <span className="min-w-8 text-[#bdc1c6]">/ {activeDocumentPageCount}</span> : null}
                      <button
                        type="button"
                        aria-label="Next page"
                        onClick={() => goToPage(hasKnownPageCount ? Math.min(activeDocumentPageCount, activePage + 1) : activePage + 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-[#5f6368] bg-[#35363a] text-base font-black text-white transition hover:bg-[#4a4b4f]"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <div className="max-w-sm rounded-lg border border-dashed border-[#c7d0dd] bg-white/80 px-5 py-5 text-sm font-semibold leading-6 text-[#667386] shadow-[0_20px_60px_-48px_rgba(15,23,42,0.45)]">
                  Add a manual PDF to preview cited pages.
                </div>
              </div>
            )}
          </section>
          <button
            type="button"
            aria-label="Resize chat panel"
            onPointerDown={(event) => startColumnResize('chat', event)}
            className="h-full cursor-col-resize border-x border-[#d9dee8] bg-[#e5eaf0] transition hover:bg-[#cad6e4]"
          />

          <section
            className={`relative grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-l border-[#d9dee8] bg-white ${dragging ? 'bg-[#e8f5f2]' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              void uploadManuals(event.dataTransfer.files)
            }}
          >
            {dragging ? (
              <div className="pointer-events-none absolute inset-2 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-[#39776f] bg-[#e8f5f2]/95 p-6 text-center shadow-xl backdrop-blur-sm">
                <div>
                  <div className="text-base font-black text-[#184d47]">Drop PDF manuals here</div>
                  <div className="mt-1 text-xs font-semibold text-[#58736f]">They will be added to the source folder and indexed for chat.</div>
                </div>
              </div>
            ) : null}
            <div className="border-b border-[#d9dee8] bg-white p-2">
              <div className="grid grid-cols-2 rounded-md bg-[#e7ecf2] p-1 text-xs font-black">
                <button
                  type="button"
                  onClick={() => setWorkspaceView('green-file')}
                  className={`rounded-md px-3 py-2 transition ${workspaceView === 'green-file' ? 'bg-white text-[#184d47] shadow-sm' : 'text-[#667386] hover:text-[#184d47]'}`}
                >
                  Green File Index
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceView('ai')}
                  className={`rounded-md px-3 py-2 transition ${workspaceView === 'ai' ? 'bg-white text-[#184d47] shadow-sm' : 'text-[#667386] hover:text-[#184d47]'}`}
                >
                  AI Assistant
                </button>
              </div>
              <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-md border border-dashed border-[#b8c4cf] bg-[#f8fafc] px-3 py-2 text-xs transition hover:border-[#76aaa1] hover:bg-[#f2faf8]">
                <span className="font-bold text-[#184d47]">{uploading ? 'Adding and indexing manuals…' : 'Drop PDF manuals anywhere in this panel'}</span>
                <span className="shrink-0 font-semibold text-[#748194]">{uploadedManualSourceCount} uploaded · Browse</span>
                <input
                  type="file"
                  accept="application/pdf"
                  multiple
                  disabled={uploading}
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files) void uploadManuals(event.target.files)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
              {sourcesError ? (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">{sourcesError}</div>
              ) : null}
            </div>

            {workspaceView === 'green-file' ? (
              <GreenFileIndex selectedSourceIndex={activeSourceIndex} onSelect={openGreenFileEntry} />
            ) : (
              <div className={`grid min-h-0 ${chatView === 'chat' ? 'grid-rows-[minmax(0,1fr)_auto]' : 'grid-rows-[minmax(0,1fr)]'}`}>
                <div ref={messagesRef} className="min-h-0 overflow-y-auto bg-[#fbfcfe] px-5 py-5">
                  <div className="sticky top-0 z-10 -mx-5 mb-4 border-b border-[#d9dee8] bg-[#fbfcfe]/95 px-5 pb-3 backdrop-blur">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-[#18202b]">{chatView === 'history' ? 'Chat History' : activeSession.title}</div>
                        <div className="text-xs font-semibold text-[#657183]">
                          {chatView === 'history' ? 'Search and reopen earlier equipment conversations.' : 'Ask follow-up questions across the crane system.'}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 rounded-md bg-[#e7ecf2] p-1 text-xs font-black">
                        {(['history', 'chat'] as const).map((view) => (
                          <button
                            key={view}
                            type="button"
                            onClick={() => setChatView(view)}
                            className={`rounded-md px-3 py-1.5 transition ${chatView === view ? 'bg-white text-[#184d47] shadow-sm' : 'text-[#667386] hover:text-[#184d47]'}`}
                          >
                            {view === 'history' ? 'History' : 'Chat'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {chatView === 'history' ? (
                    <div>
                      <div className="mb-4 flex gap-2">
                        <input
                          type="search"
                          value={historyQuery}
                          onChange={(event) => setHistoryQuery(event.target.value)}
                          placeholder="Search chat titles and messages…"
                          className="min-w-0 flex-1 rounded-md border border-[#cdd6e2] bg-white px-3 py-2 text-sm text-[#18202b] outline-none transition placeholder:text-[#8d99aa] focus:border-[#76aaa1] focus:ring-2 focus:ring-[#dff1ee]"
                        />
                        <button
                          type="button"
                          onClick={startNewChat}
                          className="shrink-0 rounded-md bg-[#184d47] px-3 py-2 text-xs font-black text-white transition hover:bg-[#123d38]"
                        >
                          + New chat
                        </button>
                      </div>
                      <div className="space-y-2">
                        {filteredSessions.map((session) => {
                          const lastMessage = session.messages.at(-1)?.content ?? 'No messages yet'
                          return (
                            <button
                              key={session.id}
                              type="button"
                              onClick={() => {
                                setActiveSessionId(session.id)
                                setChatView('chat')
                              }}
                              className={`w-full rounded-lg border px-4 py-3 text-left transition ${session.id === activeSession.id ? 'border-[#9ccac2] bg-[#edf8f6]' : 'border-[#e0e6ee] bg-white hover:border-[#b9d3ce] hover:bg-[#f8fbfb]'}`}
                            >
                              <span className="flex items-center justify-between gap-3">
                                <span className="truncate text-sm font-black text-[#18202b]">{session.title}</span>
                                <span className="shrink-0 text-[11px] font-semibold text-[#7a8697]">{new Date(session.createdAt).toLocaleDateString()}</span>
                              </span>
                              <span className="mt-1 block truncate text-xs font-semibold text-[#667386]">{lastMessage}</span>
                              <span className="mt-2 block text-[10px] font-black uppercase tracking-wide text-[#39776f]">{session.messages.length} message{session.messages.length === 1 ? '' : 's'}</span>
                            </button>
                          )
                        })}
                        {filteredSessions.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-[#c7d0dd] bg-white px-4 py-6 text-center text-sm font-semibold text-[#667386]">No chats match “{historyQuery}”.</div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {displayedMessages.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-[#c7d0dd] bg-white px-4 py-6 text-sm font-semibold text-[#667386]">Ask about a part, repair action, manual, or crane-system component.</div>
                      ) : null}
                      {displayedMessages.map((chatMessage) => (
                      <div
                        key={chatMessage.id}
                        className={chatMessage.role === 'user' ? 'ml-auto max-w-[92%] rounded-lg bg-[#e6f4f1] px-4 py-3 shadow-sm' : 'mr-auto max-w-[98%] rounded-lg border border-[#e0e6ee] bg-white px-4 py-3 shadow-sm'}
                      >
                        {chatMessage.role === 'assistant' && chatMessage.rankedSources && chatMessage.rankedSources.length > 0 ? (
                          <div className="mb-3 flex flex-wrap gap-2">
                            {chatMessage.rankedSources.slice(0, 3).map((source) => (
                              <button
                                key={source.index}
                                type="button"
                                onClick={() => {
                                  setActiveSourceIndex(source.index)
                                  setActiveExternalPdfUrl('')
                                  setActiveExternalPdfName('')
                                  goToPage(1)
                                }}
                                className="rounded-full bg-[#edf4f7] px-2.5 py-1 text-[11px] font-bold text-[#184d47] transition hover:bg-[#e0eff1]"
                              >
                                manual: {source.name}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        {chatMessage.role === 'assistant' ? (
                          <div
                            className="notebook-answer text-sm leading-6 text-[#273241]"
                            onClick={(event) => {
                              const target = event.target as HTMLElement
                              const button = target.closest<HTMLButtonElement>('.notebook-ref')
                              if (!button) return
                              const citationId = button.dataset.ref ? Number(button.dataset.ref) : null
                              const page = button.dataset.page ? Number(button.dataset.page) : null
                              handleReferenceClick(citationId, page, chatMessage.citations ?? [])
                            }}
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(chatMessage.content) }}
                          />
                        ) : (
                          <div className="text-sm font-semibold leading-6 text-[#18202b]">{chatMessage.content}</div>
                        )}
                      </div>
                      ))}
                    </div>
                  )}
                </div>

                {chatView === 'chat' ? (
                <form onSubmit={handleAsk} className="border-t border-[#d9dee8] bg-white p-3 shadow-[0_-18px_44px_-38px_rgba(15,23,42,0.5)]">
                  <button
                    type="button"
                    aria-label="Resize message input"
                    onPointerDown={startComposerResize}
                    className="-mt-3 mb-2 block h-3 w-full cursor-row-resize rounded-full border-y border-transparent bg-transparent transition hover:border-[#d9dee8] hover:bg-[#eef2f8]"
                  />
                  <div className="flex items-end gap-2">
                    <textarea
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          event.currentTarget.form?.requestSubmit()
                        }
                      }}
                      style={{ height: composerHeight }}
                      placeholder="Ask about parts, repair actions, manuals, or the quote..."
                      className="min-h-16 flex-1 resize-none rounded-md border border-[#cdd6e2] bg-[#fbfcfe] px-3 py-2 text-sm text-[#18202b] outline-none transition placeholder:text-[#8d99aa] focus:border-[#76aaa1] focus:bg-white focus:ring-2 focus:ring-[#dff1ee]"
                    />
                    <button
                      type="submit"
                      disabled={thinking || !message.trim()}
                      style={{ height: composerHeight }}
                      className="min-h-16 shrink-0 rounded-md bg-[#184d47] px-5 text-sm font-black text-white shadow-sm transition hover:bg-[#123d38] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {thinking ? 'Reading' : 'Ask'}
                    </button>
                  </div>
                  <div className="mt-2 text-xs font-semibold text-[#7a8697]">{thinking ? 'Reading sources...' : 'References open the cited manual page.'}</div>
                </form>
                ) : null}
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  )
}
