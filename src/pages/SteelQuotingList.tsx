import JobsQuotingList from './JobsQuotingList'
import type { JobsQuotingItem, JobsQuotingItemResult, JobsQuotingRun } from '../lib/jobsQuoting'

const now = '2026-06-15T18:30:00.000Z'

const mockSteelRuns: JobsQuotingRun[] = [
  {
    id: 'steel-run-frame-kit',
    userId: null,
    sourceFileName: 'Steel frame drawing packet.pdf',
    status: 'ready',
    extendWorkflowRunId: null,
    extendWorkflowUrl: null,
    errorMessage: null,
    createdAt: '2026-06-15T14:15:00.000Z',
    updatedAt: now,
  },
  {
    id: 'steel-run-guard-rail',
    userId: null,
    sourceFileName: 'Guard rail fabrication drawings.pdf',
    status: 'ready',
    extendWorkflowRunId: null,
    extendWorkflowUrl: null,
    errorMessage: null,
    createdAt: '2026-06-14T16:10:00.000Z',
    updatedAt: '2026-06-15T15:25:00.000Z',
  },
]

const createSteelQuoteItem = ({
  id,
  runId,
  documentName,
  jobNumber,
  jobType,
  dNumber,
  repairCount,
  safetyCount,
  priorityCount,
  updatedAt,
  material,
  unitPrice,
  quantity,
}: {
  id: string
  runId: string
  documentName: string
  jobNumber: string
  jobType: string
  dNumber: string
  repairCount: number
  safetyCount: number
  priorityCount: number
  updatedAt: string
  material: string
  unitPrice: string
  quantity: string
}): JobsQuotingItem => ({
  id,
  runId,
  editableDocumentId: null,
  documentName,
  jobNumber,
  jobType,
  dNumber,
  deshazoExternalInspectionReportWorkOrderId: null,
  splitType: 'steel_quote',
  splitIdentifier: dNumber,
  repairCount,
  safetyCount,
  priorityCount,
  extendFileId: null,
  pdfUrl: null,
  pdfBucket: 'mock-steel-quotes',
  pdfStoragePath: null,
  pdfFileName: documentName,
  pdfFileSize: null,
  pdfContentType: 'application/pdf',
  extractionData: {
    d_number: dNumber,
    job_number: jobNumber,
    material,
  },
  reportName: `${dNumber} steel quote`,
  sourceDocumentName: documentName,
  reportData: {
    title: 'STEEL QUOTE INPUT',
    summary: `${dNumber} steel fabrication estimate`,
    jobNumber: `Job #: ${jobNumber}`,
    description: material,
  },
  repairSections: [],
  costSections: [
    {
      id: `${id}-material`,
      title: 'Material and forming',
      lineItems: [
        {
          id: `${id}-line-1`,
          description: material,
          quantity,
          customerPrice: unitPrice,
          rate: unitPrice,
          margin: '0',
        },
      ],
    },
  ],
  blockVisibility: {},
  estimateNoteVisibility: {},
  estimateCostSectionVisibility: {},
  repairSectionVisibility: {},
  pageLayoutVisibility: {
    blockVisibility: {},
    estimateNoteVisibility: {},
    estimateCostSectionVisibility: {},
    repairSectionVisibility: {},
  },
  textBoxes: [],
  equipmentRentalSettings: {},
  createdAt: updatedAt,
  updatedAt,
})

const mockSteelItems: JobsQuotingItem[] = [
  createSteelQuoteItem({
    id: 'steel-quote-crossmember',
    runId: 'steel-run-frame-kit',
    documentName: 'Crossmember 94in DOMEX 700MCE.pdf',
    jobNumber: 'ST-270357',
    jobType: 'laser cut and form',
    dNumber: 'D200235',
    repairCount: 4,
    safetyCount: 1,
    priorityCount: 5,
    updatedAt: now,
    material: '0.079 DOMEX 700MCE formed crossmember, 94.00 in length',
    unitPrice: '248.50',
    quantity: '24',
  }),
  createSteelQuoteItem({
    id: 'steel-quote-bracket-set',
    runId: 'steel-run-frame-kit',
    documentName: 'Mounting bracket set rev B.pdf',
    jobNumber: 'ST-270357',
    jobType: 'bracket kit',
    dNumber: 'D200241',
    repairCount: 3,
    safetyCount: 0,
    priorityCount: 3,
    updatedAt: '2026-06-15T17:40:00.000Z',
    material: 'A572 grade 50 mounting bracket set with press brake offsets',
    unitPrice: '84.25',
    quantity: '60',
  }),
  createSteelQuoteItem({
    id: 'steel-quote-guard-panel',
    runId: 'steel-run-guard-rail',
    documentName: 'Guard rail panel assembly.pdf',
    jobNumber: 'ST-270411',
    jobType: 'guard rail assembly',
    dNumber: 'D200318',
    repairCount: 6,
    safetyCount: 2,
    priorityCount: 8,
    updatedAt: '2026-06-15T15:25:00.000Z',
    material: 'Powder-coated guard rail panel assembly with welded tabs',
    unitPrice: '412.00',
    quantity: '18',
  }),
  createSteelQuoteItem({
    id: 'steel-quote-access-plate',
    runId: 'steel-run-guard-rail',
    documentName: 'Access plate nest drawing.pdf',
    jobNumber: 'ST-270428',
    jobType: 'plate nesting',
    dNumber: 'D200326',
    repairCount: 2,
    safetyCount: 1,
    priorityCount: 3,
    updatedAt: '2026-06-14T18:05:00.000Z',
    material: '3/16 HRPO access plate, nested and deburred',
    unitPrice: '36.75',
    quantity: '144',
  }),
]

const mockSteelResults: JobsQuotingItemResult[] = [
  {
    id: 'steel-result-crossmember',
    jobQuoteItemId: 'steel-quote-crossmember',
    userId: null,
    quoteTotalAmount: 5964,
    winStatus: 'pending',
    amountWon: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'steel-result-guard-panel',
    jobQuoteItemId: 'steel-quote-guard-panel',
    userId: null,
    quoteTotalAmount: 7416,
    winStatus: 'won',
    amountWon: 7416,
    createdAt: '2026-06-15T15:25:00.000Z',
    updatedAt: '2026-06-15T15:25:00.000Z',
  },
]

export default function SteelQuotingList() {
  return (
    <JobsQuotingList
      homePath="/steel-demo-dashboard"
      headerLabel="Steel Quoting"
      headerTitle="Quote Builder"
      pageTitle="Steel Quoting List"
      loadingLabel="Loading steel quoting..."
      mockRuns={mockSteelRuns}
      mockItems={mockSteelItems}
      mockItemResults={mockSteelResults}
      editQuotePath="/steel-photo-upload"
      includeItemIdInEditPath={false}
      showIssueCounts={false}
      showHeaderActions={false}
    />
  )
}
