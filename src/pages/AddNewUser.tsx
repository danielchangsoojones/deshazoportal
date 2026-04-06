import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

const menuItems = [
  { label: 'Home', href: '/dashboard' },
  { label: 'Open Risk Items' },
  { label: 'Asset Fleet' },
  { label: 'Spend' },
  { label: 'Location Comparison' },
  { label: 'Documents & Reports' },
  { label: 'Add User', href: '/add-user' },
  { label: 'Contact Us', href: '/contact-us' },
]

const addUserGuidelines = [
  'Full name',
  'Email address',
//  'Any role or access notes for the new user',
]

export default function AddNewUser() {
  const [user, setUser] = useState<User | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()

  const activeMenuItems = useMemo(
    () =>
      menuItems.map((item) => ({
        ...item,
        active: item.label === 'Add User',
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
    })
  }, [navigate])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/login')
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
      <header className="bg-[var(--deshazo-blue)] px-5 py-3 shadow-sm">
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
          <aside className="hidden min-h-[calc(100vh-60px)] w-[268px] shrink-0 border-r border-[var(--deshazo-border)] bg-white lg:flex lg:flex-col">
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
                <span>User access management</span>
              </div>
            </div>
          </div>

          <div className="grid gap-8">
            <section className="overflow-hidden rounded-[26px] border border-[var(--deshazo-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.8)_0%,var(--deshazo-surface)_100%)] px-6 py-6 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
              <p className="text-[15px] font-bold text-[var(--deshazo-blue)]">Add New Users</p>
              <h2 className="mt-3 max-w-[24ch] text-[clamp(22px,2.6vw,40px)] font-bold leading-[1.08] tracking-[-0.04em] text-[var(--deshazo-text)]">
                Request access for new team members.
              </h2>
              <p className="mt-5 max-w-[70ch] text-base leading-7 text-[rgba(21,24,33,0.78)]">
                Please contact us at <span className="font-semibold text-[var(--deshazo-text)]">danieljones@blockstampsf.com</span> to
                add new users. Include the details below so we can onboard the user correctly and send them their portal invitation.
              </p>

              <div className="mt-8 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                <article className="rounded-[22px] border border-[var(--deshazo-border)] bg-white/85 p-5 shadow-[0_18px_35px_-32px_rgba(47,86,166,0.35)]">
                  <p className="text-[14px] font-bold uppercase tracking-[0.04em] text-[var(--deshazo-blue-soft)]">
                    Please provide
                  </p>
                  <ul className="mt-4 space-y-3 text-[15px] leading-7 text-[rgba(21,24,33,0.82)]">
                    {addUserGuidelines.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <span className="mt-2 inline-block h-2.5 w-2.5 rounded-full bg-[var(--deshazo-blue)]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>

                <article className="rounded-[22px] border border-[var(--deshazo-border)] bg-white/85 p-5 shadow-[0_18px_35px_-32px_rgba(47,86,166,0.35)]">
                  <p className="text-[14px] font-bold uppercase tracking-[0.04em] text-[var(--deshazo-blue-soft)]">
                    Notes
                  </p>
                  <p className="mt-4 text-[15px] leading-7 text-[rgba(21,24,33,0.82)]">
                    Once we receive the user details, we will send the new user an onboarding email with the information they need to access the portal.
                  </p>
                  <p className="mt-4 text-[15px] leading-7 text-[rgba(21,24,33,0.82)]">
                    If you would like to add multiple users, please email a CSV of your new users to speed up the setup process.
                  </p>
                </article>
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  )
}
