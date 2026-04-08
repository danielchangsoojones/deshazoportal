import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'
import { usePortalMenu } from '../lib/usePortalMenu'
import {
  getAvgMoM,
  getLocationSpend,
  getMoMSpend,
  getSpendTypes,
  getTopIssue,
  getTopLineSpendAnalytics,
  type LocationSpendAnalytics,
  type MoMSpendAnalytics,
  isPortalApiConfigured,
  type SpendTypeAnalytics,
  type TopIssueAnalytics,
  type TopLineSpendAnalytics,
} from '../lib/portalApi'
import type { User } from '@supabase/supabase-js'

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

const defaultToplineSpend: TopLineSpendAnalytics = {
  total_equipment_spend: 0,
  total_labor_spend: 0,
  total_spend: 0,
  total_invoices: 0,
  topline_start_str: 'since....',
}

const buildBlueShades = (count: number) => {
  if (count <= 0) return []

  return Array.from({ length: count }, (_, index) => {
    const lightness = 74 - (index / Math.max(count - 1, 1)) * 36
    return `hsl(221 68% ${lightness}%)`
  })
}

const formatCurrency = (value: number) => `$${value.toLocaleString()}`

const formatMonthLabel = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return value
  return trimmed.slice(0, 3).replace(/^./, (char) => char.toUpperCase())
}

const formatLocationLabel = (value: string) =>
  value
    .split('_')
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(' ')

const formatCategoryLabel = (value: string) =>
  value.trim().toLowerCase() === 'undefined'
    ? 'undefined'
    :
  value
    .trim()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ') || 'Unknown'

const buildUniqueChartColors = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const hue = Math.round((index * 137.508) % 360)
    return `hsl(${hue} 62% 56%)`
  })

const buildConicGradient = (segments: { value: number; color: string }[]) => {
  let current = 0
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1

  const stops = segments.map((segment) => {
    const start = current
    const end = current + (segment.value / total) * 100
    current = end
    return `${segment.color} ${start}% ${end}%`
  })

  return `conic-gradient(${stops.join(', ')})`
}

const getBarHeight = (value: number, maxValue: number, plotHeight?: number) => {
  if (value <= 0 || maxValue <= 0) return 0
  const ratio = value / maxValue
  return plotHeight ? ratio * plotHeight : ratio * 100
}

