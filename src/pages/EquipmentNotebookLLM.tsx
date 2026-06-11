import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { isConfigured, supabase } from '../lib/supabase'
import { usePortalMenu } from '../lib/usePortalMenu'
import { getEditableInspectionReport, type EditableInspectionReport } from '../lib/editableInspectionReports'
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
  { label: 'Documents', href: '/documents-reports' },
  { label: 'Equipment Notebook LLM', href: '/equipment-notebook-llm' },
  { label: 'Custom Reports', href: '/custom-reports' },
  { label: 'Work Orders', href: '/deshazo-work-orders' },
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
      if (/wabash|3nf005|harrington|hoist|cf4|chain|monorail/i.test(getInspectionSearchText(inspection))) {
        score += 18
        reasons.push('equipment match')
      }

      return { ...inspection, score, reasons: reasons.length > 0 ? reasons : ['inspection candidate'] }
    })
    .sort((left, right) => right.score - left.score)
}

const pickSourceForApi = (rankedSources: RankedSource[]) => {
  if (rankedSources.length === 0) return null
  const manual = rankedSources.find((source) => source.document_type === 'manual')
  return manual?.index ?? rankedSources[0].index
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

const messageReferencesOverview = (value: string) =>
  /\b(overview|above|that table|recommended|recommendation|action items|parts table|ai summary)\b/i.test(value)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export default function EquipmentNotebookLLM() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const [sources, setSources] = useState<NotebookSource[]>([])
  const [supabaseInspections, setSupabaseInspections] = useState<JobsQuotingItem[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(true)
  const [sourcesError, setSourcesError] = useState('')
  const [contextWarning, setContextWarning] = useState('')
  const [sessions, setSessions] = useState<ChatSession[]>(() => [starterSession()])
  const [activeSessionId, setActiveSessionId] = useState(() => sessions[0]?.id ?? '')
  const [chatView, setChatView] = useState<'overview' | 'chat'>('overview')
  const [message, setMessage] = useState('')
  const [activeSourceIndex, setActiveSourceIndex] = useState<number | null>(null)
  const [activeExternalPdfUrl, setActiveExternalPdfUrl] = useState('')
  const [activeExternalPdfName, setActiveExternalPdfName] = useState('')
  const [activePage, setActivePage] = useState(1)
  const [activePageCount, setActivePageCount] = useState(1)
  const [uploading, setUploading] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [panelWidths, setPanelWidths] = useState({ chats: 250, sources: 280, chat: 460 })
  const [openPanels, setOpenPanels] = useState({ chats: true, sources: true })
  const [composerHeight, setComposerHeight] = useState(96)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const launchedQuoteIdRef = useRef<string | null>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const jobsQuotingItemId = searchParams.get('jobsQuotingItemId')?.trim() || ''
  const editableReportId = searchParams.get('editableReportId')?.trim() || ''

  const activeMenuItems = useMemo(
    () =>
      menuItems.map((item) => ({
        ...item,
        active: item.label === 'Equipment Notebook LLM',
      })),
    [],
  )

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0],
    [activeSessionId, sessions],
  )

  const latestAssistant = [...(activeSession?.messages ?? [])].reverse().find((item) => item.role === 'assistant')
  const latestOverview = [...(activeSession?.messages ?? [])].reverse().find((item) => item.role === 'assistant' && item.kind === 'overview')
  const displayedMessages =
    chatView === 'overview'
      ? activeSession?.messages.filter((item) => item.kind === 'overview') ?? []
      : activeSession?.messages.filter((item) => item.kind !== 'overview') ?? []
  const latestCitations = latestAssistant?.citations ?? []
  const latestRankedSources = latestAssistant?.rankedSources ?? rankSources(message, sources)
  const topSourceItem = latestRankedSources[0]
  const activeSource = sources.find((source) => source.index === activeSourceIndex) ?? topSourceItem ?? sources[0]
  const pdfTitle = activeExternalPdfName || activeSource?.name || 'Source PDF'
  const manualSourceCount = sources.filter((source) => source.document_type === 'manual').length
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
      navigate('/login')
      return
    }
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate('/login')
      } else {
        setUser(data.user)
      }
      setAuthLoading(false)
    })
  }, [navigate])

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight })
  }, [activeSession?.messages.length, activeSessionId])

  useEffect(() => {
    const controller = new AbortController()

    async function loadSources() {
      try {
        setSourcesLoading(true)
        setSourcesError('')
        const [data, inspectionData] = await Promise.all([
          getNotebookSources(controller.signal),
          getJobsQuotingItems().catch(() => []),
        ])
        const manualSources = data.filter((source) => source.document_type === 'manual')
        setSources(manualSources)
        setSupabaseInspections(inspectionData)
        setActiveSourceIndex((current) => current ?? manualSources[0]?.index ?? null)
      } catch (error) {
        if (controller.signal.aborted) return
        setSourcesError(error instanceof Error ? error.message : 'Notebook sources could not be loaded.')
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
    if (activeExternalPdfUrl || !activeSource) {
      setActivePageCount(1)
      return
    }

    const controller = new AbortController()
    getNotebookPdfInfo(activeSource.index, controller.signal)
      .then((info) => {
        setActivePageCount(Math.max(1, info.pages || 1))
        setActivePage((page) => Math.min(Math.max(1, page), Math.max(1, info.pages || 1)))
      })
      .catch(() => setActivePageCount(1))

    return () => controller.abort()
  }, [activeExternalPdfUrl, activeSource?.index])

  const updateActiveSession = (updater: (session: ChatSession) => ChatSession) => {
    setSessions((current) => current.map((session) => (session.id === activeSessionId ? updater(session) : session)))
  }

  const startNewChat = () => {
    const session = starterSession()
    setSessions([session])
    setActiveSessionId(session.id)
    setChatView('overview')
    setMessage('')
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
      setSources(data)
      setActiveSourceIndex(data[data.length - 1]?.index ?? null)
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
      setSources(data)
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
      const answer = await askNotebook(buildInspectionContextPrompt(`${prompt}${cleanupPrompt}`, rankedInspections, preferredInspection), sourceIndex)
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
    setChatView('chat')
    await submitQuestion(message.trim(), undefined, { kind: 'chat' })
  }

  useEffect(() => {
    if (!jobsQuotingItemId || sourcesLoading || thinking || launchedQuoteIdRef.current === jobsQuotingItemId) return

    launchedQuoteIdRef.current = jobsQuotingItemId
    async function loadQuoteContext() {
      try {
        const quoteItem = await getJobsQuotingItem(jobsQuotingItemId)
        setSupabaseInspections((current) =>
          current.some((inspection) => inspection.id === quoteItem.id) ? current : [quoteItem, ...current],
        )
        const prompt = buildOverviewPrompt(buildQuotePrompt(quoteItem))
        setChatView('overview')
        await submitQuestion(prompt, quoteItem, { kind: 'overview', hideUserMessage: true, title: 'AI Overview' })
      } catch (error) {
        setSourcesError(error instanceof Error ? error.message : 'Quote context could not be loaded.')
      }
    }

    void loadQuoteContext()
  }, [jobsQuotingItemId, sourcesLoading, thinking])

  useEffect(() => {
    if (!editableReportId || jobsQuotingItemId || sourcesLoading || thinking || launchedQuoteIdRef.current === editableReportId) return

    launchedQuoteIdRef.current = editableReportId
    async function loadEditableReportContext() {
      try {
        const report = await getEditableInspectionReport(editableReportId)
        const prompt = buildOverviewPrompt(buildEditableReportPrompt(report))
        setContextWarning(
          'This chat is using a saved quote as the primary context. If source inspections differ from this quote, confirm which one should control repair facts before purchasing parts.',
        )
        setChatView('overview')
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
    <div className="h-screen overflow-hidden bg-[var(--bg)] text-[var(--deshazo-text)]">
      <header className="sticky top-0 z-40 bg-[var(--deshazo-blue)] px-5 py-3 shadow-sm">
        <div className="flex w-full items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex min-w-[120px] items-center justify-center gap-2 rounded-md border-2 border-white/80 px-6 py-2.5 text-base font-semibold text-white transition hover:bg-white/10"
          >
            <span>Menu</span>
            <span aria-hidden="true" className="text-xs">
              {menuOpen ? '^' : 'v'}
            </span>
          </button>

          <div className="text-right">
            <h1 className="text-[22px] font-black tracking-[0] text-white">Equipment Notebook LLM</h1>
            <p className="hidden text-xs font-semibold text-white/75 sm:block">Folder-aware manual and inspection chat</p>
          </div>
        </div>
      </header>

      <main className="flex h-[calc(100vh-60px)] min-h-0 w-full items-stretch">
        {menuOpen && (
          <aside className="hidden h-full w-[268px] shrink-0 border-r border-[var(--deshazo-border)] bg-white lg:flex lg:flex-col">
            <div className="flex-1 px-4 py-5">
              <div className="rounded-[24px] border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)]/50 p-4">
                <nav className="space-y-2">
                  {activeMenuItems.map((item) => (
                    <Link
                      key={item.label}
                      to={item.href}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-[15px] font-medium transition ${
                        item.active
                          ? 'bg-[#dbe5ff] text-[var(--deshazo-text)] shadow-[inset_0_0_0_1px_rgba(47,86,166,0.06)]'
                          : 'text-[rgba(21,24,33,0.7)] hover:bg-white'
                      }`}
                    >
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </nav>
              </div>
            </div>

            <div className="border-t border-[var(--deshazo-border)] px-4 py-4">
              <div className="rounded-2xl bg-[var(--deshazo-surface)] px-3 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-extrabold text-[var(--deshazo-blue)] shadow-[0_10px_24px_-18px_rgba(47,86,166,0.45)]">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold text-[var(--deshazo-text)]">{fullName}</p>
                    <p className="truncate text-[14px] text-[rgba(21,24,33,0.55)]">{user.email}</p>
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
              <aside className="min-h-0 bg-white">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="border-b border-[var(--deshazo-border)] p-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={startNewChat}
                        className="inline-flex flex-1 items-center justify-center rounded-lg bg-[var(--deshazo-blue)] px-3 py-2 text-sm font-bold text-white transition hover:bg-[var(--deshazo-blue-deep)]"
                      >
                        + New chat
                      </button>
                      <button
                        type="button"
                        aria-label="Close chat history"
                        onClick={() => setOpenPanels((current) => ({ ...current, chats: false }))}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--deshazo-border)] bg-white text-lg font-black leading-none text-[rgba(21,24,33,0.58)] transition hover:bg-[var(--deshazo-surface)] hover:text-[var(--deshazo-blue)]"
                      >
                        x
                      </button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    <div className="mb-2 text-xs font-black uppercase text-[rgba(21,24,33,0.48)]">Chat history</div>
                    <div className="space-y-2">
                      {sessions.map((session) => (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => setActiveSessionId(session.id)}
                          className={`w-full rounded-lg px-3 py-3 text-left transition ${
                            session.id === activeSession.id
                              ? 'bg-[#e9edf8] text-[var(--deshazo-text)]'
                              : 'text-[rgba(21,24,33,0.72)] hover:bg-[var(--deshazo-surface)]'
                          }`}
                        >
                          <span className="block truncate text-sm font-bold">{session.title}</span>
                          <span className="mt-1 block text-xs text-[rgba(21,24,33,0.48)]">
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
                className="h-full cursor-col-resize border-x border-[var(--deshazo-border)] bg-[#eef2f8] transition hover:bg-[#dbe5ff]"
              />
            </>
          ) : null}

          {openPanels.sources ? (
            <>
              <aside className="min-h-0 bg-[#fafbfe]">
                <div
                  className={`flex h-full min-h-0 flex-col ${dragging ? 'bg-[#eef3ff]' : ''}`}
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
                  <div className="border-b border-[var(--deshazo-border)] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-black text-[var(--deshazo-text)]">Source folder</div>
                        <div className="mt-1 text-xs font-semibold text-[rgba(21,24,33,0.52)]">
                          {sourcesLoading
                            ? 'Loading sources...'
                            : `${manualSourceCount} uploaded manual${manualSourceCount === 1 ? '' : 's'}`}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label="Close source folder"
                        onClick={() => setOpenPanels((current) => ({ ...current, sources: false }))}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--deshazo-border)] bg-white text-lg font-black leading-none text-[rgba(21,24,33,0.58)] transition hover:bg-[var(--deshazo-surface)] hover:text-[var(--deshazo-blue)]"
                      >
                        x
                      </button>
                    </div>
                    <label className="mt-3 flex cursor-pointer flex-col rounded-lg border border-dashed border-[var(--deshazo-border)] bg-white px-3 py-3 text-sm font-bold text-[var(--deshazo-blue)]">
                      <span>{uploading ? 'Uploading...' : '+ Drop or add manual PDF'}</span>
                      <span className="mt-1 text-xs font-semibold text-[rgba(21,24,33,0.48)]">manuals only</span>
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
                    <div className="m-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-700">
                      {sourcesError}
                      <div className="mt-2 text-[11px]">API: {notebookApiUrl}</div>
                    </div>
                  ) : null}
                  {contextWarning ? (
                    <div className="m-3 rounded-lg border border-[#f0d58b] bg-[#fff9e7] p-3 text-xs font-semibold leading-5 text-[#7a560f]">
                      {contextWarning}
                    </div>
                  ) : null}

                  <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    <div className="mb-2 text-xs font-black uppercase text-[rgba(21,24,33,0.48)]">Files in source folder</div>
                    <div className="space-y-2">
                      {sources.length === 0 && !sourcesLoading ? (
                        <div className="rounded-lg border border-dashed border-[var(--deshazo-border)] bg-white/70 px-3 py-4 text-xs font-semibold leading-5 text-[rgba(21,24,33,0.56)]">
                          No manuals in the source folder yet. Drop or add a manual PDF to start.
                        </div>
                      ) : null}
                      {sources.map((source, index) => {
                        return (
                          <div
                            key={source.index}
                            className={`rounded-lg border px-3 py-3 text-left transition ${
                              activeSource?.index === source.index && !activeExternalPdfUrl
                                ? 'border-[var(--deshazo-blue)] bg-white'
                                : 'border-transparent bg-white/70 hover:border-[var(--deshazo-border)]'
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
                                <span className="text-xs font-black text-[var(--deshazo-blue)]">#{index + 1} manual</span>
                                <span className="rounded-full bg-[var(--deshazo-surface)] px-2 py-0.5 text-[11px] font-bold text-[var(--deshazo-blue)]">
                                  PDF
                                </span>
                              </span>
                              <span className="mt-1 block truncate text-sm font-bold text-[var(--deshazo-text)]">{source.name}</span>
                              <span className="mt-1 block text-xs font-semibold text-[rgba(21,24,33,0.5)]">{sourceLabel(source)}</span>
                              <span className="mt-2 block truncate text-xs text-[rgba(21,24,33,0.52)]">{source.source}</span>
                            </button>
                            <button
                              type="button"
                              disabled={uploading}
                              onClick={() => void removeNotebookSource(source)}
                              className="mt-3 rounded-full border border-[#f1b7b7] bg-white px-2 py-1 text-[10px] font-black uppercase text-[#a2472f] transition hover:bg-[#fff5f5] disabled:opacity-50"
                            >
                              Remove source
                            </button>
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
                className="h-full cursor-col-resize border-x border-[var(--deshazo-border)] bg-[#eef2f8] transition hover:bg-[#dbe5ff]"
              />
            </>
          ) : null}

          <section className="relative min-h-0 overflow-hidden bg-[#f1f2f5]">
            {!openPanels.chats || !openPanels.sources ? (
              <div className="absolute left-4 top-4 z-20 flex flex-wrap gap-2">
                {!openPanels.chats ? (
                  <button
                    type="button"
                    onClick={() => setOpenPanels((current) => ({ ...current, chats: true }))}
                    className="rounded-lg border border-[var(--deshazo-border)] bg-white px-3 py-2 text-xs font-black text-[var(--deshazo-blue)] shadow-[0_12px_30px_-20px_rgba(47,86,166,0.4)] transition hover:bg-[var(--deshazo-surface)]"
                  >
                    Open chats
                  </button>
                ) : null}
                {!openPanels.sources ? (
                  <button
                    type="button"
                    onClick={() => setOpenPanels((current) => ({ ...current, sources: true }))}
                    className="rounded-lg border border-[var(--deshazo-border)] bg-white px-3 py-2 text-xs font-black text-[var(--deshazo-blue)] shadow-[0_12px_30px_-20px_rgba(47,86,166,0.4)] transition hover:bg-[var(--deshazo-surface)]"
                  >
                    Open sources
                  </button>
                ) : null}
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
                ) : activeSource ? (
                  <iframe
                    key={`${activeSource.index}-${activePage}`}
                    src={notebookPdfUrl(activeSource.index, activePage)}
                    title={pdfTitle}
                    className="h-full w-full border-0"
                  />
                ) : null}
                <div className="absolute bottom-5 left-1/2 z-20 flex max-w-[calc(100%-40px)] -translate-x-1/2 items-center gap-2 rounded-lg border border-[var(--deshazo-border)] bg-white px-3 py-2 text-xs font-semibold text-[rgba(21,24,33,0.66)] shadow-[0_12px_30px_-20px_rgba(47,86,166,0.4)]">
                  <button
                    type="button"
                    onClick={() => goToPage(Math.max(1, activePage - 1))}
                    className="rounded-md border border-[var(--deshazo-border)] px-2 py-1 text-[var(--deshazo-blue)]"
                  >
                    -
                  </button>
                  <span className="max-w-[220px] truncate">{pdfTitle}</span>
                  <span>Page</span>
                  <input
                    type="number"
                    min={1}
                    max={activeExternalPdfUrl ? undefined : activePageCount}
                    value={activePage}
                    onChange={(event) =>
                      goToPage(Math.min(activeExternalPdfUrl ? Number.MAX_SAFE_INTEGER : activePageCount, Math.max(1, Number(event.target.value || 1))))
                    }
                    className="h-7 w-16 rounded-md border border-[var(--deshazo-border)] px-2 text-sm text-[var(--deshazo-text)] outline-none"
                  />
                  {!activeExternalPdfUrl ? <span>/ {activePageCount}</span> : null}
                  <button
                    type="button"
                    onClick={() =>
                      goToPage(activeExternalPdfUrl ? activePage + 1 : Math.min(activePageCount, activePage + 1))
                    }
                    className="rounded-md border border-[var(--deshazo-border)] px-2 py-1 text-[var(--deshazo-blue)]"
                  >
                    +
                  </button>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm font-semibold text-[rgba(21,24,33,0.48)]">
                Add a manual PDF to preview cited pages.
              </div>
            )}
          </section>
          <button
            type="button"
            aria-label="Resize chat panel"
            onPointerDown={(event) => startColumnResize('chat', event)}
            className="h-full cursor-col-resize border-x border-[var(--deshazo-border)] bg-[#eef2f8] transition hover:bg-[#dbe5ff]"
          />

          <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] border-l border-[var(--deshazo-border)] bg-white">
            <div ref={messagesRef} className="min-h-0 overflow-y-auto px-5 py-5">
              <div className="sticky top-0 z-10 -mx-5 mb-4 border-b border-[var(--deshazo-border)] bg-white/95 px-5 pb-3 backdrop-blur">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-[var(--deshazo-text)]">
                      {chatView === 'overview' ? 'AI Overview' : 'Chat'}
                    </div>
                    <div className="text-xs font-semibold text-[rgba(21,24,33,0.55)]">
                      {chatView === 'overview'
                        ? 'Action items and recommended parts from the primary context.'
                        : 'Ask follow-up questions. Reference the overview when useful.'}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 rounded-full bg-[var(--deshazo-surface)] p-1 text-xs font-black">
                    {(['overview', 'chat'] as const).map((view) => (
                      <button
                        key={view}
                        type="button"
                        onClick={() => setChatView(view)}
                        className={`rounded-full px-3 py-1.5 transition ${
                          chatView === view
                            ? 'bg-white text-[var(--deshazo-blue)] shadow-sm'
                            : 'text-[rgba(21,24,33,0.52)] hover:text-[var(--deshazo-blue)]'
                        }`}
                      >
                        {view === 'overview' ? 'Overview' : 'Chat'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                {displayedMessages.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--deshazo-border)] bg-[var(--deshazo-surface)]/60 px-4 py-6 text-sm font-semibold text-[rgba(21,24,33,0.56)]">
                    {chatView === 'overview'
                      ? 'Building the overview from the selected quote or inspection...'
                      : 'Start with a follow-up question, or reference the AI Overview.'}
                  </div>
                ) : null}
                {displayedMessages.map((chatMessage) => (
                  <div
                    key={chatMessage.id}
                    className={chatMessage.role === 'user' ? 'ml-auto max-w-[92%] rounded-xl bg-[#f0f2f6] px-4 py-3' : 'mr-auto max-w-[98%]'}
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
                            className="rounded-full bg-[var(--deshazo-surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--deshazo-blue)]"
                          >
                            manual: {source.name}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {chatMessage.role === 'assistant' ? (
                      <div
                        className="notebook-answer text-sm leading-6 text-[rgba(21,24,33,0.86)]"
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
                      <div className="text-sm font-medium leading-6 text-[var(--deshazo-text)]">{chatMessage.content}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleAsk} className="border-t border-[var(--deshazo-border)] bg-white p-3">
              <button
                type="button"
                aria-label="Resize message input"
                onPointerDown={startComposerResize}
                className="-mt-3 mb-2 block h-3 w-full cursor-row-resize rounded-full border-y border-transparent bg-transparent transition hover:border-[var(--deshazo-border)] hover:bg-[#eef2f8]"
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
                  className="min-h-16 flex-1 resize-none rounded-lg border border-[var(--deshazo-border)] px-3 py-2 text-sm text-[var(--deshazo-text)] outline-none transition focus:border-[var(--deshazo-blue)]"
                />
                <button
                  type="submit"
                  disabled={thinking || !message.trim()}
                  style={{ height: composerHeight }}
                  className="min-h-16 shrink-0 rounded-lg bg-[var(--deshazo-blue)] px-5 text-sm font-bold text-white transition hover:bg-[var(--deshazo-blue-deep)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {thinking ? 'Reading' : 'Ask'}
                </button>
              </div>
              <div className="mt-2 text-xs font-semibold text-[rgba(21,24,33,0.48)]">
                {thinking ? 'Reading sources...' : 'References open the cited PDF page.'}
              </div>
            </form>
          </section>
        </section>
      </main>
    </div>
  )
}
