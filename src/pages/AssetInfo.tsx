import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, RadarChart, Radar,
  PolarGrid, PolarAngleAxis,
} from 'recharts'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { supabase, isConfigured } from '../lib/supabase'
import { usePortalMenu } from '../lib/usePortalMenu'
import {
  getAssetInfo,
  getAssetPDF,
  isPortalApiConfigured,
  type AssetPdfResponse,
  type AssetInfoAnalytics,
  type AssetIssue,
} from '../lib/portalApi'

const menuItems = [
  { label: 'Home', href: '/dashboard' },
  { label: 'Open Risk Items', href: '/asset-fleet-assets?view=open-risk' },
  { label: 'Asset Fleet', href: '/asset-fleet' },
  { label: 'Spend', href: '/spend' },
  { label: 'Location Comparison', href: '/location-comparison' },
  { label: 'Documents & Reports', href: '/documents-reports' },
  { label: 'Add User', href: '/add-user' },
  { label: 'Contact Us', href: '/contact-us' },
]

type AssetInfoTab = 'issues' | 'info' | 'documents' | 'repair' | 'below-hook' | 'notes' | 'analytics'

const ANALYTICS_COLORS = ['#2f56a6', '#f2b43f', '#e05c3a', '#4a9960', '#7b44c7', '#355fb4']

const mockIssuesByCategory = [
  { category: 'Structural', count: 14 },
  { category: 'Electrical', count: 9 },
  { category: 'Hydraulic', count: 7 },
  { category: 'Mechanical', count: 11 },
  { category: 'Controls', count: 5 },
  { category: 'Rigging', count: 3 },
]

const mockIssuesBySafety = [
  { name: 'Safety', value: 12 },
  { name: 'Monitor', value: 21 },
  { name: 'Routine', value: 16 },
]

const mockIssuesByComponent = [
  { component: 'Hoist', count: 18 },
  { component: 'Monorail', count: 11 },
  { component: 'Bridge', count: 8 },
  { component: 'Trolley', count: 6 },
  { component: 'End Truck', count: 4 },
  { component: 'Pendant', count: 2 },
]

const mockIssuesTrend = [
  { month: 'Nov', issues: 6 },
  { month: 'Dec', issues: 9 },
  { month: 'Jan', issues: 7 },
  { month: 'Feb', issues: 13 },
  { month: 'Mar', issues: 10 },
  { month: 'Apr', issues: 4 },
]

const mockRecurringIssues = [
  { component: 'Gears', failures: 5 },
  { component: 'Hoist Brake', failures: 4 },
  { component: 'End Truck Wheels', failures: 4 },
  { component: 'Limit Switch', failures: 3 },
  { component: 'Wire Rope', failures: 3 },
  { component: 'Pendant Control', failures: 2 },
  { component: 'Monorail Track', failures: 2 },
  { component: 'Trolley Frame', failures: 1 },
]

const mockRiskRadar = [
  { subject: 'Structural', score: 72 },
  { subject: 'Electrical', score: 55 },
  { subject: 'Hydraulic', score: 40 },
  { subject: 'Mechanical', score: 68 },
  { subject: 'Controls', score: 33 },
  { subject: 'Rigging', score: 20 },
]

type AssetNote = {
  id: string
  text: string
  authorName: string
  authorEmail: string
  timestamp: string
}
type FilterField = 'category' | 'safety_category' | 'inspection_date' | 'component_type' | 'remarks'

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

