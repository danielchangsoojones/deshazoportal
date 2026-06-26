import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import DNumberSearchBar from '../components/DNumberSearchBar'
import ProfileMenu from '../components/ProfileMenu'
import { isConfigured, supabase } from '../lib/supabase'
import { type TopCraneRepairItem, getTopCraneRepairItems } from '../lib/topCraneRepairItems'
import { getUserDisplayName, getUserInitials } from '../lib/userProfile'
import { usePortalMenu } from '../lib/usePortalMenu'

const menuItems = [
  { label: 'Internal Dashboard', active: false, href: '/deshazo-internal-dashboard' },
  { label: 'Top Cranes', active: true, href: '/top-cranes' },
  { label: 'Quote List', active: false, href: '/jobsquotinglist' },
  { label: 'Quote Analytics', active: false, href: '/quote-analytics' },
  { label: 'Equipment LLM', active: false, href: '/equipment-notebook-llm' },
  { label: 'Customer Portals', active: false, href: '/customer-portals' },
]

function formatDate(value: string) {
  if (!value) return 'No date'
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TopCranes() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [items, setItems] = useState<TopCraneRepairItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isConfigured || !supabase) {
      navigate('/quotelogin')
      return
    }

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate('/quotelogin')
      } else {
        setUser(data.user)
      }
      setAuthLoading(false)
    })
  }, [navigate])

  useEffect(() => {
    const controller = new AbortController()

    const loadItems = async () => {
      try {
        setLoading(true)
        setError('')
        const nextItems = await getTopCraneRepairItems(30, 10)
        if (!controller.signal.aborted) {
          setItems(nextItems)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unable to load top cranes.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    if (!authLoading && user) {
      loadItems()
    }

    return () => controller.abort()
  }, [authLoading, user])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/quotelogin')
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="rounded-2xl border border-[var(--deshazo-border)] bg-white px-6 py-4 text-sm font-semibold text-[var(--deshazo-blue)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
          Loading top cranes...
        </div>
      </div>
    )
  }

  if (!user) return null

  const fullName = getUserDisplayName(user)
  const initials = getUserInitials(user)
  const totalRepairItems = items.reduce((sum, item) => sum + item.repairItemCount, 0)
  const topItem = items[0]

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
          <div className="mb-7 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-[13px] font-bold uppercase tracking-[0.02em] text-[#8b92a4]">Past 30 days</p>
              <h1 className="mt-2 text-[clamp(32px,4vw,52px)] font-black leading-[0.96] text-[var(--deshazo-text)]">
                Top Cranes
              </h1>
              <p className="mt-3 max-w-[62ch] text-base leading-7 text-[rgba(21,24,33,0.72)]">
                Ranked by the number of repair items found in crane inspection reports.
              </p>
            </div>

            <Link
              to="/deshazo-internal-dashboard"
              className="inline-flex items-center rounded-full border border-[var(--deshazo-border)] bg-white px-4 py-2 text-sm font-bold text-[var(--deshazo-blue)] no-underline shadow-[0_10px_24px_-20px_rgba(47,86,166,0.45)] transition hover:bg-[var(--deshazo-surface)]"
            >
              Back to Dashboard
            </Link>
          </div>

          <section className="mb-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-[22px] border border-[var(--deshazo-border)] bg-white px-5 py-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.22)]">
              <p className="text-[13px] font-bold uppercase tracking-[0.02em] text-[#8b92a4]">Cranes ranked</p>
              <p className="mt-2 text-3xl font-black text-[var(--deshazo-text)]">{items.length}</p>
            </div>
            <div className="rounded-[22px] border border-[var(--deshazo-border)] bg-white px-5 py-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.22)]">
              <p className="text-[13px] font-bold uppercase tracking-[0.02em] text-[#8b92a4]">Repair items</p>
              <p className="mt-2 text-3xl font-black text-[var(--deshazo-text)]">{totalRepairItems}</p>
            </div>
            <div className="rounded-[22px] border border-[var(--deshazo-border)] bg-white px-5 py-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.22)]">
              <p className="text-[13px] font-bold uppercase tracking-[0.02em] text-[#8b92a4]">Highest crane</p>
              <p className="mt-2 truncate text-3xl font-black text-[var(--deshazo-text)]">{topItem?.craneId ?? '-'}</p>
            </div>
          </section>

          <section className="overflow-hidden rounded-[22px] border border-[var(--deshazo-border)] bg-white shadow-[0_18px_40px_-34px_rgba(47,86,166,0.22)]">
            {loading ? (
              <div className="px-6 py-10 text-center text-sm font-semibold text-[var(--deshazo-blue)]">
                Loading crane repair ranking...
              </div>
            ) : error ? (
              <div className="px-6 py-10 text-center text-sm font-semibold text-[#b42318]">{error}</div>
            ) : items.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm font-semibold text-[rgba(21,24,33,0.64)]">
                No crane repair items were found in the past 30 days.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left">
                  <thead className="bg-[var(--deshazo-surface)] text-[12px] font-black uppercase tracking-[0.04em] text-[#6f7788]">
                    <tr>
                      <th className="w-[84px] px-5 py-4">Rank</th>
                      <th className="min-w-[180px] px-5 py-4">Crane</th>
                      <th className="min-w-[220px] px-5 py-4">Customer</th>
                      <th className="min-w-[180px] px-5 py-4">Location</th>
                      <th className="px-5 py-4 text-right">Repair Items</th>
                      <th className="px-5 py-4 text-right">Reports</th>
                      <th className="min-w-[150px] px-5 py-4">Latest Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={`${item.rank}-${item.craneId}`} className="border-t border-[var(--deshazo-border)]">
                        <td className="px-5 py-4 text-lg font-black text-[var(--deshazo-blue)]">#{item.rank}</td>
                        <td className="px-5 py-4">
                          <p className="font-extrabold text-[var(--deshazo-text)]">{item.craneId}</p>
                          <p className="mt-1 max-w-[36ch] truncate text-sm text-[rgba(21,24,33,0.62)]">
                            {item.craneDescription || item.craneLocation || 'No crane details'}
                          </p>
                        </td>
                        <td className="px-5 py-4 font-semibold text-[rgba(21,24,33,0.82)]">{item.customer || '-'}</td>
                        <td className="px-5 py-4 text-[rgba(21,24,33,0.72)]">{item.customerLocation || '-'}</td>
                        <td className="px-5 py-4 text-right text-xl font-black text-[#b42318]">{item.repairItemCount}</td>
                        <td className="px-5 py-4 text-right font-bold text-[rgba(21,24,33,0.72)]">{item.workOrderCount}</td>
                        <td className="px-5 py-4 font-semibold text-[rgba(21,24,33,0.72)]">
                          {formatDate(item.latestReportDate)}
                        </td>
                      </tr>
                    ))}
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
