import { useEffect, useState } from 'react'
import { getDeshazoDailyWorktime, type DeshazoDailyWorktimeEntry, type DeshazoDailyWorktimeResponse } from '../lib/deshazoDailyWorktime'

type DailyWorktimeReportProps = {
  serviceLocationId: number | null
  onOpenWorkOrder: (workOrderId: number) => void
}

type GroupedEntry = DeshazoDailyWorktimeEntry & { regHours: number; otHours: number }

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function sameDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate()
}

function dateLabel(date: Date) {
  const today = new Date()
  if (sameDate(date, today)) return 'Today'
  if (sameDate(date, addDays(today, -1))) return 'Yesterday'
  return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).format(date)
}

function formatTime(value?: string | null) {
  if (!value) return null
  const match = value.match(/(?:T|\s)?(\d{1,2}):(\d{2})/)
  if (!match) return value
  const hour = Number(match[1])
  const minute = match[2]
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`
}

function groupEntries(entries: DeshazoDailyWorktimeEntry[]) {
  const types = new Set<string>()
  const groups: Record<string, GroupedEntry> = {}
  entries.forEach((entry) => {
    const key = String(entry.workOrderId || entry.type || '')
    if (!key) return
    if (entry.type) types.add(entry.type)
    if (groups[key]) {
      groups[key].regHours += Number(entry.regHours || 0)
      groups[key].otHours += Number(entry.otHours || 0)
    } else {
      groups[key] = { ...entry, regHours: Number(entry.regHours || 0), otHours: Number(entry.otHours || 0) }
    }
  })
  return {
    workOrders: Object.keys(groups).filter((key) => !types.has(key)).map((key) => ({ key, entry: groups[key] })),
    otherTimes: Array.from(types).map((type) => ({ type, entry: groups[type] })),
  }
}

function EntryHours({ entry }: { entry: GroupedEntry }) {
  const start = formatTime(entry.startTime)
  const end = formatTime(entry.endTime)
  return <span className="whitespace-nowrap font-medium text-[var(--deshazo-text)]">{start || entry.regHours.toFixed(2)} <span className="mx-1 text-[#9aa3b2]">/</span> {end || entry.otHours.toFixed(2)}</span>
}

export default function DailyWorktimeReport({ serviceLocationId, onOpenWorkOrder }: DailyWorktimeReportProps) {
  const [date, setDate] = useState(() => new Date())
  const [data, setData] = useState<DeshazoDailyWorktimeResponse>({ employeeNames: {}, employeesData: {}, workOrderLabels: {} })
  const [openEmployees, setOpenEmployees] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(async () => {
      if (cancelled) return
      setLoading(true)
      setError('')
      try {
        const result = await getDeshazoDailyWorktime({ date: isoDate(date), serviceLocationId })
        if (!cancelled) {
          setData(result)
          setOpenEmployees(Object.fromEntries(Object.keys(result.employeeNames).map((id) => [id, true])))
        }
      } catch (loadError) {
        if (!cancelled) {
          setData({ employeeNames: {}, employeesData: {}, workOrderLabels: {} })
          setError(loadError instanceof Error ? loadError.message : 'There was an error with your request.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [date, refreshKey, serviceLocationId])

  const employeeIds = Object.keys(data.employeeNames)
  const nextDisabled = sameDate(date, new Date())

  return (
    <div className="px-5 py-5 lg:px-7">
      <section className="overflow-hidden rounded-sm border border-[#d3dbea] bg-white shadow-[0_10px_28px_rgba(55,78,108,0.05)]">
        <header className="flex flex-col gap-4 border-b border-[#d3dbea] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-[22px] font-semibold text-[var(--deshazo-text)]">Technician Daily Report</h1>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Previous day" onClick={() => setDate((current) => addDays(current, -1))} className="flex h-9 w-9 items-center justify-center rounded-md border border-[#bdc4d3] bg-white text-lg font-bold text-[var(--deshazo-blue)]">‹</button>
            <div className="flex h-9 min-w-[120px] items-center justify-center rounded-md border border-[#c7d1e2] bg-white px-4 text-[12px] font-bold text-[var(--deshazo-text)]">{dateLabel(date)}</div>
            <button type="button" aria-label="Next day" disabled={nextDisabled} onClick={() => setDate((current) => addDays(current, 1))} className="flex h-9 w-9 items-center justify-center rounded-md border border-[#bdc4d3] bg-white text-lg font-bold text-[var(--deshazo-blue)] disabled:opacity-40">›</button>
            <button type="button" aria-label="Refresh technician daily report" onClick={() => setRefreshKey((value) => value + 1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#647688] text-lg font-bold text-white">↻</button>
          </div>
        </header>

        {error ? <p className="m-4 rounded-md border border-[#f0c8c8] bg-[#fdf1f1] px-4 py-3 text-[13px] font-semibold text-[#b23b3b]">{error}</p> : null}
        <div className="p-4">
          {loading ? <p className="py-14 text-center font-semibold text-[#747b8a]">Loading technician daily report...</p> : employeeIds.length ? <div className="space-y-2">{employeeIds.map((employeeId) => {
            const grouped = groupEntries(data.employeesData[employeeId] || [])
            const isOpen = openEmployees[employeeId] !== false
            return <section key={employeeId} className="overflow-hidden rounded-md border border-[#d3dbea]">
              <button type="button" onClick={() => setOpenEmployees((current) => ({ ...current, [employeeId]: !isOpen }))} className="flex w-full items-center justify-between bg-[var(--deshazo-blue)] px-4 py-3 text-left text-[13px] font-bold text-white"><span>{data.employeeNames[employeeId]}</span><span aria-hidden="true">{isOpen ? '⌃' : '⌄'}</span></button>
              {isOpen ? <div className="bg-white p-3">
                <h2 className="rounded-t-md bg-[#eef2f8] px-4 py-2 text-[12px] font-bold underline text-[var(--deshazo-text)]">Work Orders</h2>
                {grouped.workOrders.length ? grouped.workOrders.map(({ key, entry }) => <div key={`${employeeId}-${key}`} className="flex flex-col gap-2 border-b border-[#e2e8f2] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><span className="min-w-0 truncate text-[12px] text-[var(--deshazo-text)]">{data.workOrderLabels[key] || `Work Order ${key}`}</span><div className="flex shrink-0 items-center gap-3"><EntryHours entry={entry} /><button type="button" onClick={() => onOpenWorkOrder(Number(key))} className="rounded-md bg-[#647688] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#536576]">Go to Work Order</button></div></div>) : <p className="px-4 py-3 text-[12px] text-[#747b8a]">No time recorded</p>}
                <h2 className="mt-2 bg-[#eef2f8] px-4 py-2 text-[12px] font-bold underline text-[var(--deshazo-text)]">Non Job Time</h2>
                {grouped.otherTimes.length ? grouped.otherTimes.map(({ type, entry }) => <div key={`${employeeId}-${type}`} className="flex items-center justify-between border-b border-[#e2e8f2] px-4 py-3"><span className="text-[12px] font-medium text-[var(--deshazo-text)]">{type}</span><EntryHours entry={entry} /></div>) : <p className="px-4 py-3 text-[12px] text-[#747b8a]">No time recorded</p>}
              </div> : null}
            </section>
          })}</div> : <p className="py-14 text-center text-[#747b8a]">No data has been recorded on the selected date</p>}
        </div>
      </section>
    </div>
  )
}
