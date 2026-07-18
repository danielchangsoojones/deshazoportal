import { useEffect, useMemo, useState } from 'react'
import { getDeshazoPayroll, type DeshazoPayrollBucket, type DeshazoPayrollDay, type DeshazoPayrollEmployee } from '../lib/deshazoPayroll'

type PayrollReportProps = { serviceLocationId: number | null }

type PayrollSummary = {
  employeeId: number
  employee: string
  approvedBy?: string | null
  days: Array<{ date: Date; value: number | null; payroll?: DeshazoPayrollDay }>
  regular: number
  overtime: number
  double: number
  other: number
  total: number
  totalApproved: number
}

const bucketTotal = (bucket?: DeshazoPayrollBucket) => Number(bucket?.reg || 0) + Number(bucket?.ot || 0)
const number = (value?: number) => Number(value || 0)

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

function shortDate(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}

function fullDate(date: Date) {
  return `${shortDate(date)}/${date.getFullYear()}`
}

function hours(value: number) {
  return value.toFixed(2)
}

function dailyTotal(day?: DeshazoPayrollDay) {
  if (!day) return null
  return number(day.REG) + number(day.OT) + number(day.DOUBLE) + bucketTotal(day.PTO) + bucketTotal(day.JURY) + bucketTotal(day.BER) + bucketTotal(day.LUNCH)
}

function summarize(employee: DeshazoPayrollEmployee, week: Date[]): PayrollSummary {
  const weekly = employee.weeklyPayroll || {}
  const regular = number(weekly.REG)
  const overtime = number(weekly.OT)
  const double = number(weekly.DOUBLE)
  const other = bucketTotal(weekly.PTO) + bucketTotal(weekly.JURY) + bucketTotal(weekly.BER) + bucketTotal(weekly.LUNCH)
  const totalApproved = number(weekly.REG_APPROVAL) + number(weekly.OT_APPROVAL) + number(weekly.PTO_APPROVAL) + number(weekly.TRAINING_APPROVAL) + number(weekly.SHOP_APPROVAL) + number(weekly.JURY_APPROVAL) + number(weekly.BER_APPROVAL) + number(weekly.DOUBLE_APPROVAL) + number(weekly.LUNCH_APPROVAL)
  return {
    employeeId: employee.id,
    employee: [employee.firstName, employee.lastName].filter(Boolean).join(' ') || '-',
    approvedBy: employee.approvedBy,
    days: week.map((date) => {
      const payroll = employee.payRoll?.find((entry) => entry.date.slice(0, 10) === isoDate(date))
      return { date, value: dailyTotal(payroll), payroll }
    }),
    regular,
    overtime,
    double,
    other,
    total: regular + overtime + double + other,
    totalApproved,
  }
}

