import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import DNumberSearchBar from '../components/DNumberSearchBar'
import ProfileMenu from '../components/ProfileMenu'
import { getInternalDashboardMenuItems, internalDashboardCards } from '../lib/internalDashboardCards'
import { supabase, isConfigured } from '../lib/supabase'
import { getUserDisplayName, getUserInitials } from '../lib/userProfile'
import { usePortalMenu } from '../lib/usePortalMenu'

export default function DeshazoInternalDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authMessage, setAuthMessage] = useState('')
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const navigate = useNavigate()

  const menuItems = useMemo(
    () => getInternalDashboardMenuItems('/deshazo-internal-dashboard'),
    [],
  )

  useEffect(() => {
    if (!isConfigured || !supabase) {
      navigate('/quotelogin')
      return
    }

    let cancelled = false
    setAuthLoading(true)
    setAuthMessage('')

    supabase.auth.getUser()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data.user) {
          navigate('/quotelogin')
          return
        }

        setUser(data.user)
      })
      .catch(() => {
        if (!cancelled) {
          setAuthMessage('Unable to verify your session. Redirecting to login...')
          window.setTimeout(() => navigate('/quotelogin'), 800)
        }
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [navigate])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/quotelogin')
  }

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="rounded-2xl border border-[var(--deshazo-border)] bg-white px-6 py-4 text-sm font-semibold text-[var(--deshazo-blue)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
          {authMessage || 'Loading dashboard...'}
        </div>
      </div>
    )
  }

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
            <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <div className="text-[36px] font-black uppercase tracking-[-0.04em] text-[#b8bcc8]">
                  DESHA<span className="text-[#f2b43f]">Z</span>O
                </div>
                <p className="text-[13px] font-bold uppercase tracking-[0.02em] text-[#b6b8c2]">
                  Internal Quote Tools
                </p>
                <div className="mt-[18px] h-1.5 w-full max-w-[530px] rounded-full bg-[var(--deshazo-blue)]" />
              </div>
            </div>
          </div>

          <section className="grid w-full grid-cols-1 gap-x-8 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
            {internalDashboardCards.map((card) => (
              <article
                key={card.title}
                className="group relative flex min-h-[260px] flex-col overflow-hidden rounded-[26px] border border-[var(--deshazo-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.8)_0%,var(--deshazo-surface)_100%)] px-6 pb-5 pt-5 text-left shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_26px_48px_-34px_rgba(47,86,166,0.42)]"
              >
                <div className="absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,var(--deshazo-blue)_0%,var(--deshazo-blue-soft)_100%)] opacity-90" />
                <div className="mb-4 flex items-center justify-between gap-3 pt-1">
                  <p className="text-[15px] font-bold text-[var(--deshazo-text)]">{card.eyebrow}</p>
                  <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-[var(--deshazo-blue)] shadow-[0_10px_24px_-22px_rgba(47,86,166,0.5)]" />
                </div>
                <h2 className="text-[clamp(28px,2.3vw,32px)] font-extrabold leading-[1.08] text-[var(--deshazo-text)]">
                  {card.title}
                </h2>
                <p className="mt-2 max-w-[34ch] text-base leading-7 text-[rgba(21,24,33,0.9)]">
                  {card.description}
                </p>
                <div className="mt-auto flex items-end justify-end gap-4 pt-8">
                  <Link
                    className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[15px] font-bold text-[var(--deshazo-blue)] no-underline shadow-[0_10px_24px_-20px_rgba(47,86,166,0.45)] transition group-hover:gap-3"
                    to={card.href}
                  >
                    <span>Open</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </article>
            ))}
          </section>
        </section>
      </main>
    </div>
  )
}
