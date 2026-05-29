import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { isConfigured, supabase } from '../lib/supabase'
import { usePortalMenu } from '../lib/usePortalMenu'
import {
  type DeshazoSavedWorkOrderListItem,
  getSavedDeshazoWorkOrders,
  syncDeshazoExternalWorkOrders,
} from '../lib/deshazoExternalReports'
import { getCurrentUserTag } from '../lib/userTags'

const menuItems = [
  { label: 'Home', href: '/dashboard' },
  { label: 'Open Risk Items', href: '/asset-fleet-assets?view=open-risk' },
  { label: 'Asset Fleet', href: '/asset-fleet' },
  { label: 'Spend', href: '/spend' },
  { label: 'Location Comparison', href: '/location-comparison' },
  { label: 'Documents', href: '/documents-reports' },
  { label: 'Custom Reports', href: '/custom-reports' },
  { label: 'Work Orders', href: '/deshazo-work-orders' },
  { label: 'Deshazo Reports', href: '/deshazo-external-reports' },
  { label: 'Add User', href: '/add-user' },
  { label: 'Contact Us', href: '/contact-us' },
]

function formatDate(value: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' }).format(new Date(value))
}

function formatDateRange(workOrder: DeshazoSavedWorkOrderListItem) {
  const startDate = formatDate(workOrder.startDate)
  const endDate = formatDate(workOrder.endDate)
  if (startDate && endDate) return `${startDate} - ${endDate}`
  return startDate || endDate || '-'
}

function getWorkOrderNumber(workOrder: DeshazoSavedWorkOrderListItem) {
  return workOrder.jobNo || workOrder.salesOrderNo || String(workOrder.workOrderId)
}

function getCustomerLocation(workOrder: DeshazoSavedWorkOrderListItem) {
  return workOrder.customerLocationAddress || workOrder.customerLocationName || '-'
}

function getAssignedTechnicians(workOrder: DeshazoSavedWorkOrderListItem) {
  const rawPayload = workOrder.rawPayload
  if (!rawPayload || typeof rawPayload !== 'object') return ''
  const trips =
    'workOrderTrips' in rawPayload && Array.isArray(rawPayload.workOrderTrips)
      ? rawPayload.workOrderTrips
      : []

  const names = trips
    .flatMap((trip) =>
      trip && typeof trip === 'object' && Array.isArray((trip as Record<string, unknown>).workOrderEmployees)
        ? ((trip as Record<string, unknown>).workOrderEmployees as Array<Record<string, unknown>>)
        : [],
    )
    .map((employeeRow) => {
      const employee =
        employeeRow.employee && typeof employeeRow.employee === 'object'
          ? (employeeRow.employee as Record<string, unknown>)
          : null
      const firstName = typeof employee?.firstName === 'string' ? employee.firstName : ''
      const lastName = typeof employee?.lastName === 'string' ? employee.lastName : ''
      return [firstName, lastName].filter(Boolean).join(' ').trim()
    })
    .filter(Boolean)

  return Array.from(new Set(names)).join(', ')
}

function getTypeBadgeClass(jobType: string) {
  const normalizedType = jobType.toLowerCase()
  if (normalizedType.includes('service')) return 'bg-[#4f9879] text-white'
  if (normalizedType.includes('mod')) return 'bg-[#f47f2f] text-white'
  return 'bg-[#4f7fd6] text-white'
}

