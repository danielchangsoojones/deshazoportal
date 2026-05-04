import { useEffect, useMemo, useRef, useState } from 'react'

type ReportData = Record<string, string>

type RepairLineItem = {
  id: string
  description: string
  quantity: string
  rate: string
}

type RepairSection = {
  id: string
  title: string
  status: string
  lineItems: RepairLineItem[]
}

const storageKey = 'deshazo-editable-inspection-report'
const repairStorageKey = 'deshazo-editable-inspection-report-repairs'

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
  sectionHeader: 'Repair Items',
  notesHeader: 'Notes',
  notes:
    'Click into any text on this report and type to edit. Use the print button to save as PDF from the browser print dialog.',
}

const defaultRepairSections: RepairSection[] = [
  {
    id: 'under-running-bridge-wheels',
    title: 'Under Running Bridge: Wheels',
    status: 'Repair',
    lineItems: [
      { id: 'wheel-line-1', description: 'Inspect wheel tread wear and flange condition.', quantity: '1', rate: '185.00' },
      { id: 'wheel-line-2', description: 'Confirm wheel bearings rotate freely under load.', quantity: '1', rate: '145.00' },
    ],
  },
  {
    id: 'under-running-bridge-conductors',
    title: 'Under Running Bridge: Conductors/Festoon System',
    status: 'Repair',
    lineItems: [
      { id: 'festoon-line-1', description: 'Replace damaged festoon cable carrier hardware.', quantity: '2', rate: '95.00' },
      { id: 'festoon-line-2', description: 'Verify conductor alignment through full bridge travel.', quantity: '1', rate: '125.00' },
    ],
  },
  {
    id: 'hoist-1-festoons',
    title: 'Hoist 1: Festoons',
    status: 'Repair',
    lineItems: [
      { id: 'hoist-line-1', description: 'Repair loose festoon trolley and check cable strain relief.', quantity: '1', rate: '210.00' },
    ],
  },
]

const cells = [
  ['purchaseOrder', 'jobNumber', 'location', 'customerAddress'],
  ['manufacturerLabel', 'serialLabel', 'capacityLabel', 'modelLabel'],
  ['manufacturerCrane', 'serialCrane', 'capacityCrane', 'modelCrane'],
  ['manufacturerHoist', 'serialHoist', 'capacityHoist', 'modelHoist'],
]

