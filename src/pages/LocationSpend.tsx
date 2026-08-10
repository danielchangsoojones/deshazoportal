import { Fragment, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DeveloperBadge } from '../components/DeveloperBadge'
import { getCustomerDisplayName, useCustomerPath, useSelectedCustomer } from '../lib/customerRouting'
import {
  getInvoiceSpendCranesForLocation,
  type InvoiceSpendAllocation,
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

type LocationInvoiceGroup = {
  invoiceId: string
  invoiceNumber: string
  invoiceDate: string
  jobNumber: string
  invoiceTotal: number
  locationSpend: number
  cranes: InvoiceSpendAllocation[]
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
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<string>>(new Set())

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

  const invoiceGroups = useMemo<LocationInvoiceGroup[]>(() => {
    const allocations = new Map<string, InvoiceSpendAllocation>()
    spendState.data.forEach((crane) => {
      crane.allocations.forEach((allocation) => allocations.set(allocation.id, allocation))
    })

    const groups = new Map<string, LocationInvoiceGroup>()
    allocations.forEach((allocation) => {
      const current = groups.get(allocation.invoiceId) ?? {
        invoiceId: allocation.invoiceId,
        invoiceNumber: allocation.invoiceNumber,
        invoiceDate: allocation.invoiceDate,
        jobNumber: allocation.jobNumber,
        invoiceTotal: allocation.invoiceTotal,
        locationSpend: 0,
        cranes: [],
      }
      current.locationSpend += allocation.allocatedAmount
      current.cranes.push(allocation)
      groups.set(allocation.invoiceId, current)
    })

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        cranes: [...group.cranes].sort(
          (left, right) => right.allocatedAmount - left.allocatedAmount || left.dNumber.localeCompare(right.dNumber),
        ),
      }))
      .sort((left, right) => right.invoiceDate.localeCompare(left.invoiceDate) || right.locationSpend - left.locationSpend)
  }, [spendState.data])

  useEffect(() => {
    setExpandedInvoiceIds((current) => {
      const availableIds = new Set(invoiceGroups.map((invoice) => invoice.invoiceId))
      const retainedIds = new Set(Array.from(current).filter((invoiceId) => availableIds.has(invoiceId)))
      if (retainedIds.size > 0 || invoiceGroups.length === 0) return retainedIds
      return new Set([invoiceGroups[0].invoiceId])
    })
  }, [invoiceGroups])

  const toggleInvoice = (invoiceId: string) => {
    setExpandedInvoiceIds((current) => {
      const next = new Set(current)
      if (next.has(invoiceId)) next.delete(invoiceId)
      else next.add(invoiceId)
      return next
    })
  }

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
                Invoice and job spend with the allocated cranes shown inside each invoice.
              </p>
            </div>
          </div>

          <section className="mb-6 grid gap-4 md:grid-cols-3">
            {[
              ['Total Spend', formatCurrency(totals.totalSpend)],
              ['Invoices', totals.invoiceCount.toLocaleString()],
              ['Cranes', totals.craneCount.toLocaleString()],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[14px] border border-[var(--deshazo-border)] bg-white px-5 py-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.22)]">
                <p className="text-[13px] font-bold uppercase tracking-[0.02em] text-[#8b92a4]">{label}</p>
                <p className="mt-2 text-3xl font-black text-[var(--deshazo-text)]">{value}</p>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-[14px] border border-[var(--deshazo-border)] bg-white shadow-[0_18px_40px_-34px_rgba(47,86,166,0.22)]">
            {loading ? (
              <div className="px-6 py-10 text-center text-sm font-semibold text-[var(--deshazo-blue)]">
                Loading crane spend...
              </div>
            ) : spendState.error ? (
              <div className="px-6 py-10 text-center text-sm font-semibold text-[#b42318]">{spendState.error}</div>
            ) : spendState.data.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm font-semibold text-[rgba(21,24,33,0.64)]">
                No invoice spend allocations are available for this location yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left">
                  <thead className="bg-[var(--deshazo-surface)] text-[12px] font-black uppercase tracking-[0.04em] text-[#6f7788]">
                    <tr>
                      <th className="min-w-[220px] px-5 py-4">Invoice / Crane</th>
                      <th className="min-w-[170px] px-5 py-4">Job / Details</th>
                      <th className="min-w-[140px] px-5 py-4">Date</th>
                      <th className="min-w-[130px] px-5 py-4 text-right">Allocated Spend</th>
                      <th className="min-w-[130px] px-5 py-4 text-right">Invoice Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceGroups.map((invoice) => {
                      const expanded = expandedInvoiceIds.has(invoice.invoiceId)
                      return (
                        <Fragment key={invoice.invoiceId}>
                          <tr className="border-t border-[var(--deshazo-border)] bg-[#f7f9fd]">
                            <td className="px-5 py-4" colSpan={2}>
                              <button
                                type="button"
                                className="flex w-full items-center gap-3 text-left"
                                onClick={() => toggleInvoice(invoice.invoiceId)}
                                aria-expanded={expanded}
                              >
                                <span
                                  aria-hidden="true"
                                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#c8d5ea] bg-white text-sm font-black text-[var(--deshazo-blue)] transition-transform ${expanded ? 'rotate-90' : ''}`}
                                >
                                  ›
                                </span>
                                <span className="min-w-0">
                                  <span className="block text-[15px] font-black text-[var(--deshazo-text)]">
                                    Invoice {invoice.invoiceNumber || 'number not found'}
                                  </span>
                                  <span className="mt-1 block text-[12px] font-bold text-[#747b8a]">
                                    Job {invoice.jobNumber || 'not found'} · {invoice.cranes.length} crane{invoice.cranes.length === 1 ? '' : 's'}
                                  </span>
                                </span>
                              </button>
                            </td>
                            <td className="px-5 py-4 text-sm font-bold text-[#4d5360]">{formatDate(invoice.invoiceDate)}</td>
                            <td className="px-5 py-4 text-right text-lg font-black text-[var(--deshazo-blue)]">
                              {formatCurrency(invoice.locationSpend)}
                            </td>
                            <td className="px-5 py-4 text-right text-sm font-bold text-[#4d5360]">
                              {formatCurrency(invoice.invoiceTotal)}
                            </td>
                          </tr>
                          {expanded && invoice.cranes.map((crane) => (
                            <tr
                              key={crane.id}
                              className="cursor-pointer border-t border-[#e2e8f2] transition hover:bg-[#f8fbff]"
                              onClick={() => {
                                if (crane.dNumber && crane.dNumber !== 'Unmapped') {
                                  navigate(`${customerPath('/asset-info')}?unit_id=${encodeURIComponent(crane.dNumber)}&tab=spend-analytics`)
                                }
                              }}
                            >
                              <td className="py-4 pl-16 pr-5">
                                <p className="font-extrabold text-[var(--deshazo-text)]">{crane.dNumber || 'Unmapped'}</p>
                                <p className="mt-1 max-w-[38ch] truncate text-sm text-[rgba(21,24,33,0.62)]">
                                  {crane.craneDescription || 'No crane description'}
                                </p>
                              </td>
                              <td className="px-5 py-4">
                                <p className="font-semibold text-[rgba(21,24,33,0.82)]">{crane.craneLocation || '-'}</p>
                                <p className="mt-1 text-sm text-[rgba(21,24,33,0.52)]">{crane.allocationMethod.replaceAll('_', ' ')}</p>
                              </td>
                              <td className="px-5 py-4 text-sm font-semibold text-[rgba(21,24,33,0.62)]">Crane allocation</td>
                              <td className="px-5 py-4 text-right text-lg font-black text-[var(--deshazo-blue)]">
                                {formatCurrency(crane.allocatedAmount)}
                              </td>
                              <td className="px-5 py-4 text-right text-sm font-semibold text-[rgba(21,24,33,0.52)]">
                                {invoice.cranes.length > 1 ? `1 of ${invoice.cranes.length}` : 'Full invoice'}
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  )
}