function escapeCsv(value: string | number) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export default function PayrollReport({ serviceLocationId }: PayrollReportProps) {
  const [weekStart, setWeekStart] = useState(() => startOfIsoWeek(new Date()))
  const [employees, setEmployees] = useState<DeshazoPayrollEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedDay, setSelectedDay] = useState<{ employee: string; day: DeshazoPayrollDay; date: Date } | null>(null)
  const week = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart])
  const rows = useMemo(() => employees.map((employee) => summarize(employee, week)), [employees, week])
  const showDoubleTime = employees.some((employee) => employee.payRoll?.some((entry) => entry.IS_CALIFORNIA_PAYROLL))

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(async () => {
      if (cancelled) return
      setLoading(true)
      setError('')
      try {
        const data = await getDeshazoPayroll({ weekStart: isoDate(weekStart), serviceLocationId })
        if (!cancelled) setEmployees(data)
      } catch (loadError) {
        if (!cancelled) {
          setEmployees([])
          setError(loadError instanceof Error ? loadError.message : 'There was an error with your request.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [refreshKey, serviceLocationId, weekStart])

  const moveWeek = (amount: number) => setWeekStart((current) => addDays(current, amount * 7))
  const nextDisabled = addDays(weekStart, 6) > new Date()

  const downloadCsv = () => {
    const headers = ['Employee', ...week.map((date) => shortDate(date)), 'Regular', 'Overtime', ...(showDoubleTime ? ['Double Time'] : []), 'Other', 'Total']
    const lines = [headers, ...rows.map((row) => [row.employee, ...row.days.map((day) => day.value == null ? '-' : hours(day.value)), hours(row.regular), hours(row.overtime), ...(showDoubleTime ? [hours(row.double)] : []), hours(row.other), hours(row.total)])]
    const csv = lines.map((line) => line.map(escapeCsv).join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    link.download = `PayrollReport_${fullDate(weekStart).replaceAll('/', '-')}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="px-5 py-5 lg:px-7">
      <section className="overflow-hidden rounded-sm border border-[#d3dbea] bg-white shadow-[0_10px_28px_rgba(55,78,108,0.05)]">
        <header className="flex flex-col gap-4 border-b border-[#d3dbea] px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2"><h1 className="text-[22px] font-semibold text-[var(--deshazo-text)]">Payroll Report</h1><span className="text-[12px] text-[#747b8a]">({loading ? '' : rows.length})</span></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1"><button type="button" aria-label="Previous week" onClick={() => moveWeek(-1)} className="flex h-9 w-9 items-center justify-center rounded-md border border-[#bdc4d3] bg-white text-lg font-bold text-[var(--deshazo-blue)]">‹</button><strong className="flex h-9 items-center rounded-md border border-[#c7d1e2] px-3 text-[12px] text-[var(--deshazo-text)]">{fullDate(week[0])} - {fullDate(week[6])}</strong><button type="button" aria-label="Next week" disabled={nextDisabled} onClick={() => moveWeek(1)} className="flex h-9 w-9 items-center justify-center rounded-md border border-[#bdc4d3] bg-white text-lg font-bold text-[var(--deshazo-blue)] disabled:opacity-40">›</button></div>
            <button type="button" onClick={downloadCsv} disabled={!rows.length} className="h-9 rounded-md bg-[var(--deshazo-blue)] px-4 text-[12px] font-bold text-white disabled:opacity-40">↓ Download</button>
            <button type="button" aria-label="Refresh payroll" onClick={() => setRefreshKey((value) => value + 1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#647688] text-lg font-bold text-white">↻</button>
          </div>
        </header>
        {error ? <p className="m-4 rounded-md border border-[#f0c8c8] bg-[#fdf1f1] px-4 py-3 text-[13px] font-semibold text-[#b23b3b]">{error}</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-[12px]">
            <thead><tr className="border-b border-[#d3dbea] text-[11px] font-semibold text-[#747b8a]"><th className="px-4 py-3">Employee</th>{week.map((date) => <th key={isoDate(date)} className="whitespace-nowrap px-3 py-3">{new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).slice(0, 2)} {shortDate(date)}</th>)}<th className="px-3 py-3">Regular</th><th className="px-3 py-3">Overtime</th>{showDoubleTime ? <th className="px-3 py-3">Double Time</th> : null}<th className="px-3 py-3">Other</th><th className="px-3 py-3">Total</th></tr></thead>
            <tbody>{loading ? <tr><td colSpan={showDoubleTime ? 13 : 12} className="px-4 py-12 text-center font-semibold text-[#747b8a]">Loading payroll...</td></tr> : rows.length ? rows.map((row) => <tr key={row.employeeId} className="border-b border-[#e2e8f2] odd:bg-[#f8fbff] hover:bg-[#eef4ff]"><td className="max-w-[210px] truncate px-4 py-3 font-medium text-[var(--deshazo-text)]"><span className={`mr-2 inline-block h-2 w-2 rounded-full ${row.approvedBy && hours(row.total) === hours(row.totalApproved) ? 'bg-[#2f8b67]' : 'bg-[#d85454]'}`} />{row.employee}</td>{row.days.map((day) => <td key={isoDate(day.date)} className="px-3 py-3">{day.value == null ? '-' : <button type="button" onClick={() => day.payroll && setSelectedDay({ employee: row.employee, day: day.payroll, date: day.date })} className="font-medium text-[var(--deshazo-blue)] hover:underline">{hours(day.value)}</button>}</td>)}<td className="px-3 py-3">{hours(row.regular)}</td><td className="px-3 py-3">{hours(row.overtime)}</td>{showDoubleTime ? <td className="px-3 py-3">{hours(row.double)}</td> : null}<td className="px-3 py-3">{hours(row.other)}</td><td className="px-3 py-3 font-bold text-[var(--deshazo-text)]">{hours(row.total)}</td></tr>) : <tr><td colSpan={showDoubleTime ? 13 : 12} className="px-4 py-12 text-center text-[#747b8a]">No data has been recorded</td></tr>}</tbody>
          </table>
        </div>
      </section>

      {selectedDay ? <div role="dialog" aria-modal="true" aria-labelledby="payroll-day-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1c2733]/50 px-4" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedDay(null) }}><div className="w-full max-w-lg rounded-lg bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-[#d3dbea] px-5 py-4"><div><h2 id="payroll-day-title" className="text-[17px] font-bold text-[var(--deshazo-text)]">{selectedDay.employee}</h2><p className="text-[12px] text-[#747b8a]">{fullDate(selectedDay.date)}</p></div><button type="button" aria-label="Close" onClick={() => setSelectedDay(null)} className="text-2xl text-[#747b8a]">×</button></div><dl className="grid grid-cols-2 gap-y-3 px-5 py-5 text-[13px]"><dt className="font-semibold text-[#747b8a]">Regular Time</dt><dd>{hours(number(selectedDay.day.REG))}</dd><dt className="font-semibold text-[#747b8a]">Overtime</dt><dd>{hours(number(selectedDay.day.OT))}</dd>{selectedDay.day.IS_CALIFORNIA_PAYROLL ? <><dt className="font-semibold text-[#747b8a]">Double Time</dt><dd>{hours(number(selectedDay.day.DOUBLE))}</dd></> : null}<dt className="font-semibold text-[#747b8a]">PTO</dt><dd>{hours(bucketTotal(selectedDay.day.PTO))}</dd><dt className="font-semibold text-[#747b8a]">Jury Duty</dt><dd>{hours(bucketTotal(selectedDay.day.JURY))}</dd><dt className="font-semibold text-[#747b8a]">Bereavement</dt><dd>{hours(bucketTotal(selectedDay.day.BER))}</dd><dt className="font-semibold text-[#747b8a]">Lunch</dt><dd>{hours(bucketTotal(selectedDay.day.LUNCH))}</dd></dl><div className="flex justify-end border-t border-[#d3dbea] px-5 py-3"><button type="button" onClick={() => setSelectedDay(null)} className="rounded-md bg-[var(--deshazo-blue)] px-4 py-2 text-[12px] font-bold text-white">Close</button></div></div></div> : null}
    </div>
  )
}
