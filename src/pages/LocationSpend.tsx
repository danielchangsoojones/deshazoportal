import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DeveloperBadge } from '../components/DeveloperBadge'
import { getCustomerDisplayName, useCustomerPath, useSelectedCustomer } from '../lib/customerRouting'
import {
  getInvoiceSpendCranesForLocation,
  type InvoiceSpendCraneSummary,
} from '../lib/invoiceSpend'
import { isConfigured, supabase } from '../lib/supabase'
import { useDeveloperMenuItems } from '../lib/useDeveloperMenuItems'
import { usePortalMenu } from '../lib/usePortalMenu'

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

const formatCurrency = (value: number) =>
  `$${Math.round(value).toLocaleString()}`

function formatDate(value: string) {
  if (!value) return '-'
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

type LocationSpendState = {
  customer: string
  location: string
  data: InvoiceSpendCraneSummary[]
  error: string
  status: 'loading' | 'ready'
}

function SpendRing({ spend, totalSpend }: { spend: number; totalSpend: number }) {
  const percentage = totalSpend > 0 ? Math.min(100, (spend / totalSpend) * 100) : 0
  const degrees = percentage * 3.6

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative h-14 w-14 shrink-0 rounded-full"
        style={{ background: `conic-gradient(var(--deshazo-blue) 0deg ${degrees}deg, #dce4f1 ${degrees}deg 360deg)` }}
        aria-hidden="true"
      >
        <div className="absolute inset-[8px] flex items-center justify-center rounded-full bg-white">
          <span className="text-[10px] font-black text-[var(--deshazo-text)]">
            {percentage < 1 && percentage > 0 ? '<1%' : `${Math.round(percentage)}%`}
          </span>
        </div>
      </div>
      <div>
        <p className="text-[20px] font-black leading-none text-[var(--deshazo-text)]">{formatCurrency(spend)}</p>
        <p className="mt-1 text-[13px] font-semibold text-[rgba(21,24,33,0.62)]">Share of invoice spend</p>
      </div>
    </div>
  )
}

