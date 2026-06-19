import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { isConfigured, supabase } from '../lib/supabase'
import { usePortalMenu } from '../lib/usePortalMenu'
import { useDeveloperMenuItems } from '../lib/useDeveloperMenuItems'
import { DeveloperBadge } from '../components/DeveloperBadge'
import {
  type DeshazoSavedWorkOrderListItem,
  getDeshazoExternalWorkOrdersLastSync,
  getSavedDeshazoWorkOrders,
  syncDeshazoExternalWorkOrders,
} from '../lib/deshazoExternalReports'
import { getCurrentUserTag, type UserTag } from '../lib/userTags'
import { getCustomerDisplayName, useCustomerPath, useSelectedCustomer } from '../lib/customerRouting'

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

const WORK_ORDERS_PAGE_SIZE = 15
const FULL_SYNC_MISSING_BATCH_SIZE = 10
const FULL_SYNC_MAX_BACKFILL_PASSES = 80

function formatDate(value: string) {
  if (!value) return ''
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(value)
  return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).format(date)
}

function formatDateRange(workOrder: DeshazoSavedWorkOrderListItem) {
  const startDate = formatDate(workOrder.startDate)
  const endDate = formatDate(workOrder.endDate)
  if (startDate && endDate) return `${startDate} - ${endDate}`
  return startDate || endDate || '-'
}

