import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'
import { getCustomerLocationOptions, type PortalLocationOption } from '../lib/portalLocations'
import { getSavedDeshazoWorkOrdersCsv } from '../lib/deshazoExternalReports'
import { usePortalMenu } from '../lib/usePortalMenu'
import { useDeveloperMenuItems } from '../lib/useDeveloperMenuItems'
import { DeveloperBadge } from '../components/DeveloperBadge'
import { useCustomerPath, useSelectedCustomer } from '../lib/customerRouting'
import type { User } from '@supabase/supabase-js'

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

export default function CustomReports() {
  const [user, setUser] = useState<User | null>(null)
  const [locationOptions, setLocationOptions] = useState<PortalLocationOption[]>([])
  const [locationsLoading, setLocationsLoading] = useState(true)
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [csvLoading, setCsvLoading] = useState(false)
  const [error, setError] = useState('')
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const navigate = useNavigate()
  const selectedCustomer = useSelectedCustomer()
  const customerPath = useCustomerPath()

  const activeMenuItems = useDeveloperMenuItems(menuItems, 'Custom Reports')

  useEffect(() => {
    if (!isConfigured || !supabase) {
      navigate(customerPath('/login'))
      return
    }
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate(customerPath('/login'))
      } else {
        setUser(data.user)
      }
    })
  }, [customerPath, navigate])

  useEffect(() => {
    let cancelled = false

    async function loadLocations() {
      try {
        setLocationsLoading(true)
        const nextLocations = await getCustomerLocationOptions(selectedCustomer)
        if (cancelled) return
        setLocationOptions(nextLocations)
        setSelectedLocations((current) =>
          current.filter((locationValue) => nextLocations.some((location) => location.value === locationValue)),
        )
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load customer locations.')
          setLocationOptions([])
          setSelectedLocations([])
        }
      } finally {
        if (!cancelled) setLocationsLoading(false)
      }
    }

    void loadLocations()
    return () => {
      cancelled = true
    }
  }, [selectedCustomer])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate(customerPath('/login'))
  }

  const toggleLocation = (locationValue: string) => {
    setSelectedLocations((current) =>
      current.includes(locationValue)
        ? current.filter((value) => value !== locationValue)
        : [...current, locationValue],
    )
  }

  const selectAllLocations = () => {
    setSelectedLocations(locationOptions.map((location) => location.value))
  }

  const clearLocations = () => {
    setSelectedLocations([])
  }

  const downloadCsv = async () => {
    try {
      setCsvLoading(true)
      setError('')
      const result = await getSavedDeshazoWorkOrdersCsv(selectedLocations, selectedCustomer)
      const blob = new Blob([result.csv], { type: result.contentType })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = result.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download work orders CSV.')
    } finally {
      setCsvLoading(false)
    }
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
                        <span className="text-[12px] font-semibold text-[rgba(21,24,33,0.4)]" />
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
                <span>{selectedLocations.length} of {locationOptions.length} locations selected</span>
              </div>
            </div>
          </div>

          <section className="rounded-[26px] border border-[var(--deshazo-border)] bg-white/75 p-5 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)] sm:p-6">
            {error && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[15px] font-bold text-[var(--deshazo-blue)]">Custom Reports</p>
                <h1 className="mt-2 text-[clamp(30px,3vw,42px)] font-extrabold leading-[1.05] tracking-[-0.04em] text-[var(--deshazo-text)]">
                  Select locations
                </h1>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={selectAllLocations}
                  disabled={locationsLoading || locationOptions.length === 0}
                  className="inline-flex items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--deshazo-blue)] transition hover:bg-[var(--deshazo-surface)]"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearLocations}
                  className="inline-flex items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white px-4 py-2.5 text-sm font-bold text-[rgba(21,24,33,0.7)] transition hover:bg-[var(--deshazo-surface)]"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={downloadCsv}
                  disabled={selectedLocations.length === 0 || csvLoading || locationsLoading}
                  className="inline-flex items-center justify-center rounded-md bg-[var(--deshazo-blue)] px-5 py-2.5 text-sm font-bold text-white shadow-[0_14px_28px_-22px_rgba(47,86,166,0.65)] transition hover:bg-[var(--deshazo-blue-deep)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {csvLoading ? 'Downloading CSV' : 'Download CSV'}
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {locationsLoading ? (
                <div className="rounded-md border border-[var(--deshazo-border)] bg-white px-4 py-4 text-sm font-semibold text-[rgba(21,24,33,0.62)]">
                  Loading locations...
                </div>
              ) : locationOptions.length === 0 ? (
                <div className="rounded-md border border-[var(--deshazo-border)] bg-white px-4 py-4 text-sm font-semibold text-[rgba(21,24,33,0.62)]">
                  No locations found for this customer.
                </div>
              ) : locationOptions.map((location) => {
                const checked = selectedLocations.includes(location.value)

                return (
                  <label
                    key={location.value}
                    className={`flex min-h-[74px] cursor-pointer items-center gap-3 rounded-[16px] border bg-white px-4 py-3 text-[15px] font-bold transition ${
                      checked
                        ? 'border-[var(--deshazo-blue)] text-[var(--deshazo-text)] shadow-[0_16px_30px_-28px_rgba(47,86,166,0.45)]'
                        : 'border-[var(--deshazo-border)] text-[rgba(21,24,33,0.74)] hover:border-[var(--deshazo-blue-soft)]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleLocation(location.value)}
                      className="h-5 w-5 accent-[var(--deshazo-blue)]"
                    />
                    <span>{location.label}</span>
                  </label>
                )
              })}
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}