export default function LocationSpend() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [searchParams] = useSearchParams()
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const navigate = useNavigate()
  const selectedCustomer = useSelectedCustomer()
  const customerPath = useCustomerPath()
  const customerName = getCustomerDisplayName(selectedCustomer)
  const location = searchParams.get('location')?.trim() || ''
  const [spendState, setSpendState] = useState<LocationSpendState>({
    customer: selectedCustomer,
    location,
    data: [],
    error: '',
    status: 'loading',
  })
  const [craneSearch, setCraneSearch] = useState('')

  const activeMenuItems = useDeveloperMenuItems(menuItems, 'Location Comparison')

  useEffect(() => {
    let isMounted = true

    if (!isConfigured || !supabase) {
      navigate(customerPath('/login'))
      return () => {
        isMounted = false
      }
    }

    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return
      if (!data.user) {
        navigate(customerPath('/login'))
      } else {
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

    if (!location) {
      setSpendState({
        customer: selectedCustomer,
        location,
        data: [],
        error: 'Choose a location from Location Comparison to view crane spend.',
        status: 'ready',
      })
      return () => {
        isMounted = false
      }
    }

    setSpendState((current) => ({
      ...current,
      customer: selectedCustomer,
      location,
      status: 'loading',
      error: '',
    }))

    getInvoiceSpendCranesForLocation(location, selectedCustomer)
      .then((nextData) => {
        if (!isMounted) return
        setSpendState({
          customer: selectedCustomer,
          location,
          data: nextData,
          error: '',
          status: 'ready',
        })
      })
      .catch((err: unknown) => {
        if (!isMounted) return
        setSpendState({
          customer: selectedCustomer,
          location,
          data: [],
          error: err instanceof Error ? err.message : 'Unable to load crane spend for this location.',
          status: 'ready',
        })
      })

    return () => {
      isMounted = false
    }
  }, [location, selectedCustomer])

  const totals = useMemo(() => {
    const totalSpend = spendState.data.reduce((sum, crane) => sum + crane.totalSpend, 0)
    const invoiceIds = new Set(spendState.data.flatMap((crane) => crane.allocations.map((allocation) => allocation.invoiceId)))
    return {
      totalSpend,
      invoiceCount: invoiceIds.size,
      craneCount: spendState.data.length,
    }
  }, [spendState.data])

  const visibleCranes = useMemo(() => {
    const query = craneSearch.trim().toLowerCase()
    if (!query) return spendState.data
    return spendState.data.filter((crane) =>
      [
        crane.dNumber,
        crane.craneDescription,
        crane.craneLocation,
        ...crane.allocations.flatMap((allocation) => [allocation.invoiceNumber, allocation.jobNumber]),
      ].some((value) => value.toLowerCase().includes(query)),
    )
  }, [craneSearch, spendState.data])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate(customerPath('/login'))
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="rounded-2xl border border-[var(--deshazo-border)] bg-white px-6 py-4 text-sm font-semibold text-[var(--deshazo-blue)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
          Loading crane spend...
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
  const loading =
    spendState.customer !== selectedCustomer ||
    spendState.location !== location ||
    spendState.status === 'loading'
  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join('') || 'DP'

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
            Signed in as <span className="font-semibold text-white">{userEmail}</span>
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
                    ) : null,
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
          <div className="mb-7 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <Link
                to={customerPath('/location-comparison')}
                className="text-[13px] font-bold uppercase tracking-[0.02em] text-[var(--deshazo-blue)]"
              >
                Location Comparison
              </Link>
              <h1 className="mt-2 text-[clamp(32px,4vw,50px)] font-black leading-[0.98] text-[var(--deshazo-text)]">
                {location || `${customerName} Crane Spend`}
              </h1>
              <p className="mt-3 max-w-[68ch] text-base leading-7 text-[rgba(21,24,33,0.72)]">
                Cranes ordered by total allocated cost, from highest to lowest.
              </p>
            </div>
          </div>

          <article className="mb-6 max-w-[720px] rounded-[10px] border border-[var(--deshazo-border)] bg-white px-6 py-5 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
            <div className="flex flex-wrap items-center gap-6">
              <div className="min-w-[170px]">
                <p className="text-[14px] font-bold uppercase tracking-[0.03em] text-[rgba(21,24,33,0.58)]">Total Spend</p>
                <p className="mt-1 text-[28px] font-extrabold text-[var(--deshazo-text)]">{formatCurrency(totals.totalSpend)}</p>
              </div>
              <div className="flex min-w-[150px] items-center justify-center rounded-[6px] border border-[var(--deshazo-border)] px-6 py-3">
                <div className="text-center">
                  <p className="text-[24px] font-extrabold text-[var(--deshazo-text)]">{totals.invoiceCount}</p>
                  <div className="mt-1 h-[2px] w-24 bg-[var(--deshazo-blue)]" />
                  <p className="text-[18px] font-medium text-[var(--deshazo-blue)]">Invoices</p>
                </div>
              </div>
              <div className="flex min-w-[150px] items-center justify-center rounded-[6px] border border-[var(--deshazo-border)] px-6 py-3">
                <div className="text-center">
                  <p className="text-[24px] font-extrabold text-[var(--deshazo-text)]">{totals.craneCount}</p>
                  <div className="mt-1 h-[2px] w-24 bg-[#efb634]" />
                  <p className="text-[18px] font-medium text-[#9a6a00]">Cranes</p>
                </div>
              </div>
            </div>
          </article>

          <section>
            {loading ? (
              <div className="rounded-lg border border-[var(--deshazo-border)] bg-white px-6 py-10 text-center text-sm font-semibold text-[var(--deshazo-blue)]">
                Loading crane spend...
              </div>
            ) : spendState.error ? (
              <div className="rounded-lg border border-[#f0c4bd] bg-white px-6 py-10 text-center text-sm font-semibold text-[#b42318]">{spendState.error}</div>
            ) : spendState.data.length === 0 ? (
              <div className="rounded-lg border border-[var(--deshazo-border)] bg-white px-6 py-10 text-center text-sm font-semibold text-[rgba(21,24,33,0.64)]">
                No invoice spend allocations are available for this location yet.
              </div>
            ) : (
              <div className="rounded-[14px] border border-[#bfcdf1] bg-[#c7d4f5] px-3 py-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.2)]">
                <div className="mb-4 flex flex-col gap-3 px-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-[18px] font-black text-[var(--deshazo-text)]">Crane Cost Ranking</h2>
                    <p className="mt-1 text-sm font-semibold text-[rgba(21,24,33,0.64)]">
                      {visibleCranes.length} crane{visibleCranes.length === 1 ? '' : 's'} shown · highest cost first
                    </p>
                  </div>
                  <div className="w-full sm:w-auto">
                    <label className="sr-only" htmlFor="crane-spend-search">Search crane costs</label>
                    <input
                      id="crane-spend-search"
                      type="search"
                      value={craneSearch}
                      onChange={(event) => setCraneSearch(event.currentTarget.value)}
                      placeholder="Search crane, job, or invoice"
                      className="h-10 w-full rounded-md border border-[var(--deshazo-border)] bg-white px-4 text-sm font-semibold text-[var(--deshazo-text)] outline-none transition placeholder:text-[#8b92a4] focus:border-[var(--deshazo-blue)] focus:ring-2 focus:ring-[#dbe5ff] sm:w-[300px]"
                    />
                  </div>
                </div>

                {visibleCranes.length === 0 ? (
                  <div className="flex min-h-[420px] items-center justify-center rounded-[10px] bg-white px-6 text-center">
                    <div>
                    <p className="text-base font-black text-[var(--deshazo-text)]">No matching cranes</p>
                    <p className="mt-1 text-sm text-[rgba(21,24,33,0.58)]">Try another D-number, job, or invoice.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {visibleCranes.map((crane) => (
                      <Link
                        key={crane.dNumber}
                        to={`${customerPath('/asset-info')}?unit_id=${encodeURIComponent(crane.dNumber)}&tab=spend-analytics`}
                        className="group overflow-hidden rounded-[10px] border border-[var(--deshazo-border)] bg-white shadow-[0_14px_30px_-28px_rgba(47,86,166,0.22)] transition hover:border-[#9eb3d7] focus:outline-none focus:ring-2 focus:ring-[var(--deshazo-blue)]"
                      >
                        <article className="flex h-full flex-col">
                          <div className="flex-1 space-y-1 px-4 py-4">
                            <p className="text-[18px] font-extrabold uppercase leading-[1.1] text-[var(--deshazo-text)]">{crane.dNumber}</p>
                            <p className="line-clamp-2 min-h-[40px] text-[15px] font-medium leading-5 text-[rgba(21,24,33,0.72)]">
                              {crane.craneDescription || 'No crane description'}
                            </p>
                            <div className="flex items-center gap-2 pt-1 text-[15px] font-semibold text-[var(--deshazo-text)]">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#d7b94a] bg-[#ffe680]">
                                <span className="h-2 w-2 rounded-full bg-[#725900]" />
                              </span>
                              <span className="truncate">{crane.craneLocation || crane.locationLabel || 'Location unavailable'}</span>
                            </div>
                            <p className="pt-1 text-[15px] font-medium text-[rgba(21,24,33,0.78)]">
                              Latest invoice {formatDate(crane.latestInvoiceDate)}
                            </p>
                          </div>

                          <div className="border-t border-[var(--deshazo-border)] px-4 py-4">
                            <SpendRing spend={crane.totalSpend} totalSpend={totals.totalSpend} />
                            <span className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-[4px] bg-[var(--deshazo-blue)] text-[14px] font-bold text-white transition group-hover:bg-[var(--deshazo-blue-deep)]">
                              See Details
                            </span>
                          </div>
                        </article>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  )
}
