import { useEffect, useMemo, useRef, useState } from 'react'

type ReportData = Record<string, string>

const storageKey = 'deshazo-editable-inspection-report'

const defaultReport: ReportData = {
  logoName: 'DESHAZO',
  logoTagline: 'CRANES / SERVICE / AUTOMATION',
  branch: 'DESHAZO Branch: 018 Dallas',
  phone: 'Branch Contact Phone: ---',
  title: 'INSPECTION REPORT',
  summary: 'D200235 performed by: Calvin Waller',
  type: 'Type: Frequent',
  date: 'Date: Mar 24, 2026',
  structure: 'Structure: Gantry',
  description: 'Description: Portable Gantry',
  customer: 'Customer: Wabash',
  purchaseOrder: 'Purchase Order: S2P1215028',
  jobNumber: 'Job #: 0270357',
  location: 'Location: Building 2',
  customerAddress: 'Customer Address: 500 Commerce Blvd',
  manufacturerLabel: 'Manufacturer:',
  serialLabel: 'Serial Number:',
  capacityLabel: 'Capacity:',
  modelLabel: 'Model #:',
  manufacturerCrane: 'Crane: superior crane corporation',
  serialCrane: 'Crane: 02716',
  capacityCrane: 'Crane: 2 Ton',
  modelCrane: 'Crane: Na',
  manufacturerHoist: 'Hoist 1: Coffing',
  serialHoist: 'Hoist 1: 8PA596L',
  capacityHoist: 'Hoist 1: 1 Ton',
  modelHoist: 'Hoist 1: ELC2016.3',
  sectionHeader: 'Inspection Items',
  itemOne: 'Runway, structure, and bridge components inspected with no visible defects.',
  itemTwo: 'Hoist, trolley, controls, and safety devices checked for proper operation.',
  itemThree: 'Customer representative notified of inspection status and any noted recommendations.',
  notesHeader: 'Notes',
  notes:
    'Click into any text on this report and type to edit. Use the print button to save as PDF from the browser print dialog.',
}

const cells = [
  ['purchaseOrder', 'jobNumber', 'location', 'customerAddress'],
  ['manufacturerLabel', 'serialLabel', 'capacityLabel', 'modelLabel'],
  ['manufacturerCrane', 'serialCrane', 'capacityCrane', 'modelCrane'],
  ['manufacturerHoist', 'serialHoist', 'capacityHoist', 'modelHoist'],
]

type EditableTextProps = {
  id: string
  data: ReportData
  className?: string
  multiline?: boolean
  onChange: (id: string, value: string) => void
}

function EditableText({ id, data, className = '', multiline = false, onChange }: EditableTextProps) {
  const elementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (elementRef.current && elementRef.current.innerText !== data[id]) {
      elementRef.current.innerText = data[id] ?? ''
    }
  }, [data, id])

  return (
    <div
      ref={elementRef}
      role="textbox"
      aria-label={id}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      className={`editable-report-field ${multiline ? 'min-h-[96px]' : ''} ${className}`}
      onBlur={(event) => onChange(id, event.currentTarget.innerText)}
      onPaste={(event) => {
        event.preventDefault()
        const text = event.clipboardData.getData('text/plain')
        document.execCommand('insertText', false, text)
      }}
    >
      {data[id]}
    </div>
  )
}