const formatTitleCase = (value?: string) =>
  value
    ? value
        .split(/[\s_]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : 'Not available'

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

function AssetIssueRow({ issue, index, onClick }: { issue: AssetIssue; index: number; onClick: () => void }) {
  return (
    <tr onClick={onClick} className={`cursor-pointer transition hover:bg-[#dbe5ff] ${index % 2 === 0 ? 'bg-[#f4f7ff]' : 'bg-white'}`}>
      <td className="px-4 py-3 align-top text-[15px] font-medium text-[var(--deshazo-text)]">
        {issue.category}
      </td>
      <td className="px-4 py-3 align-top">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[13px] font-bold ${getSafetyBadgeClass(issue.safety_category)}`}>
          {issue.safety_category}
        </span>
      </td>
      <td className="px-4 py-3 align-top text-[15px] font-medium text-[var(--deshazo-text)]">
        {formatDisplayDate(issue.inspection_date)}
      </td>
      <td className="px-4 py-3 align-top">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[13px] font-bold ${getComponentBadgeClass(issue.component_type)}`}>
          {formatTitleCase(issue.component_type)}
        </span>
      </td>
      <td className="px-4 py-3 align-top text-[15px] font-medium leading-snug text-[var(--deshazo-text)]">
        {issue.remarks}
      </td>
    </tr>
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
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [documentsError, setDocumentsError] = useState('')
  const [documentsPage, setDocumentsPage] = useState(1)
  const [selectedDocumentUrl, setSelectedDocumentUrl] = useState('')
  const [notes, setNotes] = useState<AssetNote[]>([])
  const [noteInput, setNoteInput] = useState('')
  const [wabashModalOpen, setWabashModalOpen] = useState(false)
  const [wabashIdentifier, setWabashIdentifier] = useState('CBHF829494030')
  const [wabashDraft, setWabashDraft] = useState('')
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [notificationEmails, setNotificationEmails] = useState<{ email: string; newReports: boolean; repairDone: boolean }[]>([])
  const [emailDraft, setEmailDraft] = useState('')
  const [emailError, setEmailError] = useState('')
  const [issueReportOpen, setIssueReportOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const unitId = searchParams.get('unit_id')?.trim() || ''
  const currentView = searchParams.get('view') === 'open-risk' ? 'open-risk' : 'asset-fleet'

  const activeMenuItems = useMemo(
    () =>
      menuItems.map((item) => ({
        ...item,
        active:
          currentView === 'open-risk'
            ? item.label === 'Open Risk Items'
            : item.label === 'Asset Fleet',
      })),
    [currentView],
  )

  const loadAssetInfo = async (signal?: AbortSignal) => {
    if (!unitId) {
      setLoading(false)
      setError('A unit id is required to load asset information.')
      setAssetInfo(defaultAssetInfo)
      return
    }

    try {
      setLoading(true)
      setError('')
      const data = await getAssetInfo(unitId, signal)
      setAssetInfo(data)
    } catch (err) {
      if (signal?.aborted) return
      setError(err instanceof Error ? err.message : 'Unable to load asset information.')
      setAssetInfo(defaultAssetInfo)
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
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
    const controller = new AbortController()
    loadAssetInfo(controller.signal)

    return () => controller.abort()
  }, [unitId])

  useEffect(() => {
    if (activeTab !== 'documents' && activeTab !== 'repair' && activeTab !== 'below-hook') {
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
        const data = await getAssetPDF(unitId, documentsPage, controller.signal)
        setAssetDocuments(data)
        setSelectedDocumentUrl((current) =>
          data.results.some((document) => document.pdf === current) ? current : (data.results[0]?.pdf ?? ''),
        )
      } catch (err) {
        if (controller.signal.aborted) return
        setDocumentsError(err instanceof Error ? err.message : 'Unable to load asset documents.')
        setAssetDocuments(defaultAssetDocuments)
        setSelectedDocumentUrl('')
      } finally {
        if (!controller.signal.aborted) {
          setDocumentsLoading(false)
        }
      }
    }

    loadDocuments()

    return () => controller.abort()
  }, [activeTab, unitId, documentsPage])

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

  const handleAddNote = () => {
    const text = noteInput.trim()
    if (!text || !user) return
    const newNote: AssetNote = {
      id: crypto.randomUUID(),
      text,
      authorName: fullName,
      authorEmail: user.email ?? '',
      timestamp: new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    }
    setNotes((prev) => [newNote, ...prev])
    setNoteInput('')
  }

  const tabs: Array<{ id: AssetInfoTab; label: string }> = [
    { id: 'issues', label: 'Open Issues' },
    { id: 'info', label: 'Asset Info' },
    { id: 'documents', label: 'Preventative Maintenance Reports' },
    { id: 'repair', label: 'Repair Reports' },
    { id: 'below-hook', label: 'Below the Hook Reports' },
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
    loadAssetInfo()
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

  const documentsTotalPages = Math.max(1, assetDocuments.total_pages || 1)
  const visibleDocumentPages = buildVisiblePages(documentsPage, documentsTotalPages)
  const selectedDocument =
    assetDocuments.results.find((document) => document.pdf === selectedDocumentUrl) ||
    assetDocuments.results[0] ||
    null

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
                        <span>{item.label}</span>
                        <span className="text-[12px] font-semibold text-[rgba(21,24,33,0.4)]" />
                      </Link>
                    ) : (
                      <button
                        key={item.label}
                        type="button"
                        className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-[15px] font-medium text-[rgba(21,24,33,0.7)] transition hover:bg-white"
                      >
                        <span>{item.label}</span>
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

        <section className="min-w-0 flex-1 px-5 py-5 sm:px-8 lg:px-10">
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

          {!isPortalApiConfigured && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Add `VITE_PORTAL_PARSE_REST_API_KEY` to load live asset information.
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Wabash identifier + email notification buttons */}
          <div className="mb-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => { setWabashDraft(wabashIdentifier); setWabashModalOpen(true) }}
              className="flex items-center gap-3 rounded-[10px] border border-[var(--deshazo-border)] bg-white px-4 py-3 text-left shadow-[0_4px_12px_-8px_rgba(47,86,166,0.15)] transition hover:border-[var(--deshazo-blue)] hover:bg-[var(--deshazo-surface)]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--deshazo-surface)] text-[16px]">✏️</span>
              <span>
                <p className="text-[13px] font-semibold text-[rgba(21,24,33,0.55)]">unique wabash identifier</p>
                <p className="text-[14px] font-bold tracking-wide text-[var(--deshazo-text)]">{wabashIdentifier}</p>
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setEmailDraft(''); setEmailError(''); setEmailModalOpen(true) }}
              className="flex items-center gap-3 rounded-[10px] border border-[var(--deshazo-border)] bg-white px-4 py-3 text-left shadow-[0_4px_12px_-8px_rgba(47,86,166,0.15)] transition hover:border-[var(--deshazo-blue)] hover:bg-[var(--deshazo-surface)]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--deshazo-surface)] text-[16px]">✉️</span>
              <span>
                <p className="text-[14px] font-semibold text-[var(--deshazo-text)]">join email notifications</p>
                {notificationEmails.length > 0 && (
                  <p className="text-[12px] text-[rgba(21,24,33,0.45)]">{notificationEmails.length} subscriber{notificationEmails.length !== 1 ? 's' : ''}</p>
                )}
              </span>
            </button>
          </div>

          <section className="overflow-hidden rounded-[14px] border border-[var(--deshazo-border)] bg-white shadow-[0_18px_40px_-34px_rgba(47,86,166,0.2)]">
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

            <div className="min-h-[640px] px-4 py-4">
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
                    <h2 className="mb-3 text-[15px] font-bold text-[var(--deshazo-text)]">Recurring Issues</h2>
                    <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
                      {mockRecurringIssues.map((item) => (
                        <div
                          key={item.component}
                          className="group relative flex shrink-0 flex-col justify-between overflow-hidden rounded-[12px] border border-red-200 bg-white w-[155px] shadow-[0_8px_28px_-16px_rgba(220,38,38,0.18)] transition hover:shadow-[0_12px_32px_-12px_rgba(220,38,38,0.28)] hover:-translate-y-0.5"
                        >
                          {/* red top accent bar */}
                          <div className="h-1 w-full bg-gradient-to-r from-red-500 to-red-400" />
                          <div className="px-3 py-3">
                            {/* failure count */}
                            <p className="text-[28px] font-black leading-none tracking-tight text-red-500">
                              {item.failures}
                            </p>
                            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-red-400">
                              failures
                            </p>
                            {/* divider */}
                            <div className="my-2 h-px bg-red-100" />
                            {/* component name */}
                            <p className="text-[13px] font-bold text-[var(--deshazo-text)]">{item.component}</p>
                            <p className="mt-0.5 text-[11px] text-[rgba(21,24,33,0.45)]">past 12 months</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Issues table */}
                  <div className="overflow-hidden rounded-[8px] border border-[var(--deshazo-border)]">
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse">
                      <thead className="bg-[#f4f5f7]">
                        <tr className="text-left">
                          <th className="px-4 py-3 text-[15px] font-bold text-[var(--deshazo-text)]">Category</th>
                          <th className="px-4 py-3 text-[15px] font-bold text-[var(--deshazo-text)]">Safety category</th>
                          <th className="px-4 py-3 text-[15px] font-bold text-[var(--deshazo-text)]">Inspection date</th>
                          <th className="w-[180px] px-4 py-3 text-[15px] font-bold text-[var(--deshazo-text)]">Component</th>
                          <th className="px-4 py-3 text-[15px] font-bold text-[var(--deshazo-text)]">Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredIssues.length > 0 ? (
                          filteredIssues.map((issue, index) => (
                            <AssetIssueRow key={`${issue.category}-${issue.component_type}-${index}`} issue={issue} index={index} onClick={() => setIssueReportOpen(true)} />
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
                        ▾
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
              ) : activeTab === 'documents' || activeTab === 'repair' || activeTab === 'below-hook' ? (
                <section className="rounded-[18px] border border-[var(--deshazo-border)] bg-white/75 p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.16)] sm:p-5">
                  {documentsError ? (
                    <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {documentsError}
                    </div>
                  ) : null}

                  <div className="mb-5 flex flex-wrap items-center justify-between gap-4 text-sm font-semibold text-[rgba(21,24,33,0.68)]">
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
                    </div>

                    <div />
                  </div>

                  <div className="grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
                    <div className="max-h-[720px] space-y-4 overflow-y-auto pr-2">
                      {documentsLoading ? (
                        Array.from({ length: assetDocuments.page_size || defaultAssetDocuments.page_size }).map((_, index) => (
                          <div
                            key={index}
                            className="rounded-[18px] border border-[var(--deshazo-border)] bg-white px-4 py-4 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.35)]"
                          >
                            <div className="mb-5 h-5 w-36 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                            <div className="mb-3 h-6 w-24 animate-pulse rounded-full bg-[var(--deshazo-surface)]" />
                            <div className="h-5 w-40 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                          </div>
                        ))
                      ) : assetDocuments.results.length === 0 ? (
                        <div className="flex min-h-[520px] items-center justify-center rounded-[18px] border border-dashed border-[var(--deshazo-border)] bg-white text-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                          No reports available
                        </div>
                      ) : (
                        assetDocuments.results.map((document) => {
                          const isActive = selectedDocument?.pdf === document.pdf

                          return (
                            <button
                              key={document.pdf}
                              type="button"
                              onClick={() => setSelectedDocumentUrl(document.pdf)}
                              className={`w-full rounded-[18px] border bg-white px-4 py-4 text-left shadow-[0_12px_30px_-28px_rgba(47,86,166,0.35)] transition ${
                                isActive
                                  ? 'border-[var(--deshazo-blue)] shadow-[0_18px_32px_-24px_rgba(47,86,166,0.36)]'
                                  : 'border-[var(--deshazo-border)] hover:border-[var(--deshazo-blue-soft)]'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-[18px] font-bold text-[var(--deshazo-blue)]">{document.display_name}</p>
                                  <span className="mt-3 inline-flex rounded-full bg-[#dff6e6] px-2.5 py-1 text-[12px] font-semibold lowercase text-[#4a9960]">
                                    {document.type}
                                  </span>
                                </div>
                                <p className="shrink-0 text-sm font-semibold text-[rgba(21,24,33,0.72)]">
                                  {formatDisplayDate(document.inspection_date)}
                                </p>
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>

                    <div className="overflow-hidden rounded-[18px] border border-[var(--deshazo-border)] bg-white shadow-[0_12px_30px_-28px_rgba(47,86,166,0.35)]">
                      {selectedDocument ? (
                        <iframe
                          key={selectedDocument.pdf}
                          src={selectedDocument.pdf}
                          title={selectedDocument.display_name}
                          className="h-[700px] w-full border-0"
                        />
                      ) : (
                        <div className="flex h-[700px] items-center justify-center bg-[linear-gradient(180deg,rgba(238,243,255,0.3)_0%,rgba(255,255,255,1)_100%)] px-6 text-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
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
                        disabled={!noteInput.trim()}
                        className="inline-flex items-center rounded-xl bg-[var(--deshazo-blue)] px-5 py-2.5 text-[14px] font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Add note
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {notes.length === 0 ? (
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
                            <span className="ml-auto text-[13px] text-[rgba(21,24,33,0.45)]">{note.timestamp}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              ) : activeTab === 'analytics' ? (
                <section className="space-y-6">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[
                      { label: 'Total Open Issues', value: '49', color: 'text-[var(--deshazo-blue)]' },
                      { label: 'Safety Critical', value: '12', color: 'text-[#e05c3a]' },
                      { label: 'Monitor', value: '21', color: 'text-[#b27d00]' },
                      { label: 'Avg Age (days)', value: '38', color: 'text-[#4a9960]' },
                    ].map((card) => (
                      <div key={card.label} className="rounded-[14px] border border-[var(--deshazo-border)] bg-white px-5 py-4 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.2)]">
                        <p className="text-[13px] font-semibold text-[rgba(21,24,33,0.5)]">{card.label}</p>
                        <p className={`mt-1 text-[32px] font-black tracking-tight ${card.color}`}>{card.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Issues by Category + Safety Donut */}
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-[14px] border border-[var(--deshazo-border)] bg-white px-5 py-5 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.2)]">
                      <h3 className="mb-4 text-[15px] font-bold text-[var(--deshazo-text)]">Issues by Category</h3>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={mockIssuesByCategory} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" />
                          <XAxis dataKey="category" tick={{ fontSize: 12, fill: '#6b7280' }} />
                          <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />
                          <Tooltip contentStyle={{ borderRadius: 10, fontSize: 13 }} />
                          <Bar dataKey="count" name="Issues" radius={[6, 6, 0, 0]}>
                            {mockIssuesByCategory.map((_, i) => (
                              <Cell key={i} fill={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="rounded-[14px] border border-[var(--deshazo-border)] bg-white px-5 py-5 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.2)]">
                      <h3 className="mb-4 text-[15px] font-bold text-[var(--deshazo-text)]">Issues by Safety Classification</h3>
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={mockIssuesBySafety}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={95}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {mockIssuesBySafety.map((_, i) => (
                              <Cell key={i} fill={['#e05c3a', '#f2b43f', '#4a9960'][i]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: 10, fontSize: 13 }} />
                          <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 13 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Issues Trend + Component breakdown */}
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-[14px] border border-[var(--deshazo-border)] bg-white px-5 py-5 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.2)]">
                      <h3 className="mb-4 text-[15px] font-bold text-[var(--deshazo-text)]">Issues Opened — Last 6 Months</h3>
                      <ResponsiveContainer width="100%" height={240}>
                        <LineChart data={mockIssuesTrend} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" />
                          <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6b7280' }} />
                          <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />
                          <Tooltip contentStyle={{ borderRadius: 10, fontSize: 13 }} />
                          <Line type="monotone" dataKey="issues" name="Issues" stroke="#2f56a6" strokeWidth={2.5} dot={{ r: 4, fill: '#2f56a6' }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="rounded-[14px] border border-[var(--deshazo-border)] bg-white px-5 py-5 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.2)]">
                      <h3 className="mb-4 text-[15px] font-bold text-[var(--deshazo-text)]">Issues by Component</h3>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={mockIssuesByComponent} layout="vertical" margin={{ top: 0, right: 8, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} />
                          <YAxis type="category" dataKey="component" tick={{ fontSize: 12, fill: '#6b7280' }} width={70} />
                          <Tooltip contentStyle={{ borderRadius: 10, fontSize: 13 }} />
                          <Bar dataKey="count" name="Issues" radius={[0, 6, 6, 0]}>
                            {mockIssuesByComponent.map((_, i) => (
                              <Cell key={i} fill={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Risk radar */}
                  <div className="rounded-[14px] border border-[var(--deshazo-border)] bg-white px-5 py-5 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.2)]">
                    <h3 className="mb-4 text-[15px] font-bold text-[var(--deshazo-text)]">Risk Score by Category</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <RadarChart data={mockRiskRadar} cx="50%" cy="50%" outerRadius={110}>
                        <PolarGrid stroke="#e5e9f5" />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <Radar name="Risk Score" dataKey="score" stroke="#2f56a6" fill="#2f56a6" fillOpacity={0.18} strokeWidth={2} />
                        <Tooltip contentStyle={{ borderRadius: 10, fontSize: 13 }} />
                      </RadarChart>
                    </ResponsiveContainer>
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
                <p className="text-[12px] text-[rgba(21,24,33,0.45)]">D593227 · Wabash (Perris, CA) · Apr 13, 2026</p>
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
            <iframe
              src="/sample-inspection.pdf"
              title="Inspection Report"
              className="flex-1 w-full border-0"
            />
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
                    const val = emailDraft.trim().toLowerCase()
                    if (!val.includes('@')) { setEmailError('Please enter a valid email.'); return }
                    if (notificationEmails.some((s) => s.email === val)) { setEmailError('This email is already added.'); return }
                    setNotificationEmails((prev) => [...prev, { email: val, newReports: true, repairDone: true }])
                    setEmailDraft('')
                  }
                }}
                placeholder="name@example.com"
                className="flex-1 rounded-[10px] border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] px-4 py-2.5 text-[14px] text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  const val = emailDraft.trim().toLowerCase()
                  if (!val.includes('@')) { setEmailError('Please enter a valid email.'); return }
                  if (notificationEmails.some((s) => s.email === val)) { setEmailError('This email is already added.'); return }
                  setNotificationEmails((prev) => [...prev, { email: val, newReports: true, repairDone: true }])
                  setEmailDraft('')
                }}
                className="rounded-[10px] bg-[var(--deshazo-blue)] px-4 py-2.5 text-[14px] font-bold text-white transition hover:opacity-90"
              >
                Add
              </button>
            </div>
            {emailError && <p className="mt-2 text-[12px] font-semibold text-red-500">{emailError}</p>}

            {/* Subscriber list */}
            <div className="mt-4 space-y-2 max-h-[300px] overflow-y-auto">
              {notificationEmails.length === 0 ? (
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
                        onClick={() => setNotificationEmails((prev) => prev.filter((s) => s.email !== sub.email))}
                        className="ml-2 text-[18px] leading-none text-[rgba(21,24,33,0.35)] transition hover:text-red-500"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>
                    {/* Notification type toggles */}
                    <div className="mt-2.5 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setNotificationEmails((prev) => prev.map((s) => s.email === sub.email ? { ...s, newReports: !s.newReports } : s))}
                        className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${sub.newReports ? 'bg-[var(--deshazo-blue)] text-white' : 'border border-[var(--deshazo-border)] bg-white text-[rgba(21,24,33,0.5)]'}`}
                      >
                        New Reports
                      </button>
                      <button
                        type="button"
                        onClick={() => setNotificationEmails((prev) => prev.map((s) => s.email === sub.email ? { ...s, repairDone: !s.repairDone } : s))}
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
            <p className="mb-5 text-[13px] text-[rgba(21,24,33,0.5)]">Edit the identifier string for this asset.</p>
            <input
              type="text"
              value={wabashDraft}
              onChange={(e) => setWabashDraft(e.target.value)}
              className="w-full rounded-[10px] border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] px-4 py-3 text-[15px] font-bold tracking-wide text-[var(--deshazo-text)] outline-none focus:border-[var(--deshazo-blue)]"
              autoFocus
            />
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
                onClick={() => { setWabashIdentifier(wabashDraft.trim() || wabashIdentifier); setWabashModalOpen(false) }}
                className="rounded-xl bg-[var(--deshazo-blue)] px-5 py-2.5 text-[14px] font-bold text-white transition hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
