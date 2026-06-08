import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'
import { usePortalMenu } from '../lib/usePortalMenu'
import DNumberSearchBar from '../components/DNumberSearchBar'
import { portalLocationOptions } from '../lib/portalLocations'
import {
  getAssets,
  isPortalApiConfigured,
  type AssetUnit,
  type AssetsPageAnalytics,
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

const pageSize = 24

const defaultAssetsPage: AssetsPageAnalytics = {
  unit_array: [],
}

const formatDateLabel = (value?: string) =>
  value
    ? value
        .replace(/\. /g, ' ')
        .replace(/th,|st,|nd,|rd,/g, ',')
    : 'Inspection pending'

const sumIssueCount = (item: AssetUnit) => item.safety_issue_count + item.monitor_issue_count

const getIssuePercentages = (item: AssetUnit) => {
  const total = sumIssueCount(item)
  if (total <= 0) {
    return { safetyPercent: 0, monitorPercent: 0 }
  }

  return {
    safetyPercent: (item.safety_issue_count / total) * 100,
    monitorPercent: (item.monitor_issue_count / total) * 100,
  }
}

const buildIssueGradient = (item: AssetUnit) => {
  const total = sumIssueCount(item)
  if (total <= 0) {
    return 'conic-gradient(#f53822 0deg 360deg)'
  }

  const { safetyPercent } = getIssuePercentages(item)
  return `conic-gradient(#f53822 0deg ${safetyPercent * 3.6}deg, #efb634 ${safetyPercent * 3.6}deg 360deg)`
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

function IssueRing({ unit }: { unit: AssetUnit }) {
  const total = sumIssueCount(unit)

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative h-14 w-14 rounded-full"
        style={{ background: buildIssueGradient(unit) }}
      >
        <div className="absolute inset-[8px] rounded-full bg-white" />
      </div>
      <p className="text-[16px] font-bold tracking-[-0.02em] text-[var(--deshazo-text)]">
        {total} Open Items
      </p>
    </div>
  )
}

function AssetUnitCard({ unit, currentView }: { unit: AssetUnit; currentView: 'open-risk' | 'asset-fleet' }) {
  return (
    <article className="overflow-hidden rounded-[10px] border border-[var(--deshazo-border)] bg-white shadow-[0_14px_30px_-28px_rgba(47,86,166,0.22)]">
      <div className="space-y-1 px-4 py-4">
        <p className="text-[18px] font-extrabold uppercase leading-[1.1] tracking-[-0.03em] text-[var(--deshazo-text)]">
          {unit.unit_name}
        </p>
        <p className="text-[15px] font-medium text-[rgba(21,24,33,0.72)]">{unit.warehouse_location}</p>
        <div className="flex items-center gap-2 pt-1 text-[15px] font-semibold text-[var(--deshazo-text)]">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#d7b94a] bg-[#ffe680]">
            <span className="h-2 w-2 rounded-full bg-[#725900]" />
          </span>
          <span>{unit.interior_location}</span>
        </div>
        <p className="pt-1 text-[15px] font-medium text-[rgba(21,24,33,0.78)]">{formatDateLabel(unit.inspection_date)}</p>
      </div>

      <div className="border-t border-[var(--deshazo-border)] px-4 py-4">
        <IssueRing unit={unit} />
        <Link
          to={`/asset-info?unit_id=${unit.unit_id}${currentView === 'open-risk' ? '&view=open-risk' : ''}`}
          className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-[4px] bg-[var(--deshazo-blue)] text-[14px] font-bold text-white"
        >
          See Details
        </Link>
      </div>
    </article>
  )
}

export default function AssetFleetAssets() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [locationMenuOpen, setLocationMenuOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [assetsPage, setAssetsPage] = useState<AssetsPageAnalytics>(defaultAssetsPage)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()
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

  useEffect(() => {
    const initialLocations = searchParams.get('locations')
    const parsedLocations = initialLocations
      ? initialLocations.split(',').map((value) => value.trim()).filter(Boolean)
      : []
    const initialPage = Number(searchParams.get('page') || '1')

    setSelectedLocations(parsedLocations)
    setCurrentPage(Number.isFinite(initialPage) && initialPage > 0 ? initialPage : 1)
  }, [searchParams])

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

    const loadAssets = async () => {
      try {
        setLoading(true)
        setError('')
        const data = await getAssets(selectedLocations, currentPage - 1, controller.signal)
        setAssetsPage(data)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Unable to load asset details.')
        setAssetsPage(defaultAssetsPage)
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadAssets()

    return () => controller.abort()
  }, [selectedLocations, currentPage])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/login')
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="rounded-2xl border border-[var(--deshazo-border)] bg-white px-6 py-4 text-sm font-semibold text-[var(--deshazo-blue)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
          Loading asset fleet assets...
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

  const totalAssetsCount = assetsPage.total_unit_count ?? assetsPage.total_units_count ?? assetsPage.unit_array.length
  const safetyCount =
    assetsPage.total_safety_issues ??
    assetsPage.safety_issue_count ??
    assetsPage.unit_array.reduce((sum, unit) => sum + unit.safety_issue_count, 0)
  const monitorCount =
    assetsPage.total_monitor_issues ??
    assetsPage.monitor_issue_count ??
    assetsPage.unit_array.reduce((sum, unit) => sum + unit.monitor_issue_count, 0)
  const totalPages = Math.max(1, Math.ceil(totalAssetsCount / pageSize))
  const visiblePages = buildVisiblePages(currentPage, totalPages)
  const selectedLocationLabels = portalLocationOptions.filter((option) => selectedLocations.includes(option.value))

  const syncFilters = (locations: string[], page: number) => {
    const next = new URLSearchParams()
    if (currentView === 'open-risk') {
      next.set('view', 'open-risk')
    }
    if (locations.length > 0) {
      next.set('locations', locations.join(','))
    }
    if (page > 1) {
      next.set('page', String(page))
    }
    setSearchParams(next, { replace: true })
  }

  const toggleLocation = (locationValue: string) => {
    const nextLocations = selectedLocations.includes(locationValue)
      ? selectedLocations.filter((value) => value !== locationValue)
      : [...selectedLocations, locationValue]
    syncFilters(nextLocations, 1)
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

              <div className="relative flex items-start gap-3 text-sm font-semibold text-[var(--deshazo-text)]">
                <span>Location</span>
                <div className="relative w-[320px] shrink-0">
                  <button
                    type="button"
                    onClick={() => setLocationMenuOpen((open) => !open)}
                    className="flex min-h-10 w-full flex-wrap items-center gap-2 rounded-md border border-[var(--deshazo-border)] bg-white px-3 py-2 text-left text-sm text-[var(--deshazo-text)]"
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
          </div>

          {!isPortalApiConfigured && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Add `VITE_PORTAL_PARSE_REST_API_KEY` to load live asset detail data.
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <section className="space-y-6">
            <article className="max-w-[720px] rounded-[10px] border border-[var(--deshazo-border)] bg-white px-6 py-5 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
              <div className="flex flex-wrap items-center gap-6">

                <div className="min-w-[150px]">
                  <p className="text-[14px] font-bold uppercase tracking-[0.03em] text-[rgba(21,24,33,0.58)]">
                    Assets
                  </p>
                  <p className="mt-1 text-[28px] font-extrabold tracking-[-0.04em] text-[var(--deshazo-text)]">
                    {totalAssetsCount}
                  </p>
                </div>

                <div className="flex min-w-[150px] items-center justify-center rounded-[6px] border border-[var(--deshazo-border)] px-6 py-3">
                  <div className="text-center">
                    <p className="text-[24px] font-extrabold tracking-[-0.04em] text-[var(--deshazo-text)]">{safetyCount}</p>
                    <div className="mt-1 h-[2px] w-24 bg-[#f53822]" />
                    <p className="text-[18px] font-medium text-[#f53822]">Safety</p>
                  </div>
                </div>

                <div
                  className="relative h-16 w-16 rounded-full"
                  style={{
                    background: `conic-gradient(#f53822 0deg ${((safetyCount / Math.max(safetyCount + monitorCount, 1)) * 360).toFixed(1)}deg, #efb634 ${((safetyCount / Math.max(safetyCount + monitorCount, 1)) * 360).toFixed(1)}deg 360deg)`,
                  }}
                >
                  <div className="absolute inset-[10px] rounded-full bg-white" />
                </div>

                <div className="flex min-w-[150px] items-center justify-center rounded-[6px] border border-[var(--deshazo-border)] px-6 py-3">
                  <div className="text-center">
                    <p className="text-[24px] font-extrabold tracking-[-0.04em] text-[var(--deshazo-text)]">{monitorCount}</p>
                    <div className="mt-1 h-[2px] w-24 bg-[#efb634]" />
                    <p className="text-[18px] font-medium text-[#efb634]">Monitor</p>
                  </div>
                </div>
              </div>
            </article>

            <section className="rounded-[14px] border border-[#bfcdf1] bg-[#c7d4f5] px-3 py-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.2)]">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-4 px-2 text-sm font-semibold text-[rgba(21,24,33,0.76)]">
                <div />

                <div className="hidden flex-wrap items-center gap-2 md:flex">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => syncFilters(selectedLocations, Math.max(1, currentPage - 1))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white text-[var(--deshazo-blue)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ‹
                  </button>
                  {visiblePages.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => syncFilters(selectedLocations, page)}
                      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 ${
                        page === currentPage
                          ? 'bg-[var(--deshazo-blue)] text-white'
                          : 'border border-[var(--deshazo-border)] bg-white text-[var(--deshazo-text)]'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <span>of {totalPages}</span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => syncFilters(selectedLocations, Math.min(totalPages, currentPage + 1))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white text-[var(--deshazo-blue)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ›
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 24 }).map((_, index) => (
                    <div
                      key={index}
                      className="overflow-hidden rounded-[10px] border border-[var(--deshazo-border)] bg-white px-4 py-4 shadow-[0_14px_30px_-28px_rgba(47,86,166,0.22)]"
                    >
                      <div className="h-7 w-52 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                      <div className="mt-3 h-5 w-28 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                      <div className="mt-2 h-5 w-36 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                      <div className="mt-2 h-5 w-28 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                      <div className="mt-4 border-t border-[var(--deshazo-border)] pt-4">
                        <div className="h-14 w-44 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                        <div className="mt-4 h-9 w-full animate-pulse rounded bg-[var(--deshazo-surface)]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : assetsPage.unit_array.length === 0 ? (
                <div className="flex min-h-[420px] items-center justify-center rounded-[10px] bg-white text-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                  No assets available for the selected locations.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {assetsPage.unit_array.map((unit) => (
                    <AssetUnitCard key={unit.unit_id} unit={unit} currentView={currentView} />
                  ))}
                </div>
              )}
            </section>
          </section>
        </section>
      </main>
    </div>
  )
}