export default function Spend() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const [toplineSpend, setToplineSpend] = useState<TopLineSpendAnalytics>(defaultToplineSpend)
  const [toplineLoading, setToplineLoading] = useState(true)
  const [toplineError, setToplineError] = useState('')
  const [serviceTypeData, setServiceTypeData] = useState<Array<{ label: string; value: number; color: string; spend: number }>>([])
  const [serviceTypeLoading, setServiceTypeLoading] = useState(true)
  const [serviceTypeError, setServiceTypeError] = useState('')
  const [momSpendData, setMomSpendData] = useState<MoMSpendAnalytics[]>([])
  const [momSpendLoading, setMomSpendLoading] = useState(true)
  const [momSpendError, setMomSpendError] = useState('')
  const [avgMoMData, setAvgMoMData] = useState<MoMSpendAnalytics[]>([])
  const [avgMoMLoading, setAvgMoMLoading] = useState(true)
  const [avgMoMError, setAvgMoMError] = useState('')
  const [locationSpendData, setLocationSpendData] = useState<Array<{ label: string; value: number; color: string; spend: number }>>([])
  const [locationSpendLoading, setLocationSpendLoading] = useState(true)
  const [locationSpendError, setLocationSpendError] = useState('')
  const [topIssueData, setTopIssueData] = useState<Array<{ label: string; total: number }>>([])
  const [topIssueLoading, setTopIssueLoading] = useState(true)
  const [topIssueError, setTopIssueError] = useState('')
  const navigate = useNavigate()

  const activeMenuItems = useMemo(
    () =>
      menuItems.map((item) => ({
        ...item,
        active: item.label === 'Spend',
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

    const loadTopline = async () => {
      try {
        setToplineLoading(true)
        setToplineError('')
        const data = await getTopLineSpendAnalytics(controller.signal)
        setToplineSpend(data)
      } catch (err) {
        if (controller.signal.aborted) return
        setToplineError(err instanceof Error ? err.message : 'Unable to load spend summary.')
      } finally {
        if (!controller.signal.aborted) {
          setToplineLoading(false)
        }
      }
    }

    loadTopline()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    const loadMoMSpend = async () => {
      try {
        setMomSpendLoading(true)
        setMomSpendError('')
        const data = await getMoMSpend(controller.signal)
        setMomSpendData(data)
      } catch (err) {
        if (controller.signal.aborted) return
        setMomSpendError(err instanceof Error ? err.message : 'Unable to load month over month spend.')
      } finally {
        if (!controller.signal.aborted) {
          setMomSpendLoading(false)
        }
      }
    }

    loadMoMSpend()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    const loadAvgMoM = async () => {
      try {
        setAvgMoMLoading(true)
        setAvgMoMError('')
        const data = await getAvgMoM(controller.signal)
        setAvgMoMData(data)
      } catch (err) {
        if (controller.signal.aborted) return
        setAvgMoMError(err instanceof Error ? err.message : 'Unable to load average invoice amounts.')
      } finally {
        if (!controller.signal.aborted) {
          setAvgMoMLoading(false)
        }
      }
    }

    loadAvgMoM()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    const loadTopIssue = async () => {
      try {
        setTopIssueLoading(true)
        setTopIssueError('')
        const data = await getTopIssue(controller.signal)
        const mapped = data.map((item: TopIssueAnalytics) => ({
          label: formatCategoryLabel(item.category),
          total: item.total,
        }))
        setTopIssueData(mapped)
      } catch (err) {
        if (controller.signal.aborted) return
        setTopIssueError(err instanceof Error ? err.message : 'Unable to load top issue analytics.')
      } finally {
        if (!controller.signal.aborted) {
          setTopIssueLoading(false)
        }
      }
    }

    loadTopIssue()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    const loadLocationSpend = async () => {
      try {
        setLocationSpendLoading(true)
        setLocationSpendError('')
        const data = await getLocationSpend(controller.signal)
        const total = data.reduce((sum, item) => sum + item.spend, 0)
        const colors = buildUniqueChartColors(data.length)

        const mapped = data.map((item: LocationSpendAnalytics, index: number) => ({
          label: formatLocationLabel(item.location),
          value: total > 0 ? Number(((item.spend / total) * 100).toFixed(2)) : 0,
          color: colors[index] ?? `hsl(${(index * 31) % 360} 62% 56%)`,
          spend: item.spend,
        }))

        setLocationSpendData(mapped)
      } catch (err) {
        if (controller.signal.aborted) return
        setLocationSpendError(err instanceof Error ? err.message : 'Unable to load location spend.')
      } finally {
        if (!controller.signal.aborted) {
          setLocationSpendLoading(false)
        }
      }
    }

    loadLocationSpend()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    const loadSpendTypes = async () => {
      try {
        setServiceTypeLoading(true)
        setServiceTypeError('')
        const data = await getSpendTypes(controller.signal)
        const total = data.reduce((sum, item) => sum + item.spend, 0)
        const colors = buildBlueShades(data.length)

        const mapped = data.map((item: SpendTypeAnalytics, index: number) => ({
          label: item.category,
          value: total > 0 ? Number(((item.spend / total) * 100).toFixed(2)) : 0,
          color: colors[index] ?? 'hsl(221 68% 52%)',
          spend: item.spend,
        }))

        setServiceTypeData(mapped)
      } catch (err) {
        if (controller.signal.aborted) return
        setServiceTypeError(err instanceof Error ? err.message : 'Unable to load spend types.')
      } finally {
        if (!controller.signal.aborted) {
          setServiceTypeLoading(false)
        }
      }
    }

    loadSpendTypes()

    return () => controller.abort()
  }, [])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/login')
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="rounded-2xl border border-[var(--deshazo-border)] bg-white px-6 py-4 text-sm font-semibold text-[var(--deshazo-blue)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
          Loading spend page...
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

  const hasServiceTypeData = serviceTypeData.length > 0 && serviceTypeData.some((segment) => segment.spend > 0)
  const hasLocationSpendData = locationSpendData.length > 0 && locationSpendData.some((segment) => segment.spend > 0)
  const maxMoMSpend = momSpendData.reduce((max, item) => Math.max(max, item.spend), 0)
  const maxAvgMoM = avgMoMData.reduce((max, item) => Math.max(max, item.spend), 0)
  const maxTopIssue = topIssueData.reduce((max, item) => Math.max(max, item.total), 0)
  const plotHeight = 184

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
                <span>Spend analytics</span>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {!isPortalApiConfigured && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Add `VITE_PORTAL_PARSE_REST_API_KEY` to load live spend analytics.
              </div>
            )}

            {toplineError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {toplineError}
              </div>
            )}

            <section className="grid gap-4 rounded-[14px] border border-[var(--deshazo-border)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)] md:grid-cols-2 xl:grid-cols-4">
              {[
                ['Total Invoices', toplineLoading ? '...' : toplineSpend.total_invoices.toLocaleString()],
                ['Total Spend', toplineLoading ? '...' : formatCurrency(toplineSpend.total_spend)],
                ['Labor Spend', toplineLoading ? '...' : formatCurrency(toplineSpend.total_labor_spend)],
                ['Equipment Spend', toplineLoading ? '...' : formatCurrency(toplineSpend.total_equipment_spend)],
              ].map(([label, value]) => (
                <article key={label} className="rounded-xl px-2 py-1">
                  <p className="text-[15px] font-bold text-[var(--deshazo-text)]">{label}</p>
                  <p className="mt-1 text-[34px] font-extrabold leading-none tracking-[-0.05em] text-[var(--deshazo-text)]">
                    {value}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[rgba(21,24,33,0.45)]">
                    {toplineLoading ? 'Loading...' : toplineSpend.topline_start_str}
                  </p>
                </article>
              ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <article className="rounded-[16px] border-[6px] border-[var(--deshazo-surface-2)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                <h2 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--deshazo-text)]">Spend By Service Type</h2>
                {serviceTypeError && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {serviceTypeError}
                  </div>
                )}
                <div className="mt-6 flex flex-col items-center justify-center gap-5">
                  {hasServiceTypeData ? (
                    <div
                      className="relative h-44 w-44 rounded-full"
                      style={{ background: buildConicGradient(serviceTypeData) }}
                    >
                      <div className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-center text-[11px] font-semibold text-[var(--deshazo-text)] shadow-[inset_0_0_0_1px_rgba(47,86,166,0.08)]">
                        {/* Breakdown */}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-44 w-44 items-center justify-center rounded-full border-2 border-dashed border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] text-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                      {serviceTypeLoading ? 'Loading...' : 'No data available'}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-center gap-5 text-sm">
                    {(hasServiceTypeData ? serviceTypeData : []).map((segment) => (
                      <div key={segment.label} className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: segment.color }} />
                        <span className="text-[rgba(21,24,33,0.66)]">
                          {segment.label} {hasServiceTypeData ? `(${segment.value}%)` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>

              <article className="rounded-[16px] border-[6px] border-[var(--deshazo-surface-2)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                <h2 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--deshazo-text)]">Month Over Month Spend</h2>
                {momSpendError && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {momSpendError}
                  </div>
                )}
                <div className="mt-5 rounded-[14px] bg-[linear-gradient(180deg,rgba(238,243,255,0.5)_0%,rgba(255,255,255,1)_100%)] p-4">
                  {momSpendLoading ? (
                    <div className="flex h-52 items-center justify-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                      Loading...
                    </div>
                  ) : momSpendData.length === 0 ? (
                    <div className="flex h-52 items-center justify-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                      No data available
                    </div>
                  ) : (
                    <div className="scrollbar-hidden overflow-x-auto">
                      <div className="min-w-[720px]">
                        <div className="grid h-56 grid-rows-[1fr_auto]">
                          <div className="relative">
                            <div className="absolute inset-0 flex flex-col justify-between">
                            {Array.from({ length: 5 }).map((_, index) => {
                              const tickValue = Math.round((maxMoMSpend / 4) * (4 - index))
                              return (
                                <div key={index} className="flex items-center gap-3">
                                  <span className="w-12 text-xs text-[rgba(21,24,33,0.45)]">
                                    {formatCurrency(tickValue)}
                                  </span>
                                  <div className="h-px flex-1 bg-[var(--deshazo-border)]" />
                                </div>
                              )
                            })}
                            </div>
                            <div className="absolute inset-x-14 bottom-0 top-0 flex items-end justify-between gap-3">
                              {momSpendData.map((point) => {
                                const height = getBarHeight(point.spend, maxMoMSpend, plotHeight)
                                return (
                                  <div key={point.month} className="flex h-full min-w-[54px] flex-1 items-end justify-center">
                                    <div className="w-full max-w-[52px] rounded-t-md bg-[var(--deshazo-blue)]/90" style={{ height: `${height}px` }} />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          <div className="mt-2 ml-14 flex justify-between gap-3">
                            {momSpendData.map((point) => (
                              <div key={point.month} className="flex min-w-[54px] flex-1 justify-center">
                                <span className="text-center text-[11px] text-[rgba(21,24,33,0.55)]">
                                  {formatMonthLabel(point.month)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </article>

              <article className="rounded-[16px] border-[6px] border-[var(--deshazo-surface-2)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                <h2 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--deshazo-text)]">Avg. Invoice Amount</h2>
                {avgMoMError && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {avgMoMError}
                  </div>
                )}
                <div className="mt-5 rounded-[14px] bg-[linear-gradient(180deg,rgba(238,243,255,0.5)_0%,rgba(255,255,255,1)_100%)] p-4">
                  {avgMoMLoading ? (
                    <div className="flex h-52 items-center justify-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                      Loading...
                    </div>
                  ) : avgMoMData.length === 0 ? (
                    <div className="flex h-52 items-center justify-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                      No data available
                    </div>
                  ) : (
                    <div className="scrollbar-hidden overflow-x-auto">
                      <div className="min-w-[720px]">
                        <div className="grid h-56 grid-rows-[1fr_auto]">
                          <div className="relative">
                            <div className="absolute inset-0 flex flex-col justify-between">
                            {Array.from({ length: 5 }).map((_, index) => {
                              const tickValue = Math.round((maxAvgMoM / 4) * (4 - index))
                              return (
                                <div key={index} className="flex items-center gap-3">
                                  <span className="w-12 text-xs text-[rgba(21,24,33,0.45)]">
                                    {formatCurrency(tickValue)}
                                  </span>
                                  <div className="h-px flex-1 bg-[var(--deshazo-border)]" />
                                </div>
                              )
                            })}
                            </div>
                            <div className="absolute inset-x-14 bottom-0 top-0 flex items-end justify-between gap-3">
                              {avgMoMData.map((point) => {
                                const height = getBarHeight(point.spend, maxAvgMoM, plotHeight)
                                return (
                                  <div key={point.month} className="flex h-full min-w-[54px] flex-1 items-end justify-center">
                                    <div className="w-full max-w-[52px] rounded-t-md bg-[var(--deshazo-blue)]/75" style={{ height: `${height}px` }} />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          <div className="mt-2 ml-14 flex justify-between gap-3">
                            {avgMoMData.map((point) => (
                              <div key={point.month} className="flex min-w-[54px] flex-1 justify-center">
                                <span className="text-center text-[11px] capitalize text-[rgba(21,24,33,0.55)]">
                                  {formatMonthLabel(point.month)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </article>

              <article className="rounded-[16px] border-[6px] border-[var(--deshazo-surface-2)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                <h2 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--deshazo-text)]">Spend By Location</h2>
                {locationSpendError && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {locationSpendError}
                  </div>
                )}
                <div className="mt-6 flex flex-col items-center justify-center gap-5">
                  {hasLocationSpendData ? (
                    <>
                      <div
                        className="h-44 w-44 rounded-full"
                        style={{ background: buildConicGradient(locationSpendData) }}
                      />
                      <div className="grid w-full grid-cols-1 gap-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
                        {locationSpendData.map((segment) => (
                          <div key={segment.label} className="flex items-center gap-2">
                            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }} />
                            <span className="truncate text-[rgba(21,24,33,0.66)]">
                              {segment.label} ({segment.value}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex h-44 w-44 items-center justify-center rounded-full border-2 border-dashed border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] text-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                      {locationSpendLoading ? 'Loading...' : 'No data available'}
                    </div>
                  )}
                </div>
              </article>
            </section>

            <article className="rounded-[16px] border-[6px] border-[var(--deshazo-surface-2)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
              <h2 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--deshazo-text)]">
                Top 10 Open Items Over Past 6 Months
              </h2>
              {topIssueError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {topIssueError}
                </div>
              )}
              <div className="mt-5 rounded-[14px] bg-[linear-gradient(180deg,rgba(238,243,255,0.5)_0%,rgba(255,255,255,1)_100%)] p-4">
                {topIssueLoading ? (
                  <div className="flex h-52 items-center justify-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                    Loading...
                  </div>
                ) : topIssueData.length === 0 ? (
                  <div className="flex h-52 items-center justify-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                    No data available
                  </div>
                ) : (
                  <>
                    <div className="scrollbar-hidden overflow-x-auto">
                      <div className="min-w-[720px]">
                        <div className="grid h-56 grid-rows-[1fr_auto]">
                          <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-4">
                            <div className="relative h-44">
                              {Array.from({ length: 5 }).map((_, index) => {
                                const tickValue = Math.round((maxTopIssue / 4) * (4 - index))
                                const topPercent = index * 25
                                return (
                                  <span
                                    key={index}
                                    className="absolute right-0 text-xs text-[rgba(21,24,33,0.45)]"
                                    style={{
                                      top: `${topPercent}%`,
                                      transform:
                                        index === 0 ? 'translateY(0)' : index === 4 ? 'translateY(-100%)' : 'translateY(-50%)',
                                    }}
                                  >
                                    {tickValue}
                                  </span>
                                )
                              })}
                            </div>
                            <div className="relative h-44 overflow-hidden">
                              {Array.from({ length: 5 }).map((_, index) => {
                                const topPercent = index * 25
                                return (
                                  <div
                                    key={index}
                                    className="absolute inset-x-0 h-px bg-[var(--deshazo-border)]"
                                    style={{ top: `${topPercent}%` }}
                                  />
                                )
                              })}
                              <div className="absolute inset-0 flex items-end justify-between gap-3">
                                {topIssueData.map((item) => {
                                  const height = getBarHeight(item.total, maxTopIssue, 176)
                                  return (
                                    <div key={item.label} className="flex h-full min-w-[120px] flex-1 items-end justify-center">
                                      <div
                                        className="w-full bg-[var(--deshazo-blue)]"
                                        style={{ height: `${height}px` }}
                                      />
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                          <div className="ml-[68px] flex justify-between gap-3">
                            {topIssueData.map((item) => (
                              <div key={item.label} className="flex min-w-[120px] flex-1 justify-center">
                                <span className="text-center text-[11px] text-[rgba(21,24,33,0.55)]">
                                  {item.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-2 text-sm text-[rgba(21,24,33,0.6)]">
                      <span className="h-3 w-3 rounded-sm bg-[var(--deshazo-blue)]" />
                      <span>total</span>
                    </div>
                  </>
                )}
              </div>
            </article>
          </div>
        </section>
      </main>
    </div>
  )
}
