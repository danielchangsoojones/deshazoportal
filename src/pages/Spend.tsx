import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { Link, useNavigate } from 'react-router-dom'
import { usePortalMenu } from '../lib/usePortalMenu'
import { useDeveloperMenuItems } from '../lib/useDeveloperMenuItems'
import { DeveloperBadge } from '../components/DeveloperBadge'
import {
  clearSpendAnalyticsCache,
  getLocationComparisonAnalytics,
  getSpendAnalytics,
  type LocationComparisonItem,
  type SpendAnalytics,
} from '../lib/spendAnalytics'
import { uploadJpaFinanceFiles } from '../lib/jpaFinanceImport'
import { getCustomerDisplayName, useCustomerPath, useSelectedCustomer } from '../lib/customerRouting'
import { isConfigured, supabase } from '../lib/supabase'
import { getCurrentUserTag, type UserTag } from '../lib/userTags'

const menuItems = [
  { label: 'Home', href: '/dashboard' },
  { label: 'Open Risk Items', href: '/asset-fleet-assets?view=open-risk' },
  { label: 'Asset Fleet', href: '/asset-fleet' },
  { label: 'Spend', href: '/spend' },
  { label: 'Location Comparison', href: '/location-comparison' },
  { label: 'Document Reports', href: '/documents-reports' },
  { label: 'Custom Reports', href: '/custom-reports' },
  { label: 'Documents', href: '/deshazo-work-orders' },
  { label: 'Add User', href: '/add-user' },
  { label: 'Contact Us', href: '/contact-us' },
]

const buildBlueShades = (count: number) => {
  if (count <= 0) return []

  return Array.from({ length: count }, (_, index) => {
    const lightness = 74 - (index / Math.max(count - 1, 1)) * 36
    return `hsl(221 68% ${lightness}%)`
  })
}

const formatCurrency = (value: number) => `$${value.toLocaleString()}`

const defaultReportDateRange = {
  startMonth: '2025-01',
  endMonth: '2025-12',
}

