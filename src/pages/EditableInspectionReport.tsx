import { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

type ReportData = Record<string, string>

type RepairLineItem = {
  id: string
  description: string
  quantity: string
  rate: string
  margin: string
}

type RepairSection = {
  id: string
  title: string
  status: string
  lineItems: RepairLineItem[]
}

type CostSection = {
  id: string
  title: string
  lineItems: RepairLineItem[]
}

type MenuItem = {
  label: string
  description: string
  rate: string
}

type MenuItemSection = {
  title: string
  items: MenuItem[]
}

type PdfLoadSuccess = {
  numPages: number
}

type CanvasTextBox = {
  id: string
  text: string
  x: number
  y: number
}

type QuoteBlockVisibility = {
  repairItems: boolean
  estimateSummary: boolean
  grandTotal: boolean
  notes: boolean
}

const storageKey = 'deshazo-editable-inspection-report'
const repairStorageKey = 'deshazo-editable-inspection-report-repairs'
const costStorageKey = 'deshazo-editable-inspection-report-costs'
const menuStorageKey = 'deshazo-editable-inspection-report-menu-items'
const blockVisibilityStorageKey = 'deshazo-editable-inspection-report-block-visibility'
const textBoxStorageKey = 'deshazo-editable-inspection-report-text-boxes'
const menuCollapsedStorageKey = 'deshazo-editable-inspection-report-menu-collapsed'
const maxRecentlyUsedItems = 2

const defaultBlockVisibility: QuoteBlockVisibility = {
  repairItems: true,
  estimateSummary: true,
  grandTotal: true,
  notes: true,
}

const defaultReport: ReportData = {
  logoName: 'DESHAZO',
  logoTagline: 'CRANES / SERVICE / AUTOMATION',
  branch: 'DESHAZO Branch: 018 Dallas',
  phone: 'Branch Contact Phone: ---',
  title: 'QUOTE PROPOSAL',
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
      { id: 'wheel-line-1', description: 'Inspect wheel tread wear and flange condition.', quantity: '1', rate: '185.00', margin: '0' },
      { id: 'wheel-line-2', description: 'Confirm wheel bearings rotate freely under load.', quantity: '1', rate: '145.00', margin: '0' },
    ],
  },
  {
    id: 'under-running-bridge-conductors',
    title: 'Under Running Bridge: Conductors/Festoon System',
    status: 'Repair',
    lineItems: [
      { id: 'festoon-line-1', description: 'Replace damaged festoon cable carrier hardware.', quantity: '2', rate: '95.00', margin: '0' },
      { id: 'festoon-line-2', description: 'Verify conductor alignment through full bridge travel.', quantity: '1', rate: '125.00', margin: '0' },
    ],
  },
  {
    id: 'hoist-1-festoons',
    title: 'Hoist 1: Festoons',
    status: 'Repair',
    lineItems: [
      { id: 'hoist-line-1', description: 'Repair loose festoon trolley and check cable strain relief.', quantity: '1', rate: '210.00', margin: '0' },
    ],
  },
]

const defaultCostSections: CostSection[] = [
  {
    id: 'parts',
    title: 'Parts',
    lineItems: [{ id: 'parts-line-1', description: 'Parts required for listed repairs.', quantity: '1', rate: '0.00', margin: '0' }],
  },
  {
    id: 'labor',
    title: 'Labor',
    lineItems: [{ id: 'labor-line-1', description: 'Technician labor.', quantity: '1', rate: '0.00', margin: '0' }],
  },
  {
    id: 'equipment-rental',
    title: 'Equipment Rental',
    lineItems: [{ id: 'rental-line-1', description: 'Rental equipment.', quantity: '1', rate: '0.00', margin: '0' }],
  },
  {
    id: 'freight',
    title: 'Freight',
    lineItems: [{ id: 'freight-line-1', description: 'Freight and delivery.', quantity: '1', rate: '0.00', margin: '0' }],
  },
]

const cells = [
  ['purchaseOrder', 'jobNumber', 'location', 'customerAddress'],
  ['manufacturerLabel', 'serialLabel', 'capacityLabel', 'modelLabel'],
  ['manufacturerCrane', 'serialCrane', 'capacityCrane', 'modelCrane'],
  ['manufacturerHoist', 'serialHoist', 'capacityHoist', 'modelHoist'],
]

const defaultMenuItemSections: MenuItemSection[] = [
  {
    title: 'Past history',
    items: [
      { label: 'Previous wheel repair', description: 'Repeat repair from prior wheel inspection history.', rate: '185.00' },
      { label: 'Known festoon issue', description: 'Address recurring festoon wear noted on past reports.', rate: '95.00' },
    ],
  },
  {
    title: 'Customer specific',
    items: [
      { label: 'Labor', description: 'Customer-specific labor rate for Wabash service work.', rate: '145.00' },
      { label: 'Freight', description: 'Customer-specific freight and delivery charge.', rate: '85.00' },
    ],
  },
  {
    title: 'This crane',
    items: [
      { label: 'Wheel inspection', description: 'Inspect wheel tread wear and flange condition.', rate: '185.00' },
      { label: 'Cable alignment', description: 'Verify conductor alignment through full bridge travel.', rate: '125.00' },
      { label: 'Festoon repair', description: 'Replace damaged festoon cable carrier hardware.', rate: '95.00' },
    ],
  },
  {
    title: 'Shared',
    items: [
      { label: 'Technician labor', description: 'Technician labor.', rate: '145.00' },
      { label: 'Lift rental', description: 'Scissor lift rental.', rate: '275.00' },
      { label: 'Freight', description: 'Freight and delivery.', rate: '85.00' },
    ],
  },
]

const getMenuSectionDisplayTitle = (title: string) => {
  if (title === 'Past history') return 'Recently used'
  if (title === 'Customer specific') return 'Customer specific (Wabash)'
  if (title === 'This crane') return 'This crane (D200235)'
  return title
}

const customerSpecificMenuItems: MenuItem[] = [
  { label: 'Labor', description: 'Customer-specific labor rate for Wabash service work.', rate: '145.00' },
  { label: 'Freight', description: 'Customer-specific freight and delivery charge.', rate: '85.00' },
]

const normalizeMenuItemSections = (sections: MenuItemSection[]) =>
  sections.map((section) =>
    section.title === 'Past history'
      ? { ...section, items: section.items.slice(0, maxRecentlyUsedItems) }
      : section.title === 'Customer specific'
        ? { ...section, items: customerSpecificMenuItems }
        : section,
  )

const parseMoney = (value: string) => {
  const numericValue = Number(value.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(numericValue) ? numericValue : 0
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)

const getBaseLineAmount = (lineItem: RepairLineItem) =>
  parseMoney(lineItem.quantity) * parseMoney(lineItem.rate)

const getMarginAmount = (lineItem: RepairLineItem) =>
  getBaseLineAmount(lineItem) * (parseMoney(lineItem.margin) / 100)

const getLineAmount = (lineItem: RepairLineItem) =>
  getBaseLineAmount(lineItem) + getMarginAmount(lineItem)

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
        margin: savedLineItem.margin ?? '0',
      }
    }),
  }))

