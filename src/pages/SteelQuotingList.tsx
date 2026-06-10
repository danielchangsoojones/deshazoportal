import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { User } from '@supabase/supabase-js'
import { supabase, isConfigured } from '../lib/supabase'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

type ExtractedMeasurement = {
  id: string
  page: number
  value: string
  context: string
  type: 'dimension' | 'angle' | 'quantity' | 'steel'
}

type DrawingField = {
  label: string
  value: string
}

type SteelDimensionRow = {
  id: string
  measurement: string
  label: string
  page: string
  dimension: string
  notes: string
}

const defaultDimensionRows: SteelDimensionRow[] = [
  {
    id: 'length',
    measurement: 'in.',
    label: 'Length',
    page: '',
    dimension: '94.00"',
    notes: 'Overall part length.',
  },
  {
    id: 'flat-blank-width',
    measurement: 'in.',
    label: 'Width (flat blank)',
    page: '',
    dimension: '14.85"',
    notes: 'Flat blank width before forming.',
  },
  {
    id: 'material-thickness',
    measurement: 'in.',
    label: 'Material thickness',
    page: '',
    dimension: '.079"',
    notes: 'Material thickness from the steel specification.',
  },
  {
    id: 'material',
    measurement: 'text',
    label: 'Material',
    page: '',
    dimension: 'MATERIAL .079 DOMEX 700MCE PER MS28356 SSAB PROCEDURE',
    notes: 'Material callout and governing procedure.',
  },
  {
    id: 'estimated-weight',
    measurement: 'lb.',
    label: 'Est. weight',
    page: '',
    dimension: '31.74',
    notes: 'Estimated part weight.',
  },
  {
    id: 'finished-cross-section',
    measurement: 'in.',
    label: 'Finished cross-section',
    page: '',
    dimension: '4.00" x 4.73"',
    notes: 'Finished formed cross-section size.',
  },
]

