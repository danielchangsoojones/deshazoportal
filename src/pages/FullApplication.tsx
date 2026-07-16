import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { isConfigured, supabase } from '../lib/supabase'
import { getCurrentUserTag } from '../lib/userTags'
import {
  type DeshazoAppUser,
  deshazoAppLogout,
  deshazoAppSignIn,
  deshazoAppValidate,
  getDeshazoAppUserName,
} from '../lib/deshazoAppAuth'

type MenuSection = {
  id: string
  label: string
  icon: 'home' | 'calendar' | 'users' | 'reports' | 'admin'
  items: string[]
}

const menuSections: MenuSection[] = [
  {
    id: 'work-orders',
    label: 'Work Orders',
    icon: 'home',
    items: [
      'All',
      'Recently Added',
      'To Be Scheduled',
      'Scheduled',
      'In-Progress',
      'Waiting For Parts',
      'Completed',
      'Ready to Invoice',
      'Invoiced',
    ],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: 'calendar',
    items: ['Schedule', 'Recurring Jobs'],
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: 'users',
    items: ['Customers', 'Cranes'],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: 'reports',
    items: ['Payroll', 'Technician Daily Report', 'Job Cost Report', 'Recovery Report', 'Daily Usage Report', 'PayCor'],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: 'admin',
    items: ['Users', 'Calendar Grouping', 'Insp. Points Manager', 'Email Notifications', 'Trip dates without lead', 'Audit of Merged Locations'],
  },
]

const initiallyOpen = Object.fromEntries(menuSections.map((section) => [section.id, true]))

function MenuIcon({ icon }: { icon: MenuSection['icon'] | 'logout' }) {
  const paths = {
    home: <path d="M3 10.5 12 3l9 7.5M5.5 9.5V21h5v-6h3v6h5V9.5" />,
    calendar: <path d="M5 3v3m14-3v3M4 8h16M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2Z" />,
    users: <path d="M16 19v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V19m7-8a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a3 3 0 1 0 0-6m5 15v-1.5a4 4 0 0 0-3-3.7" />,
    reports: <path d="M3 5h18v4H3V5Zm2 4h14v12H5V9Zm5 4h4" />,
    admin: <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-5v2m0 13v2m8.5-8.5h-2m-13 0h-2m14.5-6-1.4 1.4M7.4 16.6 6 18m12 0-1.4-1.4M7.4 7.4 6 6" />,
    logout: <path d="M14 8V4H4v16h10v-4m-3-4h10m-3-3 3 3-3 3" />,
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[icon]}
    </svg>
  )
}

function ProfileSilhouette() {
  return (
    <svg aria-hidden="true" viewBox="0 0 80 80" className="h-full w-full">
      <circle cx="40" cy="40" r="39" fill="#e7f1ff" stroke="#c9d6e5" />
      <path d="M40 14c-10.1 0-15.2 6-15.2 15.1 0 2.3.6 4.3 1.5 6.1-.8.6-1.1 1.7-.8 3.1.4 2.1 1.4 3.8 2.8 4.4.9 4.4 3.2 8.1 6.4 10.1v4.1c-2.5 3.1-8.5 4-12.8 6.8-2.2 1.4-3.7 3.8-4.7 6.3a39 39 0 0 0 45.6 0c-1-2.5-2.5-4.9-4.7-6.3-4.3-2.8-10.3-3.7-12.8-6.8v-4.1c3.2-2 5.5-5.7 6.4-10.1 1.4-.6 2.4-2.3 2.8-4.4.3-1.4 0-2.5-.8-3.1.9-1.8 1.5-3.8 1.5-6.1C55.2 20 50.1 14 40 14Z" fill="#4d5155" />
    </svg>
  )
}

