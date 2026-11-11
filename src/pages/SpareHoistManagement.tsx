import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, isConfigured, getCurrentSupabaseUser } from '../lib/supabase'
import { usePortalMenu } from '../lib/usePortalMenu'
import { useDeveloperMenuItems } from '../lib/useDeveloperMenuItems'
import DNumberSearchBar from '../components/DNumberSearchBar'
import ProfileMenu from '../components/ProfileMenu'
import { DeveloperBadge } from '../components/DeveloperBadge'
import { useCustomerPath, useSelectedCustomer } from '../lib/customerRouting'
import type { User } from '@supabase/supabase-js'

type HoistStatus = 'Available Spare' | 'Awaiting Inspection' | 'Awaiting Approval' | 'Repair in Progress' | 'Awaiting Parts' | 'Installed'
type QuickFilter = 'All hoists' | 'Ready to issue' | 'In process'
type Hoist = {
  assetId: string
  manufacturer: string
  model: string
  capacity: string
  voltage: string
  serial: string
  location: string
  status: HoistStatus
  ticket: string
  repair: string
  updated: string
  lastService: string
  test: string
  custody: string
}

const statuses: HoistStatus[] = ['Available Spare', 'Awaiting Inspection', 'Awaiting Approval', 'Repair in Progress', 'Awaiting Parts', 'Installed']
const quickFilters: QuickFilter[] = ['All hoists', 'Ready to issue', 'In process']
const menuItems = [
  { label: 'Home', href: '/dashboard' },
  { label: 'Spare Hoist Management', href: '/spare-hoist-management' },
  { label: 'Open Risk Items', href: '/asset-fleet-assets?view=open-risk' },
  { label: 'Asset Fleet', href: '/asset-fleet' },
  { label: 'Spend', href: '/spend' },
  { label: 'Location Comparison', href: '/location-comparison' },
  { label: 'Customer Quotes', href: '/customer-quotes' },
  { label: 'Custom Reports', href: '/custom-reports' },
  { label: 'Documents', href: '/deshazo-work-orders' },
  { label: 'Add User', href: '/add-user' },
  { label: 'Contact Us', href: '/contact-us' },
]

