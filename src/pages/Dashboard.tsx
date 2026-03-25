import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

const portalCards = [
  {
    eyebrow: 'Service',
    title: 'Open Risk Items',
    description: 'See all open risks that are currently outstanding, categorized from high to low priority.',
  },
  {
    eyebrow: 'Assets',
    title: 'Asset Fleet',
    description: 'See what percentage of your industrial assets have been inspected and which items need attention.',
  },
  {
    eyebrow: 'Analytics',
    title: 'Spend',
    description: 'See an analytical breakdown of your spend regarding parts, labor, and maintenance trends.',
  },
  {
    eyebrow: 'Analytics',
    title: 'Location Comparison',
    description: 'Compare parts and labor times across different facilities and identify outliers quickly.',
  },
  {
    eyebrow: 'Documents',
    title: 'Documents & Reports',
    description: 'Download maintenance reports, summaries, and supporting PDFs from one place.',
  },
  {
    eyebrow: 'Help',
    title: 'Add User',
    description: 'Add new users to the portal and manage who gets access to key operational tools.',
  },
  {
    eyebrow: 'Help',
    title: 'Contact Us',
    description: 'Contact our team for any additional feature requests, product questions, or portal support.',
  },
]

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [menuOpen, setMenuOpen] = useState(true)
  const navigate = useNavigate()

  const menuItems = useMemo(
    () => [
      { label: 'Home', active: true },
      ...portalCards.map((card) => ({ label: card.title, active: false })),
    ],
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
          <aside className="hidden min-h-[calc(100vh-60px)] w-[255px] shrink-0 border-r border-[var(--deshazo-border)] bg-white lg:flex lg:flex-col">
            <div className="border-b border-[var(--deshazo-border)] px-6 py-5">
              <div className="text-[16px] font-black uppercase tracking-[-0.04em] text-[#b8bcc8]">
                DESHA<span className="text-[#f2b43f]">Z</span>O
              </div>
              <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#b8bcc8]">
                Cranes / Service / Automation
              </div>
            </div>

            <div className="flex-1 px-4 py-4">
              <h2 className="text-[18px] font-extrabold text-[var(--deshazo-text)]">Menu</h2>
              <nav className="mt-4 space-y-2">
                {menuItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={`block w-full rounded-lg px-3 py-3 text-left text-[15px] font-medium transition ${
                      item.active
                        ? 'bg-[#dbe5ff] text-[var(--deshazo-text)]'
                        : 'text-[rgba(21,24,33,0.7)] hover:bg-[var(--deshazo-surface)]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="border-t border-[var(--deshazo-border)] px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--deshazo-surface)] text-sm font-extrabold text-[var(--deshazo-blue)]">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-[var(--deshazo-text)]">{fullName}</p>
                  <p className="truncate text-[14px] text-[rgba(21,24,33,0.55)]">{user.email}</p>
                </div>
              </div>
            </div>
          </aside>
        )}

        <section className="min-w-0 flex-1 px-5 py-4 sm:px-8 lg:px-10">
          <div className="mb-8 flex flex-col items-start justify-between gap-5 sm:flex-row">
            <div>
              <div className="text-[16px] font-black uppercase tracking-[-0.04em] text-[#b8bcc8]">
                DESHA<span className="text-[#f2b43f]">Z</span>O
              </div>
              <p className="mt-1 text-[13px] font-bold uppercase tracking-[0.02em] text-[#b6b8c2]">
                Cranes / Service / Automation
              </p>
              <div className="mt-[18px] h-1.5 w-full max-w-[530px] rounded-full bg-[var(--deshazo-blue)]" />
            </div>

            <button
              className="inline-flex items-center justify-center rounded-md border border-[var(--deshazo-border)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--deshazo-blue)] shadow-[0_10px_24px_-20px_rgba(47,86,166,0.45)] transition hover:bg-[var(--deshazo-surface)]"
              onClick={handleSignOut}
              type="button"
            >
              Sign out
            </button>
          </div>

          <section className="grid w-full grid-cols-1 gap-x-[58px] gap-y-[42px] md:grid-cols-2 xl:grid-cols-3">
            {portalCards.map((card) => (
              <article
                key={card.title}
                className="flex min-h-[246px] flex-col rounded-[22px] bg-[var(--deshazo-surface)] px-[22px] pb-[18px] pt-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_24px_45px_-35px_rgba(47,86,166,0.45)]"
              >
                <p className="text-[15px] font-bold text-[var(--deshazo-text)]">{card.eyebrow}</p>
                <h2 className="mt-2.5 text-[clamp(28px,2.3vw,32px)] font-extrabold leading-[1.08] tracking-[-0.04em] text-[var(--deshazo-text)]">
                  {card.title}
                </h2>
                <p className="mt-3 text-[15px] font-bold text-[var(--deshazo-blue-soft)]">Description</p>
                <p className="mt-1.5 max-w-[36ch] text-base leading-[1.42] text-[rgba(21,24,33,0.92)]">
                  {card.description}
                </p>
                <a
                  className="mt-auto pt-7 text-base font-bold text-[var(--deshazo-blue)] no-underline"
                  href="#"
                >
                  Open →
                </a>
              </article>
            ))}
          </section>
        </section>
      </main>
    </div>
  )
}
