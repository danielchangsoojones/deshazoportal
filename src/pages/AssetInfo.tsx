import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { supabase, isConfigured } from '../lib/supabase'
import { usePortalMenu } from '../lib/usePortalMenu'
import { useDeveloperMenuItems } from '../lib/useDeveloperMenuItems'
import { DeveloperBadge } from '../components/DeveloperBadge'
import DNumberSearchBar from '../components/DNumberSearchBar'
import { createAssetNote, listAssetNotes, type AssetNoteRecord } from '../lib/assetNotes'
import { getAssetCompanyInternalId, upsertAssetCompanyInternalId } from '../lib/assetCompanyInternalId'
import {
  deleteAssetNotificationSubscriber,
  listAssetNotificationSubscribers,
  upsertAssetNotificationSubscriber,
  type AssetNotificationSubscriberRecord,
} from '../lib/assetNotificationSubscribers'
import {
  getAssetInfo,
  getRecurringIssues,
  type AssetPdfDocument,
  type AssetPdfResponse,
  type AssetInfoAnalytics,
  type AssetIssue,
  type RecurringIssue,
} from '../lib/portalApi'
import {
  DESHAZO_PDF_PAGE_HEIGHT_PX,
  DESHAZO_PDF_PAGE_WIDTH_PX,
  createDeshazoInspectionPdfBlob,
  getDeshazoInspectionPdfFileName,
  getDeshazoInspectionReportHtml,
  getDeshazoInspectionReportStyles,
} from '../lib/deshazoExternalPdf'
import {
  getSavedDeshazoRepairReportsByCity,
  getSavedDeshazoInspectionReportMatchesForDNumber,
  type DeshazoSavedInspectionReport,
} from '../lib/deshazoExternalReports'
import {
  getSupabaseOpenRiskAssetInfo,
  getSupabaseOpenRiskRecurringIssues,
} from '../lib/deshazoOpenRiskSupabase'

const menuItems = [
  { label: 'Home', href: '/dashboard' },
  { label: 'Open Risk Items', href: '/asset-fleet-assets?view=open-risk' },
  { label: 'Asset Fleet', href: '/asset-fleet' },
  { label: 'Spend', href: '/spend' },
  { label: 'Location Comparison', href: '/location-comparison' },
  { label: 'Documents', href: '/documents-reports' },
  { label: 'Custom Reports', href: '/custom-reports' },
  { label: 'Work Orders', href: '/deshazo-work-orders' },
  { label: 'Add User', href: '/add-user' },
  { label: 'Contact Us', href: '/contact-us' },
]

type AssetInfoTab = 'issues' | 'info' | 'documents' | 'repair' | 'notes' | 'analytics'

const ANALYTICS_COLORS = ['#2f56a6', '#f2b43f', '#e05c3a', '#4a9960', '#7b44c7', '#355fb4']
const PREVENTATIVE_REPORTS_PAGE_SIZE = 10


type AssetNote = {
  id: string
  unitId: string
  authorId: string
  text: string
  authorName: string
  authorEmail: string
  createdAt: string
}

type NotificationSubscriber = {
  email: string
  newReports: boolean
  repairDone: boolean
}

type FilterField = 'category' | 'safety_category' | 'inspection_date' | 'component_type' | 'remarks'

type GeneratedIssueReportMatch = {
  report: DeshazoSavedInspectionReport
  craneIndex: number
}

type RepairPdfDocument = AssetPdfDocument & {
  documentKey: string
  report: DeshazoSavedInspectionReport
  pdfLoading?: boolean
  pdfError?: string
}

type GeneratedInspectionPdfDocument = AssetPdfDocument & {
  documentKey: string
  report: DeshazoSavedInspectionReport
  craneIndex: number
  pdfLoading?: boolean
  pdfError?: string
}

const isRepairPdfDocument = (
  document: AssetPdfDocument | RepairPdfDocument | null,
): document is RepairPdfDocument => Boolean(document && 'documentKey' in document)

const isGeneratedInspectionPdfDocument = (
  document: AssetPdfDocument | RepairPdfDocument | GeneratedInspectionPdfDocument | null,
): document is GeneratedInspectionPdfDocument => Boolean(document && 'craneIndex' in document)

const defaultAssetInfo: AssetInfoAnalytics = {
  unit_location: '',
  unit_internal_location: '',
  unit_name: 'Asset Info',
  issues: [],
}

const defaultAssetDocuments: AssetPdfResponse = {
  results: [],
  page: 1,
  page_size: 10,
  total_invoice_count: 0,
  total_pages: 1,
}

const formatDisplayDate = (value?: string) =>
  value ? value.replace(/\. /g, ' ').replace(/th,|st,|nd,|rd,/g, ',') : 'Not available'

const parseInspectionDate = (value?: string) => {
  if (!value) return null

  const normalized = value
    .replace(/\./g, '')
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1')

  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatTitleCase = (value?: string) =>
  value
    ? value
        .split(/[\s_]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : 'Not available'

const formatNoteTimestamp = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const mapNoteRecord = (note: AssetNoteRecord): AssetNote => ({
  id: note.id,
  unitId: note.unitId,
  authorId: note.authorId,
  text: note.text,
  authorName: note.authorName,
  authorEmail: note.authorEmail,
  createdAt: note.createdAt,
})

const mapNotificationSubscriberRecord = (
  subscriber: AssetNotificationSubscriberRecord,
): NotificationSubscriber => ({
  email: subscriber.email,
  newReports: subscriber.newReports,
  repairDone: subscriber.repairDone,
})

const extractDocumentNumber = (...values: Array<string | undefined>) => {
  for (const value of values) {
    const match = value?.match(/\bD\d+\b/i)
    if (match?.[0]) {
      return match[0].toUpperCase()
    }
  }

  return ''
}

const getSafetyBadgeClass = (value: string) => {
  const normalized = value.toLowerCase()
  if (normalized === 'safety') {
    return 'bg-[#ffe1dd] text-[#bf3b2f]'
  }
  if (normalized === 'monitor') {
    return 'bg-[#fff1cc] text-[#b27d00]'
  }
  return 'bg-[var(--deshazo-surface)] text-[var(--deshazo-blue)]'
}

const getComponentBadgeClass = (value: string) => {
  const normalized = value.toLowerCase()
  if (normalized.includes('hoist')) {
    return 'bg-[#efdfff] text-[#7b44c7]'
  }
  if (normalized.includes('monorail')) {
    return 'bg-[#dbe7ff] text-[#355fb4]'
  }
  return 'bg-[#fff1cc] text-[#9b7400]'
}

const buildVisiblePages = (currentPage: number, totalPages: number) => {
  if (totalPages <= 8) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1])
  if (currentPage <= 3) {
    pages.add(2)
    pages.add(3)
    pages.add(4)
  }
  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1)
    pages.add(totalPages - 2)
    pages.add(totalPages - 3)
  }

  return Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right)
}

function AssetIssueRow({
  issue,
  index,
  onClick,
}: {
  issue: AssetIssue
  index: number
  onClick: () => void
}) {
  return (
    <tr onClick={onClick} className={`cursor-pointer transition hover:bg-[#dbe5ff] ${index % 2 === 0 ? 'bg-[#f4f7ff]' : 'bg-white'}`}>
      <td className="w-[23%] px-4 py-3 align-top text-[15px] font-medium text-[var(--deshazo-text)]">
        {issue.category}
      </td>
      <td className="w-[17%] px-4 py-3 align-top">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[13px] font-bold ${getSafetyBadgeClass(issue.safety_category)}`}>
          {issue.safety_category}
        </span>
      </td>
      <td className="w-[16%] px-4 py-3 align-top text-[15px] font-medium text-[var(--deshazo-text)]">
        {formatDisplayDate(issue.inspection_date)}
      </td>
      <td className="w-[11%] px-4 py-3 align-top">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[13px] font-bold ${getComponentBadgeClass(issue.component_type)}`}>
          {formatTitleCase(issue.component_type)}
        </span>
      </td>
      <td className="w-[33%] px-4 py-3 align-top text-[15px] font-medium leading-snug text-[var(--deshazo-text)]">
        <span className="min-w-0 flex-1 whitespace-normal break-words">{issue.remarks}</span>
      </td>
    </tr>
  )
}