// Illustrative records based on Ricky's email. No inventory data is persisted.
const sampleHoists: Hoist[] = [
  { assetId: 'D523145', manufacturer: 'CM', model: 'Lodestar', capacity: '1 Ton', voltage: '460V', serial: 'LS-841902', location: 'Customer Spare Rack A1', status: 'Available Spare', ticket: 'SR-24831', repair: 'Brake adjustment and operational check completed.', updated: 'Oct 16, 2026', lastService: 'Oct 16, 2026', test: 'Operational check passed · release verified', custody: 'Wabash maintenance' },
  { assetId: 'D523689', manufacturer: 'Yale', model: 'CPV', capacity: '½ Ton', voltage: '230V', serial: 'YCP-550284', location: 'Customer Spare Rack A2', status: 'Available Spare', ticket: 'SR-24792', repair: 'Chain guide replaced; inspected and returned to stock.', updated: 'Oct 14, 2026', lastService: 'Oct 14, 2026', test: 'Load test passed · release verified', custody: 'Wabash maintenance' },
  { assetId: 'D523147', manufacturer: 'Harrington', model: 'NTH', capacity: '2 Ton', voltage: '460V', serial: 'HN-002764', location: 'DeSHAZO Cincinnati Shop', status: 'Repair in Progress', ticket: 'SR-24876', repair: 'Brake assembly inspection; repair underway.', updated: 'Oct 21, 2026', lastService: 'Oct 21, 2026', test: 'Testing pending', custody: 'DeSHAZO service' },
  { assetId: 'D528758', manufacturer: 'CM', model: 'Lodestar', capacity: '1 Ton', voltage: '230V', serial: 'LS-731048', location: 'DeSHAZO Cincinnati Shop', status: 'Awaiting Approval', ticket: 'SR-24854', repair: 'Quote submitted for motor and control repairs.', updated: 'Oct 20, 2026', lastService: 'Oct 20, 2026', test: 'Testing pending', custody: 'DeSHAZO service' },
  { assetId: 'D526636', manufacturer: 'Harrington', model: 'NTH', capacity: '1 Ton', voltage: '460V', serial: 'HN-114029', location: 'Production Line 2', status: 'Installed', ticket: 'SR-24608', repair: 'Installed as temporary replacement for D526612.', updated: 'Oct 18, 2026', lastService: 'Oct 18, 2026', test: 'Operational check passed at installation', custody: 'Wabash maintenance' },
  { assetId: 'D526612', manufacturer: 'CM', model: 'Lodestar', capacity: '1 Ton', voltage: '460V', serial: 'LS-731251', location: 'DeSHAZO Cincinnati Shop', status: 'Awaiting Parts', ticket: 'SR-24862', repair: 'Brake lining worn; replacement parts ordered.', updated: 'Oct 21, 2026', lastService: 'Oct 21, 2026', test: 'Testing pending', custody: 'DeSHAZO service' },
  { assetId: 'D527104', manufacturer: 'Yale', model: 'CPV', capacity: '2 Ton', voltage: '460V', serial: 'YCP-330107', location: 'Customer Spare Rack B1', status: 'Available Spare', ticket: 'SR-24581', repair: 'Annual service completed; hook inspected.', updated: 'Oct 10, 2026', lastService: 'Oct 10, 2026', test: 'Load test passed · release verified', custody: 'Wabash maintenance' },
  { assetId: 'D527219', manufacturer: 'CM', model: 'Lodestar', capacity: '½ Ton', voltage: '230V', serial: 'LS-551729', location: 'Customer Spare Rack B2', status: 'Available Spare', ticket: 'SR-24524', repair: 'Limit switch replaced and function tested.', updated: 'Oct 8, 2026', lastService: 'Oct 8, 2026', test: 'Operational check passed · release verified', custody: 'Wabash maintenance' },
  { assetId: 'D527882', manufacturer: 'Harrington', model: 'NTH', capacity: '3 Ton', voltage: '460V', serial: 'HN-330087', location: 'Customer Spare Rack C1', status: 'Available Spare', ticket: 'SR-24491', repair: 'Inspection completed; no defects found.', updated: 'Oct 6, 2026', lastService: 'Oct 6, 2026', test: 'Load test passed · release verified', custody: 'Wabash maintenance' },
  { assetId: 'D528014', manufacturer: 'CM', model: 'Lodestar', capacity: '1 Ton', voltage: '230V', serial: 'LS-840055', location: 'Customer Spare Rack C2', status: 'Available Spare', ticket: 'SR-24443', repair: 'Pendant cable replaced; returned to spare rack.', updated: 'Oct 3, 2026', lastService: 'Oct 3, 2026', test: 'Operational check passed · release verified', custody: 'Wabash maintenance' },
  { assetId: 'D528130', manufacturer: 'Yale', model: 'CPV', capacity: '1 Ton', voltage: '460V', serial: 'YCP-114689', location: 'Customer Spare Rack D1', status: 'Available Spare', ticket: 'SR-24398', repair: 'Chain and hook inspected; service complete.', updated: 'Sep 30, 2026', lastService: 'Sep 30, 2026', test: 'Load test passed · release verified', custody: 'Wabash maintenance' },
  { assetId: 'D528405', manufacturer: 'Harrington', model: 'NTH', capacity: '½ Ton', voltage: '230V', serial: 'HN-771304', location: 'Receiving · DeSHAZO Cincinnati', status: 'Awaiting Inspection', ticket: 'SR-24889', repair: 'Received from Wabash; intake inspection not started.', updated: 'Oct 22, 2026', lastService: 'Oct 22, 2026', test: 'Inspection pending', custody: 'DeSHAZO receiving' },
]

