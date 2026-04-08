import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'
import { usePortalMenu } from '../lib/usePortalMenu'
import {
  getAssetsServiced,
  isPortalApiConfigured,
  type AssetsServicedAnalytics,
  type ServicedAsset,
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

const defaultAssetsSummary: AssetsServicedAnalytics = {
  total_serviced_str: '0/ 0 Inspected',
  total_units_count: 0,
  serviced_units_count: 0,
  serviced_assets: [],
}

const buildProgressGradient = (percent: number) =>
  `conic-gradient(var(--deshazo-blue) 0deg ${percent * 3.6}deg, rgba(219,227,245,0.9) ${percent * 3.6}deg 360deg)`

const getPercent = (servicedUnits: number, totalUnits: number) =>
  totalUnits > 0 ? Math.round((servicedUnits / totalUnits) * 100) : 0

function ProgressRing({ percent, size = 56 }: { percent: number; size?: number }) {
  const innerSize = size - 10

  return (
    <div
      className="relative flex items-center justify-center rounded-full"
      style={{ width: `${size}px`, height: `${size}px`, background: buildProgressGradient(percent) }}
    >
      <div
        className="flex items-center justify-center rounded-full bg-white font-extrabold text-[var(--deshazo-text)] shadow-[inset_0_0_0_1px_rgba(47,86,166,0.08)]"
        style={{ width: `${innerSize}px`, height: `${innerSize}px`, fontSize: size < 64 ? '16px' : '20px' }}
      >
        {percent}%
      </div>
    </div>
  )
}

function AssetCard({ asset }: { asset: ServicedAsset }) {
  const percent = getPercent(asset.serviced_units, asset.total_units)

  return (
    <Link
      to={`/asset-fleet-assets?locations=${asset.location_value}`}
      className="block rounded-[22px] border border-[var(--deshazo-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.86)_0%,var(--deshazo-surface)_100%)] px-6 py-5 no-underline shadow-[0_18px_40px_-34px_rgba(47,86,166,0.22)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_42px_-34px_rgba(47,86,166,0.32)]"
    >
      <p className="text-[15px] font-semibold text-[rgba(21,24,33,0.7)]">Wabash National</p>
      <h2 className="mt-2 text-[clamp(24px,2vw,34px)] font-extrabold leading-[1.08] tracking-[-0.04em] text-[var(--deshazo-text)]">
        {asset.location}
      </h2>

      <div className="mt-5 flex items-center gap-4">
        <ProgressRing percent={percent} />
        <div>
          <p className="text-[15px] font-bold text-[var(--deshazo-text)]">Assets</p>
          <p className="mt-1 text-[18px] font-extrabold tracking-[-0.03em] text-[var(--deshazo-text)]">
            {asset.checked_in_display}
          </p>
        </div>
      </div>
    </Link>
  )
}

export default function AssetFleet() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const [assetSummary, setAssetSummary] = useState<AssetsServicedAnalytics>(defaultAssetsSummary)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const activeMenuItems = useMemo(
    () =>
      menuItems.map((item) => ({
        ...item,
        active: item.label === 'Asset Fleet',
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

    const loadAssets = async () => {
      try {
        setLoading(true)
        setError('')
        const data = await getAssetsServiced(controller.signal)
        setAssetSummary(data)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Unable to load asset fleet data.')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadAssets()

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
          Loading asset fleet...
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
  const overallPercent = getPercent(assetSummary.serviced_units_count, assetSummary.total_units_count)

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
                <span>{loading ? 'Loading inspected assets...' : `${assetSummary.serviced_assets.length} locations tracked`}</span>
              </div>
            </div>
          </div>

          {!isPortalApiConfigured && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Add `VITE_PORTAL_PARSE_REST_API_KEY` to load live asset fleet analytics.
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <section className="space-y-6">
            <article className="max-w-[460px] rounded-[22px] border border-[var(--deshazo-border)] bg-white px-6 py-5 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.22)]">
              <div className="flex items-center gap-5">
                <ProgressRing percent={overallPercent} size={64} />
                <div>
                  <p className="text-[15px] font-bold text-[rgba(21,24,33,0.7)]">Assets</p>
                  <p className="mt-1 text-[24px] font-extrabold tracking-[-0.04em] text-[var(--deshazo-text)]">
                    {loading ? 'Loading...' : assetSummary.total_serviced_str}
                  </p>
                </div>
              </div>
            </article>

            {loading ? (
              <div className="grid gap-6 lg:grid-cols-2">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div
                    key={index}
                    className="rounded-[22px] border border-[var(--deshazo-border)] bg-white/85 px-6 py-5 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]"
                  >
                    <div className="h-5 w-28 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                    <div className="mt-4 h-8 w-48 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                    <div className="mt-6 flex items-center gap-4">
                      <div className="h-14 w-14 animate-pulse rounded-full bg-[var(--deshazo-surface)]" />
                      <div className="space-y-2">
                        <div className="h-5 w-20 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                        <div className="h-5 w-36 animate-pulse rounded bg-[var(--deshazo-surface)]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                {assetSummary.serviced_assets.map((asset) => (
                  <AssetCard key={asset.location_value} asset={asset} />
                ))}
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  )
}