const parseMoney = (value: string) => {
  const numericValue = Number(value.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(numericValue) ? numericValue : 0
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)

const getLineAmount = (lineItem: RepairLineItem) =>
  parseMoney(lineItem.quantity) * parseMoney(lineItem.rate)

const normalizeRepairSections = (sections: RepairSection[]) =>
  sections.map((section) => ({
    ...section,
    lineItems: section.lineItems.map((lineItem) => {
      const savedLineItem = lineItem as RepairLineItem & { text?: string }

      return {
        id: savedLineItem.id,
        description: savedLineItem.description ?? savedLineItem.text ?? 'Add repair detail here.',
        quantity: savedLineItem.quantity ?? '1',
        rate: savedLineItem.rate ?? '0.00',
      }
    }),
  }))

type EditableTextProps = {
  id: string
  data: ReportData
  className?: string
  multiline?: boolean
  onChange: (id: string, value: string) => void
}

function EditableText({ id, data, className = '', multiline = false, onChange }: EditableTextProps) {
  return (
    <EditableValue
      label={id}
      value={data[id] ?? ''}
      className={className}
      multiline={multiline}
      onChange={(value) => onChange(id, value)}
    />
  )
}

type EditableValueProps = {
  label: string
  value: string
  className?: string
  multiline?: boolean
  onChange: (value: string) => void
}

function EditableValue({ label, value, className = '', multiline = false, onChange }: EditableValueProps) {
  const elementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (elementRef.current && elementRef.current.innerText !== value) {
      elementRef.current.innerText = value
    }
  }, [value])

  return (
    <div
      ref={elementRef}
      role="textbox"
      aria-label={label}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      className={`editable-report-field ${multiline ? 'min-h-[96px]' : ''} ${className}`}
      onBlur={(event) => onChange(event.currentTarget.innerText)}
      onPaste={(event) => {
        event.preventDefault()
        const text = event.clipboardData.getData('text/plain')
        document.execCommand('insertText', false, text)
      }}
    >
      {value}
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
  const [repairSections, setRepairSections] = useState<RepairSection[]>(() => {
    const savedSections = window.localStorage.getItem(repairStorageKey)

    if (!savedSections) return defaultRepairSections

    try {
      return normalizeRepairSections(JSON.parse(savedSections) as RepairSection[])
    } catch {
      return defaultRepairSections
    }
  })

  const repairTotal = useMemo(
    () =>
      repairSections.reduce(
        (total, section) =>
          total + section.lineItems.reduce((sectionTotal, lineItem) => sectionTotal + getLineAmount(lineItem), 0),
        0,
      ),
    [repairSections],
  )

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

  const saveRepairSections = (nextSections: RepairSection[]) => {
    window.localStorage.setItem(repairStorageKey, JSON.stringify(nextSections))
    return nextSections
  }

  const createId = (prefix: string) => {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`
    return `${prefix}-${Date.now()}-${Math.round(Math.random() * 100000)}`
  }

  const addRepairSection = () => {
    setRepairSections((currentSections) =>
      saveRepairSections([
        ...currentSections,
        {
          id: createId('repair'),
          title: 'New Repair Item',
          status: 'Repair',
          lineItems: [{ id: createId('line'), description: 'Add repair detail here.', quantity: '1', rate: '0.00' }],
        },
      ]),
    )
  }

  const updateRepairSection = (sectionId: string, field: 'title' | 'status', value: string) => {
    setRepairSections((currentSections) =>
      saveRepairSections(
        currentSections.map((section) =>
          section.id === sectionId ? { ...section, [field]: value } : section,
        ),
      ),
    )
  }

  const removeRepairSection = (sectionId: string) => {
    setRepairSections((currentSections) =>
      saveRepairSections(currentSections.filter((section) => section.id !== sectionId)),
    )
  }

  const addRepairLineItem = (sectionId: string) => {
    setRepairSections((currentSections) =>
      saveRepairSections(
        currentSections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                lineItems: [
                  ...section.lineItems,
                  { id: createId('line'), description: 'Add repair detail here.', quantity: '1', rate: '0.00' },
                ],
              }
            : section,
        ),
      ),
    )
  }

  const updateRepairLineItem = (
    sectionId: string,
    lineItemId: string,
    field: 'description' | 'quantity' | 'rate',
    value: string,
  ) => {
    setRepairSections((currentSections) =>
      saveRepairSections(
        currentSections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                lineItems: section.lineItems.map((lineItem) =>
                  lineItem.id === lineItemId ? { ...lineItem, [field]: value } : lineItem,
                ),
              }
            : section,
        ),
      ),
    )
  }

  const removeRepairLineItem = (sectionId: string, lineItemId: string) => {
    setRepairSections((currentSections) =>
      saveRepairSections(
        currentSections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                lineItems: section.lineItems.filter((lineItem) => lineItem.id !== lineItemId),
              }
            : section,
        ),
      ),
    )
  }

  const resetTemplate = () => {
    window.localStorage.removeItem(storageKey)
    window.localStorage.removeItem(repairStorageKey)
    setReport(defaultReport)
    setRepairSections(defaultRepairSections)
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

            .report-inline-action {
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

            .repair-section {
              break-inside: avoid;
              page-break-inside: avoid;
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
              <div className="flex items-center justify-between gap-3 bg-[#f2f2f2]">
                <EditableText
                  id="sectionHeader"
                  data={report}
                  onChange={updateField}
                  className="flex-1 px-3 py-2 text-[17px] font-black uppercase"
                />
                <button
                  type="button"
                  onClick={addRepairSection}
                  className="report-inline-action mr-2 rounded-md border border-[#bdc4d3] bg-white px-3 py-1.5 text-[12px] font-black uppercase text-[#273f7a] transition hover:bg-[#edf2fb]"
                >
                  Add Repair Item
                </button>
              </div>

              <div className="border-t border-[#d4d4d4]">
                {repairSections.map((section, sectionIndex) => (
                  <section
                    key={section.id}
                    className={`repair-section bg-[#f4e3e3] ${
                      sectionIndex > 0 ? 'border-t border-[#e1caca]' : ''
                    }`}
                  >
                    <div className="grid grid-cols-[1fr_220px] gap-5 border-b border-[#e0caca] px-4 py-3">
                      <EditableValue
                        label={`${section.title} title`}
                        value={section.title}
                        onChange={(value) => updateRepairSection(section.id, 'title', value)}
                        className="text-[20px] font-black leading-[1.05]"
                        multiline
                      />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 bg-[#efc9c9] px-3 py-1.5 text-[#7d1515]">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#af0f0f] text-[13px] font-black text-white">
                            !
                          </span>
                          <EditableValue
                            label={`${section.title} status`}
                            value={section.status}
                            onChange={(value) => updateRepairSection(section.id, 'status', value)}
                            className="min-w-0 flex-1 text-[17px] font-black"
                          />
                          <span
                            aria-hidden="true"
                            className="relative h-5 w-6 shrink-0 rounded-sm bg-[#b70e0e] before:absolute before:left-1/2 before:top-[6px] before:h-2.5 before:w-2.5 before:-translate-x-1/2 before:rounded-full before:border-2 before:border-white after:absolute after:left-[5px] after:top-[-3px] after:h-1.5 after:w-4 after:rounded-t-sm after:bg-[#b70e0e]"
                          />
                        </div>
                        {repairSections.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeRepairSection(section.id)}
                            className="report-inline-action w-full rounded-md border border-[#d4a7a7] bg-white/70 px-2 py-1 text-[11px] font-black uppercase text-[#7d1515] transition hover:bg-white"
                          >
                            Remove Section
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="bg-white">
                      <div className="grid grid-cols-[44px_1fr_88px_112px_124px_36px] border-b border-[#d8d8d8] bg-[#f7f7f7] text-[11px] font-black uppercase text-[#555b66]">
                        <div className="px-2 py-2 text-center">#</div>
                        <div className="border-l border-[#d8d8d8] px-3 py-2">Description</div>
                        <div className="border-l border-[#d8d8d8] px-3 py-2 text-right">Qty</div>
                        <div className="border-l border-[#d8d8d8] px-3 py-2 text-right">Rate</div>
                        <div className="border-l border-[#d8d8d8] px-3 py-2 text-right">Amount</div>
                        <div className="report-inline-action border-l border-[#d8d8d8]" />
                      </div>
                      <div>
                        {section.lineItems.map((lineItem, lineIndex) => (
                          <div
                            key={lineItem.id}
                            className="grid grid-cols-[44px_1fr_88px_112px_124px_36px] border-b border-[#e5e5e5] text-[14px] font-semibold"
                          >
                            <div className="px-2 py-2 text-center text-[12px] font-black text-[#7d1515]">{lineIndex + 1}</div>
                            <EditableValue
                              label={`${section.title} line item ${lineIndex + 1}`}
                              value={lineItem.description}
                              onChange={(value) => updateRepairLineItem(section.id, lineItem.id, 'description', value)}
                              className="min-h-[38px] border-l border-[#e5e5e5] px-3 py-2 leading-tight"
                              multiline
                            />
                            <EditableValue
                              label={`${section.title} quantity ${lineIndex + 1}`}
                              value={lineItem.quantity}
                              onChange={(value) => updateRepairLineItem(section.id, lineItem.id, 'quantity', value)}
                              className="min-h-[38px] border-l border-[#e5e5e5] px-3 py-2 text-right"
                            />
                            <EditableValue
                              label={`${section.title} rate ${lineIndex + 1}`}
                              value={lineItem.rate}
                              onChange={(value) => updateRepairLineItem(section.id, lineItem.id, 'rate', value)}
                              className="min-h-[38px] border-l border-[#e5e5e5] px-3 py-2 text-right"
                            />
                            <div className="border-l border-[#e5e5e5] px-3 py-2 text-right font-black">
                              {formatMoney(getLineAmount(lineItem))}
                            </div>
                            {section.lineItems.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => removeRepairLineItem(section.id, lineItem.id)}
                                className="report-inline-action flex min-h-[38px] items-center justify-center border-l border-[#e5e5e5] bg-white text-[13px] font-black text-[#8a1a1a] transition hover:bg-[#f7eeee]"
                                aria-label={`Remove line item ${lineIndex + 1}`}
                              >
                                x
                              </button>
                            ) : (
                              <div className="report-inline-action border-l border-[#e5e5e5]" />
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-[1fr_160px_124px_36px] border-b border-[#d8d8d8] bg-[#fbfbfb] text-[14px] font-black">
                        <div className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => addRepairLineItem(section.id)}
                            className="report-inline-action rounded-md border border-[#bdc4d3] bg-[#f8fafc] px-3 py-1.5 text-[12px] font-black uppercase text-[#273f7a] transition hover:bg-[#edf2fb]"
                          >
                            Add Line Item
                          </button>
                        </div>
                        <div className="border-l border-[#d8d8d8] px-3 py-2 text-right uppercase text-[#555b66]">
                          Section Subtotal
                        </div>
                        <div className="border-l border-[#d8d8d8] px-3 py-2 text-right text-[#111]">
                          {formatMoney(section.lineItems.reduce((total, lineItem) => total + getLineAmount(lineItem), 0))}
                        </div>
                        <div className="report-inline-action border-l border-[#d8d8d8]" />
                      </div>
                    </div>
                  </section>
                ))}
                <div className="grid grid-cols-[1fr_190px_160px] border-t-2 border-[#111] bg-[#f2f2f2] text-[16px] font-black">
                  <div className="px-4 py-4 uppercase text-[#555b66]">Repair Total</div>
                  <div className="border-l border-[#cfcfcf] px-4 py-4 text-right uppercase text-[#555b66]">Total</div>
                  <div className="border-l border-[#cfcfcf] bg-[#f5b400] px-4 py-4 text-right text-[#111]">
                    {formatMoney(repairTotal)}
                  </div>
                </div>
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