const statusTone: Record<HoistStatus, string> = {
  'Available Spare': 'bg-[#e8f7f2] text-[#087e78]',
  'Awaiting Inspection': 'bg-[#eaf1ff] text-[#5270a8]',
  'Awaiting Approval': 'bg-[#edf0ff] text-[#5d63b5]',
  'Repair in Progress': 'bg-[#e5efff] text-[#2457ad]',
  'Awaiting Parts': 'bg-[#e6f5ff] text-[#1671a5]',
  Installed: 'bg-[#e8edff] text-[#4659a8]',
}
const statusDot: Record<HoistStatus, string> = {
  'Available Spare': 'bg-[#16a394]',
  'Awaiting Inspection': 'bg-[#7a9bd5]',
  'Awaiting Approval': 'bg-[#7774d2]',
  'Repair in Progress': 'bg-[#326ed0]',
  'Awaiting Parts': 'bg-[#32a0cf]',
  Installed: 'bg-[#5368c5]',
}
const statusAccent: Record<HoistStatus, string> = {
  'Available Spare': 'border-l-[#16a394]',
  'Awaiting Inspection': 'border-l-[#7a9bd5]',
  'Awaiting Approval': 'border-l-[#7774d2]',
  'Repair in Progress': 'border-l-[#326ed0]',
  'Awaiting Parts': 'border-l-[#32a0cf]',
  Installed: 'border-l-[#5368c5]',
}

