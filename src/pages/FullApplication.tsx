import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
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
import WorkOrdersSchedule from '../components/WorkOrdersSchedule'
import RecurringWorkOrders from '../components/RecurringWorkOrders'
import CustomersList from '../components/CustomersList'
import CranesList from '../components/CranesList'
import PayrollReport from '../components/PayrollReport'
import DailyWorktimeReport from '../components/DailyWorktimeReport'
import RecoveryReport from '../components/RecoveryReport'
import DailyUsageReport from '../components/DailyUsageReport'
import PayCorReport from '../components/PayCorReport'
import SafetyDashboard from '../components/SafetyDashboard'
import FleetManagement from '../components/FleetManagement'
import EquipmentNotebookLLM from './EquipmentNotebookLLM'
import { getDeshazoServiceLocations, type DeshazoServiceLocation } from '../lib/deshazoReports'

type MenuSection = {
  id: string
  label: string
  icon: 'home' | 'calendar' | 'users' | 'quote' | 'reports' | 'safety' | 'fleet' | 'knowledge' | 'admin'
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
    id: 'quoting',
    label: 'Quoting',
    icon: 'quote',
    items: ['Quote List'],
  },
  {
    id: 'safety',
    label: 'Safety',
    icon: 'safety',
    items: ['Overview'],
  },
  {
    id: 'assets',
    label: 'Assets',
    icon: 'fleet',
    items: ['Fleet Management'],
  },
  {
    id: 'green-files',
    label: 'Green Files',
    icon: 'knowledge',
    items: ['Equipment Notebook'],
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
    quote: <path d="M6 3h9l4 4v14H6V3Zm9 0v5h4M9 12h7m-7 4h5M3 7v11" />,
    safety: <path d="M12 3 4.8 6v5.4c0 4.6 2.9 8.2 7.2 9.6 4.3-1.4 7.2-5 7.2-9.6V6L12 3Zm-3.2 9 2 2 4.5-4.5" />,
    fleet: <><path d="M3 6h11v10H3V6Zm11 4h4l3 3v3h-7v-6Z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
    knowledge: <><path d="M5 3h11l3 3v15H5V3Z" /><path d="M16 3v4h4M8 11h8m-8 4h8m-8 4h5" /></>,
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
  const location = useLocation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== 'undefined' && window.localStorage.getItem('deshazo-full-application-sidebar-collapsed') === 'true',
  )
  const [user, setUser] = useState<User | null>(null)
  const [deshazoUser, setDeshazoUser] = useState<DeshazoAppUser | null>(null)
  const [deshazoChecking, setDeshazoChecking] = useState(true)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(initiallyOpen)
  const [activeItem, setActiveItem] = useState(() =>
    location.pathname.endsWith('/assets/green-files')
      ? 'green-files:Equipment Notebook'
      : location.pathname.endsWith('/assets/fleet-management')
        ? 'assets:Fleet Management'
    : location.pathname.endsWith('/quoting/quotes')
      ? 'quoting:Quote List'
      : location.pathname.endsWith('/safety')
      ? 'safety:Overview'
      : location.pathname.endsWith('/calendar/schedule')
      ? 'calendar:Schedule'
      : location.pathname.endsWith('/report/payroll')
        ? 'reports:Payroll'
        : location.pathname.endsWith('/report/daily-worktime')
          ? 'reports:Technician Daily Report'
          : location.pathname.endsWith('/report/recovery')
            ? 'reports:Recovery Report'
            : location.pathname.endsWith('/report/daily-usage-report')
              ? 'reports:Daily Usage Report'
              : location.pathname.endsWith('/report/pay-cor')
                ? 'reports:PayCor'
      : location.pathname.endsWith('/calendar/recurring-jobs')
        ? 'calendar:Recurring Jobs'
        : location.pathname.endsWith('/customers/all')
          ? 'customers:Customers'
          : location.pathname.endsWith('/customers/cranes')
            ? 'customers:Cranes'
      : location.pathname.endsWith('/work-orders/recently-added')
        ? 'work-orders:Recently Added'
        : location.pathname.endsWith('/work-orders/pending')
          ? 'work-orders:To Be Scheduled'
          : location.pathname.endsWith('/work-orders/scheduled')
            ? 'work-orders:Scheduled'
            : location.pathname.endsWith('/work-orders/in-progress')
              ? 'work-orders:In-Progress'
              : location.pathname.endsWith('/work-orders/waiting-for-parts')
                ? 'work-orders:Waiting For Parts'
                : location.pathname.endsWith('/work-orders/completed')
                  ? 'work-orders:Completed'
                  : 'work-orders:All',
  )
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
    window.localStorage.setItem('deshazo-full-application-sidebar-collapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

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
    <div className="flex h-screen overflow-hidden bg-[#f4f7fb] text-[var(--deshazo-text)]">
      <aside className={`relative h-screen shrink-0 overflow-y-auto overscroll-contain border-r border-[#d3dbea] bg-[#f8fbff] pb-8 pt-6 shadow-sm [scrollbar-gutter:stable] transition-[width,padding] duration-200 ${sidebarCollapsed ? 'w-[76px] px-3' : 'w-[272px] px-4'}`}>
        <button
          type="button"
          aria-label={sidebarCollapsed ? 'Expand side menu' : 'Collapse side menu'}
          title={sidebarCollapsed ? 'Expand side menu' : 'Collapse side menu'}
          aria-expanded={!sidebarCollapsed}
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          className="absolute -right-3 top-6 z-50 flex h-7 w-7 items-center justify-center rounded-full border border-[#c7d1e2] bg-white text-[15px] font-black text-[var(--deshazo-blue)] shadow-sm transition hover:bg-[#eef4ff]"
        >
          {sidebarCollapsed ? '›' : '‹'}
        </button>

        <div className="flex h-[52px] items-center justify-center overflow-hidden">
          {sidebarCollapsed ? (
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--deshazo-blue)] text-lg font-black text-white" aria-label="DeShazo">D</span>
          ) : (
            <img src="/deshazo-logo.png" alt="DeShazo" className="h-auto w-[180px]" />
          )}
        </div>

        <div className={`${sidebarCollapsed ? 'hidden' : 'mt-7 flex'} flex-col items-center text-center`}>
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

        <div className={`${sidebarCollapsed ? 'hidden' : 'relative mt-5'}`}>
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

        <nav aria-label="Full application navigation" className={`${sidebarCollapsed ? 'mt-5 space-y-2' : 'mt-5 space-y-3'}`}>
          {menuSections.map((section) => {
            const isOpen = openSections[section.id]
            return (
              <section key={section.id}>
                <button
                  type="button"
                  aria-expanded={!sidebarCollapsed && isOpen}
                  aria-controls={`${section.id}-items`}
                  title={sidebarCollapsed ? section.label : undefined}
                  onClick={() => {
                    if (sidebarCollapsed) {
                      setSidebarCollapsed(false)
                      setOpenSections((current) => ({ ...current, [section.id]: true }))
                    } else {
                      toggleSection(section.id)
                    }
                  }}
                  className={`flex w-full items-center py-1 text-left text-[13px] font-bold text-[var(--deshazo-text)] transition hover:text-[var(--deshazo-blue)] ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'}`}
                >
                  <span className="text-[var(--deshazo-blue)]"><MenuIcon icon={section.icon} /></span>
                  {sidebarCollapsed ? null : <>
                    <span>{section.label}</span>
                    <svg aria-hidden="true" viewBox="0 0 16 16" className={`ml-auto h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="m4 6 4 4 4-4" />
                    </svg>
                  </>}
                </button>

                <div
                  id={`${section.id}-items`}
                  className={`grid transition-[grid-template-rows,opacity] duration-200 ${isOpen && !sidebarCollapsed ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
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
                                if (itemKey === 'calendar:Schedule') navigate('/full-application/calendar/schedule')
                                else if (itemKey === 'reports:Payroll') navigate('/full-application/report/payroll')
                                else if (itemKey === 'reports:Technician Daily Report') navigate('/full-application/report/daily-worktime')
                                else if (itemKey === 'reports:Recovery Report') navigate('/full-application/report/recovery')
                                else if (itemKey === 'reports:Daily Usage Report') navigate('/full-application/report/daily-usage-report')
                                else if (itemKey === 'reports:PayCor') navigate('/full-application/report/pay-cor')
                                else if (itemKey === 'calendar:Recurring Jobs') navigate('/full-application/calendar/recurring-jobs')
                                else if (itemKey === 'customers:Customers') navigate('/full-application/customers/all')
                                else if (itemKey === 'customers:Cranes') navigate('/full-application/customers/cranes')
                                else if (itemKey === 'safety:Overview') navigate('/full-application/safety')
                                else if (itemKey === 'assets:Fleet Management') navigate('/full-application/assets/fleet-management')
                                else if (itemKey === 'green-files:Equipment Notebook') navigate('/full-application/assets/green-files')
                                else if (itemKey === 'quoting:Quote List') navigate('/jobsquotinglist')
                                else if (itemKey === 'work-orders:Recently Added') navigate('/full-application/work-orders/recently-added')
                                else if (itemKey === 'work-orders:To Be Scheduled') navigate('/full-application/work-orders/pending')
                                else if (itemKey === 'work-orders:Scheduled') navigate('/full-application/work-orders/scheduled')
                                else if (itemKey === 'work-orders:In-Progress') navigate('/full-application/work-orders/in-progress')
                                else if (itemKey === 'work-orders:Waiting For Parts') navigate('/full-application/work-orders/waiting-for-parts')
                                else if (itemKey === 'work-orders:Completed') navigate('/full-application/work-orders/completed')
                                else if (itemKey === 'work-orders:All' || workOrderId) navigate('/full-application')
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
            title={sidebarCollapsed ? 'Logout' : undefined}
            className={`flex w-full items-center py-1 text-left text-[13px] font-bold text-[var(--deshazo-text)] transition hover:text-[var(--deshazo-blue)] ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'}`}
          >
            <span className="text-[var(--deshazo-blue)]"><MenuIcon icon="logout" /></span>
            {sidebarCollapsed ? null : <span>Logout</span>}
          </button>
        </nav>
      </aside>

      <main aria-label="Full application workspace" className="h-screen min-w-0 flex-1 overflow-y-auto overscroll-contain">
        {workOrderId && Number.isInteger(workOrderId) ? (
          <WorkOrderDetails
            workOrderId={workOrderId}
            onBack={() => {
              const returnTo = new URLSearchParams(location.search).get('returnTo')
              navigate(returnTo === 'schedule' ? '/full-application/calendar/schedule' : returnTo === 'recurring-jobs' ? '/full-application/calendar/recurring-jobs' : returnTo === 'cranes' ? '/full-application/customers/cranes' : returnTo === 'daily-worktime' ? '/full-application/report/daily-worktime' : returnTo === 'recently-added' ? '/full-application/work-orders/recently-added' : returnTo === 'pending' ? '/full-application/work-orders/pending' : returnTo === 'scheduled' ? '/full-application/work-orders/scheduled' : returnTo === 'in-progress' ? '/full-application/work-orders/in-progress' : returnTo === 'waiting-for-parts' ? '/full-application/work-orders/waiting-for-parts' : returnTo === 'completed' ? '/full-application/work-orders/completed' : '/full-application')
            }}
          />
        ) : activeItem === 'work-orders:All' ? (
          <WorkOrdersAll
            key="all-work-orders"
            serviceLocationId={serviceLocationId}
            onOpenWorkOrder={(id) => navigate(`/full-application/work-orders/${id}/details`)}
          />
        ) : activeItem === 'work-orders:Recently Added' ? (
          <WorkOrdersAll
            key="recent-work-orders"
            recent
            serviceLocationId={serviceLocationId}
            onOpenWorkOrder={(id) => navigate(`/full-application/work-orders/${id}/details?returnTo=recently-added`)}
          />
        ) : activeItem === 'work-orders:To Be Scheduled' ? (
          <WorkOrdersAll
            key="pending-work-orders"
            statusName="Pending"
            listLabel="To Be Scheduled"
            serviceLocationId={serviceLocationId}
            onOpenWorkOrder={(id) => navigate(`/full-application/work-orders/${id}/details?returnTo=pending`)}
          />
        ) : activeItem === 'work-orders:Scheduled' ? (
          <WorkOrdersAll
            key="scheduled-work-orders"
            statusName="Scheduled"
            serviceLocationId={serviceLocationId}
            onOpenWorkOrder={(id) => navigate(`/full-application/work-orders/${id}/details?returnTo=scheduled`)}
          />
        ) : activeItem === 'work-orders:In-Progress' ? (
          <WorkOrdersAll
            key="in-progress-work-orders"
            statusName="In Progress"
            serviceLocationId={serviceLocationId}
            onOpenWorkOrder={(id) => navigate(`/full-application/work-orders/${id}/details?returnTo=in-progress`)}
          />
        ) : activeItem === 'work-orders:Waiting For Parts' ? (
          <WorkOrdersAll
            key="waiting-for-parts-work-orders"
            statusName="Waiting for parts"
            serviceLocationId={serviceLocationId}
            onOpenWorkOrder={(id) => navigate(`/full-application/work-orders/${id}/details?returnTo=waiting-for-parts`)}
          />
        ) : activeItem === 'work-orders:Completed' ? (
          <WorkOrdersAll
            key="completed-work-orders"
            statusName="Completed"
            serviceLocationId={serviceLocationId}
            onOpenWorkOrder={(id) => navigate(`/full-application/work-orders/${id}/details?returnTo=completed`)}
          />
        ) : activeItem === 'calendar:Schedule' ? (
          <WorkOrdersSchedule
            serviceLocationId={serviceLocationId}
            onOpenWorkOrder={(id) => navigate(`/full-application/work-orders/${id}/details?returnTo=schedule`)}
          />
        ) : activeItem === 'calendar:Recurring Jobs' ? (
          <RecurringWorkOrders
            serviceLocationId={serviceLocationId}
            onOpenWorkOrder={(id) => navigate(`/full-application/work-orders/${id}/details?returnTo=recurring-jobs`)}
          />
        ) : activeItem === 'customers:Customers' ? (
          <CustomersList serviceLocationId={serviceLocationId} roleId={deshazoUser.roleId} />
        ) : activeItem === 'customers:Cranes' ? (
          <CranesList
            serviceLocationId={serviceLocationId}
            onOpenWorkOrder={(id) => navigate(`/full-application/work-orders/${id}/details?returnTo=cranes`)}
          />
        ) : activeItem === 'safety:Overview' ? (
          <SafetyDashboard />
        ) : activeItem === 'assets:Fleet Management' ? (
          <FleetManagement serviceLocationId={serviceLocationId} serviceLocations={serviceLocations} />
        ) : activeItem === 'green-files:Equipment Notebook' ? (
          <EquipmentNotebookLLM embedded />
        ) : activeItem === 'reports:Payroll' ? (
          <PayrollReport serviceLocationId={serviceLocationId} />
        ) : activeItem === 'reports:Technician Daily Report' ? (
          <DailyWorktimeReport
            serviceLocationId={serviceLocationId}
            onOpenWorkOrder={(id) => navigate(`/full-application/work-orders/${id}/details?returnTo=daily-worktime`)}
          />
        ) : activeItem === 'reports:Recovery Report' ? (
          <RecoveryReport serviceLocationId={serviceLocationId} />
        ) : activeItem === 'reports:Daily Usage Report' ? (
          <DailyUsageReport serviceLocationId={serviceLocationId} />
        ) : activeItem === 'reports:PayCor' ? (
          <PayCorReport serviceLocationId={serviceLocationId} />
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
