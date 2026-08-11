import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { Link, useNavigate } from 'react-router-dom'
import { usePortalMenu } from '../lib/usePortalMenu'
import { useDeveloperMenuItems } from '../lib/useDeveloperMenuItems'
import { DeveloperBadge } from '../components/DeveloperBadge'
import { getLocationComparisonAnalytics, type LocationComparisonItem } from '../lib/spendAnalytics'
import { getPendingInvoiceSpendRuns, syncInvoiceSpendRuns, uploadInvoiceSpendPdf } from '../lib/invoiceSpend'
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

const formatCurrency = (value: number) =>
  `$${Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2).replace(/\.00$/, '')}`

type LocationComparisonState = {
  customer: string
  data: LocationComparisonItem[]
  error: string
  status: 'loading' | 'ready'
}

export default function LocationComparison() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const invoiceSpendUploadInputRef = useRef<HTMLInputElement | null>(null)
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const navigate = useNavigate()
  const selectedCustomer = useSelectedCustomer()
  const customerPath = useCustomerPath()
  const customerName = getCustomerDisplayName(selectedCustomer)
  const [userTag, setUserTag] = useState<UserTag | null>(null)
  const [invoiceSpendUploadStatus, setInvoiceSpendUploadStatus] = useState('')
  const [invoiceSpendUploadError, setInvoiceSpendUploadError] = useState('')
  const [invoiceSpendUploading, setInvoiceSpendUploading] = useState(false)
  const [invoiceSpendSyncing, setInvoiceSpendSyncing] = useState(false)
  const [comparisonState, setComparisonState] = useState<LocationComparisonState>({
    customer: selectedCustomer,
    data: [],
    error: '',
    status: 'loading',
  })

  const activeMenuItems = useDeveloperMenuItems(menuItems, 'Location Comparison')

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

    getLocationComparisonAnalytics(selectedCustomer)
      .then((nextLocationData) => {
        if (!isMounted) return
        setComparisonState({
          customer: selectedCustomer,
          data: nextLocationData,
          error: '',
          status: 'ready',
        })
      })
      .catch((err: unknown) => {
        if (!isMounted) return
        setComparisonState({
          customer: selectedCustomer,
          data: [],
          error: err instanceof Error ? err.message : 'Unable to load location comparison data.',
          status: 'ready',
        })
      })

    return () => {
      isMounted = false
    }
  }, [selectedCustomer])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate(customerPath('/login'))
  }

  const openLocationSpend = (location: string) => {
    navigate(`${customerPath('/location-spend')}?location=${encodeURIComponent(location)}`)
  }

  const handleInvoiceSpendUploadClick = () => {
    if (userTag !== 'developer') return
    invoiceSpendUploadInputRef.current?.click()
  }

  const handleInvoiceSpendUploadChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.name.toLowerCase().endsWith('.pdf'))
    event.target.value = ''
    if (userTag !== 'developer') return
    if (files.length === 0) return

    try {
      setInvoiceSpendUploading(true)
      setInvoiceSpendUploadError('')
      setInvoiceSpendUploadStatus(`Saving ${files.length} invoice PDF${files.length === 1 ? '' : 's'} and sending to Extend...`)

      const results = []
      for (const [index, file] of files.entries()) {
        setInvoiceSpendUploadStatus(`Saving and sending invoice ${index + 1} of ${files.length}: ${file.name}`)
        results.push(await uploadInvoiceSpendPdf(file, selectedCustomer))
      }

      setInvoiceSpendUploadStatus(
        `${results.length} invoice PDF${results.length === 1 ? '' : 's'} saved and queued. Allocations and stored PDFs will appear after Extend completes.`,
      )
    } catch (err) {
      setInvoiceSpendUploadStatus('')
      setInvoiceSpendUploadError(err instanceof Error ? err.message : 'Unable to upload invoice PDF.')
    } finally {
      setInvoiceSpendUploading(false)
    }
  }

  const handleInvoiceSpendSync = async () => {
    if (userTag !== 'developer') return

    try {
      setInvoiceSpendSyncing(true)
      setInvoiceSpendUploadError('')
      setInvoiceSpendUploadStatus('Checking pending invoice runs...')
      const pendingRuns = await getPendingInvoiceSpendRuns(selectedCustomer)
      if (pendingRuns.length === 0) {
        setInvoiceSpendUploadStatus('No pending invoice runs to sync.')
        return
      }

      setInvoiceSpendUploadStatus(`Syncing ${pendingRuns.length} pending invoice run${pendingRuns.length === 1 ? '' : 's'}...`)
      const results = await syncInvoiceSpendRuns(pendingRuns.map((run) => run.id))
      const processed = results.filter((result) => result.processed).length
      const failed = results.filter((result) => !result.processed).length
      const firstIssue = results.find((result) => !result.processed)
      const issueMessage = firstIssue?.error || firstIssue?.message
      setInvoiceSpendUploadStatus(
        `Synced ${processed} invoice run${processed === 1 ? '' : 's'}. ${failed ? `${failed} need attention${issueMessage ? `: ${issueMessage}` : '.'}` : 'Refresh the page or open a city to see updated allocations.'}`,
      )
    } catch (err) {
      setInvoiceSpendUploadStatus('')
      setInvoiceSpendUploadError(err instanceof Error ? err.message : 'Unable to sync invoice runs.')
    } finally {
      setInvoiceSpendSyncing(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="rounded-2xl border border-[var(--deshazo-border)] bg-white px-6 py-4 text-sm font-semibold text-[var(--deshazo-blue)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
          Loading location comparison...
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
  const locationData = comparisonState.customer === selectedCustomer ? comparisonState.data : []
  const loading = comparisonState.customer !== selectedCustomer || comparisonState.status === 'loading'
  const error = comparisonState.customer === selectedCustomer ? comparisonState.error : ''
  const canUploadInvoiceSpend = userTag === 'developer'
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
                <span>{customerName} location comparison</span>
              </div>
            </div>
            {canUploadInvoiceSpend ? (
              <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[14px] border border-[var(--deshazo-border)] bg-white p-3 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                <input
                  ref={invoiceSpendUploadInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  className="hidden"
                  onChange={handleInvoiceSpendUploadChange}
                />
                <button
                  type="button"
                  onClick={handleInvoiceSpendUploadClick}
                  disabled={invoiceSpendUploading || invoiceSpendSyncing}
                  className="inline-flex items-center justify-center rounded-md bg-[#1f7a4d] px-4 py-2.5 text-sm font-black text-white shadow-[0_14px_28px_-22px_rgba(31,122,77,0.7)] transition hover:bg-[#17633e] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>{invoiceSpendUploading ? 'Uploading invoices...' : 'Upload Invoice Spend PDFs'}</span>
                  <DeveloperBadge />
                </button>
                <button
                  type="button"
                  onClick={handleInvoiceSpendSync}
                  disabled={invoiceSpendUploading || invoiceSpendSyncing}
                  className="inline-flex items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white px-4 py-2.5 text-sm font-black text-[var(--deshazo-blue)] shadow-[0_14px_28px_-24px_rgba(47,86,166,0.35)] transition hover:bg-[var(--deshazo-surface)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>{invoiceSpendSyncing ? 'Syncing invoice runs...' : 'Sync Invoice Runs'}</span>
                  <DeveloperBadge />
                </button>
                <span className="text-sm font-bold text-[rgba(21,24,33,0.7)]">
                  {invoiceSpendUploadError || invoiceSpendUploadStatus || 'Save Deshazo/Wabash invoice PDFs and send them to Extend for per-crane spend allocation.'}
                </span>
              </div>
            ) : null}
          </div>

          {loading || error || locationData.length === 0 ? (
            <section className="mb-6 rounded-[14px] border border-[var(--deshazo-border)] bg-white p-4 text-sm font-semibold text-[rgba(21,24,33,0.68)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
              {loading ? 'Loading location comparison...' : error || 'No mapped JPA finance locations are available for this customer yet.'}
            </section>
          ) : null}

          <section className="rounded-[26px] border border-[var(--deshazo-border)] bg-white/75 p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)] sm:p-5">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {locationData.map((location) => (
                  <article
                    key={location.location}
                    role="button"
                    tabIndex={0}
                    onClick={() => openLocationSpend(location.location)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openLocationSpend(location.location)
                      }
                    }}
                    className="group cursor-pointer overflow-hidden rounded-[22px] border border-[var(--deshazo-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,var(--deshazo-surface)_100%)] shadow-[0_16px_34px_-30px_rgba(47,86,166,0.32)] outline-none transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_40px_-30px_rgba(47,86,166,0.42)] focus:ring-4 focus:ring-[rgba(47,86,166,0.18)]"
                  >
                    <div className="bg-[linear-gradient(90deg,var(--deshazo-blue)_0%,var(--deshazo-blue-deep)_100%)] px-4 py-4 text-white">
                      <h3 className="text-[clamp(22px,2.3vw,28px)] font-extrabold leading-[1.05] tracking-[-0.04em] text-white">
                        {location.location}
                      </h3>
                    </div>
                    <div className="space-y-3 px-4 py-4 text-[14px] text-[rgba(21,24,33,0.88)]">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-white px-3 py-3 shadow-[0_10px_24px_-20px_rgba(47,86,166,0.22)]">
                          <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--deshazo-blue-soft)]">
                            Total Jobs
                          </p>
                          <p className="mt-1 text-[20px] font-extrabold tracking-[-0.04em] text-[var(--deshazo-text)]">
                            {location.total_jobs}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white px-3 py-3 shadow-[0_10px_24px_-20px_rgba(47,86,166,0.22)]">
                          <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--deshazo-blue-soft)]">
                            Total Invoices
                          </p>
                          <p className="mt-1 text-[20px] font-extrabold tracking-[-0.04em] text-[var(--deshazo-text)]">
                            {location.total_invoices}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[var(--deshazo-border)] bg-white/75 px-4 py-3">
                        <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--deshazo-blue-soft)]">
                          Total Cost
                        </p>
                        <p className="mt-2 text-[22px] font-extrabold tracking-[-0.05em] text-[var(--deshazo-text)]">
                          {formatCurrency(location.total_invoice_cost)}
                        </p>
                        <p className="mt-1 text-sm text-[rgba(21,24,33,0.6)]">
                          Avg. invoice: {formatCurrency(location.average_invoice_cost)}
                        </p>
                      </div>

                      <div className="space-y-2">
                        {[
                          ['Total Service Spend', location.total_service_cost],
                          ['Total Parts Spend', location.total_parts_cost],
                          ['Mapped Invoices', location.mapped_invoice_count],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="flex items-center justify-between rounded-lg bg-white/80 px-4 py-2.5"
                          >
                            <span className="text-sm font-semibold text-[rgba(21,24,33,0.65)]">
                              {label}
                            </span>
                            <span className="text-sm font-bold text-[var(--deshazo-text)]">
                              {label === 'Mapped Invoices' ? Number(value).toLocaleString() : formatCurrency(Number(value))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}
