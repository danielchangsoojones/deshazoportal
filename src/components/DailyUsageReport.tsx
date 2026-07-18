import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getDeshazoDailyUsage, type DeshazoDailyUsageResponse } from '../lib/deshazoDailyUsage'

type DailyUsageReportProps = { serviceLocationId: number | null }
type PeriodType = 'weekly' | 'custom'

const cards: ReadonlyArray<{ name: string; total: string; help?: string }> = [
  { name: 'Active App Users', total: 'Total Techs', help: 'Includes techs who opened or closed a workday, or entered work time or non-job time.' },
  { name: 'Inactive App Users', total: 'Total Techs', help: 'Includes techs who did not open or close a workday and did not enter work time or non-job time.' },
  { name: 'Techs with a Closed Work Day', total: 'Total Techs' },
  { name: 'Techs with Work Time', total: 'Total Techs' },
  { name: 'Techs with Non-Job time', total: 'Total Techs' },
  { name: 'Opened Work Orders', total: 'Total Work Orders' },
  { name: 'Closed Work Orders', total: 'Total Work Orders' },
  { name: 'Active Work Orders', total: 'Total Work Orders', help: 'Includes work orders that were opened or closed, or had data entered.' },
]

function startOfIsoWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7))
  return result
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function shortDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).format(date)
}

