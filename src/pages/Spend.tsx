import { Link, useNavigate } from 'react-router-dom'
import { usePortalMenu } from '../lib/usePortalMenu'
import { useDeveloperMenuItems } from '../lib/useDeveloperMenuItems'
import { DeveloperBadge } from '../components/DeveloperBadge'
import {
  mockAverageInvoiceSpend,
  mockLocationSpend,
  mockMonthlySpend,
  mockServiceTypeSpend,
  mockToplineSpend,
  mockTopOpenItems,
} from '../lib/mockSpendAnalytics'
import { useCustomerPath } from '../lib/customerRouting'

const menuItems = [
  { label: 'Home', href: '/dashboard' },
  { label: 'Open Risk Items', href: '/asset-fleet-assets?view=open-risk' },
  { label: 'Asset Fleet', href: '/asset-fleet' },
  { label: 'Spend', href: '/spend' },
  { label: 'Location Comparison', href: '/location-comparison' },
  { label: 'Document Reports', href: '/documents-reports' },
  { label: 'Custom Reports', href: '/custom-reports' },
  { label: 'Documents', href: '/deshazo-work-orders' },
  { label: 'Add User', href: '/add-user' },
  { label: 'Contact Us', href: '/contact-us' },
]

const buildBlueShades = (count: number) => {
  if (count <= 0) return []

  return Array.from({ length: count }, (_, index) => {
    const lightness = 74 - (index / Math.max(count - 1, 1)) * 36
    return `hsl(221 68% ${lightness}%)`
  })
}

const formatCurrency = (value: number) => `$${value.toLocaleString()}`

const formatMonthLabel = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return value
  return trimmed.slice(0, 3).replace(/^./, (char) => char.toUpperCase())
}

const buildUniqueChartColors = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const hue = Math.round((index * 137.508) % 360)
    return `hsl(${hue} 62% 56%)`
  })

const buildConicGradient = (segments: { value: number; color: string }[]) => {
  let current = 0
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1

  const stops = segments.map((segment) => {
    const start = current
    const end = current + (segment.value / total) * 100
    current = end
    return `${segment.color} ${start}% ${end}%`
  })

  return `conic-gradient(${stops.join(', ')})`
}

const getBarHeight = (value: number, maxValue: number, plotHeight?: number) => {
  if (value <= 0 || maxValue <= 0) return 0
  const ratio = value / maxValue
  return plotHeight ? ratio * plotHeight : ratio * 100
}

