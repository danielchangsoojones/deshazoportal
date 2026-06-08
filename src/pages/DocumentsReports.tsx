import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'
import { usePortalMenu } from '../lib/usePortalMenu'
import { portalLocationOptions } from '../lib/portalLocations'
import {
  getAllPDFs,
  isPortalApiConfigured,
  type PortalPdfDocument,
} from '../lib/portalApi'
import type { User } from '@supabase/supabase-js'

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

const pageSize = 10

const formatDateLabel = (value: string) =>
  value
    .replace(/\. /g, ' ')
    .replace(/th,|st,|nd,|rd,/g, ',')

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

export default function DocumentsReports() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [locationMenuOpen, setLocationMenuOpen] = useState(false)
  const [documents, setDocuments] = useState<PortalPdfDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedPdfUrl, setSelectedPdfUrl] = useState('')
  const navigate = useNavigate()

  const activeMenuItems = useMemo(
    () =>
      menuItems.map((item) => ({
        ...item,
        active: item.label === 'Documents',
      })),
    [],
  )

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

    const loadDocuments = async () => {
      try {
        setLoading(true)
        setError('')
        const data = await getAllPDFs(selectedLocations, controller.signal)
        setDocuments(data)
        setCurrentPage(1)
        setSelectedPdfUrl(data[0]?.pdf ?? '')
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Unable to load documents.')
        setDocuments([])
        setSelectedPdfUrl('')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadDocuments()

    return () => controller.abort()
  }, [selectedLocations])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/login')
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="rounded-2xl border border-[var(--deshazo-border)] bg-white px-6 py-4 text-sm font-semibold text-[var(--deshazo-blue)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
          Loading documents...
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

  const totalPages = Math.max(1, Math.ceil(documents.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageDocuments = documents.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize)
  const visiblePages = buildVisiblePages(safeCurrentPage, totalPages)
  const selectedDocument =
    pageDocuments.find((item) => item.pdf === selectedPdfUrl) ||
    documents.find((item) => item.pdf === selectedPdfUrl) ||
    pageDocuments[0] ||
    null
  const selectedLocationLabels = portalLocationOptions.filter((option) => selectedLocations.includes(option.value))

  const toggleLocation = (locationValue: string) => {
    setSelectedLocations((current) =>
      current.includes(locationValue)
        ? current.filter((value) => value !== locationValue)
        : [...current, locationValue],
    )
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
          <div className="mb-8">
            <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <div className="text-[36px] font-black uppercase tracking-[-0.04em] text-[#b8bcc8]">
                  DESHA<span className="text-[#f2b43f]">Z</span>O
                </div>
                <p className="text-[13px] font-bold uppercase tracking-[0.02em] text-[#b6b8c2]">
                  Cranes / Service / Automation
                </p>
                <div className="mt-[18px] h-1.5 w-full max-w-[530px] rounded-full bg-[var(--deshazo-blue)]" />
              </div>

              <div className="inline-flex items-center gap-2 rounded-full bg-[var(--deshazo-surface)] px-4 py-2 text-[13px] font-semibold text-[var(--deshazo-blue)]">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--deshazo-blue)]" />
                <span>{loading ? 'Loading reports...' : `${documents.length} reports available`}</span>
              </div>
            </div>
          </div>

          {!isPortalApiConfigured && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Add `VITE_PORTAL_PARSE_REST_API_KEY` to load live PDF reports.
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <section className="rounded-[26px] border border-[var(--deshazo-border)] bg-white/75 p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)] sm:p-5">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[rgba(21,24,33,0.68)]">
                <button
                  type="button"
                  disabled={safeCurrentPage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white text-[var(--deshazo-blue)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ‹
                </button>
                {visiblePages.map((page, index) => {
                  const previousPage = visiblePages[index - 1]
                  const showEllipsis = previousPage && page - previousPage > 1

                  return (
                    <div key={page} className="flex items-center gap-2">
                      {showEllipsis ? <span className="px-1 text-[rgba(21,24,33,0.45)]">...</span> : null}
                      <button
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 ${
                          page === safeCurrentPage
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
                  disabled={safeCurrentPage === totalPages}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white text-[var(--deshazo-blue)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ›
                </button>
              </div>

              <div className="relative flex items-start gap-3 text-sm font-semibold text-[var(--deshazo-text)]">
                <span>Location</span>
                <div className="relative w-[320px] shrink-0">
                  <button
                    type="button"
                    onClick={() => setLocationMenuOpen((open) => !open)}
                    className="flex min-h-10 w-full flex-wrap items-center gap-2 rounded-md border border-[var(--deshazo-border)] bg-white px-3 py-2 text-left text-sm text-[var(--deshazo-text)] outline-none transition focus:border-[var(--deshazo-blue)]"
                  >
                    {selectedLocationLabels.length > 0 ? (
                      selectedLocationLabels.map((location) => (
                        <span
                          key={location.value}
                          className="inline-flex items-center gap-2 rounded-full bg-[var(--deshazo-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--deshazo-blue)]"
                        >
                          <span>{location.label}</span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleLocation(location.value)
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                event.stopPropagation()
                                toggleLocation(location.value)
                              }
                            }}
                            className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[11px] text-[var(--deshazo-blue)]"
                          >
                            ×
                          </span>
                        </span>
                      ))
                    ) : (
                      <span className="text-[rgba(21,24,33,0.45)]">Select Location</span>
                    )}
                  </button>

                  {locationMenuOpen ? (
                    <div className="absolute right-0 top-[calc(100%+8px)] z-20 max-h-72 w-full overflow-y-auto rounded-[14px] border border-[var(--deshazo-border)] bg-white p-2 shadow-[0_18px_40px_-30px_rgba(47,86,166,0.35)]">
                      {portalLocationOptions.map((location) => {
                        const isSelected = selectedLocations.includes(location.value)

                        return (
                          <button
                            key={location.value}
                            type="button"
                            onClick={() => toggleLocation(location.value)}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                              isSelected
                                ? 'bg-[#dbe5ff] font-semibold text-[var(--deshazo-text)]'
                                : 'text-[rgba(21,24,33,0.78)] hover:bg-[var(--deshazo-surface)]'
                            }`}
                          >
                            <span>{location.label}</span>
                            <span className="text-[var(--deshazo-blue)]">{isSelected ? '✓' : ''}</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
              <div className="max-h-[720px] space-y-4 overflow-y-auto pr-2">
                {loading ? (
                  Array.from({ length: pageSize }).map((_, index) => (
                    <div
                      key={index}
                      className="rounded-[18px] border border-[var(--deshazo-border)] bg-white px-4 py-4 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.35)]"
                    >
                      <div className="mb-5 h-5 w-36 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                      <div className="mb-3 h-6 w-24 animate-pulse rounded-full bg-[var(--deshazo-surface)]" />
                      <div className="h-5 w-40 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                    </div>
                  ))
                ) : pageDocuments.length === 0 ? (
                  <div className="flex min-h-[520px] items-center justify-center rounded-[18px] border border-dashed border-[var(--deshazo-border)] bg-white text-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                    No reports available
                  </div>
                ) : (
                  pageDocuments.map((document) => {
                    const isActive = selectedDocument?.pdf === document.pdf

                    return (
                      <button
                        key={document.pdf}
                        type="button"
                        onClick={() => {
                          setSelectedPdfUrl(document.pdf)
                        }}
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
                            {formatDateLabel(document.inspection_date)}
                          </p>
                        </div>
                        <p className="mt-6 text-[15px] font-semibold text-[var(--deshazo-text)]">
                          Location: <span className="font-medium text-[rgba(21,24,33,0.8)]">{document.location}</span>
                        </p>
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
        </section>
      </main>
    </div>
  )
}