const formatMonthLabel = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return value
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}-01T00:00:00`)
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' }).format(parsed)
    }
  }
  return trimmed.slice(0, 3).replace(/^./, (char) => char.toUpperCase())
}

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

const emptyAnalytics: SpendAnalytics = {
  topline: {
    total_parts_spend: 0,
    total_service_spend: 0,
    total_spend: 0,
    total_invoices: 0,
    topline_start_str: 'No finance data imported',
  },
  serviceTypeSpend: [
    { label: 'Parts', spend: 0 },
    { label: 'Service', spend: 0 },
  ],
  monthlySpend: [],
  monthlyPartsSpend: [],
  monthlyServiceSpend: [],
  averageInvoiceSpend: [],
  locationSpend: [],
  branchSpend: [],
  invoiceSizeSpend: [],
  locationMappedInvoiceCount: 0,
}

const getBarHeight = (value: number, maxValue: number, plotHeight?: number) => {
  if (value <= 0 || maxValue <= 0) return 0
  const ratio = value / maxValue
  return plotHeight ? ratio * plotHeight : ratio * 100
}

type SpendState = {
  customer: string
  startMonth: string
  endMonth: string
  analytics: SpendAnalytics
  locationComparison: LocationComparisonItem[]
  error: string
  status: 'loading' | 'ready'
}

export default function Spend() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const navigate = useNavigate()
  const selectedCustomer = useSelectedCustomer()
  const customerPath = useCustomerPath()
  const customerName = getCustomerDisplayName(selectedCustomer)
  const customAnalyticsRef = useRef<HTMLDivElement | null>(null)
  const jpaUploadInputRef = useRef<HTMLInputElement | null>(null)
  const [customAnalyticsMessage, setCustomAnalyticsMessage] = useState('')
  const [userTag, setUserTag] = useState<UserTag | null>(null)
  const [jpaUploadStatus, setJpaUploadStatus] = useState('')
  const [jpaUploadError, setJpaUploadError] = useState('')
  const [jpaUploading, setJpaUploading] = useState(false)
  const [analyticsReloadKey, setAnalyticsReloadKey] = useState(0)
  const [reportDateRange, setReportDateRange] = useState(defaultReportDateRange)
  const [spendState, setSpendState] = useState<SpendState>({
    customer: selectedCustomer,
    startMonth: defaultReportDateRange.startMonth,
    endMonth: defaultReportDateRange.endMonth,
    analytics: emptyAnalytics,
    locationComparison: [],
    error: '',
    status: 'loading',
  })

  const activeMenuItems = useDeveloperMenuItems(menuItems, 'Spend')

  useEffect(() => {
    let isMounted = true

    if (!isConfigured || !supabase) {
      navigate(customerPath('/login'))
      return () => {
        isMounted = false
      }
    }

    supabase.auth.getUser().then(async ({ data }) => {
      if (!isMounted) return
      if (!data.user) {
        navigate(customerPath('/login'))
      } else {
        const nextUserTag = await getCurrentUserTag(data.user.id).catch(() => null)
        if (!isMounted) return
        setUserTag(nextUserTag)
        setUser(data.user)
      }
      setAuthLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [customerPath, navigate])

  useEffect(() => {
    let isMounted = true

    Promise.all([
      getSpendAnalytics(selectedCustomer, reportDateRange),
      getLocationComparisonAnalytics(selectedCustomer, reportDateRange),
    ])
      .then(([nextAnalytics, nextLocationComparison]) => {
        if (!isMounted) return
        setSpendState({
          customer: selectedCustomer,
          startMonth: reportDateRange.startMonth,
          endMonth: reportDateRange.endMonth,
          analytics: nextAnalytics,
          locationComparison: nextLocationComparison,
          error: '',
          status: 'ready',
        })
      })
      .catch((err: unknown) => {
        if (!isMounted) return
        setSpendState({
          customer: selectedCustomer,
          startMonth: reportDateRange.startMonth,
          endMonth: reportDateRange.endMonth,
          analytics: emptyAnalytics,
          locationComparison: [],
          error: err instanceof Error ? err.message : 'Unable to load spend analytics.',
          status: 'ready',
        })
      })

    return () => {
      isMounted = false
    }
  }, [analyticsReloadKey, reportDateRange, selectedCustomer])

  useEffect(() => {
    if (!customAnalyticsMessage) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!customAnalyticsRef.current?.contains(event.target as Node)) {
        setCustomAnalyticsMessage('')
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [customAnalyticsMessage])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate(customerPath('/login'))
  }

  const handleJpaUploadClick = () => {
    if (userTag !== 'developer') return
    jpaUploadInputRef.current?.click()
  }

  const handleJpaUploadChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (userTag !== 'developer') return
    if (files.length === 0) return

    try {
      setJpaUploading(true)
      setJpaUploadError('')
      setJpaUploadStatus(`Uploading ${files.length} JPA file${files.length === 1 ? '' : 's'}...`)
      const result = await uploadJpaFinanceFiles(files, selectedCustomer)
      setJpaUploadStatus(
        `Uploaded ${result.rows.toLocaleString()} rows from ${result.files} file${result.files === 1 ? '' : 's'}; ` +
          `${result.matchedWorkOrders.toLocaleString()} matched work orders; total ${formatCurrency(Math.round(result.total))}.`,
      )
      clearSpendAnalyticsCache(selectedCustomer)
      setAnalyticsReloadKey((key) => key + 1)
    } catch (err) {
      setJpaUploadStatus('')
      setJpaUploadError(err instanceof Error ? err.message : 'Unable to upload JPA finance file.')
    } finally {
      setJpaUploading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="rounded-2xl border border-[var(--deshazo-border)] bg-white px-6 py-4 text-sm font-semibold text-[var(--deshazo-blue)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
          Loading spend analytics...
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
  const userEmail = user.email ?? ''
  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join('') || 'DP'

  const isCurrentReportRange =
    spendState.customer === selectedCustomer &&
    spendState.startMonth === reportDateRange.startMonth &&
    spendState.endMonth === reportDateRange.endMonth
  const analytics = isCurrentReportRange ? spendState.analytics : emptyAnalytics
  const locationComparison = isCurrentReportRange ? spendState.locationComparison : []
  const isLoading = !isCurrentReportRange || spendState.status === 'loading'
  const error = isCurrentReportRange ? spendState.error : ''
  const locationSpendTotal = analytics.locationSpend.reduce((sum, item) => sum + item.spend, 0)
  const locationColors = buildUniqueChartColors(analytics.locationSpend.length)
  const locationSpendData = analytics.locationSpend.map((item, index) => ({
    ...item,
    value: locationSpendTotal > 0 ? Number(((item.spend / locationSpendTotal) * 100).toFixed(2)) : 0,
    color: locationColors[index] ?? `hsl(${(index * 31) % 360} 62% 56%)`,
  }))
  const branchColors = buildUniqueChartColors(analytics.branchSpend.length)
  const branchSpendData = analytics.branchSpend.map((item, index) => ({
    ...item,
    color: branchColors[index] ?? `hsl(${(index * 31) % 360} 62% 56%)`,
  }))
  const maxBranchSpend = branchSpendData.reduce((max, item) => Math.max(max, item.spend), 0)
  const invoiceSizeTotal = analytics.invoiceSizeSpend.reduce((sum, item) => sum + item.spend, 0)
  const invoiceSizeColors = buildBlueShades(analytics.invoiceSizeSpend.length)
  const invoiceSizeData = analytics.invoiceSizeSpend.map((item, index) => ({
    ...item,
    value: invoiceSizeTotal > 0 ? Number(((item.spend / invoiceSizeTotal) * 100).toFixed(2)) : 0,
    color: invoiceSizeColors[index] ?? 'hsl(221 68% 52%)',
  }))
  const toplineSpend = analytics.topline
  const monthlyPartsSpendData = analytics.monthlyPartsSpend
  const monthlyServiceSpendData = analytics.monthlyServiceSpend
  const avgMoMData = analytics.averageInvoiceSpend
  const locationComparisonTotal = locationComparison.reduce((sum, item) => sum + item.total_invoice_cost, 0)
  const topLocationComparison = locationComparison[0] ?? null

  const maxMonthlyPartsSpend = monthlyPartsSpendData.reduce((max, item) => Math.max(max, item.spend), 0)
  const maxMonthlyServiceSpend = monthlyServiceSpendData.reduce((max, item) => Math.max(max, item.spend), 0)
  const maxAvgMoM = avgMoMData.reduce((max, item) => Math.max(max, item.spend), 0)
  const plotHeight = 184
  const hasFinanceData = toplineSpend.total_invoices > 0
  const unmappedLocationInvoiceCount = Math.max(toplineSpend.total_invoices - analytics.locationMappedInvoiceCount, 0)
  const locationMappingIsPending =
    hasFinanceData && analytics.locationMappedInvoiceCount === 0
  const canUploadJpa = userTag === 'developer'
  const handleDateRangeChange = (field: 'startMonth' | 'endMonth', value: string) => {
    setReportDateRange((current) => ({
      ...current,
      [field]: value,
    }))
  }
  const handlePrintReport = () => {
    window.print()
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--deshazo-text)]">
      <header className="spend-no-print sticky top-0 z-40 bg-[var(--deshazo-blue)] px-5 py-3 shadow-sm">
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
            Signed in as <span className="font-semibold text-white">{userEmail}</span>
          </div>
        </div>
      </header>

      <main className="flex w-full items-stretch">
        {menuOpen && (
          <aside className="spend-no-print sticky top-[60px] hidden h-[calc(100vh-60px)] w-[268px] shrink-0 border-r border-[var(--deshazo-border)] bg-white lg:flex lg:flex-col">
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
                    <p className="truncate text-[14px] text-[rgba(21,24,33,0.55)]">{userEmail}</p>
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
                <span>{customerName} spend analytics</span>
              </div>
            </div>
            <div ref={customAnalyticsRef} className="spend-no-print mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setCustomAnalyticsMessage((message) =>
                    message ? '' : 'Email danieljones@blockstampsf.com to contact us.',
                  )
                }
                className="inline-flex items-center justify-center rounded-md bg-[var(--deshazo-blue)] px-4 py-2.5 text-sm font-black text-white shadow-[0_14px_28px_-22px_rgba(47,86,166,0.7)] transition hover:bg-[var(--deshazo-blue-deep)]"
              >
                Want a custom analytic?
              </button>
              {customAnalyticsMessage ? (
                <p className="text-sm font-bold text-[rgba(21,24,33,0.7)]">{customAnalyticsMessage}</p>
              ) : null}
            </div>
            <div className="spend-no-print mt-4 flex flex-wrap items-end gap-3 rounded-[14px] border border-[var(--deshazo-border)] bg-white p-3 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                <label className="flex min-w-[180px] flex-col gap-1 text-[11px] font-black uppercase tracking-[0.04em] text-[rgba(21,24,33,0.5)]">
                  From
                  <input
                    type="month"
                    aria-label="From month and year"
                    value={reportDateRange.startMonth}
                    onChange={(event) => handleDateRangeChange('startMonth', event.target.value)}
                    className="h-11 rounded-md border border-[var(--deshazo-border)] bg-[#f8fafc] px-3 text-sm font-bold normal-case tracking-normal text-[var(--deshazo-text)] focus:border-[var(--deshazo-blue)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[rgba(6,24,73,0.14)]"
                  />
                </label>
                <label className="flex min-w-[180px] flex-col gap-1 text-[11px] font-black uppercase tracking-[0.04em] text-[rgba(21,24,33,0.5)]">
                  To
                  <input
                    type="month"
                    aria-label="To month and year"
                    value={reportDateRange.endMonth}
                    onChange={(event) => handleDateRangeChange('endMonth', event.target.value)}
                    className="h-11 rounded-md border border-[var(--deshazo-border)] bg-[#f8fafc] px-3 text-sm font-bold normal-case tracking-normal text-[var(--deshazo-text)] focus:border-[var(--deshazo-blue)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[rgba(6,24,73,0.14)]"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setReportDateRange({ startMonth: '', endMonth: '' })}
                  className="inline-flex h-11 items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white px-4 text-sm font-black text-[var(--deshazo-blue)] transition hover:bg-[var(--deshazo-surface)]"
                >
                  All dates
                </button>
                <button
                  type="button"
                  onClick={handlePrintReport}
                  disabled={isLoading || !hasFinanceData}
                  className="inline-flex h-11 items-center justify-center rounded-md bg-[var(--deshazo-blue)] px-4 text-sm font-black text-white shadow-[0_14px_28px_-22px_rgba(47,86,166,0.7)] transition hover:bg-[var(--deshazo-blue-deep)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Download PDF
                </button>
            </div>
            {canUploadJpa ? (
              <div className="spend-no-print mt-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-[var(--deshazo-border)] bg-white p-3 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                <input
                  ref={jpaUploadInputRef}
                  type="file"
                  accept=".xlsx,.xlsm,.jpa,.JPA"
                  multiple
                  className="hidden"
                  onChange={handleJpaUploadChange}
                />
                <button
                  type="button"
                  onClick={handleJpaUploadClick}
                  disabled={jpaUploading}
                  className="inline-flex items-center justify-center rounded-md bg-[var(--deshazo-blue)] px-4 py-2.5 text-sm font-black text-white shadow-[0_14px_28px_-22px_rgba(47,86,166,0.7)] transition hover:bg-[var(--deshazo-blue-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>{jpaUploading ? 'Uploading JPA...' : 'Upload JPA'}</span>
                  <DeveloperBadge />
                </button>
                <span className="text-sm font-bold text-[rgba(21,24,33,0.7)]">
                  {jpaUploadError || jpaUploadStatus || 'Import monthly JPA finance workbooks for this customer.'}
                </span>
              </div>
            ) : null}
          </div>

          <div className="spend-print-report space-y-6">
            <section className="rounded-[14px] border border-[var(--deshazo-border)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.08em] text-[var(--deshazo-blue)]">
                    Spend Analytics
                  </p>
                  <h1 className="mt-1 text-[28px] font-black leading-tight tracking-[-0.04em] text-[var(--deshazo-text)]">
                    {customerName} Spend Overview
                  </h1>
                  <p className="mt-1 text-sm font-semibold text-[rgba(21,24,33,0.55)]">
                    Reporting period {toplineSpend.topline_start_str}
                  </p>
                </div>
                <div className="rounded-md bg-[var(--deshazo-surface)] px-3 py-2 text-right text-xs font-black uppercase tracking-[0.04em] text-[var(--deshazo-blue)]">
                  Finance report
                </div>
              </div>
            </section>

            {isLoading || error || !hasFinanceData ? (
              <section className="rounded-[14px] border border-[var(--deshazo-border)] bg-white p-4 text-sm font-semibold text-[rgba(21,24,33,0.68)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                {isLoading ? 'Loading spend analytics...' : error || 'No JPA finance invoices have been imported for this customer yet.'}
              </section>
            ) : null}

            <section className="grid gap-4 rounded-[14px] border border-[var(--deshazo-border)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)] md:grid-cols-2 xl:grid-cols-4">
              {[
                ['Total Invoices', toplineSpend.total_invoices.toLocaleString()],
                ['Total Spend', formatCurrency(toplineSpend.total_spend)],
                ['Parts Spend', formatCurrency(toplineSpend.total_parts_spend)],
                ['Service Spend', formatCurrency(toplineSpend.total_service_spend)],
              ].map(([label, value]) => (
                <article key={label} className="rounded-xl px-2 py-1">
                  <p className="text-[15px] font-bold text-[var(--deshazo-text)]">{label}</p>
                  <p className="mt-1 text-[34px] font-extrabold leading-none tracking-[-0.05em] text-[var(--deshazo-text)]">
                    {value}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[rgba(21,24,33,0.45)]">
                    {toplineSpend.topline_start_str}
                  </p>
                </article>
              ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <article className="rounded-[16px] border-[6px] border-[var(--deshazo-surface-2)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                <h2 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--deshazo-text)]">Month Over Month Spend By Service</h2>
                <div className="mt-5 rounded-[14px] bg-[linear-gradient(180deg,rgba(238,243,255,0.5)_0%,rgba(255,255,255,1)_100%)] p-4">
                  <div className="scrollbar-hidden overflow-x-auto">
                      <div className="min-w-[720px]">
                        <div className="grid h-56 grid-rows-[1fr_auto]">
                          <div className="relative">
                            <div className="absolute inset-0 flex flex-col justify-between">
                            {Array.from({ length: 5 }).map((_, index) => {
                              const tickValue = Math.round((maxMonthlyServiceSpend / 4) * (4 - index))
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
                              {monthlyServiceSpendData.map((point) => {
                                const height = getBarHeight(point.spend, maxMonthlyServiceSpend, plotHeight)
                                return (
                                  <div key={point.month} className="flex h-full min-w-[54px] flex-1 items-end justify-center">
                                    <div className="w-full max-w-[52px] rounded-t-md bg-[var(--deshazo-blue)]/90" style={{ height: `${height}px` }} />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          <div className="mt-2 ml-14 flex justify-between gap-3">
                            {monthlyServiceSpendData.map((point) => (
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
                </div>
              </article>

              <article className="rounded-[16px] border-[6px] border-[var(--deshazo-surface-2)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                <h2 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--deshazo-text)]">Month Over Month Spend By Parts</h2>
                <div className="mt-5 rounded-[14px] bg-[linear-gradient(180deg,rgba(238,243,255,0.5)_0%,rgba(255,255,255,1)_100%)] p-4">
                  <div className="scrollbar-hidden overflow-x-auto">
                      <div className="min-w-[720px]">
                        <div className="grid h-56 grid-rows-[1fr_auto]">
                          <div className="relative">
                            <div className="absolute inset-0 flex flex-col justify-between">
                            {Array.from({ length: 5 }).map((_, index) => {
                              const tickValue = Math.round((maxMonthlyPartsSpend / 4) * (4 - index))
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
                              {monthlyPartsSpendData.map((point) => {
                                const height = getBarHeight(point.spend, maxMonthlyPartsSpend, plotHeight)
                                return (
                                  <div key={point.month} className="flex h-full min-w-[54px] flex-1 items-end justify-center">
                                    <div className="w-full max-w-[52px] rounded-t-md bg-[var(--deshazo-blue)]/90" style={{ height: `${height}px` }} />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          <div className="mt-2 ml-14 flex justify-between gap-3">
                            {monthlyPartsSpendData.map((point) => (
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
                </div>
              </article>

              <article className="rounded-[16px] border-[6px] border-[var(--deshazo-surface-2)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                <h2 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--deshazo-text)]">Avg. Invoice Amount</h2>
                <div className="mt-5 rounded-[14px] bg-[linear-gradient(180deg,rgba(238,243,255,0.5)_0%,rgba(255,255,255,1)_100%)] p-4">
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
                </div>
              </article>

              <article className="relative overflow-hidden rounded-[16px] border-[6px] border-[var(--deshazo-surface-2)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                <div className={locationMappingIsPending ? 'scale-[1.01] opacity-45 blur-[8px] saturate-50' : ''}>
                  <h2 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--deshazo-text)]">Spend By Location</h2>
                  <div className="mt-6 flex flex-col items-center justify-center gap-5">
                    {locationSpendData.length > 0 ? (
                      <>
                        <div className="h-44 w-44 rounded-full" style={{ background: buildConicGradient(locationSpendData) }} />
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
                        {unmappedLocationInvoiceCount > 0 ? (
                          <div className="text-center text-xs font-semibold text-[rgba(21,24,33,0.48)]">
                            {unmappedLocationInvoiceCount} invoice{unmappedLocationInvoiceCount === 1 ? '' : 's'} unmatched by job number
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="flex h-44 items-center justify-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                        No mapped locations
                      </div>
                    )}
                  </div>
                </div>
                {locationMappingIsPending ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/72 px-6 text-center backdrop-blur-md">
                    <div className="max-w-[360px] rounded-md border border-[var(--deshazo-border)] bg-white px-4 py-3 text-sm font-black text-[var(--deshazo-text)] shadow-[0_22px_54px_-28px_rgba(47,86,166,0.42)]">
                      Location spend pending job-number match
                    </div>
                  </div>
                ) : null}
              </article>

              <article className="rounded-[16px] border-[6px] border-[var(--deshazo-surface-2)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                <h2 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--deshazo-text)]">Spend By DeShazo Branch</h2>
                <div className="mt-5 rounded-[14px] bg-[linear-gradient(180deg,rgba(238,243,255,0.5)_0%,rgba(255,255,255,1)_100%)] p-4">
                  <div className="space-y-3">
                    {branchSpendData.slice(0, 8).map((item) => {
                      const width = maxBranchSpend > 0 ? (item.spend / maxBranchSpend) * 100 : 0
                      return (
                        <div key={item.label} className="grid grid-cols-[92px_minmax(0,1fr)_88px] items-center gap-3">
                          <span className="truncate text-xs font-bold text-[rgba(21,24,33,0.58)]">{item.label}</span>
                          <div className="h-5 overflow-hidden rounded-sm bg-white shadow-[inset_0_0_0_1px_rgba(47,86,166,0.08)]">
                            <div className="h-full rounded-sm" style={{ width: `${width}%`, backgroundColor: item.color }} />
                          </div>
                          <span className="text-right text-xs font-bold text-[rgba(21,24,33,0.66)]">{formatCurrency(item.spend)}</span>
                        </div>
                      )
                    })}
                    {branchSpendData.length === 0 ? (
                      <div className="flex h-44 items-center justify-center text-sm font-semibold text-[rgba(21,24,33,0.45)]">
                        No branch spend
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>

              <article className="rounded-[16px] border-[6px] border-[var(--deshazo-surface-2)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                <h2 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--deshazo-text)]">Invoice Size Mix</h2>
                <div className="mt-6 flex flex-col items-center justify-center gap-5">
                  <div className="relative h-44 w-44 rounded-full bg-[var(--deshazo-surface-2)]" style={invoiceSizeTotal > 0 ? { background: buildConicGradient(invoiceSizeData) } : undefined}>
                    <div className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-center text-[11px] font-semibold text-[var(--deshazo-text)] shadow-[inset_0_0_0_1px_rgba(47,86,166,0.08)]">
                      Invoice mix
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-5 text-sm">
                    {invoiceSizeData.map((segment) => (
                      <div key={segment.label} className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: segment.color }} />
                        <span className="text-[rgba(21,24,33,0.66)]">
                          {segment.label} ({segment.value}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            </section>

            <section className="spend-print-break rounded-[16px] border border-[var(--deshazo-border)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.08em] text-[var(--deshazo-blue)]">
                    Location Comparison
                  </p>
                  <h2 className="mt-1 text-[24px] font-black tracking-[-0.04em] text-[var(--deshazo-text)]">
                    Spend by Location Detail
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-[rgba(21,24,33,0.55)]">
                    Ranked by total cost for {toplineSpend.topline_start_str}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-right sm:grid-cols-4">
                  {[
                    ['Locations', locationComparison.length.toLocaleString()],
                    ['Total Jobs', locationComparison.reduce((sum, item) => sum + item.total_jobs, 0).toLocaleString()],
                    ['Mapped Invoices', `${analytics.locationMappedInvoiceCount.toLocaleString()} / ${toplineSpend.total_invoices.toLocaleString()}`],
                    ['Top Location', topLocationComparison?.location ?? 'None'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-md bg-[var(--deshazo-surface)] px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.05em] text-[rgba(21,24,33,0.48)]">{label}</p>
                      <p className="mt-0.5 text-sm font-black text-[var(--deshazo-text)]">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[980px] w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-[var(--deshazo-blue)] text-white">
                      {['Location', 'Jobs', 'Invoices', 'Total Cost', 'Avg. Invoice', 'Service', 'Parts', 'Mapped', 'Mix'].map((heading) => (
                        <th key={heading} className="px-3 py-2 text-xs font-black uppercase tracking-[0.04em]">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {locationComparison.map((item) => {
                      const servicePercent = item.total_invoice_cost > 0
                        ? Math.round((item.total_service_cost / item.total_invoice_cost) * 100)
                        : 0
                      const partsPercent = Math.max(0, 100 - servicePercent)
                      const totalPercent = locationComparisonTotal > 0
                        ? Number(((item.total_invoice_cost / locationComparisonTotal) * 100).toFixed(2))
                        : 0

                      return (
                        <tr key={item.location} className="border-b border-[var(--deshazo-border)]">
                          <td className="px-3 py-3 align-top">
                            <p className="font-black text-[var(--deshazo-text)]">{item.location}</p>
                            <p className="mt-0.5 text-xs font-semibold text-[rgba(21,24,33,0.45)]">
                              {totalPercent}% of total spend
                            </p>
                          </td>
                          <td className="px-3 py-3 align-top font-bold text-[rgba(21,24,33,0.72)]">{item.total_jobs.toLocaleString()}</td>
                          <td className="px-3 py-3 align-top font-bold text-[rgba(21,24,33,0.72)]">{item.total_invoices.toLocaleString()}</td>
                          <td className="px-3 py-3 align-top font-black text-[var(--deshazo-text)]">{formatCurrency(item.total_invoice_cost)}</td>
                          <td className="px-3 py-3 align-top font-bold text-[rgba(21,24,33,0.72)]">{formatCurrency(item.average_invoice_cost)}</td>
                          <td className="px-3 py-3 align-top font-bold text-[rgba(21,24,33,0.72)]">{formatCurrency(item.total_service_cost)}</td>
                          <td className="px-3 py-3 align-top font-bold text-[rgba(21,24,33,0.72)]">{formatCurrency(item.total_parts_cost)}</td>
                          <td className="px-3 py-3 align-top font-bold text-[rgba(21,24,33,0.72)]">{item.mapped_invoice_count.toLocaleString()}</td>
                          <td className="px-3 py-3 align-top">
                            <div className="h-3 w-32 overflow-hidden rounded-full bg-[#efb634]">
                              <div className="h-full bg-[var(--deshazo-blue-soft)]" style={{ width: `${servicePercent}%` }} />
                            </div>
                            <p className="mt-1 text-[11px] font-semibold text-[rgba(21,24,33,0.48)]">
                              {servicePercent}% service / {partsPercent}% parts
                            </p>
                          </td>
                        </tr>
                      )
                    })}
                    {locationComparison.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-8 text-center text-sm font-semibold text-[rgba(21,24,33,0.48)]">
                          No location comparison rows for this date range.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-bold text-[rgba(21,24,33,0.52)]">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[var(--deshazo-blue-soft)]" />
                  Service spend
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#efb634]" />
                  Parts spend
                </span>
                <span>Unmapped invoices are shown as a separate location row.</span>
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  )
}
