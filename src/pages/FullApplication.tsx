import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
import JobCostReport from '../components/JobCostReport'
import WorkOrdersAll from '../components/WorkOrdersAll'
import WorkOrderDetails from '../components/WorkOrderDetails'
import { getDeshazoServiceLocations, type DeshazoServiceLocation } from '../lib/deshazoReports'

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
      <circle cx="40" cy="40" r="39" fill="#eef4ff" stroke="#c8d5ea" />
      <path d="M40 14c-10.1 0-15.2 6-15.2 15.1 0 2.3.6 4.3 1.5 6.1-.8.6-1.1 1.7-.8 3.1.4 2.1 1.4 3.8 2.8 4.4.9 4.4 3.2 8.1 6.4 10.1v4.1c-2.5 3.1-8.5 4-12.8 6.8-2.2 1.4-3.7 3.8-4.7 6.3a39 39 0 0 0 45.6 0c-1-2.5-2.5-4.9-4.7-6.3-4.3-2.8-10.3-3.7-12.8-6.8v-4.1c3.2-2 5.5-5.7 6.4-10.1 1.4-.6 2.4-2.3 2.8-4.4.3-1.4 0-2.5-.8-3.1.9-1.8 1.5-3.8 1.5-6.1C55.2 20 50.1 14 40 14Z" fill="#061849" />
    </svg>
  )
}