function metricValue(value: unknown) {
  if (Array.isArray(value)) return value.length
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function chartDate(value: string) {
  const date = parseDate(value.slice(0, 10))
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric' }).format(date)
}

export default function DailyUsageReport({ serviceLocationId }: DailyUsageReportProps) {
  const [periodType, setPeriodType] = useState<PeriodType>('weekly')
  const [monday, setMonday] = useState(() => startOfIsoWeek(new Date()))
  const [customStart, setCustomStart] = useState(() => isoDate(startOfIsoWeek(new Date())))
  const [customEnd, setCustomEnd] = useState(() => isoDate(addDays(startOfIsoWeek(new Date()), 6)))
  const [data, setData] = useState<DeshazoDailyUsageResponse>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const range = useMemo(() => periodType === 'weekly'
    ? { start: monday, end: addDays(monday, 6) }
    : { start: parseDate(customStart), end: parseDate(customEnd) }, [customEnd, customStart, monday, periodType])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(async () => {
      if (cancelled) return
      setLoading(true)
      setError('')
      try {
        const response = await getDeshazoDailyUsage({ startDate: isoDate(range.start), endDate: isoDate(range.end), serviceLocationId })
        if (!cancelled) setData(response)
      } catch (loadError) {
        if (!cancelled) {
          setData({})
          setError(loadError instanceof Error ? loadError.message : 'There was an error with your request.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [range, refreshKey, serviceLocationId])

  const chartData = useMemo(() => Object.entries(data['Active App Users Per Date'] || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, point]) => {
      const active = Number(point.active) || 0
      const total = Number(point.total) || 0
      return { date: chartDate(date), active, inactive: Math.max(0, total - active) }
    }), [data])
  const nextDisabled = addDays(monday, 6) > new Date()

  return (
    <div className="px-5 py-5 lg:px-7">
      <section className="overflow-hidden rounded-sm border border-[#d3dbea] bg-white shadow-[0_10px_28px_rgba(55,78,108,0.05)]">
        <header className="flex flex-col gap-4 border-b border-[#d3dbea] px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
          <h1 className="text-[22px] font-semibold text-[var(--deshazo-text)]">Usage Report</h1>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Daily usage report period" value={periodType} onChange={(event) => setPeriodType(event.target.value as PeriodType)} className="h-9 rounded-md border border-[#c7d1e2] bg-white px-3 text-[12px] font-semibold text-[var(--deshazo-text)]"><option value="weekly">Weekly</option><option value="custom">Custom</option></select>
            {periodType === 'weekly' ? <div className="flex items-center gap-1"><button type="button" aria-label="Previous week" onClick={() => setMonday((current) => addDays(current, -7))} className="flex h-9 w-9 items-center justify-center rounded-md border border-[#bdc4d3] bg-white text-lg font-bold text-[var(--deshazo-blue)]">‹</button><strong className="flex h-9 items-center rounded-md border border-[#c7d1e2] px-3 text-[12px] text-[var(--deshazo-text)]">{shortDate(range.start)} - {shortDate(range.end)}</strong><button type="button" aria-label="Next week" disabled={nextDisabled} onClick={() => setMonday((current) => addDays(current, 7))} className="flex h-9 w-9 items-center justify-center rounded-md border border-[#bdc4d3] bg-white text-lg font-bold text-[var(--deshazo-blue)] disabled:opacity-40">›</button></div> : <div className="flex items-center gap-2"><input aria-label="Usage start date" type="date" value={customStart} max={customEnd} onChange={(event) => setCustomStart(event.target.value)} className="h-9 rounded-md border border-[#c7d1e2] px-3 text-[12px]" /><span className="text-[#747b8a]">to</span><input aria-label="Usage end date" type="date" value={customEnd} min={customStart} max={isoDate(new Date())} onChange={(event) => setCustomEnd(event.target.value)} className="h-9 rounded-md border border-[#c7d1e2] px-3 text-[12px]" /></div>}
            <button type="button" aria-label="Refresh usage report" onClick={() => setRefreshKey((value) => value + 1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#647688] text-lg font-bold text-white">↻</button>
          </div>
        </header>
        {error ? <p className="m-4 rounded-md border border-[#f0c8c8] bg-[#fdf1f1] px-4 py-3 text-[13px] font-semibold text-[#b23b3b]">{error}</p> : null}
        {loading ? <p className="py-20 text-center font-semibold text-[#747b8a]">Loading usage report...</p> : <div className="p-4">
          <div className="grid gap-4 md:grid-cols-2">
            {cards.map((card) => {
              const value = metricValue(data[card.name])
              const total = metricValue(data[card.total])
              const percent = total ? ((value / total) * 100).toFixed(2) : '0.00'
              return <article key={card.name} className="rounded-md border border-[#d3dbea] bg-white p-5 shadow-[0_5px_16px_rgba(55,78,108,0.05)]"><div className="flex items-start justify-between gap-3"><h2 className="text-[16px] font-bold text-[var(--deshazo-text)]">{card.name}</h2>{card.help ? <span title={card.help} aria-label={card.help} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#9eabc0] text-[11px] font-bold text-[#647688]">i</span> : null}</div><div className="mt-4 flex items-end justify-between gap-4"><strong className="text-[20px] font-semibold text-[#5f6876]">{value} out of {total}</strong><span className="text-[26px] font-bold text-[var(--deshazo-blue)]">{percent}%</span></div></article>
            })}
          </div>
          <section className="mt-6 rounded-md border border-[#d3dbea] bg-white p-4">
            <h2 className="mb-4 text-[18px] font-bold text-[var(--deshazo-text)]">Activity Chart</h2>
            {chartData.length ? <div className="h-[330px] w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}><CartesianGrid stroke="#e1e7f0" strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fill: '#677180', fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fill: '#677180', fontSize: 11 }} /><Tooltip contentStyle={{ borderColor: '#c7d1e2', borderRadius: 6, fontSize: 12 }} /><Legend /><Line type="monotone" dataKey="active" name="Active Users" stroke="#ff6383" strokeWidth={3} dot={{ r: 4, fill: '#ff6383' }} /><Line type="monotone" dataKey="inactive" name="Inactive Users" stroke="#37a2eb" strokeWidth={3} dot={{ r: 4, fill: '#37a2eb' }} /></LineChart></ResponsiveContainer></div> : <p className="py-16 text-center text-[#747b8a]">No activity data available</p>}
          </section>
        </div>}
      </section>
    </div>
  )
}