function GeneratedInspectionReportPreview({
  report,
  selectedCraneIndex,
  zoom,
  onZoomOut,
  onZoomIn,
  onOpenReportPage,
  onDownload,
  downloadBusy = false,
}: {
  report: DeshazoSavedInspectionReport
  selectedCraneIndex: number
  zoom: number
  onZoomOut?: () => void
  onZoomIn?: () => void
  onOpenReportPage?: () => void
  onDownload?: () => void
  downloadBusy?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [currentPage, setCurrentPage] = useState(0)
  const reportMarkup = useMemo(
    () =>
      `<style>${getDeshazoInspectionReportStyles('preview')}</style>${getDeshazoInspectionReportHtml(
        report,
        selectedCraneIndex,
      )}`,
    [report, selectedCraneIndex],
  )
  const pageCount = useMemo(() => Math.max(1, reportMarkup.match(/class="pdf-page"/g)?.length ?? 1), [reportMarkup])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return undefined

    const updateScale = () => {
      const availableWidth = Math.max(0, node.clientWidth - 32)
      const widthScale = availableWidth / DESHAZO_PDF_PAGE_WIDTH_PX
      setScale(Math.max(0.45, Math.min(1.75, widthScale * zoom)))
    }

    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(node)
    window.addEventListener('resize', updateScale)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateScale)
    }
  }, [zoom])

  const pageGap = 24
  const scaledWidth = DESHAZO_PDF_PAGE_WIDTH_PX * scale
  const scaledHeight = DESHAZO_PDF_PAGE_HEIGHT_PX * scale
  const pageOffset = currentPage * (DESHAZO_PDF_PAGE_HEIGHT_PX + pageGap) * scale

  return (
    <section ref={containerRef} className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#777]">
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto px-4 py-5">
        <div className="overflow-hidden bg-white shadow-[0_16px_40px_-34px_rgba(0,0,0,0.4)]" style={{ width: scaledWidth, height: scaledHeight }}>
          <div
            className="deshazo-pdf-root"
            style={{
              marginTop: -pageOffset,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            dangerouslySetInnerHTML={{ __html: reportMarkup }}
          />
        </div>
      </div>
      {(onZoomOut || onZoomIn || onOpenReportPage || onDownload) ? (
        <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center overflow-hidden rounded-[12px] bg-[#323232] px-3 py-2 text-white shadow-[0_18px_34px_-18px_rgba(0,0,0,0.6)]">
          <button
            type="button"
            onClick={onZoomOut}
            disabled={!onZoomOut}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[28px] font-light leading-none text-white/90 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Zoom out"
            title="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            disabled={!onZoomIn}
            className="ml-2 flex h-10 w-10 items-center justify-center rounded-full text-[25px] font-light leading-none text-white/90 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
          <div className="mx-3 h-9 w-px bg-white/35" />
          <button
            type="button"
            onClick={onOpenReportPage}
            disabled={!onOpenReportPage}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[22px] font-semibold leading-none text-white/90 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Open report preview"
            title="Open report preview"
          >
            ▣
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={!onDownload || downloadBusy}
            className="ml-2 flex h-10 w-10 items-center justify-center rounded-full text-[28px] font-light leading-none text-white/90 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Download report"
            title="Download report"
          >
            {downloadBusy ? '…' : '↓'}
          </button>
        </div>
      ) : null}
      <div className="border-t border-[var(--deshazo-border)] bg-white px-4 py-3">
        <div className="grid grid-cols-[44px_1fr_44px] items-center gap-3 rounded-sm border border-[var(--deshazo-border)] bg-white px-2 py-2">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(0, page - 1))}
            disabled={currentPage === 0}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-[#edae2f] text-2xl font-bold leading-none text-white transition hover:bg-[#d89b22] disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Previous PDF page"
          >
            ‹
          </button>
          <div className="text-center text-[15px] font-bold text-[var(--deshazo-text)]">
            Page {currentPage + 1} of {pageCount}
          </div>
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(pageCount - 1, page + 1))}
            disabled={currentPage >= pageCount - 1}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-[#edae2f] text-2xl font-bold leading-none text-white transition hover:bg-[#d89b22] disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Next PDF page"
          >
            ›
          </button>
        </div>
      </div>
    </section>
  )
}