export default function Spend() {
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const navigate = useNavigate()
  const customerPath = useCustomerPath()

  const activeMenuItems = useDeveloperMenuItems(menuItems, 'Spend')

  const handleSignOut = () => {
    navigate(customerPath('/login'))
  }
  const fullName = 'Developer Preview'
  const userEmail = 'local@deshazo.test'
  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join('') || 'DP'

  const serviceTypeTotal = mockServiceTypeSpend.reduce((sum, item) => sum + item.spend, 0)
  const serviceTypeColors = buildBlueShades(mockServiceTypeSpend.length)
  const serviceTypeData = mockServiceTypeSpend.map((item, index) => ({
    ...item,
    value: Number(((item.spend / serviceTypeTotal) * 100).toFixed(2)),
    color: serviceTypeColors[index] ?? 'hsl(221 68% 52%)',
  }))
  const locationSpendTotal = mockLocationSpend.reduce((sum, item) => sum + item.spend, 0)
  const locationColors = buildUniqueChartColors(mockLocationSpend.length)
  const locationSpendData = mockLocationSpend.map((item, index) => ({
    ...item,
    value: Number(((item.spend / locationSpendTotal) * 100).toFixed(2)),
    color: locationColors[index] ?? `hsl(${(index * 31) % 360} 62% 56%)`,
  }))
  const toplineSpend = mockToplineSpend
  const momSpendData = mockMonthlySpend
  const avgMoMData = mockAverageInvoiceSpend
  const topIssueData = mockTopOpenItems

  const maxMoMSpend = momSpendData.reduce((max, item) => Math.max(max, item.spend), 0)
  const maxAvgMoM = avgMoMData.reduce((max, item) => Math.max(max, item.spend), 0)
  const maxTopIssue = topIssueData.reduce((max, item) => Math.max(max, item.total), 0)
  const plotHeight = 184

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
            Signed in as <span className="font-semibold text-white">{userEmail}</span>
          </div>
        </div>
      </header>

      <main className="flex w-full items-stretch">
        {menuOpen && (
          <aside className="sticky top-[60px] hidden h-[calc(100vh-60px)] w-[268px] shrink-0 border-r border-[var(--deshazo-border)] bg-white lg:flex lg:flex-col">
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
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <span className="truncate">{item.label}</span>
                          {item.developerOnly ? <DeveloperBadge /> : null}
                        </span>
                        <span className="text-[12px] font-semibold text-[rgba(21,24,33,0.4)]" />
                      </Link>
                    ) : (
                      <button
                        key={item.label}
                        type="button"
                        className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-[15px] font-medium text-[rgba(21,24,33,0.7)] transition hover:bg-white"
                      >
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <span className="truncate">{item.label}</span>
                          {item.developerOnly ? <DeveloperBadge /> : null}
                        </span>
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
                    <p className="truncate text-[14px] text-[rgba(21,24,33,0.55)]">{userEmail}</p>
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
                <span>Spend analytics</span>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <section className="grid gap-4 rounded-[14px] border border-[var(--deshazo-border)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)] md:grid-cols-2 xl:grid-cols-4">
              {[
                ['Total Invoices', toplineSpend.total_invoices.toLocaleString()],
                ['Total Spend', formatCurrency(toplineSpend.total_spend)],
                ['Labor Spend', formatCurrency(toplineSpend.total_labor_spend)],
                ['Equipment Spend', formatCurrency(toplineSpend.total_equipment_spend)],
              ].map(([label, value]) => (
                <article key={label} className="rounded-xl px-2 py-1">
                  <p className="text-[15px] font-bold text-[var(--deshazo-text)]">{label}</p>
                  <p className="mt-1 text-[34px] font-extrabold leading-none tracking-[-0.05em] text-[var(--deshazo-text)]">
                    {value}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[rgba(21,24,33,0.45)]">
                    {toplineSpend.topline_start_str}
                  </p>
                </article>
              ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <article className="rounded-[16px] border-[6px] border-[var(--deshazo-surface-2)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                <h2 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--deshazo-text)]">Spend By Service Type</h2>
                <div className="mt-6 flex flex-col items-center justify-center gap-5">
                  <div
                    className="relative h-44 w-44 rounded-full"
                    style={{ background: buildConicGradient(serviceTypeData) }}
                  >
                    <div className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-center text-[11px] font-semibold text-[var(--deshazo-text)] shadow-[inset_0_0_0_1px_rgba(47,86,166,0.08)]">
                      Service mix
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-5 text-sm">
                    {serviceTypeData.map((segment) => (
                      <div key={segment.label} className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: segment.color }} />
                        <span className="text-[rgba(21,24,33,0.66)]">
                          {segment.label} ({segment.value}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>

              <article className="rounded-[16px] border-[6px] border-[var(--deshazo-surface-2)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                <h2 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--deshazo-text)]">Month Over Month Spend</h2>
                <div className="mt-5 rounded-[14px] bg-[linear-gradient(180deg,rgba(238,243,255,0.5)_0%,rgba(255,255,255,1)_100%)] p-4">
                  <div className="scrollbar-hidden overflow-x-auto">
                      <div className="min-w-[720px]">
                        <div className="grid h-56 grid-rows-[1fr_auto]">
                          <div className="relative">
                            <div className="absolute inset-0 flex flex-col justify-between">
                            {Array.from({ length: 5 }).map((_, index) => {
                              const tickValue = Math.round((maxMoMSpend / 4) * (4 - index))
                              return (
                                <div key={index} className="flex items-center gap-3">
                                  <span className="w-12 text-xs text-[rgba(21,24,33,0.45)]">
                                    {formatCurrency(tickValue)}
                                  </span>
                                  <div className="h-px flex-1 bg-[var(--deshazo-border)]" />
                                </div>
                              )
                            })}
                            </div>
                            <div className="absolute inset-x-14 bottom-0 top-0 flex items-end justify-between gap-3">
                              {momSpendData.map((point) => {
                                const height = getBarHeight(point.spend, maxMoMSpend, plotHeight)
                                return (
                                  <div key={point.month} className="flex h-full min-w-[54px] flex-1 items-end justify-center">
                                    <div className="w-full max-w-[52px] rounded-t-md bg-[var(--deshazo-blue)]/90" style={{ height: `${height}px` }} />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          <div className="mt-2 ml-14 flex justify-between gap-3">
                            {momSpendData.map((point) => (
                              <div key={point.month} className="flex min-w-[54px] flex-1 justify-center">
                                <span className="text-center text-[11px] text-[rgba(21,24,33,0.55)]">
                                  {formatMonthLabel(point.month)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                  </div>
                </div>
              </article>

              <article className="rounded-[16px] border-[6px] border-[var(--deshazo-surface-2)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                <h2 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--deshazo-text)]">Avg. Invoice Amount</h2>
                <div className="mt-5 rounded-[14px] bg-[linear-gradient(180deg,rgba(238,243,255,0.5)_0%,rgba(255,255,255,1)_100%)] p-4">
                  <div className="scrollbar-hidden overflow-x-auto">
                      <div className="min-w-[720px]">
                        <div className="grid h-56 grid-rows-[1fr_auto]">
                          <div className="relative">
                            <div className="absolute inset-0 flex flex-col justify-between">
                            {Array.from({ length: 5 }).map((_, index) => {
                              const tickValue = Math.round((maxAvgMoM / 4) * (4 - index))
                              return (
                                <div key={index} className="flex items-center gap-3">
                                  <span className="w-12 text-xs text-[rgba(21,24,33,0.45)]">
                                    {formatCurrency(tickValue)}
                                  </span>
                                  <div className="h-px flex-1 bg-[var(--deshazo-border)]" />
                                </div>
                              )
                            })}
                            </div>
                            <div className="absolute inset-x-14 bottom-0 top-0 flex items-end justify-between gap-3">
                              {avgMoMData.map((point) => {
                                const height = getBarHeight(point.spend, maxAvgMoM, plotHeight)
                                return (
                                  <div key={point.month} className="flex h-full min-w-[54px] flex-1 items-end justify-center">
                                    <div className="w-full max-w-[52px] rounded-t-md bg-[var(--deshazo-blue)]/75" style={{ height: `${height}px` }} />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          <div className="mt-2 ml-14 flex justify-between gap-3">
                            {avgMoMData.map((point) => (
                              <div key={point.month} className="flex min-w-[54px] flex-1 justify-center">
                                <span className="text-center text-[11px] capitalize text-[rgba(21,24,33,0.55)]">
                                  {formatMonthLabel(point.month)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                  </div>
                </div>
              </article>

              <article className="rounded-[16px] border-[6px] border-[var(--deshazo-surface-2)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
                <h2 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--deshazo-text)]">Spend By Location</h2>
                <div className="mt-6 flex flex-col items-center justify-center gap-5">
                  <div className="h-44 w-44 rounded-full" style={{ background: buildConicGradient(locationSpendData) }} />
                  <div className="grid w-full grid-cols-1 gap-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
                    {locationSpendData.map((segment) => (
                      <div key={segment.label} className="flex items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }} />
                        <span className="truncate text-[rgba(21,24,33,0.66)]">
                          {segment.label} ({segment.value}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            </section>

            <article className="rounded-[16px] border-[6px] border-[var(--deshazo-surface-2)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
              <h2 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--deshazo-text)]">
                Top 10 Open Items Over Past 6 Months
              </h2>
              <div className="mt-5 rounded-[14px] bg-[linear-gradient(180deg,rgba(238,243,255,0.5)_0%,rgba(255,255,255,1)_100%)] p-4">
                <>
                    <div className="scrollbar-hidden overflow-x-auto">
                      <div className="min-w-[720px]">
                        <div className="grid h-56 grid-rows-[1fr_auto]">
                          <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-4">
                            <div className="relative h-44">
                              {Array.from({ length: 5 }).map((_, index) => {
                                const tickValue = Math.round((maxTopIssue / 4) * (4 - index))
                                const topPercent = index * 25
                                return (
                                  <span
                                    key={index}
                                    className="absolute right-0 text-xs text-[rgba(21,24,33,0.45)]"
                                    style={{
                                      top: `${topPercent}%`,
                                      transform:
                                        index === 0 ? 'translateY(0)' : index === 4 ? 'translateY(-100%)' : 'translateY(-50%)',
                                    }}
                                  >
                                    {tickValue}
                                  </span>
                                )
                              })}
                            </div>
                            <div className="relative h-44 overflow-hidden">
                              {Array.from({ length: 5 }).map((_, index) => {
                                const topPercent = index * 25
                                return (
                                  <div
                                    key={index}
                                    className="absolute inset-x-0 h-px bg-[var(--deshazo-border)]"
                                    style={{ top: `${topPercent}%` }}
                                  />
                                )
                              })}
                              <div className="absolute inset-0 flex items-end justify-between gap-3">
                                {topIssueData.map((item) => {
                                  const height = getBarHeight(item.total, maxTopIssue, 176)
                                  return (
                                    <div key={item.label} className="flex h-full min-w-[120px] flex-1 items-end justify-center">
                                      <div
                                        className="w-full bg-[var(--deshazo-blue)]"
                                        style={{ height: `${height}px` }}
                                      />
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                          <div className="ml-[68px] flex justify-between gap-3">
                            {topIssueData.map((item) => (
                              <div key={item.label} className="flex min-w-[120px] flex-1 justify-center">
                                <span className="text-center text-[11px] text-[rgba(21,24,33,0.55)]">
                                  {item.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-2 text-sm text-[rgba(21,24,33,0.6)]">
                      <span className="h-3 w-3 rounded-sm bg-[var(--deshazo-blue)]" />
                      <span>total</span>
                    </div>
                </>
              </div>
            </article>
          </div>
        </section>
      </main>
    </div>
  )
}