const dimensionPattern =
  /\b(?:\d+\s*[- ]\s*)?(?:\d+\/\d+|\d+(?:\.\d+)?)(?:\s*(?:'|ft|feet|in|inch|inches|")|\s*[- ]\s*\d+\/\d+\s*")\b/gi
const anglePattern = /\b\d+(?:\.\d+)?\s*(?:deg|degree|degrees|°)\b/gi
const quantityPattern = /\b(?:qty|quantity)\s*[:#-]?\s*\d+\b|\b\d+\s*(?:pcs|pieces|ea|each)\b/gi
const steelPattern = /\b(?:W|S|C|MC|L|WT|ST|MT|HSS|PIPE|PL|BAR)\s*\d[\d./ xX-]*(?:\s*x\s*[\d./-]+)?\b/gi
const gradePattern = /\bA\s?(?:36|572|588|500|53|992|514|709)\b|\bGR(?:ADE)?\.?\s?[A-Z0-9-]+\b/gi
const finishPattern = /\b(?:hot dip galvanized|galvanized|paint(?:ed)?|primer|primed|powder coat(?:ed)?|bare steel|stainless|zinc)\b/gi

const rowMatchRules: Record<string, { patterns: RegExp[]; types?: ExtractedMeasurement['type'][] }> = {
  length: { patterns: [/length|long|overall|o\.?a\.?/i], types: ['dimension'] },
  'flat-blank-width': { patterns: [/flat blank|blank width|width/i], types: ['dimension'] },
  'material-thickness': { patterns: [/material|thick|thickness|domex|700mce|ms28356/i], types: ['dimension'] },
  material: { patterns: [/material|domex|700mce|ms28356|ssab/i] },
  'estimated-weight': { patterns: [/est\.?\s*weight|estimated weight|weight|wt\.?/i], types: ['dimension', 'quantity'] },
  'finished-cross-section': { patterns: [/finished cross-section|cross section|cross-section|formed size|finished size/i], types: ['dimension'] },
  'overall-length': { patterns: [/length|long|overall|o\.?a\.?/i], types: ['dimension'] },
  'member-shape': { patterns: [/beam|member|shape|section|wide flange|hss|pipe|tube|channel|angle/i], types: ['steel'] },
  'material-grade': { patterns: [/grade|material|astm|a36|a572|a500|a992/i] },
  quantity: { patterns: [/qty|quantity|pieces|pcs|each|\bea\b/i], types: ['quantity'] },
  'width-height': { patterns: [/width|height|wide|deep|depth|outside|o\.?d\.?|frame|opening/i], types: ['dimension'] },
  thickness: { patterns: [/thick|thickness|wall|gauge|ga\.?|plate/i], types: ['dimension'] },
  'hole-size': { patterns: [/hole|diameter|dia\.?|drill|punch|bolt/i], types: ['dimension'] },
  'hole-spacing': { patterns: [/spacing|center|c\/c|edge|end distance|pitch|holes/i], types: ['dimension'] },
  'slot-size': { patterns: [/slot|slotted/i], types: ['dimension'] },
  'plate-size': { patterns: [/plate|base plate|cap plate|gusset|stiffener|clip|tab/i] },
  'bend-radius': { patterns: [/bend|radius|roll|rolled/i], types: ['dimension', 'angle'] },
  'cut-angle': { patterns: [/miter|mitre|bevel|angle|cut/i], types: ['angle', 'dimension'] },
  'cope-notch': { patterns: [/cope|notch|block out|cutout/i], types: ['dimension'] },
  'weld-size': { patterns: [/weld|fillet|groove|plug|stitch/i], types: ['dimension'] },
  'weld-length': { patterns: [/weld|stitch|intermittent|continuous/i], types: ['dimension'] },
  'bolt-size': { patterns: [/bolt|anchor|washer|nut|hardware/i], types: ['dimension'] },
  finish: { patterns: [/finish|paint|prime|galv|coat|bare|stainless/i] },
  tolerance: { patterns: [/tolerance|field verify|verify|hold|critical|fit/i], types: ['dimension'] },
  'assembly-notes': { patterns: [/install|assembly|field|erect|weld in field|shop/i] },
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function uniqueMatches(pattern: RegExp, value: string) {
  pattern.lastIndex = 0
  return Array.from(new Set(Array.from(value.matchAll(pattern), (match) => normalizeText(match[0]))))
}

function getFieldFromText(label: string, text: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = text.match(new RegExp(`\\b${escapedLabel}\\b\\s*[:#-]?\\s*([^\\n]{1,80})`, 'i'))
  return normalizeText(match?.[1] ?? '')
}

function extractDrawingFields(fullText: string, fileName: string): DrawingField[] {
  const candidates = [
    ['File', fileName],
    ['Job', getFieldFromText('job', fullText) || getFieldFromText('job no', fullText) || getFieldFromText('job number', fullText)],
    ['Drawing', getFieldFromText('drawing', fullText) || getFieldFromText('dwg', fullText)],
    ['Sheet', getFieldFromText('sheet', fullText)],
    ['Revision', getFieldFromText('rev', fullText) || getFieldFromText('revision', fullText)],
    ['Date', getFieldFromText('date', fullText)],
  ] satisfies Array<[string, string]>

  return candidates.filter((field) => field[1]).map(([label, value]) => ({ label, value }))
}

function buildMeasurements(pages: string[]) {
  const measurements: ExtractedMeasurement[] = []

  pages.forEach((pageText, pageIndex) => {
    const lines = pageText
      .split('\n')
      .map(normalizeText)
      .filter(Boolean)

    lines.forEach((line, lineIndex) => {
      const context = normalizeText(
        [lines[lineIndex - 1], line, lines[lineIndex + 1]]
          .filter(Boolean)
          .join(' '),
      )

      const groups: Array<[ExtractedMeasurement['type'], string[]]> = [
        ['dimension', uniqueMatches(dimensionPattern, line)],
        ['angle', uniqueMatches(anglePattern, line)],
        ['quantity', uniqueMatches(quantityPattern, line)],
        ['steel', uniqueMatches(steelPattern, line)],
      ]

      groups.forEach(([type, values]) => {
        values.forEach((value) => {
          const duplicate = measurements.some(
            (item) => item.page === pageIndex + 1 && item.type === type && item.value === value && item.context === context,
          )
          if (!duplicate) {
            measurements.push({
              id: `${pageIndex + 1}-${type}-${measurements.length}`,
              page: pageIndex + 1,
              value,
              context,
              type,
            })
          }
        })
      })
    })
  })

  return measurements
}

function formatMeasurementValues(items: ExtractedMeasurement[]) {
  return Array.from(new Set(items.map((item) => item.value))).join(', ')
}

function formatMeasurementNotes(items: ExtractedMeasurement[], fallback: string) {
  const notes = Array.from(new Set(items.map((item) => item.context).filter(Boolean))).slice(0, 3)
  return notes.length > 0 ? notes.join(' | ') : fallback
}

function inferMeasurementUnit(value: string, type: ExtractedMeasurement['type']) {
  const lowerValue = value.toLowerCase()
  if (type === 'angle' || lowerValue.includes('deg') || lowerValue.includes('°')) return 'deg.'
  if (type === 'quantity' || /\b(?:pcs|pieces|ea|each)\b/i.test(value)) return 'ea.'
  if (type === 'steel') return 'shape'
  if (lowerValue.includes('cm')) return 'cm'
  if (lowerValue.includes('mm')) return 'mm'
  if (lowerValue.includes('ft') || value.includes("'")) return 'ft.'
  if (lowerValue.includes('in') || value.includes('"')) return 'in.'
  return 'in.'
}

function findLabeledValue(labelPattern: RegExp, fullText: string) {
  const lines = fullText
    .split('\n')
    .map(normalizeText)
    .filter(Boolean)
  const line = lines.find((candidate) => labelPattern.test(candidate))
  labelPattern.lastIndex = 0
  if (!line) return ''

  const [, value = ''] = line.split(/[:#-]\s*/, 2)
  return normalizeText(value || line)
}

function buildAutofilledRows(pages: string[], fileName: string) {
  const measurements = buildMeasurements(pages)
  const fullText = pages.join('\n')
  const usedMeasurementIds = new Set<string>()

  const rows = defaultDimensionRows.map((row): SteelDimensionRow => {
    const rule = rowMatchRules[row.id]
    let matches: ExtractedMeasurement[] = []

    if (rule) {
      matches = measurements.filter((item) => {
        const contextMatches = rule.patterns.some((pattern) => pattern.test(item.context))
        rule.patterns.forEach((pattern) => {
          pattern.lastIndex = 0
        })
        const typeMatches = !rule.types || rule.types.includes(item.type)
        return contextMatches && typeMatches
      })
    }

    let dimension = matches.length > 0 ? formatMeasurementValues(matches) : row.dimension
    let notes = matches.length > 0 ? formatMeasurementNotes(matches, row.notes) : row.notes
    let page = matches[0]?.page ? String(matches[0].page) : row.page

    if (row.id === 'drawing-title') {
      dimension =
        getFieldFromText('drawing', fullText) ||
        getFieldFromText('dwg', fullText) ||
        getFieldFromText('title', fullText) ||
        fileName.replace(/\.pdf$/i, '')
      notes = normalizeText(
        [
          getFieldFromText('job', fullText) && `Job: ${getFieldFromText('job', fullText)}`,
          getFieldFromText('sheet', fullText) && `Sheet: ${getFieldFromText('sheet', fullText)}`,
          getFieldFromText('rev', fullText) && `Rev: ${getFieldFromText('rev', fullText)}`,
        ]
          .filter(Boolean)
          .join(' | '),
      ) || row.notes
      page = '1'
    }

    if (row.id === 'member-shape' && !dimension) {
      const steelMatches = measurements.filter((item) => item.type === 'steel')
      dimension = formatMeasurementValues(steelMatches)
      notes = formatMeasurementNotes(steelMatches, row.notes)
      page = steelMatches[0]?.page ? String(steelMatches[0].page) : page
      matches = steelMatches
    }

    if (row.id === 'material-grade' && !dimension) {
      dimension = uniqueMatches(gradePattern, fullText).join(', ')
      page = dimension ? '1' : page
    }

    if (row.id === 'finish' && !dimension) {
      dimension = uniqueMatches(finishPattern, fullText).join(', ')
      page = dimension ? '1' : page
    }

    if (row.id === 'quantity' && !dimension) {
      dimension = findLabeledValue(/\b(?:qty|quantity)\b/i, fullText)
      page = dimension ? '1' : page
    }

    matches.forEach((item) => usedMeasurementIds.add(item.id))

    return {
      ...row,
      page,
      dimension,
      notes,
    }
  })

  const extraRows = measurements
    .filter((item) => item.type === 'dimension' && !usedMeasurementIds.has(item.id))
    .map((item, index): SteelDimensionRow => ({
      id: `dimension-${index}-${item.id}`,
      measurement: inferMeasurementUnit(item.value, item.type),
      label: `Extra dimension ${index + 1}`,
      page: String(item.page),
      dimension: item.value,
      notes: item.context,
    }))

  return {
    rows: [...rows, ...extraRows],
    filledCount: rows.filter((row) => row.dimension.trim()).length,
    extraCount: extraRows.length,
  }
}

async function extractPdfText(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise
  const pages: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = content.items
      .filter((item): item is TextItem => 'str' in item)
      .map((item) => item.str)
      .join('\n')
    pages.push(pageText)
  }

  return pages
}

export default function SteelQuotingList() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [pdfUrl, setPdfUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [pagesText, setPagesText] = useState<string[]>([])
  const [dimensionRows, setDimensionRows] = useState<SteelDimensionRow[]>(defaultDimensionRows)
  const [extracting, setExtracting] = useState(false)
  const [message, setMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isConfigured || !supabase) {
      navigate('/quotelogin')
      return
    }

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate('/quotelogin')
      } else {
        setUser(data.user)
        setAuthLoading(false)
      }
    })
  }, [navigate])

  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    },
    [pdfUrl],
  )

  const fullText = useMemo(() => pagesText.join('\n'), [pagesText])
  const drawingFields = useMemo(() => extractDrawingFields(fullText, fileName), [fileName, fullText])

  const updateDimensionRow = (rowId: string, updates: Partial<SteelDimensionRow>) => {
    setDimensionRows((currentRows) =>
      currentRows.map((row) => (row.id === rowId ? { ...row, ...updates } : row)),
    )
  }

  const addDimensionRow = () => {
    setDimensionRows((currentRows) => [
      ...currentRows,
      {
        id: `manual-dimension-${Date.now()}`,
        measurement: 'in.',
        label: 'Manual item',
        page: '1',
        dimension: '',
        notes: '',
      },
    ])
  }

  const deleteDimensionRow = (rowId: string) => {
    setDimensionRows((currentRows) => currentRows.filter((row) => row.id !== rowId))
  }

  const uploadPdf = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setMessage('Choose a PDF file.')
      return
    }

    setExtracting(true)
    setMessage('Reading steel drawing measurements.')
    setPagesText([])
    setDimensionRows(defaultDimensionRows)
    setFileName(file.name)

    setPdfUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl)
      return URL.createObjectURL(file)
    })

    try {
      const nextPagesText = await extractPdfText(file)
      const autofillResult = buildAutofilledRows(nextPagesText, file.name)
      setPagesText(nextPagesText)
      setDimensionRows(autofillResult.rows)
      setMessage(
        `Filled ${autofillResult.filledCount} checklist item${autofillResult.filledCount === 1 ? '' : 's'} from ${file.name}. ${autofillResult.extraCount} extra dimension${autofillResult.extraCount === 1 ? '' : 's'} added below.`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Measurements could not be read from this PDF.')
    } finally {
      setExtracting(false)
    }
  }

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#e8eaef] px-4">
        <div className="rounded-md border border-[#dfe4ef] bg-white px-6 py-4 text-sm font-black text-[#273f7a] shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
          Loading steel quoting...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#e8eaef] text-[#111]">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-[linear-gradient(90deg,#3cb9c5_0%,#7a35e8_100%)] px-4 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/steel-demo-dashboard')}
            className="text-[22px] font-black leading-none transition hover:text-white/80"
            aria-label="Home"
          >
            ⌂
          </button>
          <div className="hidden rounded-md border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold md:block">
            Steel Quoting
          </div>
        </div>

        <div className="text-sm font-black tracking-wide">Steel Quoting List</div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => {
              uploadPdf(event.currentTarget.files)
              event.currentTarget.value = ''
            }}
          />
          <button
            type="button"
            disabled={extracting}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md bg-white px-4 py-2 text-sm font-black text-[#35245f] transition hover:bg-[#f3efff] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {extracting ? 'Reading...' : 'Upload PDF'}
          </button>
        </div>
      </header>

      <main className="grid h-[calc(100vh-56px)] min-h-0 grid-cols-1 overflow-hidden bg-[#f3f4f8] lg:grid-cols-[minmax(420px,1fr)_620px]">
        <section className="min-h-0 border-r border-[#d9dce5] bg-[#20242c]">
          {pdfUrl ? (
            <iframe
              key={pdfUrl}
              src={pdfUrl}
              title={fileName || 'Uploaded steel PDF'}
              className="h-full w-full border-0 bg-white"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div className="max-w-sm rounded-md border border-dashed border-white/25 bg-white/10 px-6 py-8 text-white">
                <p className="text-lg font-black">Upload a steel PDF</p>
                <p className="mt-2 text-sm font-semibold text-white/70">
                  The drawing preview will appear here.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-5 rounded-md bg-white px-4 py-2 text-sm font-black text-[#273f7a] transition hover:bg-[#edf2fb]"
                >
                  Choose PDF
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="min-h-0 overflow-y-auto bg-white">
          <div className="sticky top-0 z-10 border-b border-[#dfe4ef] bg-white px-5 py-4">
            <h1 className="text-[24px] font-black leading-tight text-[#1f2430]">Dimension List</h1>
            <p className="mt-1 text-[13px] font-semibold text-[#747b8a]">
              Fill in the steel takeoff fields, then use the PDF to verify each value.
            </p>
          </div>

          <div className="space-y-4 px-5 py-5">
            {message ? (
              <div className="rounded-md border border-[#cfd9ef] bg-[#f4f7ff] px-4 py-3 text-[13px] font-bold text-[#273f7a]">
                {message}
              </div>
            ) : null}

            {fileName ? (
              <section className="rounded-md border border-[#dfe4ef] bg-[#fbfcff] p-4">
                <h2 className="text-[13px] font-black uppercase text-[#273f7a]">Drawing Info</h2>
                <div className="mt-3 grid gap-2">
                  {drawingFields.map((field) => (
                    <div key={field.label} className="grid grid-cols-[92px_1fr] gap-3 text-sm">
                      <span className="font-black text-[#747b8a]">{field.label}</span>
                      <span className="min-w-0 break-words font-bold text-[#1f2430]">{field.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="overflow-hidden rounded-md border border-[#dfe4ef]">
              <div className="flex items-center justify-between gap-3 border-b border-[#dfe4ef] bg-[#fbfcff] px-4 py-3">
                <div>
                  <h2 className="text-[15px] font-black text-[#1f2430]">Dimensions</h2>
                  <p className="mt-1 text-[12px] font-semibold text-[#747b8a]">
                    {extracting ? 'Reading...' : `${dimensionRows.length} takeoff item${dimensionRows.length === 1 ? '' : 's'}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addDimensionRow}
                  className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[#273f7a] transition hover:bg-[#edf2fb]"
                >
                  Add Row
                </button>
              </div>

              {dimensionRows.length > 0 ? (
                <div className="divide-y divide-[#edf0f6]">
                  <div className="grid grid-cols-[minmax(140px,1fr)_minmax(120px,0.65fr)_minmax(140px,0.9fr)_44px] gap-2 bg-white px-3 py-2 text-[11px] font-black uppercase text-[#747b8a]">
                    <span>Item</span>
                    <span>Measurement</span>
                    <span>Value</span>
                    <span />
                  </div>
                  {dimensionRows.map((row, index) => (
                    <div key={row.id} className="space-y-2 px-3 py-3">
                      <div className="grid grid-cols-[minmax(140px,1fr)_minmax(120px,0.65fr)_minmax(140px,0.9fr)_44px] gap-2">
                        <div className="flex min-h-10 min-w-0 items-center rounded-md border border-transparent bg-[#f7f9fc] px-3 text-sm font-black text-[#1f2430]">
                          <span className="min-w-0 break-words leading-snug">{row.label}</span>
                        </div>

                        <label className="sr-only" htmlFor={`dimension-measurement-${row.id}`}>
                          Measurement unit for dimension {index + 1}
                        </label>
                        <input
                          id={`dimension-measurement-${row.id}`}
                          type="text"
                          value={row.measurement}
                          onChange={(event) => updateDimensionRow(row.id, { measurement: event.currentTarget.value })}
                          placeholder="in."
                          className="h-10 min-w-0 rounded-md border border-[#cfd6e5] bg-white px-3 text-sm font-bold text-[#4d5360] outline-none focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                        />

                      <label className="sr-only" htmlFor={`dimension-value-${row.id}`}>
                        Value for dimension {index + 1}
                      </label>
                      <input
                        id={`dimension-value-${row.id}`}
                        type="text"
                        value={row.dimension}
                        onChange={(event) => updateDimensionRow(row.id, { dimension: event.currentTarget.value })}
                        className="h-10 min-w-0 rounded-md border border-[#cfd6e5] bg-white px-3 text-sm font-black text-[#1f2430] outline-none focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                      />

                      <button
                        type="button"
                        onClick={() => deleteDimensionRow(row.id)}
                        className="h-10 rounded-md border border-[#e2c8c0] bg-[#fff6f3] text-[16px] font-black text-[#a2472f] transition hover:bg-[#ffece6]"
                        aria-label={`Delete dimension ${index + 1}`}
                        title="Delete row"
                      >
                        x
                      </button>
                      </div>

                      <p className="rounded-md bg-[#fbfcff] px-3 py-2 text-[13px] font-semibold leading-5 text-[#5b606b]">
                        {row.notes}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-12 text-center text-sm font-semibold text-[#747b8a]">
                  {extracting ? 'Reading the PDF...' : 'Add a takeoff item to start.'}
                </div>
              )}
            </section>
          </div>
        </aside>
      </main>
    </div>
  )
}
