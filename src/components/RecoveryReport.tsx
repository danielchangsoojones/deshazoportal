import { useEffect, useMemo, useState } from 'react'
import { getDeshazoRecovery, type DeshazoRecoveryRegion } from '../lib/deshazoRecovery'

type RecoveryReportProps = { serviceLocationId: number | null }
type PeriodType = 'weekly' | 'custom'

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

function longDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date)
}

function displayNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '')
}

function employeeHoursPerWeek(total: number, weekOrder: number) {
  return weekOrder > 0 ? Number((total / weekOrder).toFixed(2)) : 0
}

function recoveryPercent(job: number, total: number) {
  return total > 0 ? Math.round((job / total) * 100) : 0
}

function escapeCsv(value: string | number) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export default function RecoveryReport({ serviceLocationId }: RecoveryReportProps) {
  const [periodType, setPeriodType] = useState<PeriodType>('weekly')
  const [monday, setMonday] = useState(() => startOfIsoWeek(new Date()))
  const [customStart, setCustomStart] = useState(() => isoDate(startOfIsoWeek(new Date())))
  const [customEnd, setCustomEnd] = useState(() => isoDate(addDays(startOfIsoWeek(new Date()), 6)))
  const [regions, setRegions] = useState<DeshazoRecoveryRegion[]>([])
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
        const data = await getDeshazoRecovery({ startDate: isoDate(range.start), endDate: isoDate(range.end), serviceLocationId })
        if (!cancelled) setRegions(data)
      } catch (loadError) {
        if (!cancelled) {
          setRegions([])
          setError(loadError instanceof Error ? loadError.message : 'There was an error with your request.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [range, refreshKey, serviceLocationId])

  const nextDisabled = addDays(monday, 6) > new Date()
  const downloadCsv = () => {
    const rows: Array<Array<string | number>> = [['Region', 'Location', 'Employee Name', 'Job Time', 'Idle Time', 'Warranty Time', 'Total', 'Hrs/Week', 'Rec %']]
    regions.forEach((region) => region.locations.forEach((location) => {
      location.employees.forEach((employee) => rows.push([region.regionName || 'No Region', location.locationName, employee.employeeName, employee.job, employee.shop, employee.warranty, employee.total, employeeHoursPerWeek(employee.total, employee.weekOrder), `${recoveryPercent(employee.job, employee.total)}%`]))
      rows.push([region.regionName || 'No Region', location.locationName, `Headcount ${location.totals.headCount}`, location.totals.jobTime, location.totals.idleTime, location.totals.warrantyTime, location.totals.total, location.totals.hrsWeek, `${recoveryPercent(location.totals.jobTime, location.totals.total)}%`])
    }))
    const csv = rows.map((row) => row.map(escapeCsv).join(';')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    link.download = `Recovery-${isoDate(range.start)}-${isoDate(range.end)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="px-5 py-5 lg:px-7">
      <section className="overflow-hidden rounded-sm border border-[#d3dbea] bg-white shadow-[0_10px_28px_rgba(55,78,108,0.05)]">
        <header className="flex flex-col gap-4 border-b border-[#d3dbea] px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
          <h1 className="text-[22px] font-semibold text-[var(--deshazo-text)]">Recovery Report</h1>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Recovery report period" value={periodType} onChange={(event) => setPeriodType(event.target.value as PeriodType)} className="h-9 rounded-md border border-[#c7d1e2] bg-white px-3 text-[12px] font-semibold text-[var(--deshazo-text)]"><option value="weekly">Weekly</option><option value="custom">Custom</option></select>
            {periodType === 'weekly' ? <div className="flex items-center gap-1"><button type="button" aria-label="Previous week" onClick={() => setMonday((current) => addDays(current, -7))} className="flex h-9 w-9 items-center justify-center rounded-md border border-[#bdc4d3] bg-white text-lg font-bold text-[var(--deshazo-blue)]">‹</button><strong className="flex h-9 items-center rounded-md border border-[#c7d1e2] px-3 text-[12px] text-[var(--deshazo-text)]">{shortDate(range.start)} - {shortDate(range.end)}</strong><button type="button" aria-label="Next week" disabled={nextDisabled} onClick={() => setMonday((current) => addDays(current, 7))} className="flex h-9 w-9 items-center justify-center rounded-md border border-[#bdc4d3] bg-white text-lg font-bold text-[var(--deshazo-blue)] disabled:opacity-40">›</button></div> : <div className="flex items-center gap-2"><input aria-label="Recovery start date" type="date" value={customStart} max={customEnd} onChange={(event) => setCustomStart(event.target.value)} className="h-9 rounded-md border border-[#c7d1e2] px-3 text-[12px]" /><span className="text-[#747b8a]">to</span><input aria-label="Recovery end date" type="date" value={customEnd} min={customStart} max={isoDate(new Date())} onChange={(event) => setCustomEnd(event.target.value)} className="h-9 rounded-md border border-[#c7d1e2] px-3 text-[12px]" /></div>}
            <button type="button" disabled={!regions.length} onClick={downloadCsv} className="h-9 rounded-md bg-[var(--deshazo-blue)] px-4 text-[12px] font-bold text-white disabled:opacity-40">↓ Download CSV</button>
            <button type="button" aria-label="Refresh recovery report" onClick={() => setRefreshKey((value) => value + 1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#647688] text-lg font-bold text-white">↻</button>
          </div>
        </header>
        {error ? <p className="m-4 rounded-md border border-[#f0c8c8] bg-[#fdf1f1] px-4 py-3 text-[13px] font-semibold text-[#b23b3b]">{error}</p> : null}
        <div className="p-4">
          {loading ? <p className="py-14 text-center font-semibold text-[#747b8a]">Loading recovery report...</p> : regions.length ? regions.map((region, regionIndex) => <section key={`${region.regionName || 'none'}-${regionIndex}`} className="mb-10 last:mb-0">
            <div className="mb-5 text-center"><h2 className="text-[20px] font-bold text-[var(--deshazo-text)]">Service Recovery {region.regionName || 'No'} Region</h2><p className="mt-1 text-[13px] text-[#747b8a]">{longDate(range.start)} thru {longDate(range.end)}</p></div>
            <div className="space-y-6">{region.locations.map((location) => <section key={location.locationName}><h3 className="mb-3 text-[18px] font-bold text-[var(--deshazo-text)]">{location.locationName}</h3><div className="overflow-x-auto rounded-md border border-[#d3dbea]"><table className="w-full min-w-[800px] border-collapse text-[12px]"><thead><tr className="bg-[#eef2f8] text-[#5f6876]">{['Employee Name', 'Job Time', 'Idle Time', 'Warranty Time', 'Total', 'Hrs/Week', 'Rec %'].map((label) => <th key={label} className={`border-b border-[#d3dbea] px-4 py-3 ${label === 'Employee Name' ? 'text-left' : 'text-right'}`}>{label}</th>)}</tr></thead><tbody>{location.employees.map((employee, index) => <tr key={`${employee.employeeName}-${index}`} className="border-b border-[#e2e8f2] odd:bg-white even:bg-[#f8fbff]"><td className="px-4 py-3 font-medium text-[var(--deshazo-text)]">{employee.employeeName}</td><td className="px-4 py-3 text-right">{displayNumber(employee.job)}</td><td className="px-4 py-3 text-right">{displayNumber(employee.shop)}</td><td className="px-4 py-3 text-right">{displayNumber(employee.warranty)}</td><td className="px-4 py-3 text-right">{displayNumber(employee.total)}</td><td className="px-4 py-3 text-right">{displayNumber(employeeHoursPerWeek(employee.total, employee.weekOrder))}</td><td className="px-4 py-3 text-right font-semibold text-[var(--deshazo-blue)]">{recoveryPercent(employee.job, employee.total)}%</td></tr>)}<tr className="bg-[#eef2f8] font-bold text-[var(--deshazo-text)]"><td className="px-4 py-3">Headcount {location.totals.headCount}</td><td className="px-4 py-3 text-right">{displayNumber(location.totals.jobTime)}</td><td className="px-4 py-3 text-right">{displayNumber(location.totals.idleTime)}</td><td className="px-4 py-3 text-right">{displayNumber(location.totals.warrantyTime)}</td><td className="px-4 py-3 text-right">{displayNumber(location.totals.total)}</td><td className="px-4 py-3 text-right">{displayNumber(location.totals.hrsWeek)}</td><td className="px-4 py-3 text-right">{recoveryPercent(location.totals.jobTime, location.totals.total)}%</td></tr></tbody></table></div></section>)}</div>
          </section>) : <p className="py-14 text-center text-[#747b8a]">No data available</p>}
        </div>
      </section>
    </div>
  )
}