function formatDateTime(value: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function getWorkOrderNumber(workOrder: DeshazoSavedWorkOrderListItem) {
  return workOrder.jobNo || workOrder.salesOrderNo || String(workOrder.workOrderId)
}

function isRecentlySynced(workOrder: DeshazoSavedWorkOrderListItem) {
  if (!workOrder.createdAt) return false
  const createdAt = new Date(workOrder.createdAt).getTime()
  if (!Number.isFinite(createdAt)) return false
  return Date.now() - createdAt < 24 * 60 * 60 * 1000
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
  const normalizedType = jobType.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (normalizedType.includes('inspection')) return 'bg-[#4f7fd6]'
  if (normalizedType.includes('warranty')) return 'bg-[#9aa1ad]'
  if (normalizedType.includes('service call')) return 'bg-[#4f9879]'
  if (normalizedType.includes('installation')) return 'bg-[#43c7ae]'
  if (
    normalizedType.includes('retail parts') ||
    normalizedType.includes('repair') ||
    normalizedType.includes('load test') ||
    normalizedType.includes('quoted repair') ||
    normalizedType.includes('site agreement') ||
    normalizedType.includes('emergency after hour')
  ) {
    return 'bg-[#f4b331]'
  }
  return 'bg-[#f4b331]'
}

export default function DeshazoWorkOrders() {
  const [user, setUser] = useState<User | null>(null)
  const [workOrders, setWorkOrders] = useState<DeshazoSavedWorkOrderListItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [lastSyncAt, setLastSyncAt] = useState('')
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const [userTag, setUserTag] = useState<UserTag | null>(null)
  const userRef = useRef<User | null>(null)
  const userTagRef = useRef<UserTag | null>(null)
  const lastSyncAtRef = useRef('')
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const navigate = useNavigate()
  const selectedCustomer = useSelectedCustomer()
  const customerName = getCustomerDisplayName(selectedCustomer)
  const customerPath = useCustomerPath()
  const canFetchAll = userTag === 'developer'
  const searchIsPending = search !== submittedSearch || (loading && submittedSearch.trim().length > 0)

  const activeMenuItems = useDeveloperMenuItems(menuItems, '/deshazo-work-orders')

  const loadWorkOrders = useCallback(async (cancelledRef?: { cancelled: boolean }) => {
    if (!isConfigured || !supabase) {
      navigate(customerPath('/login'))
      return
    }

    const client = supabase

    try {
      setLoading(true)
      let nextUser = userRef.current
      if (!nextUser) {
        const { data } = await client.auth.getUser()
        nextUser = data.user
      }

      if (!nextUser) {
        navigate(customerPath('/login'))
        return
      }

      const offset = (currentPage - 1) * WORK_ORDERS_PAGE_SIZE
      const [result, latestSyncAt, nextUserTag] = await Promise.all([
        getSavedDeshazoWorkOrders(WORK_ORDERS_PAGE_SIZE, submittedSearch, offset, selectedCustomer),
        lastSyncAtRef.current ? Promise.resolve(lastSyncAtRef.current) : getDeshazoExternalWorkOrdersLastSync(selectedCustomer),
        userTagRef.current ? Promise.resolve(userTagRef.current) : getCurrentUserTag(nextUser.id),
      ])
      if (cancelledRef?.cancelled) return

      const totalPages = Math.max(1, Math.ceil(result.totalCount / WORK_ORDERS_PAGE_SIZE))
      if (currentPage > totalPages) {
        setCurrentPage(totalPages)
        return
      }

      const firstVisibleRow = result.totalCount > 0 ? offset + 1 : 0
      const lastVisibleRow = Math.min(offset + result.workOrders.length, result.totalCount)

      userRef.current = nextUser
      userTagRef.current = nextUserTag
      lastSyncAtRef.current = latestSyncAt
      setUser(nextUser)
      setUserTag(nextUserTag)
      setWorkOrders(result.workOrders)
      setTotalCount(result.totalCount)
      setLastSyncAt(latestSyncAt)
      setMessage(
        result.totalCount > 0
          ? `Showing ${firstVisibleRow}-${lastVisibleRow} of ${result.totalCount} saved work orders from Supabase.`
          : 'No saved work orders found yet.',
      )
    } catch (error) {
      if (cancelledRef?.cancelled) return
      setMessage(error instanceof Error ? error.message : 'Saved work orders could not be loaded.')
    } finally {
      if (!cancelledRef?.cancelled) setLoading(false)
    }
  }, [currentPage, customerPath, navigate, selectedCustomer, submittedSearch])

  useEffect(() => {
    if (!isConfigured || !supabase) {
      navigate(customerPath('/login'))
      return
    }

    const cancelledRef = { cancelled: false }
    loadWorkOrders(cancelledRef)
    return () => {
      cancelledRef.cancelled = true
    }
  }, [customerPath, loadWorkOrders, navigate])

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
    navigate(customerPath('/login'))
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCurrentPage(1)
      setSubmittedSearch(search)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [search])


  const clearSearch = () => {
    setSearch('')
    setSubmittedSearch('')
    setCurrentPage(1)
  }

  const syncAllWorkOrders = async () => {
    let pagesProcessed = 0
    let totalCount: number | null = null
    let totalPages: number | null = null
    let workOrdersSeen = 0
    let reportsSeen = 0
    const failures: Array<Record<string, unknown>> = []

    for (let pass = 1; pass <= FULL_SYNC_MAX_BACKFILL_PASSES; pass += 1) {
      setMessage(
        `Backfilling missing work orders from production API... pass ${pass}, ${workOrdersSeen} processed so far.`,
      )
      const missingResult = await syncDeshazoExternalWorkOrders({
        pageSize: FULL_SYNC_MISSING_BATCH_SIZE,
        maxPages: 1,
        page: 1,
        nextMissingByDate: true,
      })

      totalCount = missingResult.totalCount ?? totalCount
      totalPages = missingResult.totalPages ?? totalPages
      pagesProcessed += missingResult.pagesProcessed
      workOrdersSeen += missingResult.workOrdersSeen
      reportsSeen += missingResult.reportsSeen
      failures.push(...(missingResult.failures ?? []))

      if (missingResult.workOrdersSeen === 0) {
        break
      }
    }

    return {
      saved: true,
      pagesProcessed,
      pageSize: FULL_SYNC_MISSING_BATCH_SIZE,
      totalCount,
      totalPages,
      workOrdersSeen,
      reportsSeen,
      failures,
    }
  }

  const handleSync = async (
    label: string,
    pageSize: number,
    maxPages?: number,
    page = 1,
    latestByDate = false,
    nextMissingByDate = false,
  ) => {
    const isFetchAll = !maxPages && !latestByDate && !nextMissingByDate
    const scopeText = isFetchAll
      ? `all missing work orders from the full source list in batches of ${FULL_SYNC_MISSING_BATCH_SIZE}`
      : nextMissingByDate
      ? `the next ${pageSize} newest work orders that are not already saved`
      : maxPages
        ? `${pageSize} work orders from source page ${page}`
        : `all work orders using page size ${pageSize}`
    const confirmed = window.confirm(
      `This will call the production DeShazo sync API and save/update ${scopeText} in Supabase. Continue?`,
    )
    if (!confirmed) return

    try {
      setSyncing(true)
      setMessage(`Syncing ${label} from production API...`)
      const result = isFetchAll
        ? await syncAllWorkOrders()
        : await syncDeshazoExternalWorkOrders({ pageSize, maxPages, page, latestByDate, nextMissingByDate })
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

  const totalPages = Math.max(1, Math.ceil(totalCount / WORK_ORDERS_PAGE_SIZE))
  const firstRow = totalCount > 0 ? (currentPage - 1) * WORK_ORDERS_PAGE_SIZE + 1 : 0
  const lastRow = Math.min(currentPage * WORK_ORDERS_PAGE_SIZE, totalCount)

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
                  Last Sync: {lastSyncAt ? formatDateTime(lastSyncAt) : 'Never'}
                </div>
              </div>
              <div className="flex w-full flex-col gap-3 lg:max-w-[760px] lg:items-end">
                {canFetchAll && (
                  <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                    <button
                      type="button"
                      onClick={() => handleSync('all work orders', FULL_SYNC_MISSING_BATCH_SIZE)}
                      disabled={syncing}
                      className="rounded-sm bg-[#4f9879] px-3 py-2 text-sm font-black text-white transition hover:bg-[#43886c] disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      <span className="inline-flex items-center gap-2">
                        Fetch All
                        <DeveloperBadge />
                      </span>
                    </button>
                  </div>
                )}
                <div className="w-full max-w-[440px]">
                  <div className="relative min-w-0">
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search D-number or job number..."
                      className="w-full min-w-0 border border-[#bfc7d8] px-3 py-2 pr-9 text-sm font-semibold outline-none focus:border-[var(--deshazo-blue)]"
                    />
                    {search || submittedSearch ? (
                      <button
                        type="button"
                        onClick={clearSearch}
                        className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-[#bfc7d8] bg-[#eef2f8] text-[16px] font-black leading-none text-[#273f7a] shadow-sm transition hover:border-[var(--deshazo-blue)] hover:bg-[#dbe5ff]"
                        aria-label="Clear search"
                        title="Clear search"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                  {searchIsPending ? (
                    <div className="mt-1 flex items-center gap-2 text-[12px] font-bold text-[#5f6675]" role="status">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[#f4b331]" aria-hidden="true" />
                      Searching...
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {message ? (
              <div className="mb-4 rounded-md bg-[#f6f8fc] px-3 py-2 text-sm font-semibold text-[rgba(21,24,33,0.72)]">
                {message}
              </div>
            ) : null}

            <div className="mb-3 flex flex-col gap-2 border border-[var(--deshazo-border)] bg-[#f8f9fb] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-bold text-[#5f6675]">
                Rows {firstRow}-{lastRow} of {totalCount}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage <= 1 || loading}
                  className="rounded-sm bg-[#f4b331] px-3 py-1.5 text-sm font-black text-white transition hover:bg-[#dfa123] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  ‹ Prev
                </button>
                <span className="min-w-[110px] text-center text-sm font-black text-[var(--deshazo-text)]">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage >= totalPages || loading}
                  className="rounded-sm bg-[#f4b331] px-3 py-1.5 text-sm font-black text-white transition hover:bg-[#dfa123] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Next ›
                </button>
              </div>
            </div>

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
                    const targetHref = `${customerPath('/deshazo-external-reports')}?workOrderId=${encodeURIComponent(workOrder.workOrderId)}`
                    const assignedTechnicians = getAssignedTechnicians(workOrder)
                    return (
                      <tr
                        key={workOrder.workOrderId}
                        onClick={() => navigate(targetHref)}
                        className="cursor-pointer border-b border-[var(--deshazo-border)] odd:bg-[#f8f9fb] even:bg-white hover:bg-[#eef3ff]"
                      >
                        <td className="px-3 py-3 font-black">
                          <div className="flex items-center gap-2">
                            <span>{getWorkOrderNumber(workOrder)}</span>
                            {canFetchAll && isRecentlySynced(workOrder) ? (
                              <span className="rounded-sm bg-[#4f7fd6] px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.02em] text-white">
                                New
                              </span>
                            ) : null}
                            {canFetchAll && isRecentlySynced(workOrder) ? <DeveloperBadge /> : null}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`rounded-sm px-2 py-1 text-sm font-black text-white ${getTypeBadgeClass(workOrder.jobType)}`}>
                            {workOrder.jobType || 'Inspection'}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-bold">{workOrder.customerName || customerName}</td>
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
