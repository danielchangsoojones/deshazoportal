import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'
import { usePortalMenu } from '../lib/usePortalMenu'
import type { User } from '@supabase/supabase-js'
import {
  getLocationAnalytics,
  isPortalApiConfigured,
  type LocationAnalytics,
} from '../lib/portalApi'

const menuItems = [
  { label: 'Home', href: '/dashboard' },
  { label: 'Open Risk Items', href: '/asset-fleet-assets?view=open-risk' },
  { label: 'Asset Fleet', href: '/asset-fleet' },
  { label: 'Spend', href: '/spend' },
  { label: 'Location Comparison', href: '/location-comparison' },
  { label: 'Documents', href: '/documents-reports' },
  { label: 'Custom Reports', href: '/custom-reports' },
  { label: 'Add User', href: '/add-user' },
  { label: 'Contact Us', href: '/contact-us' },
]

const formatCurrency = (value: number) =>
  `$${Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2).replace(/\.00$/, '')}`

export default function LocationComparison() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const [locationData, setLocationData] = useState<LocationAnalytics[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const activeMenuItems = useMemo(
    () =>
      menuItems.map((item) => ({
        ...item,
        active: item.label === 'Location Comparison',
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

    const loadAnalytics = async () => {
      try {
        setLoading(true)
        setError('')
        const data = await getLocationAnalytics(controller.signal)
        setLocationData(data)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Unable to load location analytics.')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadAnalytics()

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
                <span>{loading ? 'Loading locations...' : `${locationData.length} locations compared`}</span>
              </div>
            </div>
          </div>

          <section className="rounded-[26px] border border-[var(--deshazo-border)] bg-white/75 p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)] sm:p-5">
            {!isPortalApiConfigured && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Add `VITE_PORTAL_PARSE_REST_API_KEY` or proxy this Parse function through your backend to load live data.
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="overflow-hidden rounded-[8px] border border-[var(--deshazo-border)] bg-white shadow-[0_12px_30px_-28px_rgba(47,86,166,0.35)]"
                  >
                    <div className="h-[54px] animate-pulse bg-[var(--deshazo-blue)]/85" />
                    <div className="space-y-3 px-4 py-4">
                      {Array.from({ length: 7 }).map((__, lineIndex) => (
                        <div key={lineIndex} className="h-4 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {locationData.map((location) => (
                  <article
                    key={location.location}
                    className="group overflow-hidden rounded-[22px] border border-[var(--deshazo-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,var(--deshazo-surface)_100%)] shadow-[0_16px_34px_-30px_rgba(47,86,166,0.32)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_40px_-30px_rgba(47,86,166,0.42)]"
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
                            Total Units
                          </p>
                          <p className="mt-1 text-[20px] font-extrabold tracking-[-0.04em] text-[var(--deshazo-text)]">
                            {location.total_units}
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
                          ['Total Labor Cost', location.total_labor_cost],
                          ['Total Equipment Cost', location.total_equipment_cost],
                          ['Total Parts Cost', location.total_parts_cost],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="flex items-center justify-between rounded-lg bg-white/80 px-4 py-2.5"
                          >
                            <span className="text-sm font-semibold text-[rgba(21,24,33,0.65)]">
                              {label}
                            </span>
                            <span className="text-sm font-bold text-[var(--deshazo-text)]">
                              {formatCurrency(Number(value))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  )
}