export default function AssetInfo() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<AssetInfoTab>('issues')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterField, setFilterField] = useState<FilterField>('category')
  const [filterValue, setFilterValue] = useState('')
  const [assetInfo, setAssetInfo] = useState<AssetInfoAnalytics>(defaultAssetInfo)
  const [assetDocuments, setAssetDocuments] = useState<AssetPdfResponse>(defaultAssetDocuments)
  const [inspectionDocuments, setInspectionDocuments] = useState<GeneratedInspectionPdfDocument[]>([])
  const [repairDocuments, setRepairDocuments] = useState<RepairPdfDocument[]>([])
  const repairDocumentUrlsRef = useRef<string[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [documentsError, setDocumentsError] = useState('')
  const [documentsPage, setDocumentsPage] = useState(1)
  const [inspectionPreviewZoom, setInspectionPreviewZoom] = useState(1)
  const [inspectionDownloadBusy, setInspectionDownloadBusy] = useState(false)
  const [selectedDocumentUrl, setSelectedDocumentUrl] = useState('')
  const [notes, setNotes] = useState<AssetNote[]>([])
  const [noteInput, setNoteInput] = useState('')
  const [notesLoading, setNotesLoading] = useState(false)
  const [notesError, setNotesError] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [wabashModalOpen, setWabashModalOpen] = useState(false)
  const [wabashIdentifier, setWabashIdentifier] = useState('')
  const [wabashDraft, setWabashDraft] = useState('')
  const [wabashLoading, setWabashLoading] = useState(false)
  const [wabashSaving, setWabashSaving] = useState(false)
  const [wabashError, setWabashError] = useState('')
  const [wabashInfoOpen, setWabashInfoOpen] = useState(false)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [notificationEmails, setNotificationEmails] = useState<NotificationSubscriber[]>([])
  const [notificationEmailsLoading, setNotificationEmailsLoading] = useState(false)
  const [notificationSavingEmail, setNotificationSavingEmail] = useState('')
  const [emailDraft, setEmailDraft] = useState('')
  const [emailError, setEmailError] = useState('')
  const [issueReportOpen, setIssueReportOpen] = useState(false)
  const [issueReportLoading, setIssueReportLoading] = useState(false)
  const [issueReportError, setIssueReportError] = useState('')
  const [selectedIssue, setSelectedIssue] = useState<AssetIssue | null>(null)
  const [selectedIssueMatch, setSelectedIssueMatch] = useState<GeneratedIssueReportMatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [recurringIssues, setRecurringIssues] = useState<RecurringIssue[]>([])
  const [recurringIssuesLoading, setRecurringIssuesLoading] = useState(false)
  const selectedRepairDocumentToDraft = useMemo(
    () => repairDocuments.find((document) => document.documentKey === selectedDocumentUrl) ?? null,
    [repairDocuments, selectedDocumentUrl],
  )
  const navigate = useNavigate()
  const unitId = searchParams.get('unit_id')?.trim() || ''
  const currentView = searchParams.get('view') === 'open-risk' ? 'open-risk' : 'asset-fleet'
  const usesSupabaseAssetData = currentView === 'open-risk' || currentView === 'asset-fleet'

  const activeMenuItems = useDeveloperMenuItems(
    menuItems,
    currentView === 'open-risk' ? 'Open Risk Items' : 'Asset Fleet',
  )

  const analytics = useMemo(() => {
    const issues = assetInfo.issues || []
    const now = new Date()

    const safetyBreakdownMap = new Map<string, number>()
    const categoryMap = new Map<string, number>()
    const componentMap = new Map<string, number>()
    const monthMap = new Map<string, { month: string; sortKey: number; total: number; safety: number; monitor: number; other: number }>()
    const recurringMap = new Map<string, { label: string; count: number; latestDate: number }>()

    let safetyCount = 0
    let monitorCount = 0
    let averageAgeAccumulator = 0
    let datedIssueCount = 0
    let latestInspectionDate: Date | null = null

    for (const issue of issues) {
      const safetyLabel = formatTitleCase(issue.safety_category || 'Other')
      safetyBreakdownMap.set(safetyLabel, (safetyBreakdownMap.get(safetyLabel) || 0) + 1)

      const categoryLabel = issue.category || 'Uncategorized'
      categoryMap.set(categoryLabel, (categoryMap.get(categoryLabel) || 0) + 1)

      const componentLabel = formatTitleCase(issue.component_type || 'Unknown')
      componentMap.set(componentLabel, (componentMap.get(componentLabel) || 0) + 1)

      const recurringLabel = `${componentLabel} / ${categoryLabel}`
      const parsedDate = parseInspectionDate(issue.inspection_date)
      recurringMap.set(recurringLabel, {
        label: recurringLabel,
        count: (recurringMap.get(recurringLabel)?.count || 0) + 1,
        latestDate: Math.max(recurringMap.get(recurringLabel)?.latestDate || 0, parsedDate?.getTime() || 0),
      })

      const normalizedSafety = issue.safety_category.trim().toLowerCase()
      if (normalizedSafety === 'safety') safetyCount += 1
      else if (normalizedSafety === 'monitor') monitorCount += 1

      if (parsedDate) {
        const monthKey = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}`
        const monthLabel = parsedDate.toLocaleString(undefined, { month: 'short' })
        const existingMonth = monthMap.get(monthKey) || {
          month: monthLabel,
          sortKey: parsedDate.getFullYear() * 12 + parsedDate.getMonth(),
          total: 0,
          safety: 0,
          monitor: 0,
          other: 0,
        }

        existingMonth.total += 1
        if (normalizedSafety === 'safety') existingMonth.safety += 1
        else if (normalizedSafety === 'monitor') existingMonth.monitor += 1
        else existingMonth.other += 1
        monthMap.set(monthKey, existingMonth)

        const ageInDays = Math.max(0, Math.round((now.getTime() - parsedDate.getTime()) / 86400000))
        averageAgeAccumulator += ageInDays
        datedIssueCount += 1

        if (!latestInspectionDate || parsedDate > latestInspectionDate) {
          latestInspectionDate = parsedDate
        }
      }
    }

    const safetyBreakdown = Array.from(safetyBreakdownMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((left, right) => right.value - left.value)

    const issuesByCategory = Array.from(categoryMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 6)

    const issuesByComponent = Array.from(componentMap.entries())
      .map(([component, count]) => ({ component, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 6)

    const issuesOverTime = Array.from(monthMap.values())
      .sort((left, right) => left.sortKey - right.sortKey)
      .slice(-6)

    const recurringPatterns = Array.from(recurringMap.values())
      .sort((left, right) => {
        if (right.count !== left.count) return right.count - left.count
        return right.latestDate - left.latestDate
      })
      .slice(0, 5)

    return {
      totalIssues: issues.length,
      safetyCount,
      monitorCount,
      averageAgeDays: datedIssueCount ? Math.round(averageAgeAccumulator / datedIssueCount) : 0,
      latestInspectionLabel: latestInspectionDate
        ? latestInspectionDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Not available',
      safetyBreakdown,
      issuesByCategory,
      issuesByComponent,
      issuesOverTime,
      recurringPatterns,
    }
  }, [assetInfo.issues])

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
    if (authLoading || !user) {
      return
    }

    const controller = new AbortController()

    const loadAssetInfo = async () => {
      if (!unitId) {
        setLoading(false)
        setError('A unit id is required to load asset information.')
        setAssetInfo(defaultAssetInfo)
        return
      }

      try {
        setLoading(true)
        setError('')
        const data = usesSupabaseAssetData
          ? await getSupabaseOpenRiskAssetInfo(unitId)
          : await getAssetInfo(unitId, controller.signal)
        setAssetInfo(data)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Unable to load asset information.')
        setAssetInfo(defaultAssetInfo)
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadAssetInfo()

    return () => controller.abort()
  }, [unitId, usesSupabaseAssetData, authLoading, user])

  useEffect(() => {
    if (authLoading || !user) {
      return
    }
    if (!unitId) return
    const controller = new AbortController()

    const loadRecurringIssues = async () => {
      try {
        setRecurringIssuesLoading(true)
        const data = usesSupabaseAssetData
          ? await getSupabaseOpenRiskRecurringIssues(unitId)
          : await getRecurringIssues(unitId, controller.signal)
        setRecurringIssues(data)
      } catch {
        if (!controller.signal.aborted) setRecurringIssues([])
      } finally {
        if (!controller.signal.aborted) setRecurringIssuesLoading(false)
      }
    }

    void loadRecurringIssues()
    return () => controller.abort()
  }, [unitId, usesSupabaseAssetData, authLoading, user])

  useEffect(() => {
    if (!user || !unitId || !supabase) {
      setNotes([])
      setNotesLoading(false)
      setNotesError(unitId ? '' : 'A unit id is required to load notes.')
      return
    }

    let cancelled = false

    const loadNotes = async () => {
      try {
        setNotesLoading(true)
        setNotesError('')
        const data = await listAssetNotes(unitId)
        if (!cancelled) {
          setNotes(data.map(mapNoteRecord))
        }
      } catch (err) {
        if (!cancelled) {
          setNotes([])
          setNotesError(err instanceof Error ? err.message : 'Unable to load notes.')
        }
      } finally {
        if (!cancelled) {
          setNotesLoading(false)
        }
      }
    }

    loadNotes()

    return () => {
      cancelled = true
    }
  }, [unitId, user])

  useEffect(() => {
    if (!user || !unitId || !supabase) {
      setNotificationEmails([])
      setNotificationEmailsLoading(false)
      return
    }

    let cancelled = false

    const loadNotificationSubscribers = async () => {
      try {
        setNotificationEmailsLoading(true)
        setEmailError('')
        const data = await listAssetNotificationSubscribers(unitId)
        if (!cancelled) {
          setNotificationEmails(data.map(mapNotificationSubscriberRecord))
        }
      } catch (err) {
        if (!cancelled) {
          setNotificationEmails([])
          setEmailError(err instanceof Error ? err.message : 'Unable to load email notifications.')
        }
      } finally {
        if (!cancelled) {
          setNotificationEmailsLoading(false)
        }
      }
    }

    loadNotificationSubscribers()

    return () => {
      cancelled = true
    }
  }, [unitId, user])

  useEffect(() => {
    if (!user || !unitId || !supabase) {
      setWabashIdentifier('')
      setWabashLoading(false)
      setWabashError(unitId ? '' : 'A unit id is required to load the unique company internal id.')
      return
    }

    let cancelled = false

    const loadCompanyInternalId = async () => {
      try {
        setWabashLoading(true)
        setWabashError('')
        const data = await getAssetCompanyInternalId(unitId)
        if (!cancelled) {
          setWabashIdentifier(data?.value ?? '')
        }
      } catch (err) {
        if (!cancelled) {
          setWabashIdentifier('')
          setWabashError(err instanceof Error ? err.message : 'Unable to load the unique company internal id.')
        }
      } finally {
        if (!cancelled) {
          setWabashLoading(false)
        }
      }
    }

    loadCompanyInternalId()

    return () => {
      cancelled = true
    }
  }, [unitId, user])

  useEffect(() => {
    if (activeTab !== 'documents') {
      return
    }
    if (!unitId) {
      setDocumentsLoading(false)
      setDocumentsError('A unit id is required to load documents.')
      setAssetDocuments(defaultAssetDocuments)
      setSelectedDocumentUrl('')
      return
    }

    const controller = new AbortController()

    const loadDocuments = async () => {
      try {
        setDocumentsLoading(true)
        setDocumentsError('')
        const docNumber = extractDocumentNumber(assetInfo.unit_name, unitId)
        if (!docNumber) {
          setDocumentsError('No D number was found for this asset, so preventative maintenance reports could not be loaded.')
          setAssetDocuments(defaultAssetDocuments)
          setInspectionDocuments([])
          setSelectedDocumentUrl('')
          return
        }

        const matchedReports = await getSavedDeshazoInspectionReportMatchesForDNumber(docNumber)
        const mappedDocuments: GeneratedInspectionPdfDocument[] = matchedReports.map((match) => ({
          documentKey: `inspection:${match.report.workOrderId}:${match.craneIndex}`,
          report: match.report,
          craneIndex: match.craneIndex,
          inspection_date: match.inspectionDate || match.report.summary?.endDate || match.report.syncedAt,
          pdf: '',
          type: match.report.jobType || match.report.summary?.jobType || 'Inspection',
          display_name: getDeshazoInspectionPdfFileName(match.report).replace(/\.pdf$/i, ''),
        }))

        setAssetDocuments({
          ...defaultAssetDocuments,
          page_size: PREVENTATIVE_REPORTS_PAGE_SIZE,
          total_invoice_count: mappedDocuments.length,
          total_pages: Math.max(1, Math.ceil(mappedDocuments.length / PREVENTATIVE_REPORTS_PAGE_SIZE)),
        })
        setInspectionDocuments(mappedDocuments)
        setDocumentsPage(1)
        setSelectedDocumentUrl((current) =>
          mappedDocuments.some((document) => document.documentKey === current) ? current : (mappedDocuments[0]?.documentKey ?? ''),
        )
      } catch (err) {
        if (controller.signal.aborted) return
        setDocumentsError(err instanceof Error ? err.message : 'Unable to load asset documents.')
        setAssetDocuments(defaultAssetDocuments)
        setInspectionDocuments([])
        setSelectedDocumentUrl('')
      } finally {
        if (!controller.signal.aborted) {
          setDocumentsLoading(false)
        }
      }
    }

    loadDocuments()

    return () => {
      controller.abort()
    }
  }, [activeTab, unitId, assetInfo.unit_name])

  useEffect(() => {
    if (activeTab !== 'documents') return

    const totalPages = Math.max(1, Math.ceil(inspectionDocuments.length / PREVENTATIVE_REPORTS_PAGE_SIZE))
    if (documentsPage > totalPages) {
      setDocumentsPage(totalPages)
      return
    }

    const startIndex = (documentsPage - 1) * PREVENTATIVE_REPORTS_PAGE_SIZE
    const currentPageDocuments = inspectionDocuments.slice(startIndex, startIndex + PREVENTATIVE_REPORTS_PAGE_SIZE)
    if (currentPageDocuments.length === 0) return
    if (!currentPageDocuments.some((document) => document.documentKey === selectedDocumentUrl)) {
      setSelectedDocumentUrl(currentPageDocuments[0].documentKey)
    }
  }, [activeTab, documentsPage, inspectionDocuments, selectedDocumentUrl])

  useEffect(() => {
    if (activeTab !== 'repair') {
      return
    }

    const city = assetInfo.unit_location || assetInfo.unit_internal_location

    if (!city) {
      setDocumentsLoading(false)
      setDocumentsError('A city/location is required to load repair reports.')
      setRepairDocuments([])
      setSelectedDocumentUrl('')
      return
    }

    let cancelled = false

    const loadRepairDocuments = async () => {
      try {
        setDocumentsLoading(true)
        setDocumentsError('')
        repairDocumentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
        repairDocumentUrlsRef.current = []

        if (!cancelled) {
          const reports = await getSavedDeshazoRepairReportsByCity(city)
          const mappedDocuments: RepairPdfDocument[] = reports.map((report) => ({
            documentKey: `repair:${report.workOrderId}`,
            report,
            inspection_date: report.summary?.startDate || report.summary?.endDate || report.syncedAt,
            pdf: '',
            type: report.jobType || 'Repair',
            display_name: getDeshazoInspectionPdfFileName(report).replace(/\.pdf$/i, ''),
          }))

          if (cancelled) {
            return
          }

          setRepairDocuments(mappedDocuments)
          setSelectedDocumentUrl((current) =>
            mappedDocuments.some((document) => document.documentKey === current) ? current : (mappedDocuments[0]?.documentKey ?? ''),
          )
        }
      } catch (err) {
        if (!cancelled) {
          setDocumentsError(err instanceof Error ? err.message : 'Unable to load repair reports.')
          setRepairDocuments([])
          setSelectedDocumentUrl('')
        }
      } finally {
        if (!cancelled) {
          setDocumentsLoading(false)
        }
      }
    }

    void loadRepairDocuments()

    return () => {
      cancelled = true
      repairDocumentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      repairDocumentUrlsRef.current = []
    }
  }, [activeTab, assetInfo.unit_location, assetInfo.unit_internal_location])

  useEffect(() => {
    return () => {
      repairDocumentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      repairDocumentUrlsRef.current = []
    }
  }, [])

  useEffect(() => {
    if (activeTab !== 'repair' || !selectedDocumentUrl) {
      return
    }

    const selectedRepairDocument = selectedRepairDocumentToDraft
    if (!selectedRepairDocument || selectedRepairDocument.pdf || selectedRepairDocument.pdfLoading) {
      return
    }

    let cancelled = false

    const loadSelectedRepairPdf = async () => {
      try {
        const blob = await createDeshazoInspectionPdfBlob(selectedRepairDocument.report)
        if (cancelled) return

        const pdfUrl = URL.createObjectURL(blob)
        repairDocumentUrlsRef.current.push(pdfUrl)
        setRepairDocuments((documents) =>
          documents.map((document) =>
            document.documentKey === selectedRepairDocument.documentKey
              ? { ...document, pdf: pdfUrl, pdfError: '' }
              : document,
          ),
        )
      } catch (err) {
        if (cancelled) return
        setRepairDocuments((documents) =>
          documents.map((document) =>
            document.documentKey === selectedRepairDocument.documentKey
              ? {
                  ...document,
                  pdfError: err instanceof Error ? err.message : 'Unable to draft repair PDF.',
                }
              : document,
          ),
        )
      }
    }

    void loadSelectedRepairPdf()

    return () => {
      cancelled = true
    }
  }, [activeTab, selectedDocumentUrl, selectedRepairDocumentToDraft])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/login')
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="rounded-2xl border border-[var(--deshazo-border)] bg-white px-6 py-4 text-sm font-semibold text-[var(--deshazo-blue)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
          Loading asset info...
        </div>
      </div>
    )
  }

  if (!user) return null

  const fullName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Portal User'
  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join('') || 'DP'

  const handleAddNote = async () => {
    const text = noteInput.trim()
    if (!text || !user || !unitId) return

    try {
      setNoteSaving(true)
      setNotesError('')
      const newNote = await createAssetNote({
        unitId,
        authorId: user.id,
        authorName: fullName,
        authorEmail: user.email ?? '',
        text,
      })
      setNotes((prev) => [mapNoteRecord(newNote), ...prev])
      setNoteInput('')
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : 'Unable to save note.')
    } finally {
      setNoteSaving(false)
    }
  }

  const handleSaveWabashIdentifier = async () => {
    const value = wabashDraft.trim()
    if (!value || !user || !unitId) {
      return
    }

    try {
      setWabashSaving(true)
      setWabashError('')
      const savedRecord = await upsertAssetCompanyInternalId({
        unitId,
        value,
        updatedBy: user.id,
        updatedByName: fullName,
        updatedByEmail: user.email ?? '',
      })
      setWabashIdentifier(savedRecord.value)
      setWabashModalOpen(false)
    } catch (err) {
      setWabashError(err instanceof Error ? err.message : 'Unable to save the unique company internal id.')
    } finally {
      setWabashSaving(false)
    }
  }

  const refreshAssetInfo = async () => {
    if (!unitId) {
      setLoading(false)
      setError('A unit id is required to load asset information.')
      setAssetInfo(defaultAssetInfo)
      return
    }

    try {
      setLoading(true)
      setError('')
      const data = usesSupabaseAssetData
        ? await getSupabaseOpenRiskAssetInfo(unitId)
        : await getAssetInfo(unitId)
      setAssetInfo(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load asset information.')
      setAssetInfo(defaultAssetInfo)
    } finally {
      setLoading(false)
    }
  }

  const saveNotificationSubscriber = async (subscriber: NotificationSubscriber) => {
    if (!user || !unitId) {
      setEmailError('Sign in and select an asset before editing email notifications.')
      return false
    }

    try {
      setNotificationSavingEmail(subscriber.email)
      setEmailError('')
      const savedSubscriber = await upsertAssetNotificationSubscriber({
        unitId,
        email: subscriber.email,
        newReports: subscriber.newReports,
        repairDone: subscriber.repairDone,
        updatedBy: user.id,
        updatedByName: fullName,
        updatedByEmail: user.email ?? '',
      })
      setNotificationEmails((prev) => {
        const next = prev.filter((entry) => entry.email !== savedSubscriber.email)
        next.push(mapNotificationSubscriberRecord(savedSubscriber))
        return next.sort((left, right) => left.email.localeCompare(right.email))
      })
      return true
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Unable to save email notification settings.')
      return false
    } finally {
      setNotificationSavingEmail('')
    }
  }

  const handleAddNotificationEmail = async () => {
    const val = emailDraft.trim().toLowerCase()
    if (!val.includes('@')) {
      setEmailError('Please enter a valid email.')
      return
    }
    if (notificationEmails.some((subscriber) => subscriber.email === val)) {
      setEmailError('This email is already added.')
      return
    }

    const saved = await saveNotificationSubscriber({ email: val, newReports: true, repairDone: true })
    if (saved) {
      setEmailDraft('')
    }
  }

  const handleRemoveNotificationEmail = async (email: string) => {
    if (!unitId) {
      setEmailError('A unit id is required to remove email notifications.')
      return
    }

    try {
      setNotificationSavingEmail(email)
      setEmailError('')
      await deleteAssetNotificationSubscriber(unitId, email)
      setNotificationEmails((prev) => prev.filter((subscriber) => subscriber.email !== email))
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Unable to remove this email notification.')
    } finally {
      setNotificationSavingEmail('')
    }
  }

  const handleToggleNotificationEmail = async (
    email: string,
    field: 'newReports' | 'repairDone',
  ) => {
    const subscriber = notificationEmails.find((entry) => entry.email === email)
    if (!subscriber) {
      return
    }

    await saveNotificationSubscriber({ ...subscriber, [field]: !subscriber[field] })
  }

  const handleIssueRowClick = async (issue: AssetIssue) => {
    setSelectedIssue(issue)
    setSelectedIssueMatch(null)
    setIssueReportError('')
    setIssueReportOpen(true)

    const docNumber = extractDocumentNumber(issue.remarks, assetInfo.unit_name, unitId)
    if (!docNumber) {
      setIssueReportError('No D number was found in the issue, asset name, or unit id, so a matching PDF could not be identified.')
      return
    }

    try {
      setIssueReportLoading(true)
      const matchedReports = await getSavedDeshazoInspectionReportMatchesForDNumber(docNumber)

      if (matchedReports.length === 0) {
        setIssueReportError(`No synced inspection report matched ${docNumber}.`)
        return
      }

      const issueDate = parseInspectionDate(issue.inspection_date)
      const sameDateMatch = issueDate
        ? matchedReports.find((match) => {
            const matchDate = parseInspectionDate(match.inspectionDate)
            return Boolean(matchDate && matchDate.toDateString() === issueDate.toDateString())
          })
        : null
      const matchedReport = sameDateMatch ?? matchedReports[0]

      setSelectedIssueMatch({
        report: matchedReport.report,
        craneIndex: matchedReport.craneIndex,
      })
    } catch (err) {
      setIssueReportError(err instanceof Error ? err.message : 'Unable to load the matching inspection report.')
    } finally {
      setIssueReportLoading(false)
    }
  }

  const tabs: Array<{ id: AssetInfoTab; label: string }> = [
    { id: 'issues', label: 'Open Issues' },
    { id: 'info', label: 'Asset Info' },
    { id: 'documents', label: 'Preventative Maintenance Reports' },
    { id: 'repair', label: 'Repair Reports' },
    { id: 'notes', label: 'Notes' },
    { id: 'analytics', label: 'Analytics' },
  ]

  const filterFieldOptions: Array<{ value: FilterField; label: string }> = [
    { value: 'category', label: 'Category' },
    { value: 'safety_category', label: 'Safety category' },
    { value: 'inspection_date', label: 'Inspection date' },
    { value: 'component_type', label: 'Component type' },
    { value: 'remarks', label: 'Remarks' },
  ]

  const filteredIssues = assetInfo.issues.filter((issue) => {
    const query = filterValue.trim().toLowerCase()
    if (!query) return true
    return String(issue[filterField] ?? '')
      .toLowerCase()
      .includes(query)
  })

  const handleRefreshIssues = () => {
    void refreshAssetInfo()
  }

  const clearFilter = () => {
    setFilterField('category')
    setFilterValue('')
    setFilterOpen(false)
  }

  const handleDownloadIssues = () => {
    const rows = filteredIssues.map((issue) => [
      issue.category,
      issue.safety_category,
      formatDisplayDate(issue.inspection_date),
      formatTitleCase(issue.component_type),
      issue.remarks.replace(/\r?\n/g, ' '),
    ])

    const csv = [
      ['Category', 'Safety category', 'Inspection date', 'Component', 'Remarks'],
      ...rows,
    ]
      .map((row) =>
        row
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(assetInfo.unit_name || 'asset-info').replace(/\s+/g, '-').toLowerCase()}-issues.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const currentDocumentList =
    activeTab === 'repair'
      ? repairDocuments
      : inspectionDocuments
  const getDocumentKey = (document: AssetPdfDocument | RepairPdfDocument) =>
    'documentKey' in document ? document.documentKey : document.pdf
  const documentsTotalPages = activeTab === 'documents'
    ? Math.max(1, Math.ceil(inspectionDocuments.length / PREVENTATIVE_REPORTS_PAGE_SIZE))
    : Math.max(1, assetDocuments.total_pages || 1)
  const visibleDocumentPages = buildVisiblePages(documentsPage, documentsTotalPages)
  const pagedDocumentList = activeTab === 'documents'
    ? currentDocumentList.slice(
        (documentsPage - 1) * PREVENTATIVE_REPORTS_PAGE_SIZE,
        documentsPage * PREVENTATIVE_REPORTS_PAGE_SIZE,
      )
    : currentDocumentList
  const selectedDocument =
    currentDocumentList.find((document) => getDocumentKey(document) === selectedDocumentUrl) ||
    currentDocumentList[0] ||
    null
  const selectedRepairDocument = isRepairPdfDocument(selectedDocument) ? selectedDocument : null
  const selectedInspectionDocument = isGeneratedInspectionPdfDocument(selectedDocument) ? selectedDocument : null
  const selectedDocumentDownloadName = selectedDocument
    ? `${selectedDocument.display_name.replace(/\.pdf$/i, '')}.pdf`
    : 'report.pdf'
  const handleDownloadSelectedInspectionReport = async () => {
    if (!selectedInspectionDocument) return

    try {
      setInspectionDownloadBusy(true)
      const blob = await createDeshazoInspectionPdfBlob(selectedInspectionDocument.report, selectedInspectionDocument.craneIndex)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = getDeshazoInspectionPdfFileName(selectedInspectionDocument.report, selectedInspectionDocument.craneIndex)
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally {
      setInspectionDownloadBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--deshazo-text)]">
      <header className="sticky top-0 z-40 bg-[var(--deshazo-blue)] px-5 py-3 shadow-sm">
        <div className="flex w-full items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex min-w-[120px] items-center justify-center gap-2 rounded-md border-2 border-white/80 px-6 py-2.5 text-base font-semibold text-white transition hover:bg-white/10"
          >
            <span>Menu</span>
            <span aria-hidden="true" className="text-xs">
              {menuOpen ? '⌃' : '⌄'}
            </span>
          </button>

          <DNumberSearchBar />

          <div className="hidden text-right text-sm text-white/85 sm:block">
            Signed in as <span className="font-semibold text-white">{user.email}</span>
          </div>
        </div>
      </header>

      <main className="flex w-full items-stretch">
        {menuOpen && (
          <aside className="sticky top-[60px] hidden h-[calc(100vh-60px)] w-[268px] shrink-0 border-r border-[var(--deshazo-border)] bg-white lg:flex lg:flex-col">
            <div className="flex-1 px-4 py-5">
              <div className="rounded-[24px] border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)]/50 p-4">
                <nav className="space-y-2">
                  {activeMenuItems.map((item) =>
                    item.href ? (
                      <Link
                        key={item.label}
                        to={item.href}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-[15px] font-medium transition ${
                          item.active
                            ? 'bg-[#dbe5ff] text-[var(--deshazo-text)] shadow-[inset_0_0_0_1px_rgba(47,86,166,0.06)]'
                            : 'text-[rgba(21,24,33,0.7)] hover:bg-white'
                        }`}
                      >
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <span className="truncate">{item.label}</span>
                          {item.developerOnly ? <DeveloperBadge /> : null}
                        </span>
                        <span className="text-[12px] font-semibold text-[rgba(21,24,33,0.4)]" />
                      </Link>
                    ) : (
                      <button
                        key={item.label}
                        type="button"
                        className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-[15px] font-medium text-[rgba(21,24,33,0.7)] transition hover:bg-white"
                      >
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <span className="truncate">{item.label}</span>
                          {item.developerOnly ? <DeveloperBadge /> : null}
                        </span>
                        <span className="text-[12px] font-semibold text-[rgba(21,24,33,0.4)]" />
                      </button>
                    ),
                  )}
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
                <button
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-[var(--deshazo-border)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--deshazo-blue)] shadow-[0_10px_24px_-20px_rgba(47,86,166,0.45)] transition hover:bg-[var(--deshazo-surface)]"
                  onClick={handleSignOut}
                  type="button"
                >
                  Sign out
                </button>
              </div>
            </div>
          </aside>
        )}

        <section className="flex min-h-0 min-w-0 flex-1 flex-col px-5 py-5 sm:px-8 lg:h-[calc(100vh-60px)] lg:px-10">
          <div className="mb-6">
            <div className="text-[36px] font-black uppercase tracking-[-0.04em] text-[#b8bcc8]">
              DESHA<span className="text-[#f2b43f]">Z</span>O
            </div>
            <p className="text-[13px] font-bold uppercase tracking-[0.02em] text-[#b6b8c2]">
              Cranes / Service / Automation
            </p>
            <div className="mt-[18px] h-1.5 w-full max-w-[530px] rounded-full bg-[var(--deshazo-blue)]" />
            <h1 className="text-[24px] font-black tracking-[-0.04em] text-[var(--deshazo-text)]">
              {loading ? 'Loading asset...' : assetInfo.unit_name || 'Asset Info'}
            </h1>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Wabash identifier + email notification buttons */}
          <div className="mb-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => { setWabashDraft(wabashIdentifier); setWabashError(''); setWabashModalOpen(true) }}
              className="flex items-center gap-3 rounded-[10px] border border-[var(--deshazo-border)] bg-white px-4 py-3 text-left shadow-[0_4px_12px_-8px_rgba(47,86,166,0.15)] transition hover:border-[var(--deshazo-blue)] hover:bg-[var(--deshazo-surface)]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--deshazo-surface)] text-[16px]">✏️</span>
              <span className="relative">
                <span className="flex items-center gap-2">
                  <p className="text-[13px] font-semibold text-[rgba(21,24,33,0.55)]">Unique Wabash Identifier</p>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setWabashInfoOpen((open) => !open)
                    }}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--deshazo-border)] bg-white text-[11px] font-bold text-[var(--deshazo-blue)] transition hover:bg-[var(--deshazo-surface)]"
                    aria-label="What is the unique Wabash identifier?"
                    title="What is the unique Wabash identifier?"
                  >
                    i
                  </button>
                </span>
                <p className="text-[14px] font-bold tracking-wide text-[var(--deshazo-text)]">
                  {wabashLoading ? 'Loading...' : (wabashIdentifier || 'Not set')}
                </p>
                {wabashInfoOpen ? (
                  <span
                    className="absolute left-0 top-[calc(100%+10px)] z-20 block w-[300px] rounded-[12px] border border-[var(--deshazo-border)] bg-white p-3 text-[12px] font-medium leading-relaxed text-[rgba(21,24,33,0.68)] shadow-[0_18px_40px_-28px_rgba(47,86,166,0.28)]"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Use this field to store the company-specific internal identifier for this asset. It is shared across all users for the same unit and helps your team reference the asset consistently.
                  </span>
                ) : null}
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setEmailDraft(''); setEmailError(''); setEmailModalOpen(true) }}
              className="flex items-center gap-3 rounded-[10px] border border-[var(--deshazo-border)] bg-white px-4 py-3 text-left shadow-[0_4px_12px_-8px_rgba(47,86,166,0.15)] transition hover:border-[var(--deshazo-blue)] hover:bg-[var(--deshazo-surface)]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--deshazo-surface)] text-[16px]">✉️</span>
              <span>
                <p className="text-[14px] font-semibold text-[var(--deshazo-text)]">Join Email Notifications</p>
                {notificationEmails.length > 0 && (
                  <p className="text-[12px] text-[rgba(21,24,33,0.45)]">{notificationEmails.length} subscriber{notificationEmails.length !== 1 ? 's' : ''}</p>
                )}
              </span>
            </button>
          </div>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-[var(--deshazo-border)] bg-white shadow-[0_18px_40px_-34px_rgba(47,86,166,0.2)]">
            <div className="border-b border-[var(--deshazo-border)] px-4 pt-3">
              <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-t-[8px] px-4 py-2 text-[15px] font-bold transition ${
                      activeTab === tab.id
                        ? 'bg-[#dbe5ff] text-[var(--deshazo-text)]'
                        : 'text-[rgba(21,24,33,0.72)] hover:bg-[var(--deshazo-surface)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
              {loading ? (
                <div className="space-y-3">
                  <div className="h-12 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                  <div className="h-12 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                  <div className="h-12 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                </div>
              ) : activeTab === 'issues' ? (
                <div className="space-y-4">
                  {/* Recurring Issues carousel */}
                  <div>
                    <h2 className="mb-5 text-[15px] font-bold text-[var(--deshazo-text)]">Recurring Issues</h2>
                    <div className="mt-3 flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
                      {recurringIssuesLoading ? (
                        <div className="flex gap-3">
                          {[...Array(4)].map((_, i) => (
                            <div key={i} className="h-[110px] w-[155px] animate-pulse rounded-[12px] bg-[var(--deshazo-surface)]" />
                          ))}
                        </div>
                      ) : recurringIssues.length === 0 ? (
                        <p className="text-[13px] text-[rgba(21,24,33,0.45)]">No recurring issues found.</p>
                      ) : recurringIssues.map((item) => (
                        <div
                          key={item.category_display_name}
                          className="group relative flex shrink-0 flex-col justify-between overflow-hidden rounded-[12px] border border-red-200 bg-white w-[155px] shadow-[0_8px_28px_-16px_rgba(220,38,38,0.18)] transition hover:shadow-[0_12px_32px_-12px_rgba(220,38,38,0.28)] hover:-translate-y-0.5"
                        >
                          <div className="h-1 w-full bg-gradient-to-r from-red-500 to-red-400" />
                          <div className="px-3 py-3">
                            <p className="text-[28px] font-black leading-none tracking-tight text-red-500">
                              {item.occurrences}
                            </p>
                            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-red-400">
                              occurrences
                            </p>
                            <div className="my-2 h-px bg-red-100" />
                            <p className="text-[13px] font-bold text-[var(--deshazo-text)] capitalize">{item.category_display_name}</p>
                            <p className="mt-0.5 text-[11px] text-[rgba(21,24,33,0.45)]">past 12 months</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Issues table */}
                  <div className="overflow-hidden rounded-[8px] border border-[var(--deshazo-border)]">
                  <div className="overflow-x-auto">
                    <table className="min-w-full table-fixed border-collapse">
                      <thead className="bg-[#f4f5f7]">
                        <tr className="text-left">
                          <th className="w-[23%] px-4 py-3 text-[15px] font-bold text-[var(--deshazo-text)]">Category</th>
                          <th className="w-[17%] px-4 py-3 text-[15px] font-bold text-[var(--deshazo-text)]">Safety category</th>
                          <th className="w-[16%] px-4 py-3 text-[15px] font-bold text-[var(--deshazo-text)]">Inspection date</th>
                          <th className="w-[11%] px-4 py-3 text-[15px] font-bold text-[var(--deshazo-text)]">Component</th>
                          <th className="w-[33%] px-4 py-3 text-[15px] font-bold text-[var(--deshazo-text)]">Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredIssues.length > 0 ? (
                          filteredIssues.map((issue, index) => (
                            <AssetIssueRow
                              key={`${issue.category}-${issue.component_type}-${index}`}
                              issue={issue}
                              index={index}
                              onClick={() => void handleIssueRowClick(issue)}
                            />
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="px-4 py-12 text-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                              No open issues available for this filter.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--deshazo-border)] px-4 py-3">
                    <div className="text-[15px] font-medium text-[rgba(21,24,33,0.6)]">
                      {filteredIssues.length} results
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setFilterOpen((open) => !open)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white text-[16px] text-[var(--deshazo-blue)] hover:bg-[var(--deshazo-surface)]"
                        aria-label="Filter issues"
                        title="Filter issues"
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          className="h-4.5 w-4.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 6h16l-6.5 7.4v4.6l-3 1.5v-6.1z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadIssues}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white text-[16px] text-[var(--deshazo-blue)] hover:bg-[var(--deshazo-surface)]"
                        aria-label="Download issues"
                        title="Download issues"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={handleRefreshIssues}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white text-[16px] text-[var(--deshazo-blue)] hover:bg-[var(--deshazo-surface)]"
                        aria-label="Refresh issues"
                        title="Refresh issues"
                      >
                        ↻
                      </button>
                    </div>
                  </div>
                  {filterOpen ? (
                    <div className="border-t border-[var(--deshazo-border)] bg-white px-4 py-4">
                      <div className="rounded-[8px] border border-[var(--deshazo-border)] bg-white shadow-[0_16px_28px_-24px_rgba(47,86,166,0.3)]">
                        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--deshazo-border)] px-4 py-3">
                          <span className="text-[14px] font-bold text-[var(--deshazo-text)]">Where</span>
                          <select
                            value={filterField}
                            onChange={(event) => setFilterField(event.target.value as FilterField)}
                            className="h-10 rounded-md border border-[var(--deshazo-border)] bg-white px-3 text-[14px] font-medium text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]"
                          >
                            {filterFieldOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <div className="flex h-10 items-center rounded-md border border-[var(--deshazo-border)] bg-[#f8f9fb] px-3 text-[14px] font-medium text-[rgba(21,24,33,0.65)]">
                            includes
                          </div>
                          <input
                            value={filterValue}
                            onChange={(event) => setFilterValue(event.target.value)}
                            placeholder="Type to filter"
                            className="h-10 min-w-[220px] flex-1 rounded-md border border-[#f53822] px-3 text-[14px] font-medium text-[var(--deshazo-text)] outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setFilterOpen(false)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-[22px] leading-none text-[rgba(21,24,33,0.5)] hover:bg-[var(--deshazo-surface)]"
                            aria-label="Close filter"
                          >
                            ×
                          </button>
                        </div>
                        <div className="flex items-center justify-between px-4 py-3">
                          {/* <button
                            type="button"
                            className="text-[14px] font-bold text-[rgba(21,24,33,0.65)] hover:text-[var(--deshazo-text)]"
                          >
                            + Add
                          </button> */}
                          <button
                            type="button"
                            onClick={clearFilter}
                            className="text-[14px] font-bold text-[#f53822] hover:opacity-80"
                          >
                            Clear filter
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  </div>
                </div>
              ) : activeTab === 'info' ? (
                <div className="overflow-hidden rounded-[8px] border border-[var(--deshazo-border)]">
                  <table className="min-w-full border-collapse">
                    <thead className="bg-[#f4f5f7]">
                      <tr className="text-left">
                        <th className="w-[40%] px-4 py-3 text-[15px] font-bold text-[var(--deshazo-text)]">Key</th>
                        <th className="px-4 py-3 text-[15px] font-bold text-[var(--deshazo-text)]">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-[var(--deshazo-border)]">
                        <td className="px-4 py-3 text-[15px] font-semibold text-[var(--deshazo-text)]">Name</td>
                        <td className="px-4 py-3 text-[15px] font-medium text-[var(--deshazo-text)]">{assetInfo.unit_name || 'Not available'}</td>
                      </tr>
                      {wabashIdentifier ? (
                        <tr className="border-t border-[var(--deshazo-border)]">
                          <td className="px-4 py-3 text-[15px] font-semibold text-[var(--deshazo-text)]">Unique Wabash Identifier</td>
                          <td className="px-4 py-3 text-[15px] font-medium tracking-wide text-[var(--deshazo-text)]">{wabashIdentifier}</td>
                        </tr>
                      ) : null}
                      <tr className="border-t border-[var(--deshazo-border)]">
                        <td className="px-4 py-3 text-[15px] font-semibold text-[var(--deshazo-text)]">Location</td>
                        <td className="px-4 py-3 text-[15px] font-medium text-[var(--deshazo-text)]">{assetInfo.unit_location || 'Not available'}</td>
                      </tr>
                      <tr className="border-t border-[var(--deshazo-border)]">
                        <td className="px-4 py-3 text-[15px] font-semibold text-[var(--deshazo-text)]">Internal Location</td>
                        <td className="px-4 py-3 text-[15px] font-medium text-[var(--deshazo-text)]">{assetInfo.unit_internal_location || 'Not available'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : activeTab === 'documents' || activeTab === 'repair' ? (
                <section className="flex h-full min-h-0 flex-col rounded-[18px] border border-[var(--deshazo-border)] bg-white/75 p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.16)] sm:p-5">
                  {documentsError ? (
                    <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {documentsError}
                    </div>
                  ) : null}

                  <div className="mb-5 flex flex-wrap items-center justify-between gap-4 text-sm font-semibold text-[rgba(21,24,33,0.68)]">
                    {activeTab === 'documents' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={documentsPage === 1}
                          onClick={() => setDocumentsPage((page) => Math.max(1, page - 1))}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white text-[var(--deshazo-blue)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          ‹
                        </button>
                        {visibleDocumentPages.map((page, index) => {
                          const previousPage = visibleDocumentPages[index - 1]
                          const showEllipsis = previousPage && page - previousPage > 1

                          return (
                            <div key={page} className="flex items-center gap-2">
                              {showEllipsis ? <span className="px-1 text-[rgba(21,24,33,0.45)]">...</span> : null}
                              <button
                                type="button"
                                onClick={() => setDocumentsPage(page)}
                                className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 ${
                                  page === documentsPage
                                    ? 'bg-[var(--deshazo-blue)] text-white'
                                    : 'border border-[var(--deshazo-border)] bg-white text-[var(--deshazo-text)]'
                                }`}
                              >
                                {page}
                              </button>
                            </div>
                          )
                        })}
                        <button
                          type="button"
                          disabled={documentsPage >= documentsTotalPages}
                          onClick={() => setDocumentsPage((page) => Math.min(documentsTotalPages, page + 1))}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white text-[var(--deshazo-blue)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          ›
                        </button>
                        <span className="ml-2 text-[13px] font-bold text-[rgba(21,24,33,0.55)]">
                          {inspectionDocuments.length} reports
                        </span>
                      </div>
                    ) : null}

                    <div />
                  </div>

                  <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(320px,430px)_minmax(0,1fr)]">
                    <div className="min-h-0 space-y-4 overflow-y-auto pr-2">
                      {documentsLoading ? (
                        Array.from({ length: activeTab === 'documents' ? PREVENTATIVE_REPORTS_PAGE_SIZE : (assetDocuments.page_size || defaultAssetDocuments.page_size) }).map((_, index) => (
                          <div
                            key={index}
                            className="rounded-[18px] border border-[var(--deshazo-border)] bg-white px-4 py-4 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.35)]"
                          >
                            <div className="mb-5 h-5 w-36 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                            <div className="mb-3 h-6 w-24 animate-pulse rounded-full bg-[var(--deshazo-surface)]" />
                            <div className="h-5 w-40 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                          </div>
                        ))
                      ) : currentDocumentList.length === 0 ? (
                        <div className="flex min-h-[520px] items-center justify-center rounded-[18px] border border-dashed border-[var(--deshazo-border)] bg-white text-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                          No reports available
                        </div>
                      ) : (
                        pagedDocumentList.map((document) => {
                          const documentKey = getDocumentKey(document)
                          const isActive = selectedDocument ? getDocumentKey(selectedDocument) === documentKey : false
                          const repairPdfLoading = 'pdfLoading' in document && document.pdfLoading

                          return (
                            <button
                              key={documentKey}
                              type="button"
                              onClick={() => setSelectedDocumentUrl(documentKey)}
                              className={`w-full rounded-[18px] border bg-white px-4 py-4 text-left shadow-[0_12px_30px_-28px_rgba(47,86,166,0.35)] transition ${
                                isActive
                                  ? 'border-[var(--deshazo-blue)] shadow-[0_18px_32px_-24px_rgba(47,86,166,0.36)]'
                                  : 'border-[var(--deshazo-border)] hover:border-[var(--deshazo-blue-soft)]'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="break-words text-[18px] font-bold leading-tight text-[var(--deshazo-blue)]">
                                    {document.display_name}
                                  </p>
                                  <span className="mt-3 inline-flex rounded-full bg-[#dff6e6] px-2.5 py-1 text-[12px] font-semibold text-[#4a9960]">
                                    {formatTitleCase(document.type)}
                                  </span>
                                  {repairPdfLoading ? (
                                    <span className="ml-2 mt-3 inline-flex rounded-full bg-[var(--deshazo-surface)] px-2.5 py-1 text-[12px] font-semibold text-[rgba(21,24,33,0.55)]">
                                      Drafting PDF
                                    </span>
                                  ) : null}
                                </div>
                                <p className="w-[92px] shrink-0 text-right text-sm font-semibold text-[rgba(21,24,33,0.72)]">
                                  {formatDisplayDate(document.inspection_date)}
                                </p>
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>

                    <div className="relative flex min-h-0 flex-col overflow-hidden rounded-[18px] border border-[var(--deshazo-border)] bg-white shadow-[0_12px_30px_-28px_rgba(47,86,166,0.35)]">
                      {selectedDocument ? (
                        <>
                          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--deshazo-border)] bg-white px-4 py-3">
                            <p className="min-w-0 truncate text-sm font-bold text-[var(--deshazo-text)]">
                              {selectedDocument.display_name}
                            </p>
                            {activeTab === 'documents' && selectedInspectionDocument ? (
                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setInspectionPreviewZoom((zoom) => Math.max(0.7, Number((zoom - 0.1).toFixed(2))))}
                                  disabled={inspectionPreviewZoom <= 0.7}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white text-[16px] font-black text-[var(--deshazo-blue)] transition hover:bg-[var(--deshazo-surface)] disabled:cursor-not-allowed disabled:opacity-40"
                                  aria-label="Zoom out"
                                  title="Zoom out"
                                >
                                  −
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setInspectionPreviewZoom((zoom) => Math.min(1.6, Number((zoom + 0.1).toFixed(2))))}
                                  disabled={inspectionPreviewZoom >= 1.6}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white text-[16px] font-black text-[var(--deshazo-blue)] transition hover:bg-[var(--deshazo-surface)] disabled:cursor-not-allowed disabled:opacity-40"
                                  aria-label="Zoom in"
                                  title="Zoom in"
                                >
                                  +
                                </button>
                                <a
                                  href={`/deshazo-external-reports?workOrderId=${encodeURIComponent(selectedInspectionDocument.report.workOrderId)}&dNumber=${encodeURIComponent(
                                    extractDocumentNumber(assetInfo.unit_name, unitId) || unitId,
                                  )}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex h-8 items-center rounded-lg border border-[var(--deshazo-border)] bg-white px-3 text-xs font-bold text-[var(--deshazo-blue)] transition hover:bg-[var(--deshazo-surface)]"
                                >
                                  Open report page
                                </a>
                                <button
                                  type="button"
                                  onClick={() => { void handleDownloadSelectedInspectionReport() }}
                                  disabled={inspectionDownloadBusy}
                                  className="inline-flex h-8 items-center rounded-md bg-[var(--deshazo-blue)] px-3 text-xs font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                  {inspectionDownloadBusy ? 'Downloading' : 'Download'}
                                </button>
                              </div>
                            ) : selectedDocument.pdf ? (
                              <a
                                href={selectedDocument.pdf}
                                download={selectedDocumentDownloadName}
                                className="shrink-0 rounded-md bg-[var(--deshazo-blue)] px-3 py-2 text-xs font-bold text-white transition hover:opacity-90"
                              >
                                Download
                              </a>
                            ) : null}
                          </div>
                          {activeTab === 'documents' && selectedInspectionDocument ? (
                            <div className="flex h-full min-h-0 flex-col overflow-hidden">
                              <GeneratedInspectionReportPreview
                                key={`${selectedInspectionDocument.report.workOrderId}-${selectedInspectionDocument.craneIndex}`}
                                report={selectedInspectionDocument.report}
                                selectedCraneIndex={selectedInspectionDocument.craneIndex}
                                zoom={inspectionPreviewZoom}
                              />
                            </div>
                          ) : selectedDocument.pdf ? (
                            <iframe
                              key={selectedDocument.pdf}
                              src={selectedDocument.pdf}
                              title={selectedDocument.display_name}
                              className="h-full min-h-[420px] w-full border-0"
                            />
                          ) : (
                            <div className="flex h-full min-h-[420px] items-center justify-center bg-[linear-gradient(180deg,rgba(238,243,255,0.3)_0%,rgba(255,255,255,1)_100%)] px-6 text-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                              {selectedRepairDocument?.pdfError
                                ? selectedRepairDocument.pdfError
                                : 'Drafting PDF preview...'}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex h-full min-h-[460px] items-center justify-center bg-[linear-gradient(180deg,rgba(238,243,255,0.3)_0%,rgba(255,255,255,1)_100%)] px-6 text-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                          Select a report to preview the PDF.
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              ) : activeTab === 'notes' ? (
                <section className="space-y-5">
                  <div className="rounded-[14px] border border-[var(--deshazo-border)] bg-white p-5 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.16)]">
                    <h2 className="mb-3 text-[16px] font-bold text-[var(--deshazo-text)]">Add a note</h2>
                    <textarea
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="Write a note..."
                      rows={4}
                      className="w-full resize-none rounded-[10px] border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] px-4 py-3 text-[15px] font-medium text-[var(--deshazo-text)] placeholder-[rgba(21,24,33,0.35)] outline-none focus:border-[var(--deshazo-blue)]"
                    />
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={handleAddNote}
                        disabled={!noteInput.trim() || noteSaving}
                        className="inline-flex items-center rounded-xl bg-[var(--deshazo-blue)] px-5 py-2.5 text-[14px] font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {noteSaving ? 'Saving...' : 'Add note'}
                      </button>
                    </div>
                    {notesError ? (
                      <p className="mt-3 text-sm font-semibold text-[#c94b2c]">{notesError}</p>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    {notesLoading ? (
                      <div className="flex min-h-[200px] items-center justify-center rounded-[14px] border border-dashed border-[var(--deshazo-border)] bg-white text-sm font-semibold text-[rgba(21,24,33,0.4)]">
                        Loading notes...
                      </div>
                    ) : notes.length === 0 ? (
                      <div className="flex min-h-[200px] items-center justify-center rounded-[14px] border border-dashed border-[var(--deshazo-border)] bg-white text-sm font-semibold text-[rgba(21,24,33,0.4)]">
                        No notes yet. Add the first one above.
                      </div>
                    ) : (
                      notes.map((note) => (
                        <div
                          key={note.id}
                          className="rounded-[14px] border border-[var(--deshazo-border)] bg-white px-5 py-4 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.2)]"
                        >
                          <p className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-[var(--deshazo-text)]">
                            {note.text}
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--deshazo-blue)] text-[11px] font-extrabold text-white">
                              {note.authorName.split(' ').slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')}
                            </div>
                            <span className="text-[13px] font-semibold text-[var(--deshazo-text)]">{note.authorName}</span>
                            <span className="text-[13px] text-[rgba(21,24,33,0.45)]">{note.authorEmail}</span>
                            <span className="ml-auto text-[13px] text-[rgba(21,24,33,0.45)]">{formatNoteTimestamp(note.createdAt)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              ) : activeTab === 'analytics' ? (
                <section className="space-y-6">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[
                      { label: 'Total Open Issues', value: String(analytics.totalIssues), color: 'text-[var(--deshazo-blue)]' },
                      { label: 'Safety Issues', value: String(analytics.safetyCount), color: 'text-[#e05c3a]' },
                      { label: 'Monitor Issues', value: String(analytics.monitorCount), color: 'text-[#b27d00]' },
                      { label: 'Avg Age (days)', value: String(analytics.averageAgeDays), color: 'text-[#4a9960]' },
                    ].map((card) => (
                      <div key={card.label} className="rounded-[14px] border border-[var(--deshazo-border)] bg-white px-5 py-4 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.2)]">
                        <p className="text-[13px] font-semibold text-[rgba(21,24,33,0.5)]">{card.label}</p>
                        <p className={`mt-1 text-[32px] font-black tracking-tight ${card.color}`}>{card.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-[14px] border border-[var(--deshazo-border)] bg-white px-5 py-5 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.2)]">
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-[15px] font-bold text-[var(--deshazo-text)]">Safety vs Monitor Over Time</h3>
                          <p className="mt-1 text-[13px] text-[rgba(21,24,33,0.5)]">Monthly open-issue mix for this asset based on inspection dates.</p>
                        </div>
                        <div className="rounded-full bg-[var(--deshazo-surface)] px-3 py-1 text-[12px] font-semibold text-[rgba(21,24,33,0.6)]">
                          Latest inspection: {analytics.latestInspectionLabel}
                        </div>
                      </div>
                      {analytics.issuesOverTime.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                          <BarChart data={analytics.issuesOverTime} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" />
                            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6b7280' }} />
                            <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />
                            <Tooltip contentStyle={{ borderRadius: 10, fontSize: 13 }} />
                            <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 13 }} />
                            <Bar dataKey="safety" name="Safety" stackId="issues" fill="#e05c3a" radius={[6, 6, 0, 0]} />
                            <Bar dataKey="monitor" name="Monitor" stackId="issues" fill="#f2b43f" radius={[6, 6, 0, 0]} />
                            <Bar dataKey="other" name="Other" stackId="issues" fill="#4a9960" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-[240px] items-center justify-center rounded-[12px] bg-[var(--deshazo-surface)]/55 text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                          No dated issues available for time-based analytics.
                        </div>
                      )}
                    </div>

                    <div className="rounded-[14px] border border-[var(--deshazo-border)] bg-white px-5 py-5 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.2)]">
                      <h3 className="mb-4 text-[15px] font-bold text-[var(--deshazo-text)]">Issue Mix by Safety Classification</h3>
                      {analytics.safetyBreakdown.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                          <PieChart>
                            <Pie
                              data={analytics.safetyBreakdown}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={95}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {analytics.safetyBreakdown.map((_, i) => (
                                <Cell key={i} fill={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: 10, fontSize: 13 }} />
                            <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 13 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-[240px] items-center justify-center rounded-[12px] bg-[var(--deshazo-surface)]/55 text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                          No safety classification data available.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-[14px] border border-[var(--deshazo-border)] bg-white px-5 py-5 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.2)]">
                      <h3 className="mb-4 text-[15px] font-bold text-[var(--deshazo-text)]">Issue Volume Trend</h3>
                      {analytics.issuesOverTime.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                          <LineChart data={analytics.issuesOverTime} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" />
                            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6b7280' }} />
                            <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />
                            <Tooltip contentStyle={{ borderRadius: 10, fontSize: 13 }} />
                            <Line type="monotone" dataKey="total" name="Total Issues" stroke="#2f56a6" strokeWidth={2.5} dot={{ r: 4, fill: '#2f56a6' }} activeDot={{ r: 6 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-[240px] items-center justify-center rounded-[12px] bg-[var(--deshazo-surface)]/55 text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                          No issue trend is available yet.
                        </div>
                      )}
                    </div>

                    <div className="rounded-[14px] border border-[var(--deshazo-border)] bg-white px-5 py-5 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.2)]">
                      <h3 className="mb-4 text-[15px] font-bold text-[var(--deshazo-text)]">Issues by Category</h3>
                      {analytics.issuesByCategory.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                          <BarChart data={analytics.issuesByCategory} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" />
                            <XAxis dataKey="category" tick={{ fontSize: 12, fill: '#6b7280' }} />
                            <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />
                            <Tooltip contentStyle={{ borderRadius: 10, fontSize: 13 }} />
                            <Bar dataKey="count" name="Issues" radius={[6, 6, 0, 0]}>
                              {analytics.issuesByCategory.map((_, i) => (
                                <Cell key={i} fill={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-[240px] items-center justify-center rounded-[12px] bg-[var(--deshazo-surface)]/55 text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                          No category data available.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                    <div className="rounded-[14px] border border-[var(--deshazo-border)] bg-white px-5 py-5 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.2)]">
                      <h3 className="mb-4 text-[15px] font-bold text-[var(--deshazo-text)]">Most Affected Components</h3>
                      {analytics.issuesByComponent.length > 0 ? (
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={analytics.issuesByComponent} layout="vertical" margin={{ top: 0, right: 8, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} />
                            <YAxis type="category" dataKey="component" tick={{ fontSize: 12, fill: '#6b7280' }} width={100} />
                            <Tooltip contentStyle={{ borderRadius: 10, fontSize: 13 }} />
                            <Bar dataKey="count" name="Issues" radius={[0, 6, 6, 0]}>
                              {analytics.issuesByComponent.map((_, i) => (
                                <Cell key={i} fill={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-[260px] items-center justify-center rounded-[12px] bg-[var(--deshazo-surface)]/55 text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                          No component trend data available.
                        </div>
                      )}
                    </div>

                    <div className="rounded-[14px] border border-[var(--deshazo-border)] bg-white px-5 py-5 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.2)]">
                      <h3 className="mb-4 text-[15px] font-bold text-[var(--deshazo-text)]">Recurring Patterns</h3>
                      <div className="space-y-3">
                        {analytics.recurringPatterns.length > 0 ? (
                          analytics.recurringPatterns.map((pattern) => (
                            <div
                              key={pattern.label}
                              className="flex items-center justify-between rounded-[12px] border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)]/45 px-4 py-3"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-[14px] font-bold text-[var(--deshazo-text)]">{pattern.label}</p>
                                <p className="mt-1 text-[12px] text-[rgba(21,24,33,0.48)]">Repeated issue pattern on this asset</p>
                              </div>
                              <div className="ml-4 shrink-0 rounded-full bg-white px-3 py-1 text-[12px] font-bold text-[var(--deshazo-blue)] shadow-[0_10px_20px_-18px_rgba(47,86,166,0.45)]">
                                {pattern.count} issue{pattern.count === 1 ? '' : 's'}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="flex h-[260px] items-center justify-center rounded-[12px] bg-[var(--deshazo-surface)]/55 text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                            No recurring patterns available yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          </section>
        </section>
      </main>

      {/* Issue Report PDF Modal */}
      {issueReportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6" onClick={() => setIssueReportOpen(false)}>
          <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.4)]" style={{ height: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--deshazo-border)] px-5 py-4">
              <div>
                <h2 className="text-[16px] font-black text-[var(--deshazo-text)]">Inspection Report</h2>
                <p className="text-[12px] text-[rgba(21,24,33,0.45)]">
                  {extractDocumentNumber(selectedIssue?.remarks, assetInfo.unit_name, unitId) || 'No D number'}
                  {' · '}
                  {assetInfo.unit_name || 'Asset'}
                  {' · '}
                  {selectedIssue ? formatDisplayDate(selectedIssue.inspection_date) : 'Not available'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIssueReportOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[20px] text-[rgba(21,24,33,0.4)] transition hover:bg-[var(--deshazo-surface)] hover:text-[var(--deshazo-text)]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {issueReportLoading ? (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                Building the matching inspection report from Supabase...
              </div>
            ) : issueReportError ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-base font-bold text-[var(--deshazo-text)]">Matching inspection report not available</p>
                <p className="max-w-xl text-sm font-medium text-[rgba(21,24,33,0.55)]">{issueReportError}</p>
              </div>
            ) : selectedIssueMatch ? (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-[var(--deshazo-border)] px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--deshazo-blue)]">
                      {selectedIssueMatch.report.summary?.jobNo ||
                        selectedIssueMatch.report.summary?.salesOrderNo ||
                        selectedIssueMatch.report.jobNo ||
                        selectedIssueMatch.report.workOrderId}
                    </p>
                    <p className="text-xs text-[rgba(21,24,33,0.45)]">
                      Generated from synced Supabase inspection report data.
                    </p>
                  </div>
                  <a
                    href={`/deshazo-external-reports?workOrderId=${encodeURIComponent(selectedIssueMatch.report.workOrderId)}&dNumber=${encodeURIComponent(
                      extractDocumentNumber(selectedIssue?.remarks, assetInfo.unit_name, unitId) || unitId,
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-lg border border-[var(--deshazo-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--deshazo-blue)] transition hover:bg-[var(--deshazo-surface)]"
                  >
                    Open report page
                  </a>
                </div>
                <GeneratedInspectionReportPreview
                  key={`${selectedIssueMatch.report.workOrderId}-${selectedIssueMatch.craneIndex}`}
                  report={selectedIssueMatch.report}
                  selectedCraneIndex={selectedIssueMatch.craneIndex}
                  zoom={1}
                />
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                No report selected.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Email Notifications Modal */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setEmailModalOpen(false)}>
          <div className="w-full max-w-md rounded-[18px] bg-white p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.3)]" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-[18px] font-black text-[var(--deshazo-text)]">Email Notifications</h2>
            <p className="mb-5 text-[13px] text-[rgba(21,24,33,0.5)]">Add emails and choose what they get notified about.</p>

            {/* Add email input */}
            <div className="flex gap-2">
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => { setEmailDraft(e.target.value); setEmailError('') }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleAddNotificationEmail()
                  }
                }}
                placeholder="name@example.com"
                className="flex-1 rounded-[10px] border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] px-4 py-2.5 text-[14px] text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]"
                autoFocus
              />
              <button
                type="button"
                onClick={() => { void handleAddNotificationEmail() }}
                disabled={notificationEmailsLoading || Boolean(notificationSavingEmail)}
                className="rounded-[10px] bg-[var(--deshazo-blue)] px-4 py-2.5 text-[14px] font-bold text-white transition hover:opacity-90"
              >
                Add
              </button>
            </div>
            {emailError && <p className="mt-2 text-[12px] font-semibold text-red-500">{emailError}</p>}

            {/* Subscriber list */}
            <div className="mt-4 space-y-2 max-h-[300px] overflow-y-auto">
              {notificationEmailsLoading ? (
                <p className="rounded-[10px] border border-dashed border-[var(--deshazo-border)] py-6 text-center text-[13px] font-semibold text-[rgba(21,24,33,0.4)]">
                  Loading subscribers...
                </p>
              ) : notificationEmails.length === 0 ? (
                <p className="rounded-[10px] border border-dashed border-[var(--deshazo-border)] py-6 text-center text-[13px] font-semibold text-[rgba(21,24,33,0.4)]">
                  No subscribers yet
                </p>
              ) : (
                notificationEmails.map((sub) => (
                  <div key={sub.email} className="rounded-[10px] border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--deshazo-blue)] text-[11px] font-extrabold text-white">
                          {sub.email[0].toUpperCase()}
                        </div>
                        <span className="text-[14px] font-medium text-[var(--deshazo-text)]">{sub.email}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { void handleRemoveNotificationEmail(sub.email) }}
                        disabled={notificationSavingEmail === sub.email}
                        className="ml-2 text-[18px] leading-none text-[rgba(21,24,33,0.35)] transition hover:text-red-500"
                        aria-label="Remove"
                      >
                        {notificationSavingEmail === sub.email ? '…' : '×'}
                      </button>
                    </div>
                    {/* Notification type toggles */}
                    <div className="mt-2.5 flex gap-2">
                      <button
                        type="button"
                        onClick={() => { void handleToggleNotificationEmail(sub.email, 'newReports') }}
                        disabled={notificationSavingEmail === sub.email}
                        className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${sub.newReports ? 'bg-[var(--deshazo-blue)] text-white' : 'border border-[var(--deshazo-border)] bg-white text-[rgba(21,24,33,0.5)]'}`}
                      >
                        New Reports
                      </button>
                      <button
                        type="button"
                        onClick={() => { void handleToggleNotificationEmail(sub.email, 'repairDone') }}
                        disabled={notificationSavingEmail === sub.email}
                        className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${sub.repairDone ? 'bg-[#4a9960] text-white' : 'border border-[var(--deshazo-border)] bg-white text-[rgba(21,24,33,0.5)]'}`}
                      >
                        Repair Completed
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setEmailModalOpen(false)}
                className="rounded-xl bg-[var(--deshazo-blue)] px-5 py-2.5 text-[14px] font-bold text-white transition hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wabash Identifier Modal */}
      {wabashModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setWabashModalOpen(false)}>
          <div className="w-full max-w-md rounded-[18px] bg-white p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.3)]" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-[18px] font-black text-[var(--deshazo-text)]">Unique Wabash Identifier</h2>
            <p className="mb-5 text-[13px] text-[rgba(21,24,33,0.5)]">Edit the identifier string for this asset. This is shared across all users for the same unit.</p>
            <input
              type="text"
              value={wabashDraft}
              onChange={(e) => setWabashDraft(e.target.value)}
              className="w-full rounded-[10px] border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] px-4 py-3 text-[15px] font-bold tracking-wide text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]"
              autoFocus
            />
            {wabashError ? (
              <p className="mt-3 text-sm font-semibold text-[#c94b2c]">{wabashError}</p>
            ) : null}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setWabashModalOpen(false)}
                className="rounded-xl border border-[var(--deshazo-border)] px-5 py-2.5 text-[14px] font-bold text-[rgba(21,24,33,0.6)] transition hover:bg-[var(--deshazo-surface)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveWabashIdentifier()}
                disabled={!wabashDraft.trim() || wabashSaving}
                className="rounded-xl bg-[var(--deshazo-blue)] px-5 py-2.5 text-[14px] font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {wabashSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