export default function DeshazoWorkOrders() {
  const [user, setUser] = useState<User | null>(null)
  const [workOrders, setWorkOrders] = useState<DeshazoSavedWorkOrderListItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const navigate = useNavigate()

  const activeMenuItems = useMemo(
    () =>
      menuItems.map((item) => ({
        ...item,
        active: item.href === '/deshazo-work-orders',
      })),
    [],
  )

  const loadWorkOrders = useCallback(async (cancelledRef?: { cancelled: boolean }) => {
    if (!isConfigured || !supabase) {
      navigate('/login')
      return
    }

    const client = supabase

    try {
      setLoading(true)
      const { data } = await client.auth.getUser()
      const nextUser = data.user
      if (!nextUser) {
        navigate('/login')
        return
      }

      const userTag = await getCurrentUserTag(nextUser.id)
      if (userTag !== 'developer') {
        navigate('/dashboard')
        return
      }

      const result = await getSavedDeshazoWorkOrders(100, submittedSearch)
      if (cancelledRef?.cancelled) return

      setUser(nextUser)
      setWorkOrders(result.workOrders)
      setTotalCount(result.totalCount)
      setMessage(
        result.totalCount > 0
          ? `Showing ${result.workOrders.length} of ${result.totalCount} saved work orders from Supabase.`
          : 'No saved work orders found yet.',
      )
    } catch (error) {
      if (cancelledRef?.cancelled) return
      setMessage(error instanceof Error ? error.message : 'Saved work orders could not be loaded.')
    } finally {
      if (!cancelledRef?.cancelled) setLoading(false)
    }
  }, [navigate, submittedSearch])

  useEffect(() => {
    if (!isConfigured || !supabase) {
      navigate('/login')
      return
    }

    const cancelledRef = { cancelled: false }
    loadWorkOrders(cancelledRef)
    return () => {
      cancelledRef.cancelled = true
    }
  }, [loadWorkOrders, navigate])

  const fullName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'Portal User'
  const initials =
    fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase())
      .join('') || 'DP'

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/login')
  }

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmittedSearch(search)
  }

  const handleSync = async (label: string, pageSize: number, maxPages?: number) => {
    const scopeText = maxPages ? `${pageSize} work orders` : `all work orders using page size ${pageSize}`
    const confirmed = window.confirm(
      `This will call the production DeShazo sync API and save/update ${scopeText} in Supabase. Continue?`,
    )
    if (!confirmed) return

    try {
      setSyncing(true)
      setMessage(`Syncing ${label} from production API...`)
      const result = await syncDeshazoExternalWorkOrders({ pageSize, maxPages })
      const failureText = result.failures?.length ? ` ${result.failures.length} failures returned.` : ''
      await loadWorkOrders()
      setMessage(
        `Sync complete: ${result.workOrdersSeen} work orders and ${result.reportsSeen} reports processed.${failureText}`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'External work order sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  if (loading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="rounded-2xl border border-[var(--deshazo-border)] bg-white px-6 py-4 text-sm font-semibold text-[var(--deshazo-blue)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
          Loading work orders...
        </div>
      </div>
    )
  }

  if (!user) return null

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
                  {activeMenuItems.map((item) => (
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
                    </Link>
                  ))}
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

        <section className="min-w-0 flex-1 bg-[#e9eef8] px-5 py-5 sm:px-8 lg:px-10">
          <div className="rounded-sm border border-[var(--deshazo-border)] bg-white px-5 py-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.22)]">
            <div className="mb-4 flex flex-col gap-3 border-b border-[var(--deshazo-border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-[20px] font-black text-[var(--deshazo-text)]">
                  Work Orders <span className="text-[15px] font-bold text-[#7a808e]">({totalCount})</span>
                </h1>
                <div className="mt-2 inline-flex rounded-sm bg-[#f4b331] px-3 py-1 text-sm font-bold text-white">
                  Synced
                </div>
              </div>
              <div className="flex w-full flex-col gap-3 lg:max-w-[760px] lg:items-end">
                <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                  <button
                    type="button"
                    onClick={() => handleSync('latest 10 work orders', 10, 1)}
                    disabled={syncing}
                    className="rounded-sm bg-[#4f7fd6] px-3 py-2 text-sm font-black text-white transition hover:bg-[#3f6dc0] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    Fetch 10
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSync('latest 50 work orders', 50, 1)}
                    disabled={syncing}
                    className="rounded-sm bg-[#4f7fd6] px-3 py-2 text-sm font-black text-white transition hover:bg-[#3f6dc0] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    Fetch 50
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSync('all work orders', 100)}
                    disabled={syncing}
                    className="rounded-sm bg-[#4f9879] px-3 py-2 text-sm font-black text-white transition hover:bg-[#43886c] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    Fetch All
                  </button>
                </div>
                <form onSubmit={handleSearchSubmit} className="flex w-full max-w-[360px] items-stretch">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="wabash"
                    className="min-w-0 flex-1 border border-[#bfc7d8] px-3 py-2 text-sm font-semibold outline-none focus:border-[var(--deshazo-blue)]"
                  />
                  <button type="submit" className="bg-[#f4b331] px-4 text-lg font-black text-white">
                    ⌕
                  </button>
                </form>
              </div>
            </div>

            {message ? (
              <div className="mb-4 rounded-md bg-[#f6f8fc] px-3 py-2 text-sm font-semibold text-[rgba(21,24,33,0.72)]">
                {message}
              </div>
            ) : null}

            <div className="overflow-auto">
              <table className="min-w-[1320px] w-full border-collapse text-left text-[14px]">
                <thead>
                  <tr className="border-b border-[var(--deshazo-border)] text-[13px] font-black text-[#6d7482]">
                    <th className="px-3 py-3">Work Order #</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Customer Location</th>
                    <th className="px-3 py-3">Comment</th>
                    <th className="px-3 py-3">Service Location</th>
                    <th className="px-3 py-3">Dates</th>
                    <th className="px-3 py-3">Assigned To</th>
                  </tr>
                </thead>
                <tbody>
                  {workOrders.map((workOrder) => {
                    const targetHref = `/deshazo-external-reports?workOrderId=${encodeURIComponent(workOrder.workOrderId)}`
                    const assignedTechnicians = getAssignedTechnicians(workOrder)
                    return (
                      <tr
                        key={workOrder.workOrderId}
                        onClick={() => navigate(targetHref)}
                        className="cursor-pointer border-b border-[var(--deshazo-border)] odd:bg-[#f8f9fb] even:bg-white hover:bg-[#eef3ff]"
                      >
                        <td className="px-3 py-3 font-black">{getWorkOrderNumber(workOrder)}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-sm px-2 py-1 text-sm font-black ${getTypeBadgeClass(workOrder.jobType)}`}>
                            {workOrder.jobType || 'Inspection'}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-bold">{workOrder.customerName || 'Wabash'}</td>
                        <td className="max-w-[290px] truncate px-3 py-3 font-bold">{getCustomerLocation(workOrder)}</td>
                        <td className="max-w-[260px] truncate px-3 py-3 font-bold">{workOrder.comment || '-'}</td>
                        <td className="px-3 py-3 font-bold">{workOrder.serviceLocationName || '-'}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-bold">{formatDateRange(workOrder)}</td>
                        <td className="px-3 py-3">
                          {assignedTechnicians ? (
                            <span className="font-bold text-[var(--deshazo-text)]">{assignedTechnicians}</span>
                          ) : (
                            <span className="rounded-sm bg-[#f4b331] px-3 py-2 text-sm font-black text-white">
                              Show Assigned
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
