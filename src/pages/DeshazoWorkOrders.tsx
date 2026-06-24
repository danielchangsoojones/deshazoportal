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
  { label: 'Document Reports', href: '/documents-reports' },
  { label: 'Custom Reports', href: '/custom-reports' },
  { label: 'Documents', href: '/deshazo-work-orders' },
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
  if (normalizedType.includes('inspection')) return 'border-[#b8c9f5] bg-[#eef3ff] text-[#315aa7]'
  if (normalizedType.includes('warranty')) return 'border-[#d3d8e2] bg-[#f4f6fa] text-[#616a78]'
  if (normalizedType.includes('service call')) return 'border-[#b8dece] bg-[#edf8f3] text-[#367861]'
  if (normalizedType.includes('installation')) return 'border-[#b5e8df] bg-[#ecfbf8] text-[#248976]'
  if (
    normalizedType.includes('retail parts') ||
    normalizedType.includes('repair') ||
    normalizedType.includes('load test') ||
    normalizedType.includes('quoted repair') ||
    normalizedType.includes('site agreement') ||
    normalizedType.includes('emergency after hour')
  ) {
    return 'border-[#f6d58e] bg-[#fff7e8] text-[#a96d09]'
  }
  return 'border-[#f6d58e] bg-[#fff7e8] text-[#a96d09]'
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
          ? `Showing ${firstVisibleRow}-${lastVisibleRow} of ${result.totalCount} saved documents from Supabase.`
          : 'No saved documents found yet.',
      )
    } catch (error) {
      if (cancelledRef?.cancelled) return
      setMessage(error instanceof Error ? error.message : 'Saved documents could not be loaded.')
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
        `Backfilling missing documents from production API... pass ${pass}, ${workOrdersSeen} processed so far.`,
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
      ? `all missing documents from the full source list in batches of ${FULL_SYNC_MISSING_BATCH_SIZE}`
      : nextMissingByDate
      ? `the next ${pageSize} newest documents that are not already saved`
      : maxPages
        ? `${pageSize} documents from source page ${page}`
        : `all documents using page size ${pageSize}`
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
        `Sync complete: ${result.workOrdersSeen} documents and ${result.reportsSeen} reports processed.${failureText}`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'External document sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  if (loading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="rounded-2xl border border-[var(--deshazo-border)] bg-white px-6 py-4 text-sm font-semibold text-[var(--deshazo-blue)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
          Loading documents...
        </div>
      </div>
    )
  }

  if (!user) return null

  const totalPages = Math.max(1, Math.ceil(totalCount / WORK_ORDERS_PAGE_SIZE))
  const firstRow = totalCount > 0 ? (currentPage - 1) * WORK_ORDERS_PAGE_SIZE + 1 : 0
  const lastRow = Math.min(currentPage * WORK_ORDERS_PAGE_SIZE, totalCount)
  const currentPageCount = workOrders.length
  const recentlySyncedCount = canFetchAll ? workOrders.filter(isRecentlySynced).length : 0
  const assignedVisibleCount = workOrders.filter((workOrder) => getAssignedTechnicians(workOrder)).length

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
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span className="truncate">{item.label}</span>
                        {item.developerOnly ? <DeveloperBadge /> : null}
                      </span>
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
          <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[34px] font-black uppercase leading-none tracking-[-0.035em] text-[#b8bcc8] sm:text-[38px]">
                DESHA<span className="text-[#f2b43f]">Z</span>O
              </div>
              <p className="mt-2 text-[13px] font-bold uppercase tracking-[0.02em] text-[#8a91a3]">
                Documents
              </p>
            </div>

            <div className="inline-flex w-full flex-col gap-2 rounded-[18px] border border-[var(--deshazo-border)] bg-white/75 px-4 py-3 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.24)] sm:w-auto sm:min-w-[320px]">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[12px] font-black uppercase tracking-[0.08em] text-[#8a91a3]">Last Sync</span>
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#4f9879]" aria-hidden="true" />
              </div>
              <p className="text-[15px] font-black text-[var(--deshazo-text)]">
                {lastSyncAt ? formatDateTime(lastSyncAt) : 'Never synced'}
              </p>
            </div>
          </div>

          <section className="rounded-[26px] border border-[var(--deshazo-border)] bg-white/78 p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)] sm:p-5">
            <div className="mb-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-[18px] border border-[var(--deshazo-border)] bg-white px-4 py-4 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.35)]">
                <p className="text-[12px] font-black uppercase tracking-[0.08em] text-[#8a91a3]">Saved Documents</p>
                <p className="mt-2 text-[30px] font-black leading-none tracking-[-0.03em] text-[var(--deshazo-blue)]">
                  {totalCount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-[18px] border border-[var(--deshazo-border)] bg-white px-4 py-4 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.35)]">
                <p className="text-[12px] font-black uppercase tracking-[0.08em] text-[#8a91a3]">Showing Now</p>
                <p className="mt-2 text-[30px] font-black leading-none tracking-[-0.03em] text-[var(--deshazo-text)]">
                  {currentPageCount}
                </p>
              </div>
              <div className="rounded-[18px] border border-[var(--deshazo-border)] bg-white px-4 py-4 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.35)]">
                <p className="text-[12px] font-black uppercase tracking-[0.08em] text-[#8a91a3]">
                  {canFetchAll ? 'New Today' : 'Assigned Visible'}
                </p>
                <p className="mt-2 text-[30px] font-black leading-none tracking-[-0.03em] text-[#4f9879]">
                  {canFetchAll ? recentlySyncedCount : assignedVisibleCount}
                </p>
              </div>
            </div>

            <div className="mb-5 rounded-[18px] border border-[var(--deshazo-border)] bg-white px-4 py-4 shadow-[0_12px_30px_-28px_rgba(47,86,166,0.35)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-[24px] font-black leading-tight tracking-[-0.025em] text-[var(--deshazo-text)] sm:text-[28px]">
                    Documents
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[rgba(21,24,33,0.58)]">
                    Search by D-number, job number, customer, or location.
                  </p>
                </div>

                <div className="flex w-full flex-col gap-3 lg:max-w-[760px] lg:items-end">
                  {canFetchAll && (
                    <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => handleSync('all documents', FULL_SYNC_MISSING_BATCH_SIZE)}
                        disabled={syncing}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#4f9879] px-4 py-2 text-sm font-black text-white shadow-[0_12px_26px_-20px_rgba(79,152,121,0.7)] transition hover:bg-[#43886c] disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        <span>{syncing ? 'Syncing...' : 'Fetch All'}</span>
                        <DeveloperBadge />
                      </button>
                    </div>
                  )}
                  <div className="w-full max-w-[500px]">
                    <div className="relative min-w-0">
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search documents..."
                        className="h-11 w-full min-w-0 rounded-md border border-[#cfd7e8] bg-[#fbfcff] px-4 pr-10 text-sm font-semibold text-[var(--deshazo-text)] outline-none transition placeholder:text-[#98a0b2] focus:border-[var(--deshazo-blue)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(47,86,166,0.1)]"
                      />
                      {search || submittedSearch ? (
                        <button
                          type="button"
                          onClick={clearSearch}
                          className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-[#cfd7e8] bg-white text-[16px] font-black leading-none text-[#273f7a] shadow-sm transition hover:border-[var(--deshazo-blue)] hover:bg-[#eef3ff]"
                          aria-label="Clear search"
                          title="Clear search"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                    {searchIsPending ? (
                      <div className="mt-2 flex items-center gap-2 text-[12px] font-bold text-[#5f6675]" role="status">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-[#f4b331]" aria-hidden="true" />
                        Searching...
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {message ? (
              <div className="mb-4 rounded-[14px] border border-[var(--deshazo-border)] bg-[#f7f9fd] px-4 py-3 text-sm font-semibold text-[rgba(21,24,33,0.72)]">
                {message}
              </div>
            ) : null}

            <div className="mb-3 flex flex-col gap-3 rounded-[16px] border border-[var(--deshazo-border)] bg-[#f8f9fb] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-bold text-[#5f6675]">
                Rows {firstRow}-{lastRow} of {totalCount}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage <= 1 || loading}
                  className="rounded-md border border-[#e9c46e] bg-white px-3 py-1.5 text-sm font-black text-[#9d6507] transition hover:bg-[#fff7e8] disabled:cursor-not-allowed disabled:opacity-45"
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
                  className="rounded-md border border-[#e9c46e] bg-white px-3 py-1.5 text-sm font-black text-[#9d6507] transition hover:bg-[#fff7e8] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Next ›
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-[18px] border border-[var(--deshazo-border)] bg-white shadow-[0_12px_30px_-28px_rgba(47,86,166,0.35)]">
              <div className="overflow-auto">
                <table className="w-full min-w-[1320px] border-collapse text-left text-[14px]">
                  <thead>
                    <tr className="border-b border-[var(--deshazo-border)] bg-[#f7f9fd] text-[12px] font-black uppercase tracking-[0.04em] text-[#6d7482]">
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
                          className="group cursor-pointer border-b border-[var(--deshazo-border)] bg-white transition last:border-b-0 odd:bg-[#fbfcff] hover:bg-[#eef3ff]"
                        >
                          <td className="px-3 py-4 font-black">
                            <div className="flex items-center gap-2">
                              <span className="text-[var(--deshazo-blue)] group-hover:underline">{getWorkOrderNumber(workOrder)}</span>
                              {canFetchAll && isRecentlySynced(workOrder) ? (
                                <span className="rounded-full bg-[#eaf1ff] px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.02em] text-[#315aa7]">
                                  New
                                </span>
                              ) : null}
                              {canFetchAll && isRecentlySynced(workOrder) ? <DeveloperBadge /> : null}
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${getTypeBadgeClass(workOrder.jobType)}`}>
                              {workOrder.jobType || 'Inspection'}
                            </span>
                          </td>
                          <td className="px-3 py-4 font-bold">{workOrder.customerName || customerName}</td>
                          <td className="max-w-[290px] truncate px-3 py-4 font-semibold text-[rgba(21,24,33,0.78)]">{getCustomerLocation(workOrder)}</td>
                          <td className="max-w-[260px] truncate px-3 py-4 font-semibold text-[rgba(21,24,33,0.72)]">{workOrder.comment || '-'}</td>
                          <td className="px-3 py-4 font-semibold text-[rgba(21,24,33,0.78)]">{workOrder.serviceLocationName || '-'}</td>
                          <td className="whitespace-nowrap px-3 py-4 font-bold">{formatDateRange(workOrder)}</td>
                          <td className="px-3 py-4">
                            {assignedTechnicians ? (
                              <span className="font-bold text-[var(--deshazo-text)]">{assignedTechnicians}</span>
                            ) : (
                              <span className="rounded-full border border-[#f6d58e] bg-[#fff7e8] px-3 py-1 text-xs font-black text-[#a96d09]">
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
        </section>
      </main>
    </div>
  )
}
