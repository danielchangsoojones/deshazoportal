import { useEffect, useMemo, useState } from 'react'
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

type AssetInfoTab = 'issues' | 'info' | 'documents' | 'repair' | 'below-hook' | 'notes'

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

function AssetIssueRow({ issue, index }: { issue: AssetIssue; index: number }) {
  return (
    <tr className={index % 2 === 0 ? 'bg-[#f4f7ff]' : 'bg-white'}>
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
      timestamp: new Date().toLocaleString(),
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
                            <AssetIssueRow key={`${issue.category}-${issue.component_type}-${index}`} issue={issue} index={index} />
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
              ) : null}
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}
