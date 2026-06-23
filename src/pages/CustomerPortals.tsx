import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import DNumberSearchBar from '../components/DNumberSearchBar'
import ProfileMenu from '../components/ProfileMenu'
import { getCustomerPortals, type CustomerPortal } from '../lib/customerPortals'
import { supabase, isConfigured } from '../lib/supabase'
import { usePortalMenu } from '../lib/usePortalMenu'
import { getUserDisplayName, getUserInitials } from '../lib/userProfile'

const menuItems = [
  { label: 'Internal Dashboard', active: false, href: '/deshazo-internal-dashboard' },
  { label: 'Customer Portals', active: true, href: '/customer-portals' },
  { label: 'Quote List', active: false, href: '/jobsquotinglist' },
  { label: 'Quote Analytics', active: false, href: '/quote-analytics' },
  { label: 'Equipment LLM', active: false, href: '/equipment-notebook-llm' },
]

function matchesCustomerSearch(portal: CustomerPortal, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true

  return [portal.label, portal.customer, portal.href].some((value) => value.toLowerCase().includes(normalizedQuery))
}

export default function CustomerPortals() {
  const [user, setUser] = useState<User | null>(null)
  const [portals, setPortals] = useState<CustomerPortal[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isConfigured || !supabase) {
      navigate('/quotelogin')
      return
    }

    let isMounted = true

    supabase.auth.getUser().then(async ({ data }) => {
      if (!isMounted) return

      if (!data.user) {
        navigate('/quotelogin')
        return
      }

      setUser(data.user)

      try {
        const nextPortals = await getCustomerPortals()
        if (isMounted) {
          setPortals(nextPortals)
          setError('')
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unable to load customer portals.')
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    })

    return () => {
      isMounted = false
    }
  }, [navigate])

  const filteredPortals = useMemo(
    () => portals.filter((portal) => matchesCustomerSearch(portal, query)),
    [portals, query],
  )

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/quotelogin')
  }

  if (!user) return null

  const fullName = getUserDisplayName(user)
  const initials = getUserInitials(user)

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

          <DNumberSearchBar />

          <ProfileMenu user={user} onSignOut={handleSignOut} />
        </div>
      </header>

      <main className="flex w-full items-stretch">
        {menuOpen && (
          <aside className="sticky top-[60px] hidden h-[calc(100vh-60px)] w-[268px] shrink-0 border-r border-[var(--deshazo-border)] bg-white lg:flex lg:flex-col">
            <div className="flex-1 px-4 py-5">
              <div className="rounded-[24px] border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)]/50 p-4">
                <nav className="space-y-2">
                  {menuItems.map((item) => (
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
              </div>
            </div>
          </aside>
        )}

        <section className="min-w-0 flex-1 px-5 py-5 sm:px-8 lg:px-10">
          <div className="mb-8">
            <div className="flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-end">
              <div>
                <div className="text-[36px] font-black uppercase tracking-[-0.04em] text-[#b8bcc8]">
                  DESHA<span className="text-[#f2b43f]">Z</span>O
                </div>
                <p className="text-[13px] font-bold uppercase tracking-[0.02em] text-[#b6b8c2]">
                  Customer Portals
                </p>
                <div className="mt-[18px] h-1.5 w-full max-w-[530px] rounded-full bg-[var(--deshazo-blue)]" />
              </div>

              <div className="w-full max-w-[460px]">
                <label htmlFor="customer-portal-search" className="sr-only">
                  Search customer portals
                </label>
                <input
                  id="customer-portal-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search customer portals..."
                  className="h-12 w-full rounded-md border border-[var(--deshazo-border)] bg-white px-4 text-[15px] font-semibold text-[var(--deshazo-text)] outline-none transition placeholder:text-[rgba(21,24,33,0.45)] focus:border-[var(--deshazo-blue)] focus:ring-4 focus:ring-[rgba(47,86,166,0.12)]"
                />
              </div>
            </div>
          </div>

          <section className="overflow-hidden rounded-[24px] border border-[var(--deshazo-border)] bg-white shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
            <div className="flex flex-col gap-2 border-b border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--deshazo-text)]">
                  Master Customer Portal List
                </h1>
                <p className="text-sm font-semibold text-[rgba(21,24,33,0.62)]">
                  {loading ? 'Loading portals...' : `${filteredPortals.length} of ${portals.length} portals`}
                </p>
              </div>
              <Link
                to="/deshazo-internal-dashboard"
                className="inline-flex items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white px-4 py-2 text-sm font-bold text-[var(--deshazo-blue)] no-underline transition hover:border-[var(--deshazo-blue)]"
              >
                Back
              </Link>
            </div>

            {error ? (
              <div className="px-5 py-8 text-sm font-semibold text-red-700">{error}</div>
            ) : loading ? (
              <div className="px-5 py-8 text-sm font-semibold text-[rgba(21,24,33,0.65)]">Loading customer portals...</div>
            ) : filteredPortals.length === 0 ? (
              <div className="px-5 py-8 text-sm font-semibold text-[rgba(21,24,33,0.65)]">No customer portals match your search.</div>
            ) : (
              <div className="max-h-[calc(100vh-280px)] overflow-auto">
                <ul className="divide-y divide-[var(--deshazo-border)]">
                  {filteredPortals.map((portal) => (
                    <li key={portal.customer}>
                      <Link
                        to={portal.href}
                        className="flex flex-col gap-1 px-5 py-4 text-[var(--deshazo-text)] no-underline transition hover:bg-[var(--deshazo-surface)] sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="text-base font-extrabold">{portal.label}</span>
                        <span className="break-all text-sm font-semibold text-[rgba(21,24,33,0.58)]">{portal.href}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  )
}