function HoistCard({ hoist, onSelect }: { hoist: Hoist; onSelect: (hoist: Hoist) => void }) {
  return (
    <button type="button" onClick={() => onSelect(hoist)} aria-label={'Open ' + hoist.assetId + ', ' + hoist.manufacturer + ' ' + hoist.model} className={'w-full rounded-xl border border-[#dce6f5] border-l-[3px] ' + statusAccent[hoist.status] + ' bg-white p-3.5 text-left shadow-[0_8px_20px_-17px_rgba(37,74,139,0.42)] transition duration-150 hover:-translate-y-0.5 hover:border-[#a8c2ec] hover:shadow-[0_13px_24px_-17px_rgba(37,74,139,0.42)] focus:outline-none focus:ring-2 focus:ring-[#7ca5e8]'}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-extrabold tracking-wide text-[#183a78]">{hoist.assetId}</span>
        <span className="shrink-0 rounded-full bg-[#eaf1ff] px-2.5 py-1 text-[10px] font-extrabold text-[#315da7]">{hoist.capacity}</span>
      </div>
      <h3 className="mt-3 text-[15px] font-extrabold leading-5 text-[#17243d]">{hoist.manufacturer} {hoist.model}</h3>
      <p className="mt-1 text-[11px] font-medium text-[#748198]">{hoist.voltage}<span className="mx-1.5 text-[#bdc7d6]">·</span>S/N {hoist.serial}</p>
      <div className="mt-3 flex min-w-0 items-start gap-2 border-t border-[#edf1f7] pt-3 text-[11px] font-semibold leading-4 text-[#4c5d78]">
        <span aria-hidden="true" className="shrink-0 text-[#5881c2]">⌖</span><span className="line-clamp-2">{hoist.location}</span>
      </div>
      <p className="mt-3 line-clamp-2 min-h-9 text-[11px] leading-[18px] text-[#58667d]">{hoist.repair}</p>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#edf1f7] pt-2.5 text-[10px] font-bold text-[#8290a5]">
        <span className="text-[#496da9]">{hoist.ticket}</span><span className="shrink-0">{hoist.updated}</span>
      </div>
    </button>
  )
}

export default function SpareHoistManagement() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('All hoists')
  const [selected, setSelected] = useState<Hoist | null>(null)
  const navigate = useNavigate()
  const selectedCustomer = useSelectedCustomer()
  const customerPath = useCustomerPath()
  const activeMenuItems = useDeveloperMenuItems(menuItems, 'Spare Hoist Management')

  useEffect(() => {
    if (selectedCustomer !== 'wabash') {
      navigate(customerPath('/dashboard'), { replace: true })
      return
    }
    if (!isConfigured || !supabase) {
      navigate(customerPath('/login'))
      return
    }
    getCurrentSupabaseUser().then(async (nextUser) => {
      if (!nextUser) {
        navigate(customerPath('/login'))
        return
      }
      setUser(nextUser)
      setAuthLoading(false)
    }).catch(() => {
      navigate(customerPath('/login'))
      setAuthLoading(false)
    })
  }, [customerPath, navigate, selectedCustomer])

  const filteredHoists = useMemo(() => {
    const query = search.trim().toLowerCase()
    return sampleHoists.filter((hoist) => {
      const matchesSearch = !query || [hoist.assetId, hoist.manufacturer, hoist.model, hoist.capacity, hoist.serial, hoist.location, hoist.status].some((value) => value.toLowerCase().includes(query))
      const matchesFilter = quickFilter === 'All hoists'
        || (quickFilter === 'Ready to issue' && hoist.status === 'Available Spare')
        || (quickFilter === 'In process' && ['Awaiting Inspection', 'Awaiting Approval', 'Repair in Progress', 'Awaiting Parts'].includes(hoist.status))
      return matchesSearch && matchesFilter
    })
  }, [quickFilter, search])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate(customerPath('/login'))
  }

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-sm font-semibold text-[var(--deshazo-blue)]">Loading spare hoist management...</div>
  if (!user) return null
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Portal User'
  const availableCount = sampleHoists.filter((hoist) => hoist.status === 'Available Spare').length
  const repairCount = sampleHoists.filter((hoist) => ['Repair in Progress', 'Awaiting Parts', 'Awaiting Inspection'].includes(hoist.status)).length
  const approvalCount = sampleHoists.filter((hoist) => hoist.status === 'Awaiting Approval').length
  const installedCount = sampleHoists.filter((hoist) => hoist.status === 'Installed').length
  const boardColumns = statuses.map((status) => ({
    status,
    items: filteredHoists.filter((hoist) => hoist.status === status),
  }))
  const selectedDetails = selected ? [
    { label: 'Serial number', value: selected.serial },
    { label: 'Capacity / voltage', value: selected.capacity + ' · ' + selected.voltage },
    { label: 'Current location', value: selected.location },
    { label: 'Custody', value: selected.custody },
    { label: 'Last service', value: selected.lastService },
    { label: 'Test / release', value: selected.test },
  ] : []

  return (
    <div className="min-h-screen bg-[#f4f6f9] text-[var(--deshazo-text)]">
      <header className="sticky top-0 z-40 bg-[var(--deshazo-blue)] px-4 py-3 shadow-sm sm:px-5">
        <div className="flex w-full items-center justify-between gap-3">
          <button type="button" onClick={() => setMenuOpen((open) => !open)} className="inline-flex min-w-[100px] items-center justify-center gap-2 rounded-md border-2 border-white/80 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 sm:min-w-[120px] sm:px-6 sm:text-base" aria-expanded={menuOpen}>
            Menu <span aria-hidden="true" className="text-xs">{menuOpen ? '⌃' : '⌄'}</span>
          </button>
          <div className="hidden flex-1 justify-center md:flex"><DNumberSearchBar /></div>
          <ProfileMenu user={user} onSignOut={handleSignOut} />
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
                      to={item.href || '#'}
                      className={item.active
                        ? 'block rounded-xl bg-[#dbe5ff] px-3 py-3 text-[15px] font-medium text-[var(--deshazo-text)]'
                        : 'block rounded-xl px-3 py-3 text-[15px] font-medium text-[rgba(21,24,33,0.7)] hover:bg-white'}
                    >
                      <span className="inline-flex items-center gap-2">{item.label}{item.developerOnly && <DeveloperBadge />}</span>
                    </Link>
                  ))}
                </nav>
              </div>
            </div>
            <div className="border-t border-[var(--deshazo-border)] px-4 py-4">
              <p className="truncate text-sm font-bold">{fullName}</p>
              <p className="truncate text-xs text-[rgba(21,24,33,0.55)]">{user.email}</p>
            </div>
          </aside>
        )}

        <section className="min-w-0 flex-1 px-4 py-6 sm:px-7 lg:px-9">
          <div className="mx-auto max-w-[1680px]">
            <div className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <Link to={customerPath('/dashboard')} className="inline-flex items-center gap-2 text-xs font-bold text-[#778398] hover:text-[var(--deshazo-blue)]"><span>Wabash Portal</span><span aria-hidden="true">›</span><span className="text-[var(--deshazo-blue)]">Spare Hoists</span></Link>
                <h1 className="mt-3 text-[clamp(30px,4vw,44px)] font-black tracking-[-0.05em]">Spare Hoists</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[rgba(21,24,33,0.65)]">Inventory, repair progress, and service history in one place.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#dce2eb] bg-white px-3 py-2 text-xs font-bold text-[#637087]">Wabash · Illustrative data</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
              {[
                { label: 'Total hoists', value: sampleHoists.length, note: 'Across all locations', color: 'text-[#202b3c]' },
                { label: 'Available spares', value: availableCount, note: 'Ready to issue', color: 'text-[#16744d]' },
                { label: 'Under repair', value: repairCount, note: 'Inspection, repair, or parts', color: 'text-[#315baa]' },
                { label: 'Awaiting approval', value: approvalCount, note: 'Quote or work approval needed', color: 'text-[#946300]' },
                { label: 'Installed', value: installedCount, note: 'Currently in service', color: 'text-[#6545a5]' },
              ].map((metric) => (
                <article key={metric.label} className="rounded-2xl border border-[#e3e8ef] bg-white px-4 py-4 shadow-[0_14px_30px_-28px_rgba(29,45,72,0.3)] sm:px-5">
                  <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#788397]">{metric.label}</p>
                  <p className={'mt-2 text-3xl font-black tracking-[-0.04em] ' + metric.color}>{metric.value}</p>
                  <p className="mt-1 text-xs text-[#8791a0]">{metric.note}</p>
                </article>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-[#e3e8ef] bg-white p-4 shadow-[0_14px_30px_-28px_rgba(29,45,72,0.3)] sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div><p className="text-sm font-extrabold">Inventory board</p><p className="mt-1 text-xs leading-5 text-[#788397]">A repaired hoist becomes available after testing, release approval, and inventory receipt.</p></div>
                <label className="flex w-full items-center gap-2 rounded-xl border border-[#dce2eb] bg-[#fafbfc] px-3 py-2.5 transition focus-within:border-[#8ca6db] focus-within:ring-2 focus-within:ring-[#dbe5ff] lg:max-w-sm"><span aria-hidden="true" className="text-[#8993a3]">⌕</span><input aria-label="Search hoists" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ID, model, serial, or location" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9ba4b1]" />{search && <button type="button" onClick={() => setSearch('')} className="rounded-md px-1 text-xs font-bold text-[var(--deshazo-blue)] hover:bg-[#eaf0ff]">Clear</button>}</label>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#edf0f4] pt-4">
                <span className="mr-1 text-xs font-bold text-[#788397]">Show</span>
                {quickFilters.map((filter) => {
                  const count = filter === 'All hoists' ? sampleHoists.length : filter === 'Ready to issue' ? availableCount : repairCount + approvalCount
                  const buttonTone = quickFilter === filter
                    ? 'bg-[var(--deshazo-blue)] text-white shadow-sm'
                    : 'bg-[#f2f4f7] text-[#627087] hover:bg-[#e8edf4]'
                  return (
                    <button key={filter} type="button" onClick={() => setQuickFilter(filter)} aria-pressed={quickFilter === filter} className={'rounded-full px-3.5 py-2 text-xs font-bold transition ' + buttonTone}>
                      {filter} · {count}
                    </button>
                  )
                })}
                <span className="ml-auto text-xs font-semibold text-[#8993a3]">Showing {filteredHoists.length} of {sampleHoists.length} hoists</span>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto pb-3">
              <div className="grid min-w-[1200px] grid-cols-6 gap-3">
                {boardColumns.map((column) => (
                  <section key={column.status} aria-label={column.status + ': ' + column.items.length} className="min-w-0 rounded-2xl border border-[#e0e9f7] bg-[#edf3fc] p-3">
                    <div className="mb-3 flex items-center justify-between gap-2 px-1">
                      <h2 className="flex items-center gap-2 text-[13px] font-extrabold leading-5 text-[#344054]"><span className={'h-2 w-2 rounded-full ' + statusDot[column.status]} />{column.status}</h2>
                      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs font-extrabold text-[#677489]">{column.items.length}</span>
                    </div>
                    <div className="space-y-3">
                      {column.items.length
                        ? column.items.map((hoist) => <HoistCard key={hoist.assetId} hoist={hoist} onSelect={setSelected} />)
                        : <p className="rounded-xl border border-dashed border-[#cbd3df] px-3 py-5 text-center text-xs font-medium text-[#8993a3]">No hoists in this stage</p>}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-[#f0dcae] bg-[#fff9eb] px-4 py-4 sm:flex-row sm:items-start">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ffedc2] font-black text-[#946300]">!</span><div><p className="text-sm font-extrabold text-[#77520b]">Release and availability control</p><p className="mt-1 text-xs leading-5 text-[#806a3d]">Service completion alone does not make a hoist available. Confirm documented testing, release authorization, and its spare inventory location first. Ticket scan details should be reviewed by an authorized employee.</p></div>
            </div>
            <p className="mt-4 text-center text-[11px] font-medium text-[#929baa]">Illustrative inventory for review · Changes are not saved</p>
          </div>
        </section>
      </main>

      {selected && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#101828]/45 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}>
        <section role="dialog" aria-modal="true" aria-labelledby="hoist-dialog-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--deshazo-blue)]">Asset record · {selected.ticket}</p><h2 id="hoist-dialog-title" className="mt-2 text-2xl font-black tracking-tight">{selected.assetId}</h2><p className="mt-1 text-sm text-[#687386]">{selected.manufacturer} {selected.model} · {selected.capacity}</p></div><button type="button" onClick={() => setSelected(null)} aria-label="Close asset details" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f1f3f6] text-xl text-[#536074]">×</button></div>
          <span className={'mt-4 inline-flex rounded-full px-3 py-1.5 text-xs font-extrabold ' + statusTone[selected.status]}>{selected.status}</span>
          <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {selectedDetails.map((detail) => (
              <div key={detail.label} className="rounded-xl bg-[#f6f7f9] px-4 py-3">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-[#8590a0]">{detail.label}</dt>
                <dd className="mt-1 text-sm font-bold text-[#354052]">{detail.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 rounded-xl border border-[#e3e8ef] px-4 py-4"><p className="text-xs font-extrabold uppercase tracking-wide text-[#8590a0]">Service history</p><p className="mt-2 text-sm leading-6 text-[#465267]">{selected.repair}</p><p className="mt-2 text-xs font-semibold text-[#8590a0]">Ticket {selected.ticket} · Updated {selected.updated}</p></div>
          <p className="mt-4 text-xs leading-5 text-[#8993a3]">Sample record only. Ticket document and QR code scanning are represented as future workflow steps.</p>
        </section>
      </div>}
    </div>
  )
}