export default function FullApplication() {
  const [user, setUser] = useState<User | null>(null)
  const [deshazoUser, setDeshazoUser] = useState<DeshazoAppUser | null>(null)
  const [deshazoChecking, setDeshazoChecking] = useState(true)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(initiallyOpen)
  const [activeItem, setActiveItem] = useState('work-orders:All')
  const [serviceLocationId, setServiceLocationId] = useState<number | null>(null)
  const [serviceLocations, setServiceLocations] = useState<DeshazoServiceLocation[]>([])
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const navigate = useNavigate()
  const { workOrderId: workOrderIdParam } = useParams()
  const workOrderId = workOrderIdParam ? Number(workOrderIdParam) : null

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

  useEffect(() => {
    if (!deshazoUser) return
    let cancelled = false
    getDeshazoServiceLocations()
      .then((locations) => {
        if (!cancelled) setServiceLocations(locations)
      })
      .catch(() => {
        if (!cancelled) setServiceLocations([])
      })
    return () => {
      cancelled = true
    }
  }, [deshazoUser])

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
      <div className="flex min-h-screen items-center justify-center bg-[#edf1f7] text-[var(--deshazo-text)]">
        <div className="rounded-md border border-[#d3dbea] bg-white px-6 py-4 text-sm font-black text-[var(--deshazo-blue)] shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
          Checking DeShazo session...
        </div>
      </div>
    )
  }

  if (!deshazoUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#edf1f7] px-4 text-[var(--deshazo-text)]">
        <div className="w-full max-w-[380px] rounded-md border border-[#d3dbea] bg-white px-7 py-8 shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
          <div className="flex justify-center">
            <img src="/deshazo-logo.png" alt="DeShazo" className="h-auto w-[170px]" />
          </div>
          <p className="mt-6 text-center text-[15px] font-black text-[var(--deshazo-text)]">Sign in to DeShazo</p>
          <p className="mt-1 text-center text-[12px] font-semibold leading-4 text-[#747b8a]">
            Log in with your DeShazo application account to load the full application.
          </p>

          <form className="mt-6 space-y-3" onSubmit={handleDeshazoSignIn}>
            <label className="block">
              <span className="text-[11px] font-black uppercase tracking-[0.04em] text-[var(--deshazo-blue)]">Email</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-[#c7d1e2] bg-white px-3 text-[13px] font-bold text-[var(--deshazo-text)] outline-none transition focus:border-[var(--deshazo-blue)] focus:ring-2 focus:ring-[rgba(6,24,73,0.16)]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-black uppercase tracking-[0.04em] text-[var(--deshazo-blue)]">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-[#c7d1e2] bg-white px-3 text-[13px] font-bold text-[var(--deshazo-text)] outline-none transition focus:border-[var(--deshazo-blue)] focus:ring-2 focus:ring-[rgba(6,24,73,0.16)]"
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
              className="h-10 w-full rounded-md bg-[var(--deshazo-blue)] text-[13px] font-black text-white transition hover:bg-[var(--deshazo-blue-deep)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingIn ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#f4f7fb] text-[var(--deshazo-text)]">
      <aside className="min-h-screen w-[272px] shrink-0 border-r border-[#d3dbea] bg-[#f8fbff] px-4 pb-8 pt-6 shadow-sm">
        <div className="flex justify-center">
          <img src="/deshazo-logo.png" alt="DeShazo" className="h-auto w-[180px]" />
        </div>

        <div className="mt-7 flex flex-col items-center text-center">
          <div className="h-[76px] w-[76px]">
            <ProfileSilhouette />
          </div>
          <p className="mt-1 text-[13px] font-black leading-5 text-[var(--deshazo-text)]">{getDeshazoAppUserName(deshazoUser)}</p>
          <p className="text-[12px] font-semibold leading-4 text-[#747b8a]">{deshazoUser.role?.name || 'DeShazo User'}</p>
          <p className="mt-1 text-[11px] font-semibold leading-[17px] text-[#747b8a]">
            032 Richmond, 028 Cincinnati, 017
            <br />
            Northeast
          </p>
        </div>

        <div className="relative mt-5">
          <select
            aria-label="Service location"
            value={serviceLocationId ?? 'all'}
            onChange={(event) => setServiceLocationId(event.target.value === 'all' ? null : Number(event.target.value))}
            className="h-10 w-full appearance-none rounded-md border border-[#c7d1e2] bg-white pl-3 pr-14 text-[11px] font-bold text-[var(--deshazo-text)] outline-none transition focus:border-[var(--deshazo-blue)]"
          >
            <option value="all">All Service Locations</option>
            {serviceLocations.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
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
                  className="flex w-full items-center gap-3 px-3 py-1 text-left text-[13px] font-bold text-[var(--deshazo-text)] transition hover:text-[var(--deshazo-blue)]"
                >
                  <span className="text-[var(--deshazo-blue)]"><MenuIcon icon={section.icon} /></span>
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
                      {section.items.map((item) => {
                        const itemKey = `${section.id}:${item}`
                        const isActive = activeItem === itemKey
                        return (
                          <li key={item}>
                            <button
                              type="button"
                              aria-current={isActive ? 'page' : undefined}
                              onClick={() => {
                                setActiveItem(itemKey)
                                if (itemKey === 'work-orders:All' && workOrderId) navigate('/full-application')
                              }}
                              className={`w-full rounded-sm px-2 py-1 text-left text-[11px] leading-[17px] transition hover:bg-[#eef4ff] hover:text-[var(--deshazo-blue)] ${
                                isActive ? 'bg-[#e6efff] font-black text-[var(--deshazo-blue)]' : 'font-semibold text-[#747b8a]'
                              }`}
                            >
                              {item}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </div>
              </section>
            )
          })}

          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 px-3 py-1 text-left text-[13px] font-bold text-[var(--deshazo-text)] transition hover:text-[var(--deshazo-blue)]"
          >
            <span className="text-[var(--deshazo-blue)]"><MenuIcon icon="logout" /></span>
            <span>Logout</span>
          </button>
        </nav>
      </aside>

      <main aria-label="Full application workspace" className="min-h-screen min-w-0 flex-1">
        {workOrderId && Number.isInteger(workOrderId) ? (
          <WorkOrderDetails workOrderId={workOrderId} onBack={() => navigate('/full-application')} />
        ) : activeItem === 'work-orders:All' ? (
          <WorkOrdersAll
            serviceLocationId={serviceLocationId}
            onOpenWorkOrder={(id) => navigate(`/full-application/work-orders/${id}/details`)}
          />
        ) : activeItem === 'reports:Job Cost Report' ? (
          <JobCostReport />
        ) : (
          <div className="flex min-h-screen items-center justify-center px-6 text-center text-[13px] text-[#7a8592]">
            This section is not built yet.
          </div>
        )}
      </main>
    </div>
  )
}