export default function EditableInspectionReport() {
  const [report, setReport] = useState<ReportData>(() => {
    const savedReport = window.localStorage.getItem(storageKey)

    if (!savedReport) return defaultReport

    try {
      return { ...defaultReport, ...JSON.parse(savedReport) as ReportData }
    } catch {
      return defaultReport
    }
  })

  const updatedAt = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date()),
    [],
  )

  const updateField = (id: string, value: string) => {
    setReport((currentReport) => {
      const nextReport = { ...currentReport, [id]: value }
      window.localStorage.setItem(storageKey, JSON.stringify(nextReport))
      return nextReport
    })
  }

  const resetTemplate = () => {
    window.localStorage.removeItem(storageKey)
    setReport(defaultReport)
  }

  return (
    <div className="min-h-screen bg-[#e8eaef] text-[#111]">
      <style>
        {`
          .editable-report-field {
            min-width: 0;
            border-radius: 2px;
            outline: 1px solid transparent;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
          }

          .editable-report-field:hover {
            background: rgba(255, 184, 0, 0.12);
            outline-color: rgba(245, 175, 0, 0.38);
          }

          .editable-report-field:focus {
            background: #fffdf3;
            outline: 2px solid #f3a900;
            box-shadow: 0 0 0 3px rgba(243, 169, 0, 0.14);
          }

          @media print {
            body {
              background: #fff !important;
            }

            .report-toolbar {
              display: none !important;
            }

            .report-shell {
              padding: 0 !important;
              background: #fff !important;
            }

            .report-page {
              width: 11in !important;
              min-height: 8.5in !important;
              box-shadow: none !important;
              border: 1px solid #111 !important;
            }

            .editable-report-field:hover,
            .editable-report-field:focus {
              background: transparent !important;
              outline: 0 !important;
              box-shadow: none !important;
            }
          }
        `}
      </style>

      <header className="report-toolbar sticky top-0 z-20 border-b border-[#d1d5de] bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.02em] text-[#273f7a]">Editable inspection report</p>
            <p className="text-xs font-semibold text-[#6c7280]">Saved locally after each edit · Last opened {updatedAt}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={resetTemplate}
              className="rounded-md border border-[#c8cedb] bg-white px-4 py-2 text-sm font-bold text-[#273f7a] transition hover:bg-[#f2f5fb]"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md bg-[#273f7a] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1e3162]"
            >
              Print / Save PDF
            </button>
          </div>
        </div>
      </header>

      <main className="report-shell overflow-x-auto px-4 py-8 sm:px-8">
        <article className="report-page mx-auto min-h-[850px] w-[1100px] border border-[#111] bg-white shadow-[0_24px_70px_-40px_rgba(17,24,39,0.62)]">
          <section className="grid grid-cols-[1.25fr_1fr_1fr] items-center bg-[#f5b400] px-9 py-5">
            <div>
              <EditableText id="logoName" data={report} onChange={updateField} className="text-[48px] font-black leading-none tracking-[-0.04em]" />
              <EditableText id="logoTagline" data={report} onChange={updateField} className="mt-1 text-[17px] font-black leading-tight" />
            </div>
            <div className="space-y-3 text-[20px] font-semibold leading-tight">
              <EditableText id="branch" data={report} onChange={updateField} />
              <EditableText id="phone" data={report} onChange={updateField} />
            </div>
            <EditableText id="title" data={report} onChange={updateField} className="text-right text-[28px] font-black leading-tight" />
          </section>

          <section className="px-8 py-7">
            <div className="grid grid-cols-[52px_1.5fr_0.85fr_0.9fr] items-center border-b border-[#bcbcbc]">
              <div className="flex h-[72px] items-center justify-center">
                <div className="relative h-11 w-14 border-t-4 border-[#111]">
                  <span className="absolute left-1 top-[-9px] h-2 w-2 rounded-full bg-[#111]" />
                  <span className="absolute right-1 top-[-9px] h-2 w-2 rounded-full bg-[#111]" />
                  <span className="absolute left-3 top-0 h-9 border-l-4 border-[#111]" />
                  <span className="absolute right-3 top-0 h-9 border-l-4 border-[#111]" />
                  <span className="absolute left-1/2 top-2 h-6 -translate-x-1/2 border-l-2 border-[#111]" />
                </div>
              </div>
              <EditableText id="summary" data={report} onChange={updateField} className="border-r border-[#cfcfcf] px-3 text-[18px] font-bold" />
              <EditableText id="type" data={report} onChange={updateField} className="border-r border-[#cfcfcf] px-3 text-[18px] font-bold" />
              <EditableText id="date" data={report} onChange={updateField} className="px-3 text-[18px] font-bold" />
            </div>

            <div className="grid grid-cols-[1.7fr_0.9fr_0.95fr] border-b border-[#d4d4d4] text-[15px] font-bold">
              <EditableText id="structure" data={report} onChange={updateField} className="px-2 py-2" />
              <EditableText id="description" data={report} onChange={updateField} className="border-l border-[#d4d4d4] px-2 py-2" />
              <EditableText id="customer" data={report} onChange={updateField} className="border-l border-[#d4d4d4] px-2 py-2" />
            </div>

            <div className="grid grid-cols-4 text-[15px] font-semibold">
              {cells.flatMap((row, rowIndex) =>
                row.map((fieldId, columnIndex) => (
                  <EditableText
                    key={fieldId}
                    id={fieldId}
                    data={report}
                    onChange={updateField}
                    className={`min-h-[39px] border-b border-[#dcdcdc] px-2 py-2 ${
                      columnIndex > 0 ? 'border-l border-[#d4d4d4]' : ''
                    } ${rowIndex === 1 ? 'font-bold' : ''}`}
                  />
                )),
              )}
            </div>

            <section className="mt-8 border border-[#d4d4d4]">
              <EditableText
                id="sectionHeader"
                data={report}
                onChange={updateField}
                className="bg-[#f2f2f2] px-3 py-2 text-[17px] font-black uppercase"
              />
              <div className="grid grid-cols-[38px_1fr] text-[15px] font-semibold">
                {['itemOne', 'itemTwo', 'itemThree'].map((fieldId, index) => (
                  <div key={fieldId} className="contents">
                    <div className="border-t border-[#d4d4d4] px-3 py-3 text-center font-black">{index + 1}</div>
                    <EditableText
                      id={fieldId}
                      data={report}
                      onChange={updateField}
                      className="border-l border-t border-[#d4d4d4] px-3 py-3"
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-8 border border-[#d4d4d4]">
              <EditableText
                id="notesHeader"
                data={report}
                onChange={updateField}
                className="bg-[#f2f2f2] px-3 py-2 text-[17px] font-black uppercase"
              />
              <EditableText id="notes" data={report} onChange={updateField} multiline className="px-3 py-3 text-[15px] font-semibold" />
            </section>
          </section>
        </article>
      </main>
    </div>
  )
}
