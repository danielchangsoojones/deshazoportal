import { useEffect, useMemo, useState } from 'react'
import { getDeshazoPayCor, type DeshazoPayCorBucket, type DeshazoPayCorRow } from '../lib/deshazoPayCor'

type PayCorReportProps = { serviceLocationId: number | null }
type DisplayRow = { source: DeshazoPayCorRow; department: string; key: string }

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

function fullDate(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`
}

function reportDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value || '-'
}

function bucketHours(bucket?: DeshazoPayCorBucket) {
  return (Number(bucket?.reg || 0) + Number(bucket?.ot || 0)).toFixed(2)
}

function escapeCsv(value: string | number) {
  const text = String(value)
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function expandRows(rows: DeshazoPayCorRow[]) {
  return rows.flatMap<DisplayRow>((row, rowIndex) => {
    const jobNumbers = row.jobNumber || []
    if (!jobNumbers.length) return [{ source: row, department: row.department || '-', key: `${rowIndex}-none` }]
    return jobNumbers.map((jobNumber, jobIndex) => ({ source: row, department: row.departments?.[String(jobNumber)] || row.department || '-', key: `${rowIndex}-${jobIndex}` }))
  })
}

export default function PayCorReport({ serviceLocationId }: PayCorReportProps) {
  const [weekStart, setWeekStart] = useState(() => startOfIsoWeek(new Date()))
  const [data, setData] = useState<DeshazoPayCorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])
  const rows = useMemo(() => expandRows(data), [data])
  const showLunch = data.some((row) => row.IS_CALIFORNIA_PAYROLL)

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(async () => {
      if (cancelled) return
      setLoading(true)
      setError('')
      try {
        const response = await getDeshazoPayCor({ weekStart: isoDate(weekStart), serviceLocationId })
        if (!cancelled) setData(response)
      } catch (loadError) {
        if (!cancelled) {
          setData([])
          setError(loadError instanceof Error ? loadError.message : 'There was an error with your request.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [refreshKey, serviceLocationId, weekStart])

  const downloadCsv = () => {
    const headers = ['Employee Id', 'Employee Name', 'Date', 'Department', 'PTO', 'Bereavement', 'Jury Duty', 'Training', ...(showLunch ? ['Lunch'] : [])]
    const lines = [headers, ...rows.map(({ source, department }) => [source.employeeId || '-', source.employeeName || '-', reportDate(source.date), department, bucketHours(source.PTO), bucketHours(source.BER), bucketHours(source.JURY), bucketHours(source.TRAINING), ...(showLunch ? [bucketHours(source.LUNCH)] : [])])]
    const csv = lines.map((line) => line.map(escapeCsv).join(';')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    link.download = `PayCorReport_${fullDate(weekStart).replaceAll('/', '-')}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="px-5 py-5 lg:px-7">
      <section className="overflow-hidden rounded-sm border border-[#d3dbea] bg-white shadow-[0_10px_28px_rgba(55,78,108,0.05)]">
        <header className="flex flex-col gap-4 border-b border-[#d3dbea] px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2"><h1 className="text-[22px] font-semibold text-[var(--deshazo-text)]">PayCor Report</h1><span className="text-[12px] text-[#747b8a]">({loading ? '' : data.length})</span></div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-label="Previous week" onClick={() => setWeekStart((current) => addDays(current, -7))} className="flex h-9 w-9 items-center justify-center rounded-md border border-[#bdc4d3] bg-white text-lg font-bold text-[var(--deshazo-blue)]">‹</button>
            <strong className="flex h-9 items-center rounded-md border border-[#c7d1e2] px-3 text-[12px] text-[var(--deshazo-text)]">{fullDate(weekStart)} - {fullDate(weekEnd)}</strong>
            <button type="button" aria-label="Next week" disabled={weekEnd > new Date()} onClick={() => setWeekStart((current) => addDays(current, 7))} className="flex h-9 w-9 items-center justify-center rounded-md border border-[#bdc4d3] bg-white text-lg font-bold text-[var(--deshazo-blue)] disabled:opacity-40">›</button>
            <button type="button" onClick={downloadCsv} disabled={!rows.length} className="h-9 rounded-md bg-[var(--deshazo-blue)] px-4 text-[12px] font-bold text-white disabled:opacity-40">↓ Download</button>
            <button type="button" aria-label="Refresh PayCor report" onClick={() => setRefreshKey((value) => value + 1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#647688] text-lg font-bold text-white">↻</button>
          </div>
        </header>
        {error ? <p className="m-4 rounded-md border border-[#f0c8c8] bg-[#fdf1f1] px-4 py-3 text-[13px] font-semibold text-[#b23b3b]">{error}</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[970px] border-collapse text-left text-[12px]">
            <thead><tr className="border-b border-[#d3dbea] text-[11px] font-semibold text-[#747b8a]">{['Employee Id', 'Employee Name', 'Date', 'Department', 'PTO', 'Bereavement', 'Jury Duty', 'Training', ...(showLunch ? ['Lunch'] : [])].map((heading) => <th key={heading} className="whitespace-nowrap px-4 py-3">{heading}</th>)}</tr></thead>
            <tbody>{loading ? <tr><td colSpan={showLunch ? 9 : 8} className="px-4 py-14 text-center font-semibold text-[#747b8a]">Loading PayCor report...</td></tr> : rows.length ? rows.map(({ source, department, key }) => <tr key={key} className="border-b border-[#e2e8f2] odd:bg-[#f8fbff] hover:bg-[#eef4ff]"><td className="whitespace-nowrap px-4 py-3">{source.employeeId || '-'}</td><td className="max-w-[230px] truncate px-4 py-3 font-medium text-[var(--deshazo-text)]">{source.employeeName || '-'}</td><td className="whitespace-nowrap px-4 py-3">{reportDate(source.date)}</td><td className="max-w-[240px] truncate px-4 py-3">{department}</td><td className="px-4 py-3">{bucketHours(source.PTO)}</td><td className="px-4 py-3">{bucketHours(source.BER)}</td><td className="px-4 py-3">{bucketHours(source.JURY)}</td><td className="px-4 py-3">{bucketHours(source.TRAINING)}</td>{showLunch ? <td className="px-4 py-3">{source.IS_CALIFORNIA_PAYROLL ? bucketHours(source.LUNCH) : '-'}</td> : null}</tr>) : <tr><td colSpan={showLunch ? 9 : 8} className="px-4 py-14 text-center text-[#747b8a]">No data has been recorded</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