export default function FullApplication() {
  const [user, setUser] = useState<User | null>(null)
  const [deshazoUser, setDeshazoUser] = useState<DeshazoAppUser | null>(null)
  const [deshazoChecking, setDeshazoChecking] = useState(true)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(initiallyOpen)
  const [serviceLocation, setServiceLocation] = useState('all')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isConfigured || !supabase) {
      navigate('/quotelogin', { replace: true })
      return
    }

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        navigate('/quotelogin', { replace: true })
        return
      }

      const userTag = await getCurrentUserTag(data.user.id).catch(() => null)
      if (userTag !== 'developer') {
        navigate('/deshazo-internal-dashboard', { replace: true })
        return
      }

      setUser(data.user)
    })
  }, [navigate])

  // Once the portal (Supabase) developer check passes, check for a live DeShazo
  // application session. This is a separate login from the portal's Supabase auth.
  useEffect(() => {
    if (!user) return

    let cancelled = false
    setDeshazoChecking(true)
    deshazoAppValidate()
      .then((sessionUser) => {
        if (!cancelled) setDeshazoUser(sessionUser)
      })
      .catch(() => {
        if (!cancelled) setDeshazoUser(null)
      })
      .finally(() => {
        if (!cancelled) setDeshazoChecking(false)
      })

    return () => {
      cancelled = true
    }
  }, [user])

  const handleDeshazoSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoginError('')
    setSigningIn(true)
    try {
      const sessionUser = await deshazoAppSignIn(loginEmail.trim(), loginPassword)
      setDeshazoUser(sessionUser)
      setLoginPassword('')
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Sign in failed.')
    } finally {
      setSigningIn(false)
    }
  }

  const handleSignOut = async () => {
    await deshazoAppLogout()
    setDeshazoUser(null)
    if (supabase) await supabase.auth.signOut()
    navigate('/quotelogin')
  }

  const toggleSection = (sectionId: string) => {
    setOpenSections((current) => ({ ...current, [sectionId]: !current[sectionId] }))
  }

  if (!user) return null

  if (deshazoChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eaf2ff] text-[#46515e]">
        <div className="rounded-2xl border border-[#cfd6dc] bg-white px-6 py-4 text-sm font-semibold text-[#0a3b2a] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
          Checking DeShazo session...
        </div>
      </div>
    )
  }

  if (!deshazoUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eaf2ff] px-4 text-[#46515e]">
        <div className="w-full max-w-[380px] rounded-2xl bg-white px-7 py-8 shadow-[0_24px_60px_-40px_rgba(47,86,166,0.5)]">
          <div className="flex justify-center">
            <img src="/deshazo-logo.png" alt="DeShazo" className="h-auto w-[170px]" />
          </div>
          <p className="mt-6 text-center text-[15px] font-bold text-[#3b4652]">Sign in to DeShazo</p>
          <p className="mt-1 text-center text-[12px] leading-4 text-[#5d6874]">
            Log in with your DeShazo application account to load the full application.
          </p>

          <form className="mt-6 space-y-3" onSubmit={handleDeshazoSignIn}>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#6d7482]">Email</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-[#cfd6dc] bg-white px-3 text-[13px] text-[#404a54] outline-none transition focus:border-[#0a3b2a]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#6d7482]">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-[#cfd6dc] bg-white px-3 text-[13px] text-[#404a54] outline-none transition focus:border-[#0a3b2a]"
              />
            </label>

            {loginError ? (
              <p className="rounded-md border border-[#f0c8c8] bg-[#fdf1f1] px-3 py-2 text-[12px] font-semibold text-[#b23b3b]">
                {loginError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={signingIn}
              className="h-10 w-full rounded-md bg-[#0a3b2a] text-[13px] font-bold text-white transition hover:bg-[#0b4632] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingIn ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#eaf2ff] text-[#46515e]">
      <aside className="min-h-screen w-[272px] shrink-0 bg-white px-4 pb-8 pt-6 shadow-[8px_0_24px_rgba(74,102,139,0.04)]">
        <div className="flex justify-center">
          <img src="/deshazo-logo.png" alt="DeShazo" className="h-auto w-[180px]" />
        </div>

        <div className="mt-7 flex flex-col items-center text-center">
          <div className="h-[76px] w-[76px]">
            <ProfileSilhouette />
          </div>
          <p className="mt-1 text-[13px] font-bold leading-5 text-[#4b5560]">{getDeshazoAppUserName(deshazoUser)}</p>
          <p className="text-[12px] leading-4 text-[#5d6874]">{deshazoUser.role?.name || 'DeShazo User'}</p>
          <p className="mt-1 text-[11px] leading-[17px] text-[#5d6874]">
            032 Richmond, 028 Cincinnati, 017
            <br />
            Northeast
          </p>
        </div>

        <div className="relative mt-5">
          <select
            aria-label="Service location"
            value={serviceLocation}
            onChange={(event) => setServiceLocation(event.target.value)}
            className="h-10 w-full appearance-none border border-[#cfd6dc] bg-white pl-3 pr-14 text-[11px] text-[#404a54] outline-none transition focus:border-[#8797a7]"
          >
            <option value="all">All Service Locations</option>
            <option value="richmond">032 Richmond</option>
            <option value="cincinnati">028 Cincinnati</option>
            <option value="northeast">017 Northeast</option>
          </select>
          <span aria-hidden="true" className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-[15px] text-[#bbc2c8]">×</span>
          <span aria-hidden="true" className="pointer-events-none absolute right-0 top-2 h-6 w-8 border-l border-[#d7dde2] text-center text-[15px] leading-5 text-[#9da7b0]">⌄</span>
        </div>

        <nav aria-label="Full application navigation" className="mt-5 space-y-3">
          {menuSections.map((section) => {
            const isOpen = openSections[section.id]
            return (
              <section key={section.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`${section.id}-items`}
                  onClick={() => toggleSection(section.id)}
                  className="flex w-full items-center gap-3 px-3 py-1 text-left text-[13px] font-medium text-[#46515e] transition hover:text-[#0b3829]"
                >
                  <span className="text-[#0a3b2a]"><MenuIcon icon={section.icon} /></span>
                  <span>{section.label}</span>
                  <svg aria-hidden="true" viewBox="0 0 16 16" className={`ml-auto h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="m4 6 4 4 4-4" />
                  </svg>
                </button>

                <div
                  id={`${section.id}-items`}
                  className={`grid transition-[grid-template-rows,opacity] duration-200 ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                >
                  <div className="overflow-hidden">
                    <ul className="space-y-0.5 pb-1 pl-[38px] pt-1">
                      {section.items.map((item) => (
                        <li key={item}>
                          <button
                            type="button"
                            className="w-full py-1 text-left text-[11px] leading-[17px] text-[#53606d] transition hover:text-[#0a3b2a]"
                          >
                            {item}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            )
          })}

          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 px-3 py-1 text-left text-[13px] font-medium text-[#46515e] transition hover:text-[#0a3b2a]"
          >
            <span className="text-[#0a3b2a]"><MenuIcon icon="logout" /></span>
            <span>Logout</span>
          </button>
        </nav>
      </aside>

      <main aria-label="Full application workspace" className="min-h-screen min-w-0 flex-1" />
    </div>
  )
}