const normalizeCostSections = (sections: CostSection[]) =>
  sections.map((section) => ({
    ...section,
    lineItems: section.lineItems.map((lineItem) => {
      const savedLineItem = lineItem as RepairLineItem & { text?: string }

      return {
        id: savedLineItem.id,
        description: savedLineItem.description ?? savedLineItem.text ?? 'Add line item here.',
        quantity: savedLineItem.quantity ?? '1',
        rate: savedLineItem.rate ?? '0.00',
        margin: savedLineItem.margin ?? '0',
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
  onDropMenuItem?: (item: MenuItem) => void
}

function EditableValue({ label, value, className = '', onChange, onDropMenuItem }: EditableValueProps) {
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
      className={`editable-report-field ${className}`}
      onBlur={(event) => onChange(event.currentTarget.innerText)}
      onDragOver={(event) => {
        if (onDropMenuItem) event.preventDefault()
      }}
      onDrop={(event) => {
        if (!onDropMenuItem) return
        event.preventDefault()
        const payload = event.dataTransfer.getData('application/deshazo-menu-item')
        if (!payload) return

        try {
          onDropMenuItem(JSON.parse(payload) as MenuItem)
        } catch {
          onDropMenuItem({ label: 'Menu item', description: payload, rate: '0.00' })
        }
      }}
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
  const generatedId = useRef(1000)
  const textBoxDragStart = useRef<Record<string, { clientX: number; clientY: number; x: number; y: number }>>({})
  const [activeLineMenu, setActiveLineMenu] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [textMenuOpen, setTextMenuOpen] = useState(false)
  const [menuCollapsed, setMenuCollapsed] = useState(() => window.localStorage.getItem(menuCollapsedStorageKey) === 'true')
  const [menuSettingsOpen, setMenuSettingsOpen] = useState(false)
  const [relatedDocumentsOpen, setRelatedDocumentsOpen] = useState(false)
  const [originalPdfOpen, setOriginalPdfOpen] = useState(false)
  const [masterServiceAgreementOpen, setMasterServiceAgreementOpen] = useState(false)
  const [originalPdfPages, setOriginalPdfPages] = useState(0)
  const [menuSearch, setMenuSearch] = useState('')
  const [newMenuSection, setNewMenuSection] = useState(defaultMenuItemSections[0]?.title ?? 'Shared')
  const [newMenuLabel, setNewMenuLabel] = useState('')
  const [newMenuDescription, setNewMenuDescription] = useState('')
  const [newMenuRate, setNewMenuRate] = useState('0.00')
  const [report, setReport] = useState<ReportData>(() => {
    const savedReport = window.localStorage.getItem(storageKey)

    if (!savedReport) return defaultReport

    try {
      const parsedReport = { ...defaultReport, ...JSON.parse(savedReport) as ReportData }
      return parsedReport.title === 'INSPECTION REPORT' ? { ...parsedReport, title: defaultReport.title } : parsedReport
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
  const [costSections, setCostSections] = useState<CostSection[]>(() => {
    const savedSections = window.localStorage.getItem(costStorageKey)

    if (!savedSections) return defaultCostSections

    try {
      return normalizeCostSections(JSON.parse(savedSections) as CostSection[])
    } catch {
      return defaultCostSections
    }
  })
  const [menuItemSections, setMenuItemSections] = useState<MenuItemSection[]>(() => {
    const savedSections = window.localStorage.getItem(menuStorageKey)

    if (!savedSections) return normalizeMenuItemSections(defaultMenuItemSections)

    try {
      const parsedSections = JSON.parse(savedSections) as MenuItemSection[]
      return normalizeMenuItemSections(parsedSections.length > 0 ? parsedSections : defaultMenuItemSections)
    } catch {
      return normalizeMenuItemSections(defaultMenuItemSections)
    }
  })
  const [blockVisibility, setBlockVisibility] = useState<QuoteBlockVisibility>(() => {
    const savedVisibility = window.localStorage.getItem(blockVisibilityStorageKey)

    if (!savedVisibility) return defaultBlockVisibility

    try {
      return { ...defaultBlockVisibility, ...JSON.parse(savedVisibility) as Partial<QuoteBlockVisibility> }
    } catch {
      return defaultBlockVisibility
    }
  })
  const [canvasTextBoxes, setCanvasTextBoxes] = useState<CanvasTextBox[]>(() => {
    const savedTextBoxes = window.localStorage.getItem(textBoxStorageKey)

    if (!savedTextBoxes) return []

    try {
      return JSON.parse(savedTextBoxes) as CanvasTextBox[]
    } catch {
      return []
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
  const costTotal = useMemo(
    () =>
      costSections.reduce(
        (total, section) =>
          total + section.lineItems.reduce((sectionTotal, lineItem) => sectionTotal + getLineAmount(lineItem), 0),
        0,
      ),
    [costSections],
  )
  const invoiceTotal = repairTotal + costTotal
  const visibleMenuItemSections = useMemo(() => {
    const searchValue = menuSearch.trim().toLowerCase()
    const cappedSections = normalizeMenuItemSections(menuItemSections)
    if (!searchValue) return cappedSections

    return cappedSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          `${item.label} ${item.description} ${item.rate}`.toLowerCase().includes(searchValue),
        ),
      }))
      .filter((section) => section.items.length > 0)
  }, [menuItemSections, menuSearch])

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

  const saveCostSections = (nextSections: CostSection[]) => {
    window.localStorage.setItem(costStorageKey, JSON.stringify(nextSections))
    return nextSections
  }

  const saveMenuItemSections = (nextSections: MenuItemSection[]) => {
    const normalizedSections = normalizeMenuItemSections(nextSections)
    window.localStorage.setItem(menuStorageKey, JSON.stringify(normalizedSections))
    return normalizedSections
  }

  const saveCanvasTextBoxes = (nextTextBoxes: CanvasTextBox[]) => {
    window.localStorage.setItem(textBoxStorageKey, JSON.stringify(nextTextBoxes))
    return nextTextBoxes
  }

  const deleteQuoteBlock = (block: keyof QuoteBlockVisibility) => {
    setBlockVisibility((currentVisibility) => {
      const nextVisibility = { ...currentVisibility, [block]: false }
      window.localStorage.setItem(blockVisibilityStorageKey, JSON.stringify(nextVisibility))
      return nextVisibility
    })
  }

  const toggleMenuCollapsed = () => {
    setMenuCollapsed((currentCollapsed) => {
      const nextCollapsed = !currentCollapsed
      window.localStorage.setItem(menuCollapsedStorageKey, String(nextCollapsed))
      return nextCollapsed
    })
  }

  const addMenuItemFromSettings = () => {
    const label = newMenuLabel.trim()
    const description = newMenuDescription.trim()
    if (!label || !description) return

    const nextItem: MenuItem = {
      label,
      description,
      rate: parseMoney(newMenuRate).toFixed(2),
    }

    setMenuItemSections((currentSections) =>
      saveMenuItemSections(
        currentSections.map((section) =>
          section.title === newMenuSection ? { ...section, items: [...section.items, nextItem] } : section,
        ),
      ),
    )
    setNewMenuLabel('')
    setNewMenuDescription('')
    setNewMenuRate('0.00')
  }

  const addMenuItemToRecentlyUsed = (item: MenuItem) => {
    setMenuItemSections((currentSections) =>
      saveMenuItemSections(
        currentSections.map((section) => {
          if (section.title !== 'Past history') return section

          const matchingItem = (sectionItem: MenuItem) =>
            sectionItem.label === item.label
            || (sectionItem.description === item.description && sectionItem.rate === item.rate)

          return {
            ...section,
            items: [item, ...section.items.filter((sectionItem) => !matchingItem(sectionItem))].slice(0, maxRecentlyUsedItems),
          }
        }),
      ),
    )
  }

  const createId = (prefix: string) => {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`
    generatedId.current += 1
    return `${prefix}-${generatedId.current}`
  }

  const addCanvasTextBox = () => {
    setCanvasTextBoxes((currentTextBoxes) =>
      saveCanvasTextBoxes([
        ...currentTextBoxes,
        {
          id: createId('text-box'),
          text: 'Add text',
          x: 360,
          y: 255 + currentTextBoxes.length * 22,
        },
      ]),
    )
    setTextMenuOpen(false)
  }

  const updateCanvasTextBox = (textBoxId: string, value: string) => {
    setCanvasTextBoxes((currentTextBoxes) =>
      saveCanvasTextBoxes(
        currentTextBoxes.map((textBox) =>
          textBox.id === textBoxId ? { ...textBox, text: value } : textBox,
        ),
      ),
    )
  }

  const moveCanvasTextBox = (textBoxId: string, x: number, y: number) => {
    setCanvasTextBoxes((currentTextBoxes) =>
      saveCanvasTextBoxes(
        currentTextBoxes.map((textBox) =>
          textBox.id === textBoxId
            ? {
                ...textBox,
                x: Math.max(12, Math.min(960, x)),
                y: Math.max(12, Math.min(790, y)),
              }
            : textBox,
        ),
      ),
    )
  }

  const deleteCanvasTextBox = (textBoxId: string) => {
    setCanvasTextBoxes((currentTextBoxes) =>
      saveCanvasTextBoxes(currentTextBoxes.filter((textBox) => textBox.id !== textBoxId)),
    )
  }

  const addRepairSection = () => {
    setRepairSections((currentSections) =>
      saveRepairSections([
        ...currentSections,
        {
          id: createId('repair'),
          title: 'New Repair Item',
          status: 'Repair',
          lineItems: [{ id: createId('line'), description: 'Add repair detail here.', quantity: '1', rate: '0.00', margin: '0' }],
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
                  { id: createId('line'), description: 'Add repair detail here.', quantity: '1', rate: '0.00', margin: '0' },
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
    field: 'description' | 'quantity' | 'rate' | 'margin',
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

  const addMenuItemToRepairSection = (sectionId: string, item: MenuItem) => {
    addMenuItemToRecentlyUsed(item)
    setRepairSections((currentSections) =>
      saveRepairSections(
        currentSections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                lineItems: [
                  ...section.lineItems,
                  { id: createId('line'), description: item.description, quantity: '1', rate: item.rate, margin: '0' },
                ],
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

  const addCostLineItem = (sectionId: string) => {
    setCostSections((currentSections) =>
      saveCostSections(
        currentSections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                lineItems: [
                  ...section.lineItems,
                  { id: createId('line'), description: 'Add line item here.', quantity: '1', rate: '0.00', margin: '0' },
                ],
              }
            : section,
        ),
      ),
    )
  }

  const updateCostSectionTitle = (sectionId: string, value: string) => {
    setCostSections((currentSections) =>
      saveCostSections(
        currentSections.map((section) => (section.id === sectionId ? { ...section, title: value } : section)),
      ),
    )
  }

  const updateCostLineItem = (
    sectionId: string,
    lineItemId: string,
    field: 'description' | 'quantity' | 'rate' | 'margin',
    value: string,
  ) => {
    setCostSections((currentSections) =>
      saveCostSections(
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

  const addMenuItemToCostSection = (sectionId: string, item: MenuItem) => {
    addMenuItemToRecentlyUsed(item)
    setCostSections((currentSections) =>
      saveCostSections(
        currentSections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                lineItems: [
                  ...section.lineItems,
                  { id: createId('line'), description: item.description, quantity: '1', rate: item.rate, margin: '0' },
                ],
              }
            : section,
        ),
      ),
    )
  }

  const removeCostLineItem = (sectionId: string, lineItemId: string) => {
    setCostSections((currentSections) =>
      saveCostSections(
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
    window.localStorage.removeItem(costStorageKey)
    window.localStorage.removeItem(menuStorageKey)
    window.localStorage.removeItem(blockVisibilityStorageKey)
    window.localStorage.removeItem(textBoxStorageKey)
    window.localStorage.removeItem(menuCollapsedStorageKey)
    setReport(defaultReport)
    setRepairSections(defaultRepairSections)
    setCostSections(defaultCostSections)
    setMenuItemSections(defaultMenuItemSections)
    setBlockVisibility(defaultBlockVisibility)
    setCanvasTextBoxes([])
    setMenuCollapsed(false)
    setUnlocked(false)
    setTextMenuOpen(false)
    setRelatedDocumentsOpen(false)
    setMenuSettingsOpen(false)
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

      <header className="report-toolbar sticky top-0 z-30 flex h-14 items-center justify-between bg-[linear-gradient(90deg,#3cb9c5_0%,#7a35e8_100%)] px-4 text-white shadow-sm">
        <div className="flex items-center gap-5">
          <button type="button" className="text-[22px] font-black leading-none" aria-label="Home">
            ⌂
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setTextMenuOpen((currentOpen) => !currentOpen)}
              className="rounded-md px-2 py-1 text-sm font-black transition hover:bg-white/15"
              aria-expanded={textMenuOpen}
            >
              Text
            </button>
            {textMenuOpen ? (
              <div className="absolute left-0 top-[calc(100%+14px)] z-50 w-[360px] rounded-[22px] border border-[#dfe4ef] bg-white p-4 text-[#111] shadow-[0_24px_70px_-34px_rgba(15,23,42,0.55)]">
                <label className="relative block">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[28px] leading-none text-[#111]">
                    ⌕
                  </span>
                  <input
                    placeholder="Search fonts and combinations"
                    className="w-full rounded-[18px] border-2 border-[#eadcff] bg-white py-4 pl-14 pr-4 text-[18px] font-semibold text-[#1f2430] outline-none placeholder:text-[#7b808b]"
                  />
                </label>
                <button
                  type="button"
                  onClick={addCanvasTextBox}
                  className="mt-4 flex w-full items-center justify-center gap-4 rounded-xl bg-[#8b3dff] px-4 py-4 text-[18px] font-black text-white transition hover:bg-[#7830e8]"
                >
                  <span className="text-[31px] leading-none">T</span>
                  <span>Add a text box</span>
                </button>
              </div>
            ) : null}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setRelatedDocumentsOpen((currentOpen) => !currentOpen)}
              className="rounded-md px-2 py-1 text-sm font-black transition hover:bg-white/15"
              aria-expanded={relatedDocumentsOpen}
            >
              Related Documents
            </button>
            {relatedDocumentsOpen ? (
              <div className="absolute left-0 top-[calc(100%+14px)] z-50 w-[300px] rounded-md border border-[#dfe4ef] bg-white p-2 text-[#111] shadow-[0_24px_70px_-34px_rgba(15,23,42,0.55)]">
                <button
                  type="button"
                  onClick={() => {
                    setOriginalPdfOpen(true)
                    setRelatedDocumentsOpen(false)
                  }}
                  className="w-full rounded-md px-3 py-3 text-left transition hover:bg-[#f4f6fb]"
                >
                  <span className="block text-[14px] font-black text-[#1f2430]">Original Inspection</span>
                  <span className="mt-0.5 block text-[12px] font-semibold text-[#747b8a]">View the source inspection PDF.</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMasterServiceAgreementOpen(true)
                    setRelatedDocumentsOpen(false)
                  }}
                  className="mt-1 w-full rounded-md px-3 py-3 text-left transition hover:bg-[#f4f6fb]"
                >
                  <span className="block text-[14px] font-black text-[#1f2430]">Master Service Agreement</span>
                  <span className="mt-0.5 block text-[12px] font-semibold text-[#747b8a]">Open example labor and service pricing.</span>
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setUnlocked((currentUnlocked) => !currentUnlocked)}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-black transition ${
              unlocked
                ? 'border-white bg-white text-[#35245f]'
                : 'border-white/25 bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <span className="text-base">{unlocked ? '🔓' : '🔒'}</span>
            <span>{unlocked ? 'Unlocked' : 'Locked'}</span>
          </button>
        </div>

        <div className="text-sm font-black tracking-wide">DESHAZO Quote Builder</div>

        <div className="flex items-center gap-2">
          <div className="hidden rounded-md border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold md:block">
            Saved {updatedAt}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={resetTemplate}
              className="rounded-md border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md bg-white px-4 py-2 text-sm font-black text-[#35245f] transition hover:bg-[#f3efff]"
            >
              Print PDF
            </button>
          </div>
        </div>
      </header>

      <div className="editor-workspace report-shell flex h-[calc(100vh-56px)] overflow-hidden bg-[#f3f4f8]">
        <aside className={`report-toolbar relative flex shrink-0 flex-col border-r border-[#d9dce5] bg-[#fbfcff] shadow-sm transition-[width] duration-200 ${menuCollapsed ? 'w-[42px]' : 'w-[260px]'}`}>
          {menuCollapsed ? (
            <button
              type="button"
              onClick={toggleMenuCollapsed}
              className="flex h-full w-full items-center justify-center bg-white text-[#273f7a] transition hover:bg-[#f5f7ff]"
              aria-label="Open menu items"
            >
              <span className="[writing-mode:vertical-rl] rotate-180 text-[12px] font-black uppercase tracking-[0.12em]">
                Menu Items
              </span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleMenuCollapsed}
                className="absolute right-[-15px] top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[#d4dbea] bg-white text-[17px] font-black text-[#273f7a] shadow-sm transition hover:bg-[#f5f7ff]"
                aria-label="Hide menu items"
              >
                ‹
              </button>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
                <div className="mb-4 pr-4">
                  <p className="text-[16px] font-black text-[#1f2430]">Menu Items</p>
                  <p className="mt-1 text-[12px] font-semibold leading-tight text-[#747b8a]">
                    Drag an item into any line-item description.
                  </p>
                </div>

                <label className="mb-4 block">
                  <span className="sr-only">Search menu items</span>
                  <input
                    value={menuSearch}
                    onChange={(event) => setMenuSearch(event.currentTarget.value)}
                    placeholder="Search menu items..."
                    className="w-full rounded-md border border-[#cfd6e5] bg-white px-3 py-2 text-[13px] font-bold text-[#1f2430] outline-none transition placeholder:text-[#9aa2b2] focus:border-[#273f7a]"
                  />
                </label>

                <div className="space-y-4">
                  {visibleMenuItemSections.length > 0 ? visibleMenuItemSections.map((section) => (
                    <section key={section.title}>
                      <h3 className="mb-2 border-b border-[#dfe4ef] pb-1 text-[12px] font-black uppercase tracking-[0.02em] text-[#273f7a]">
                        {getMenuSectionDisplayTitle(section.title)}
                      </h3>
                      <div className="space-y-2">
                        {section.items.map((item) => (
                          <button
                            key={`${section.title}-${item.label}`}
                            type="button"
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData('application/deshazo-menu-item', JSON.stringify(item))
                              event.dataTransfer.setData('text/plain', item.description)
                              event.dataTransfer.effectAllowed = 'copy'
                            }}
                            className="w-full rounded-md border border-[#dde3ef] bg-white px-3 py-2 text-left shadow-[0_8px_20px_-18px_rgba(31,36,48,0.45)] transition hover:border-[#9bb0dc] hover:bg-[#f5f7ff]"
                          >
                            <span className="block text-[13px] font-black text-[#273f7a]">{item.label}</span>
                            <span className="mt-1 block text-[12px] font-semibold leading-tight text-[#4d5360]">{item.description}</span>
                            <span className="mt-2 block text-[12px] font-black text-[#111]">{formatMoney(parseMoney(item.rate))}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )) : (
                    <div className="rounded-md border border-dashed border-[#cfd6e5] bg-white px-3 py-5 text-center text-[12px] font-bold text-[#747b8a]">
                      No menu items found.
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-[#d9dce5] bg-white p-4">
                <button
                  type="button"
                  onClick={() => setMenuSettingsOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-[#273f7a] px-3 py-2.5 text-[13px] font-black text-white transition hover:bg-[#1f3262]"
                >
                  <span className="text-[16px]">⚙</span>
                  <span>Menu Settings</span>
                </button>
              </div>
            </>
          )}
        </aside>

        <main className="canvas-stage min-w-0 flex-1 overflow-auto px-8 py-7">
          <div className="mx-auto w-fit">
            <div className="report-toolbar mb-3 flex items-center justify-between text-[#5b606b]">
              <div className="text-[16px] font-black text-[#1e222b]">
                Page 1 <span className="font-bold text-[#7b808b]">- Quote proposal</span>
              </div>
              <div className="flex items-center gap-4 text-[18px]">
                <button type="button" aria-label="Move page up">⌃</button>
                <button type="button" aria-label="Move page down">⌄</button>
                <button type="button" aria-label="Hide page">◉</button>
                <button type="button" aria-label="Lock page">▣</button>
                <button type="button" aria-label="Duplicate page">▣</button>
                <button type="button" aria-label="Delete page">⌫</button>
              </div>
            </div>

            <article className="report-page relative min-h-[850px] w-[1100px] border border-[#111] bg-white shadow-[0_24px_70px_-40px_rgba(17,24,39,0.62)]">
          <section className="grid grid-cols-[1.2fr_1fr_0.95fr] items-center bg-[#f5b400] px-6 py-2">
            <div>
              <EditableText id="logoName" data={report} onChange={updateField} className="text-[30px] font-black leading-none tracking-[-0.04em]" />
              <EditableText id="logoTagline" data={report} onChange={updateField} className="text-[10px] font-black leading-tight" />
            </div>
            <div className="space-y-0.5 text-[12px] font-semibold leading-tight">
              <EditableText id="branch" data={report} onChange={updateField} />
              <EditableText id="phone" data={report} onChange={updateField} />
            </div>
            <EditableText id="title" data={report} onChange={updateField} className="text-right text-[18px] font-black leading-tight" />
          </section>

          <section className="px-6 py-3">
            <div className="grid grid-cols-[34px_1.5fr_0.85fr_0.9fr] items-center border-b border-[#bcbcbc]">
              <div className="flex h-[34px] items-center justify-center">
                <div className="relative h-6 w-8 border-t-2 border-[#111]">
                  <span className="absolute left-0.5 top-[-5px] h-1.5 w-1.5 rounded-full bg-[#111]" />
                  <span className="absolute right-0.5 top-[-5px] h-1.5 w-1.5 rounded-full bg-[#111]" />
                  <span className="absolute left-2 top-0 h-5 border-l-2 border-[#111]" />
                  <span className="absolute right-2 top-0 h-5 border-l-2 border-[#111]" />
                  <span className="absolute left-1/2 top-1 h-4 -translate-x-1/2 border-l border-[#111]" />
                </div>
              </div>
              <EditableText id="summary" data={report} onChange={updateField} className="border-r border-[#cfcfcf] px-2 text-[12px] font-bold leading-tight" />
              <EditableText id="type" data={report} onChange={updateField} className="border-r border-[#cfcfcf] px-2 text-[12px] font-bold leading-tight" />
              <EditableText id="date" data={report} onChange={updateField} className="px-2 text-[12px] font-bold leading-tight" />
            </div>

            <div className="grid grid-cols-[1.7fr_0.9fr_0.95fr] border-b border-[#d4d4d4] text-[11px] font-bold leading-tight">
              <EditableText id="structure" data={report} onChange={updateField} className="px-2 py-0.5" />
              <EditableText id="description" data={report} onChange={updateField} className="border-l border-[#d4d4d4] px-2 py-0.5" />
              <EditableText id="customer" data={report} onChange={updateField} className="border-l border-[#d4d4d4] px-2 py-0.5" />
            </div>

            <div className="grid grid-cols-4 text-[11px] font-semibold leading-tight">
              {cells.flatMap((row, rowIndex) =>
                row.map((fieldId, columnIndex) => (
                  <EditableText
                    key={fieldId}
                    id={fieldId}
                    data={report}
                    onChange={updateField}
                    className={`min-h-[21px] border-b border-[#dcdcdc] px-2 py-0.5 ${
                      columnIndex > 0 ? 'border-l border-[#d4d4d4]' : ''
                    } ${rowIndex === 1 ? 'font-bold' : ''}`}
                  />
                )),
              )}
            </div>

            {blockVisibility.repairItems ? (
            <section className={`relative mt-3 border border-[#d4d4d4] ${unlocked ? 'ring-2 ring-red-500/45' : ''}`}>
              {unlocked ? (
                <button
                  type="button"
                  onClick={() => deleteQuoteBlock('repairItems')}
                  className="report-toolbar absolute right-[-14px] top-[-14px] z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-red-600 bg-white text-[15px] font-black text-red-700 shadow-sm transition hover:bg-red-50"
                  aria-label="Delete repair items block"
                >
                  🗑
                </button>
              ) : null}
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
                    <div className="grid grid-cols-[1fr_150px] gap-3 border-b border-[#e0caca] px-2.5 py-1">
                      <EditableValue
                        label={`${section.title} title`}
                        value={section.title}
                        onChange={(value) => updateRepairSection(section.id, 'title', value)}
                        className="text-[13px] font-black leading-tight"
                        multiline
                      />
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between gap-1.5 bg-[#efc9c9] px-1.5 py-0.5 text-[#7d1515]">
                          <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#af0f0f] text-[9px] font-black text-white">
                            !
                          </span>
                          <EditableValue
                            label={`${section.title} status`}
                            value={section.status}
                            onChange={(value) => updateRepairSection(section.id, 'status', value)}
                            className="min-w-0 flex-1 text-[11px] font-black leading-tight"
                          />
                        </div>
                        {repairSections.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeRepairSection(section.id)}
                            className="report-inline-action w-full rounded-sm border border-[#d4a7a7] bg-white/70 px-1.5 py-0.5 text-[8px] font-black uppercase leading-tight text-[#7d1515] transition hover:bg-white"
                          >
                            Remove Section
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="bg-white">
                      <div className="grid grid-cols-[34px_1fr_70px_96px_112px_38px] border-b border-[#d8d8d8] bg-[#f7f7f7] text-[10px] font-black uppercase text-[#555b66]">
                        <div className="px-2 py-1 text-center">#</div>
                        <div className="border-l border-[#d8d8d8] px-2 py-1">Description</div>
                        <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Qty</div>
                        <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Rate</div>
                        <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Amount</div>
                        <div className="report-inline-action border-l border-[#d8d8d8]" />
                      </div>
                      <div>
                        {section.lineItems.map((lineItem, lineIndex) => (
                          <div
                            key={lineItem.id}
                            className="relative grid grid-cols-[34px_1fr_70px_96px_112px_38px] border-b border-[#e5e5e5] text-[12px] font-semibold"
                          >
                            {parseMoney(lineItem.margin) > 0 ? (
                              <span className="absolute right-[-106px] top-1 z-10 inline-flex items-center gap-1.5 rounded-r-md border border-l-0 border-[#42a65a] bg-[#e9f8ed] px-2 py-1 text-[10px] font-black leading-none text-[#17652b] shadow-sm">
                                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1f9d45] text-[12px] leading-none text-white">
                                  +
                                </span>
                                <span>{Math.round(parseMoney(lineItem.margin))}% margin</span>
                              </span>
                            ) : null}
                            <div className="px-2 py-1.5 text-center text-[11px] font-black text-[#7d1515]">{lineIndex + 1}</div>
                            <div className="flex min-h-[25px] items-start gap-2 border-l border-[#e5e5e5] px-2 py-1.5">
                              <EditableValue
                                label={`${section.title} line item ${lineIndex + 1}`}
                                value={lineItem.description}
                                onChange={(value) => updateRepairLineItem(section.id, lineItem.id, 'description', value)}
                                onDropMenuItem={(item) => addMenuItemToRepairSection(section.id, item)}
                                className="min-w-0 flex-1 leading-tight"
                                multiline
                              />
                            </div>
                            <EditableValue
                              label={`${section.title} quantity ${lineIndex + 1}`}
                              value={lineItem.quantity}
                              onChange={(value) => updateRepairLineItem(section.id, lineItem.id, 'quantity', value)}
                              className="min-h-[25px] border-l border-[#e5e5e5] px-2 py-1.5 text-right"
                            />
                            <EditableValue
                              label={`${section.title} rate ${lineIndex + 1}`}
                              value={lineItem.rate}
                              onChange={(value) => updateRepairLineItem(section.id, lineItem.id, 'rate', value)}
                              className="min-h-[25px] border-l border-[#e5e5e5] px-2 py-1.5 text-right"
                            />
                            <div className="border-l border-[#e5e5e5] px-2 py-1.5 text-right font-black">
                              {formatMoney(getLineAmount(lineItem))}
                            </div>
                            <div className="report-inline-action relative border-l border-[#e5e5e5]">
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveLineMenu((currentMenu) =>
                                    currentMenu === `repair-${section.id}-${lineItem.id}`
                                      ? ''
                                      : `repair-${section.id}-${lineItem.id}`,
                                  )
                                }
                                className="flex min-h-[25px] w-full items-center justify-center bg-white text-[19px] font-black leading-none text-[#4d5360] transition hover:bg-[#f4f6fb]"
                                aria-label={`Open settings for line item ${lineIndex + 1}`}
                              >
                                ⚙
                              </button>
                              {activeLineMenu === `repair-${section.id}-${lineItem.id}` ? (
                                <div className="absolute right-0 top-[calc(100%+4px)] z-20 w-[230px] rounded-md border border-[#cfd6e5] bg-white p-3 text-left shadow-[0_18px_44px_-28px_rgba(15,23,42,0.55)]">
                                  <div className="mb-2 flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-black uppercase text-[#555b66]">Line settings</span>
                                    <button
                                      type="button"
                                      onClick={() => setActiveLineMenu('')}
                                      className="flex h-6 w-6 items-center justify-center rounded-md border border-[#d8deea] bg-white text-[13px] font-black text-[#4d5360] transition hover:bg-[#f4f6fb]"
                                      aria-label="Close line settings"
                                    >
                                      x
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      removeRepairLineItem(section.id, lineItem.id)
                                      setActiveLineMenu('')
                                    }}
                                    className="mb-3 w-full rounded-md border border-[#e1c6c6] bg-[#fff7f7] px-3 py-2 text-left text-[12px] font-black text-[#8a1a1a] transition hover:bg-[#fcecec]"
                                  >
                                    Delete item
                                  </button>
                                  <label className="block text-[11px] font-black uppercase text-[#555b66]">
                                    Add margin: {Math.round(parseMoney(lineItem.margin))}%
                                  </label>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={parseMoney(lineItem.margin)}
                                    onChange={(event) =>
                                      updateRepairLineItem(section.id, lineItem.id, 'margin', event.currentTarget.value)
                                    }
                                    className="mt-2 w-full accent-[#273f7a]"
                                  />
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-bold text-[#4d5360]">
                                    <span>Base</span>
                                    <span className="text-right">{formatMoney(getBaseLineAmount(lineItem))}</span>
                                    <span>Increase</span>
                                    <span className="text-right text-[#7d1515]">{formatMoney(getMarginAmount(lineItem))}</span>
                                    <span className="font-black text-[#111]">New price</span>
                                    <span className="text-right font-black text-[#111]">{formatMoney(getLineAmount(lineItem))}</span>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-[1fr_150px_112px_30px] border-b border-[#d8d8d8] bg-[#fbfbfb] text-[12px] font-black">
                        <div className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => addRepairLineItem(section.id)}
                            className="report-inline-action rounded-md border border-[#bdc4d3] bg-[#f8fafc] px-2 py-1 text-[10px] font-black uppercase text-[#273f7a] transition hover:bg-[#edf2fb]"
                          >
                            Add Line Item
                          </button>
                        </div>
                        <div className="border-l border-[#d8d8d8] px-2 py-1.5 text-right uppercase text-[#555b66]">
                          Section Subtotal
                        </div>
                        <div className="border-l border-[#d8d8d8] px-2 py-1.5 text-right text-[#111]">
                          {formatMoney(section.lineItems.reduce((total, lineItem) => total + getLineAmount(lineItem), 0))}
                        </div>
                        <div className="report-inline-action border-l border-[#d8d8d8]" />
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </section>
            ) : null}

            {blockVisibility.estimateSummary ? (
            <section className={`relative mt-5 border border-[#d4d4d4] ${unlocked ? 'ring-2 ring-red-500/45' : ''}`}>
              {unlocked ? (
                <button
                  type="button"
                  onClick={() => deleteQuoteBlock('estimateSummary')}
                  className="report-toolbar absolute right-[-14px] top-[-14px] z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-red-600 bg-white text-[15px] font-black text-red-700 shadow-sm transition hover:bg-red-50"
                  aria-label="Delete estimate summary block"
                >
                  🗑
                </button>
              ) : null}
              <div className="bg-[#f2f2f2] px-3 py-2 text-[17px] font-black uppercase">Estimate Summary</div>

              <div className="border-t border-[#d4d4d4]">
                {costSections.map((section, sectionIndex) => (
                  <section
                    key={section.id}
                    className={`repair-section bg-white ${sectionIndex > 0 ? 'border-t border-[#d4d4d4]' : ''}`}
                  >
                    <div className="border-b border-[#d8d8d8] bg-[#f7f7f7] px-3 py-1.5">
                      <EditableValue
                        label={`${section.title} section title`}
                        value={section.title}
                        onChange={(value) => updateCostSectionTitle(section.id, value)}
                        className="text-[14px] font-black uppercase leading-tight text-[#273f7a]"
                      />
                    </div>

                    <div className="grid grid-cols-[34px_1fr_70px_96px_112px_38px] border-b border-[#d8d8d8] bg-[#fbfbfb] text-[10px] font-black uppercase text-[#555b66]">
                      <div className="px-2 py-1 text-center">#</div>
                      <div className="border-l border-[#d8d8d8] px-2 py-1">Description</div>
                      <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Qty</div>
                      <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Rate</div>
                      <div className="border-l border-[#d8d8d8] px-2 py-1 text-right">Amount</div>
                      <div className="report-inline-action border-l border-[#d8d8d8]" />
                    </div>

                    {section.lineItems.map((lineItem, lineIndex) => (
                      <div
                        key={lineItem.id}
                        className="relative grid grid-cols-[34px_1fr_70px_96px_112px_38px] border-b border-[#e5e5e5] text-[12px] font-semibold"
                      >
                        {parseMoney(lineItem.margin) > 0 ? (
                          <span className="absolute right-[-106px] top-1 z-10 inline-flex items-center gap-1.5 rounded-r-md border border-l-0 border-[#42a65a] bg-[#e9f8ed] px-2 py-1 text-[10px] font-black leading-none text-[#17652b] shadow-sm">
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1f9d45] text-[12px] leading-none text-white">
                              +
                            </span>
                            <span>{Math.round(parseMoney(lineItem.margin))}% margin</span>
                          </span>
                        ) : null}
                        <div className="px-2 py-1.5 text-center text-[11px] font-black text-[#273f7a]">{lineIndex + 1}</div>
                        <div className="flex min-h-[25px] items-start gap-2 border-l border-[#e5e5e5] px-2 py-1.5">
                          <EditableValue
                            label={`${section.title} line item ${lineIndex + 1}`}
                            value={lineItem.description}
                            onChange={(value) => updateCostLineItem(section.id, lineItem.id, 'description', value)}
                            onDropMenuItem={(item) => addMenuItemToCostSection(section.id, item)}
                            className="min-w-0 flex-1 leading-tight"
                          />
                        </div>
                        <EditableValue
                          label={`${section.title} quantity ${lineIndex + 1}`}
                          value={lineItem.quantity}
                          onChange={(value) => updateCostLineItem(section.id, lineItem.id, 'quantity', value)}
                          className="min-h-[25px] border-l border-[#e5e5e5] px-2 py-1.5 text-right"
                        />
                        <EditableValue
                          label={`${section.title} rate ${lineIndex + 1}`}
                          value={lineItem.rate}
                          onChange={(value) => updateCostLineItem(section.id, lineItem.id, 'rate', value)}
                          className="min-h-[25px] border-l border-[#e5e5e5] px-2 py-1.5 text-right"
                        />
                        <div className="border-l border-[#e5e5e5] px-2 py-1.5 text-right font-black">
                          {formatMoney(getLineAmount(lineItem))}
                        </div>
                        <div className="report-inline-action relative border-l border-[#e5e5e5]">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveLineMenu((currentMenu) =>
                                currentMenu === `cost-${section.id}-${lineItem.id}`
                                  ? ''
                                  : `cost-${section.id}-${lineItem.id}`,
                              )
                            }
                            className="flex min-h-[25px] w-full items-center justify-center bg-white text-[19px] font-black leading-none text-[#4d5360] transition hover:bg-[#f4f6fb]"
                            aria-label={`Open settings for ${section.title} line item ${lineIndex + 1}`}
                          >
                            ⚙
                          </button>
                          {activeLineMenu === `cost-${section.id}-${lineItem.id}` ? (
                            <div className="absolute right-0 top-[calc(100%+4px)] z-20 w-[230px] rounded-md border border-[#cfd6e5] bg-white p-3 text-left shadow-[0_18px_44px_-28px_rgba(15,23,42,0.55)]">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="text-[11px] font-black uppercase text-[#555b66]">Line settings</span>
                                <button
                                  type="button"
                                  onClick={() => setActiveLineMenu('')}
                                  className="flex h-6 w-6 items-center justify-center rounded-md border border-[#d8deea] bg-white text-[13px] font-black text-[#4d5360] transition hover:bg-[#f4f6fb]"
                                  aria-label="Close line settings"
                                >
                                  x
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  removeCostLineItem(section.id, lineItem.id)
                                  setActiveLineMenu('')
                                }}
                                className="mb-3 w-full rounded-md border border-[#e1c6c6] bg-[#fff7f7] px-3 py-2 text-left text-[12px] font-black text-[#8a1a1a] transition hover:bg-[#fcecec]"
                              >
                                Delete item
                              </button>
                              <label className="block text-[11px] font-black uppercase text-[#555b66]">
                                Add margin: {Math.round(parseMoney(lineItem.margin))}%
                              </label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                value={parseMoney(lineItem.margin)}
                                onChange={(event) =>
                                  updateCostLineItem(section.id, lineItem.id, 'margin', event.currentTarget.value)
                                }
                                className="mt-2 w-full accent-[#273f7a]"
                              />
                              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-bold text-[#4d5360]">
                                <span>Base</span>
                                <span className="text-right">{formatMoney(getBaseLineAmount(lineItem))}</span>
                                <span>Increase</span>
                                <span className="text-right text-[#7d1515]">{formatMoney(getMarginAmount(lineItem))}</span>
                                <span className="font-black text-[#111]">New price</span>
                                <span className="text-right font-black text-[#111]">{formatMoney(getLineAmount(lineItem))}</span>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}

                    <div className="grid grid-cols-[1fr_150px_112px_30px] border-b border-[#d8d8d8] bg-[#fbfbfb] text-[12px] font-black">
                      <div className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => addCostLineItem(section.id)}
                          className="report-inline-action rounded-md border border-[#bdc4d3] bg-[#f8fafc] px-2 py-1 text-[10px] font-black uppercase text-[#273f7a] transition hover:bg-[#edf2fb]"
                        >
                          Add Line Item
                        </button>
                      </div>
                      <div className="border-l border-[#d8d8d8] px-2 py-1.5 text-right uppercase text-[#555b66]">
                        Subtotal
                      </div>
                      <div className="border-l border-[#d8d8d8] px-2 py-1.5 text-right text-[#111]">
                        {formatMoney(section.lineItems.reduce((total, lineItem) => total + getLineAmount(lineItem), 0))}
                      </div>
                      <div className="report-inline-action border-l border-[#d8d8d8]" />
                    </div>
                  </section>
                ))}
              </div>
            </section>
            ) : null}

            {blockVisibility.grandTotal ? (
            <section className={`relative mt-5 border-2 border-[#111] ${unlocked ? 'ring-2 ring-red-500/45' : ''}`}>
              {unlocked ? (
                <button
                  type="button"
                  onClick={() => deleteQuoteBlock('grandTotal')}
                  className="report-toolbar absolute right-[-14px] top-[-14px] z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-red-600 bg-white text-[15px] font-black text-red-700 shadow-sm transition hover:bg-red-50"
                  aria-label="Delete grand total block"
                >
                  🗑
                </button>
              ) : null}
              <div className="grid grid-cols-[1fr_180px_160px] bg-[#f2f2f2] text-[16px] font-black">
                <div className="px-4 py-3 uppercase text-[#555b66]">Grand Total</div>
                <div className="border-l border-[#cfcfcf] px-4 py-3 text-right uppercase text-[#555b66]">Total</div>
                <div className="border-l border-[#111] bg-[#f5b400] px-4 py-3 text-right text-[#111]">
                  {formatMoney(invoiceTotal)}
                </div>
              </div>
            </section>
            ) : null}

            {blockVisibility.notes ? (
            <section className={`relative mt-5 border border-[#d4d4d4] ${unlocked ? 'ring-2 ring-red-500/45' : ''}`}>
              {unlocked ? (
                <button
                  type="button"
                  onClick={() => deleteQuoteBlock('notes')}
                  className="report-toolbar absolute right-[-14px] top-[-14px] z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-red-600 bg-white text-[15px] font-black text-red-700 shadow-sm transition hover:bg-red-50"
                  aria-label="Delete notes block"
                >
                  🗑
                </button>
              ) : null}
              <EditableText
                id="notesHeader"
                data={report}
                onChange={updateField}
                className="bg-[#f2f2f2] px-3 py-2 text-[17px] font-black uppercase"
              />
              <EditableText id="notes" data={report} onChange={updateField} multiline className="min-h-[96px] px-3 py-3 text-[15px] font-semibold" />
            </section>
            ) : null}
          </section>
          {canvasTextBoxes.map((textBox) => (
            <div
              key={textBox.id}
              draggable
              onDragStart={(event) => {
                textBoxDragStart.current[textBox.id] = {
                  clientX: event.clientX,
                  clientY: event.clientY,
                  x: textBox.x,
                  y: textBox.y,
                }
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={(event) => {
                const start = textBoxDragStart.current[textBox.id]
                if (!start || event.clientX === 0 || event.clientY === 0) return
                moveCanvasTextBox(
                  textBox.id,
                  start.x + event.clientX - start.clientX,
                  start.y + event.clientY - start.clientY,
                )
                delete textBoxDragStart.current[textBox.id]
              }}
              className="absolute z-20 min-w-[170px] max-w-[360px] cursor-move rounded-md ring-2 ring-[#8b3dff]/35"
              style={{ left: textBox.x, top: textBox.y }}
            >
              <button
                type="button"
                onClick={() => deleteCanvasTextBox(textBox.id)}
                className="report-toolbar absolute right-[-12px] top-[-12px] z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-red-600 bg-white text-[13px] font-black text-red-700 shadow-sm transition hover:bg-red-50"
                aria-label="Delete text box"
              >
                🗑
              </button>
              <EditableValue
                label="Canvas text box"
                value={textBox.text}
                onChange={(value) => updateCanvasTextBox(textBox.id, value)}
                className="min-h-[34px] rounded-md border border-dashed border-[#8b3dff]/55 bg-white/90 px-2.5 py-1.5 font-['Times_New_Roman',Times,serif] text-[18px] font-normal leading-tight shadow-[0_8px_22px_-20px_rgba(15,23,42,0.55)]"
                multiline
              />
            </div>
          ))}
        </article>
          </div>
      </main>
    </div>
    {menuSettingsOpen ? (
      <div className="report-toolbar fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 px-4">
        <div className="w-full max-w-[680px] rounded-md border border-[#cfd6e5] bg-white shadow-[0_28px_80px_-36px_rgba(15,23,42,0.75)]">
          <div className="flex items-center justify-between border-b border-[#dfe4ef] px-5 py-4">
            <div>
              <h2 className="text-[20px] font-black text-[#1f2430]">Menu Settings</h2>
              <p className="mt-1 text-[13px] font-semibold text-[#747b8a]">Add a draggable item to one of the menu sections.</p>
            </div>
            <button
              type="button"
              onClick={() => setMenuSettingsOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-[#d8deea] bg-white text-[16px] font-black text-[#4d5360] transition hover:bg-[#f4f6fb]"
              aria-label="Close menu settings"
            >
              x
            </button>
          </div>

          <div className="grid gap-4 px-5 py-5">
            <label className="grid gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[#555b66]">
              Section
              <select
                value={newMenuSection}
                onChange={(event) => setNewMenuSection(event.currentTarget.value)}
                className="rounded-md border border-[#cfd6e5] bg-white px-3 py-2 text-[14px] font-bold normal-case text-[#1f2430] outline-none focus:border-[#273f7a]"
              >
                {menuItemSections.map((section) => (
                  <option key={section.title} value={section.title}>
                    {getMenuSectionDisplayTitle(section.title)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[#555b66]">
              Item name
              <input
                value={newMenuLabel}
                onChange={(event) => setNewMenuLabel(event.currentTarget.value)}
                placeholder="Example: Replacement contactor"
                className="rounded-md border border-[#cfd6e5] px-3 py-2 text-[14px] font-bold normal-case text-[#1f2430] outline-none focus:border-[#273f7a]"
              />
            </label>

            <label className="grid gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[#555b66]">
              Description
              <textarea
                value={newMenuDescription}
                onChange={(event) => setNewMenuDescription(event.currentTarget.value)}
                placeholder="Description that will appear in the quote line item"
                className="min-h-[110px] resize-y rounded-md border border-[#cfd6e5] px-3 py-2 text-[14px] font-semibold normal-case text-[#1f2430] outline-none focus:border-[#273f7a]"
              />
            </label>

            <label className="grid max-w-[220px] gap-1.5 text-[12px] font-black uppercase tracking-[0.02em] text-[#555b66]">
              Rate
              <input
                value={newMenuRate}
                onChange={(event) => setNewMenuRate(event.currentTarget.value)}
                inputMode="decimal"
                className="rounded-md border border-[#cfd6e5] px-3 py-2 text-[14px] font-bold normal-case text-[#1f2430] outline-none focus:border-[#273f7a]"
              />
            </label>
          </div>

          <div className="flex items-center justify-between border-t border-[#dfe4ef] bg-[#fbfcff] px-5 py-4">
            <p className="text-[12px] font-semibold text-[#747b8a]">New items save locally and become draggable immediately.</p>
            <button
              type="button"
              onClick={addMenuItemFromSettings}
              disabled={!newMenuLabel.trim() || !newMenuDescription.trim()}
              className="rounded-md bg-[#273f7a] px-5 py-2.5 text-[13px] font-black text-white transition hover:bg-[#1f3262] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Add Item
            </button>
          </div>
        </div>
      </div>
    ) : null}
    {masterServiceAgreementOpen ? (
      <div className="report-toolbar fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/55 px-4 py-6">
        <div className="flex h-full w-full max-w-[920px] flex-col rounded-md border border-[#cfd6e5] bg-white shadow-[0_28px_80px_-36px_rgba(15,23,42,0.75)]">
          <div className="flex items-center justify-between border-b border-[#dfe4ef] px-5 py-3">
            <div>
              <h2 className="text-[18px] font-black text-[#1f2430]">Master Service Agreement</h2>
              <p className="mt-0.5 text-[12px] font-semibold text-[#747b8a]">Example pricing schedule for Wabash service work</p>
            </div>
            <button
              type="button"
              onClick={() => setMasterServiceAgreementOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-[#d8deea] bg-white text-[16px] font-black text-[#4d5360] transition hover:bg-[#f4f6fb]"
              aria-label="Close master service agreement"
            >
              x
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[#eef1f6] px-5 py-5">
            <article className="mx-auto min-h-[980px] max-w-[760px] bg-white px-12 py-10 text-[#1f2430] shadow-[0_18px_46px_-30px_rgba(15,23,42,0.5)]">
              <div className="border-b-4 border-[#f5b400] pb-4">
                <p className="text-[12px] font-black uppercase tracking-[0.08em] text-[#273f7a]">Example Agreement</p>
                <h3 className="mt-2 text-[30px] font-black leading-tight">Master Service Agreement</h3>
                <p className="mt-2 text-[13px] font-semibold text-[#5b606b]">
                  DESHAZO service pricing reference for quote proposal preparation.
                </p>
              </div>

              <section className="mt-6 grid grid-cols-2 gap-4 text-[13px] font-semibold">
                <div className="rounded-md border border-[#dfe4ef] p-4">
                  <p className="text-[11px] font-black uppercase text-[#747b8a]">Customer</p>
                  <p className="mt-1 text-[16px] font-black">Wabash</p>
                </div>
                <div className="rounded-md border border-[#dfe4ef] p-4">
                  <p className="text-[11px] font-black uppercase text-[#747b8a]">Covered Equipment</p>
                  <p className="mt-1 text-[16px] font-black">Crane D200235</p>
                </div>
              </section>

              <section className="mt-7">
                <h4 className="text-[16px] font-black uppercase text-[#273f7a]">Labor Rates</h4>
                <div className="mt-3 overflow-hidden rounded-md border border-[#cfd6e5] text-[13px]">
                  <div className="grid grid-cols-[1fr_120px] bg-[#f7f8fb] text-[11px] font-black uppercase text-[#555b66]">
                    <div className="px-3 py-2">Service Type</div>
                    <div className="border-l border-[#cfd6e5] px-3 py-2 text-right">Rate</div>
                  </div>
                  {[
                    ['Regular technician labor', '$145.00/hr'],
                    ['Overtime technician labor', '$217.50/hr'],
                    ['Double-time emergency labor', '$290.00/hr'],
                    ['Project manager / engineering support', '$185.00/hr'],
                    ['Helper / apprentice labor', '$95.00/hr'],
                  ].map(([label, rate]) => (
                    <div key={label} className="grid grid-cols-[1fr_120px] border-t border-[#e5e9f2] font-semibold">
                      <div className="px-3 py-2">{label}</div>
                      <div className="border-l border-[#e5e9f2] px-3 py-2 text-right font-black">{rate}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-7">
                <h4 className="text-[16px] font-black uppercase text-[#273f7a]">Equipment, Travel, and Freight</h4>
                <div className="mt-3 grid gap-3 text-[13px] font-semibold">
                  {[
                    ['Service truck', '$85.00 per visit'],
                    ['Scissor lift rental', '$275.00 per day'],
                    ['Forklift / telehandler rental', '$425.00 per day'],
                    ['Freight and delivery', 'Actual cost plus 15%'],
                    ['Mileage outside service area', '$1.25 per mile'],
                  ].map(([label, rate]) => (
                    <div key={label} className="flex items-center justify-between rounded-md border border-[#dfe4ef] px-3 py-2">
                      <span>{label}</span>
                      <span className="font-black">{rate}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-7 rounded-md border border-[#e4d08a] bg-[#fff9df] p-4">
                <h4 className="text-[14px] font-black uppercase text-[#7d5c00]">Commercial Terms</h4>
                <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#4d5360]">
                  Parts are billed at quoted cost plus applicable margin. Taxes, permits, special site access,
                  and expedited freight are added when required. Pricing shown here is example data for this
                  quoting prototype.
                </p>
              </section>
            </article>
          </div>
        </div>
      </div>
    ) : null}
    {originalPdfOpen ? (
      <div className="report-toolbar fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/55 px-4 py-6">
        <div className="flex h-full w-full max-w-[1080px] flex-col rounded-md border border-[#cfd6e5] bg-white shadow-[0_28px_80px_-36px_rgba(15,23,42,0.75)]">
          <div className="flex items-center justify-between border-b border-[#dfe4ef] px-5 py-3">
            <div>
              <h2 className="text-[18px] font-black text-[#1f2430]">Original PDF</h2>
              <p className="mt-0.5 text-[12px] font-semibold text-[#747b8a]">D400049 inspection report</p>
            </div>
            <button
              type="button"
              onClick={() => setOriginalPdfOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-[#d8deea] bg-white text-[16px] font-black text-[#4d5360] transition hover:bg-[#f4f6fb]"
              aria-label="Close original PDF"
            >
              x
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-[#eef1f6] px-5 py-5">
            <Document
              file="/original-inspection-report.pdf"
              onLoadSuccess={({ numPages }: PdfLoadSuccess) => setOriginalPdfPages(numPages)}
              loading={
                <div className="flex h-full items-center justify-center text-[13px] font-black text-[#747b8a]">
                  Loading original PDF...
                </div>
              }
              error={
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-700">
                  Unable to load the original PDF.
                </div>
              }
              className="space-y-5"
            >
              {Array.from({ length: originalPdfPages }, (_, index) => (
                <div
                  key={`original-pdf-page-${index + 1}`}
                  className="mx-auto w-fit overflow-hidden bg-white shadow-[0_18px_46px_-30px_rgba(15,23,42,0.5)]"
                >
                  <Page
                    pageNumber={index + 1}
                    width={920}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                  />
                </div>
              ))}
            </Document>
          </div>
        </div>
      </div>
    ) : null}
    </div>
  )
}
