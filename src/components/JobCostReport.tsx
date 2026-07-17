import { useEffect, useMemo, useState } from 'react'
import {
  type DeshazoServiceLocation,
  type JobCostReportRow,
  flattenJobCostRows,
  getDeshazoServiceLocations,
  getJobCostReport,
  hasCaliforniaPayroll,
} from '../lib/deshazoReports'

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Monday of the ISO week containing `date`, at local midnight.
function isoWeekStart(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  const dayFromMonday = (result.getDay() + 6) % 7
  result.setDate(result.getDate() - dayFromMonday)
  return result
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function formatDisplayDate(value: string | Date) {
  const date = typeof value === 'string' ? parseDateOnly(value) : value
  return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).format(date)
}

// Parse a YYYY-MM-DD string as a local date (avoids the UTC shift `new Date('YYYY-MM-DD')` causes).
function parseDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return new Date(value)
}

function csvCell(value: string | number) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export default function JobCostReport() {
  const [weekStart, setWeekStart] = useState(() => isoWeekStart(new Date()))
  const [serviceLocationId, setServiceLocationId] = useState<number | null>(null)
  const [locations, setLocations] = useState<DeshazoServiceLocation[]>([])
  const [rows, setRows] = useState<JobCostReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])
  const nextDisabled = weekEnd >= isoWeekStart(new Date())

  useEffect(() => {
    let cancelled = false
    getDeshazoServiceLocations()
      .then((data) => {
        if (!cancelled) setLocations(data)
      })
      .catch(() => {
        if (!cancelled) setLocations([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    // The API returns the whole week regardless of serviceLocationId (the server
    // ignores it), so fetch once per week and filter by location on the client.
    getJobCostReport({ weekStart: toIsoDate(weekStart) })
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((err) => {
        if (cancelled) return
        setRows([])
        setError(err instanceof Error ? err.message : 'There was an error with your request.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [weekStart])

  const filteredRows = useMemo(() => {
    if (!serviceLocationId) return rows
    return rows.filter((row) => row.serviceLocationEmployee?.[0]?.serviceLocationId === serviceLocationId)
  }, [rows, serviceLocationId])

  const showDoubleTime = hasCaliforniaPayroll(filteredRows)
  const lines = useMemo(() => flattenJobCostRows(filteredRows), [filteredRows])

  const downloadCsv = () => {
    const headers = ['Employee Id', 'Employee Name', 'Date', 'Department', 'Job Number', 'Regular Hours', 'Overtime Hours']
    if (showDoubleTime) headers.push('Double Time')

    const csvLines = [headers.map(csvCell).join(',')]
    for (const line of lines) {
      const cells: Array<string | number> = [
        line.employeeId,
        line.employeeName,
        formatDisplayDate(line.date),
        line.department,
        line.jobNumber,
        line.regularHours,
        line.overtimeHours,
      ]
      if (showDoubleTime) cells.push(line.doubleHours)
      csvLines.push(cells.map(csvCell).join(','))
    }

    const csv = '﻿' + csvLines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `JobCostReport_${formatDisplayDate(weekStart).replace(/\//g, '-')}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="px-6 py-6 sm:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-bold text-[var(--deshazo-text)]">Job Cost Report</h1>
          <span className="text-[13px] text-[#747b8a]">({filteredRows.length})</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Service location"
            value={serviceLocationId ?? 'all'}
            onChange={(event) =>
              setServiceLocationId(event.target.value === 'all' ? null : Number(event.target.value))
            }
            className="h-9 rounded-md border border-[#c7d1e2] bg-white px-3 text-[13px] text-[var(--deshazo-text)] outline-none transition focus:border-[var(--deshazo-blue)]"
          >
            <option value="all">All Service Locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous week"
              onClick={() => setWeekStart((current) => addDays(current, -7))}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-[#c7d1e2] bg-white text-[var(--deshazo-text)] transition hover:bg-[#f2f6fb]"
            >
              ‹
            </button>
            <span className="min-w-[190px] rounded-md border border-[#c7d1e2] bg-white px-3 py-1.5 text-center text-[13px] font-bold text-[var(--deshazo-text)]">
              {formatDisplayDate(weekStart)} - {formatDisplayDate(weekEnd)}
            </span>
            <button
              type="button"
              aria-label="Next week"
              onClick={() => setWeekStart((current) => addDays(current, 7))}
              disabled={nextDisabled}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-[#c7d1e2] bg-white text-[var(--deshazo-text)] transition hover:bg-[#f2f6fb] disabled:cursor-not-allowed disabled:opacity-45"
            >
              ›
            </button>
          </div>

          <button
            type="button"
            onClick={downloadCsv}
            disabled={!lines.length}
            className="h-9 rounded-md bg-[var(--deshazo-blue)] px-4 text-[13px] font-bold text-white transition hover:bg-[var(--deshazo-blue-deep)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Download CSV
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-[#f0c8c8] bg-[#fdf1f1] px-4 py-3 text-[13px] font-semibold text-[#b23b3b]">
          {error}
        </p>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-xl border border-[#d3dbea] bg-white shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
        <div className="overflow-auto">
          <table className="w-full min-w-[880px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#d3dbea] bg-[#f7f9fc] text-[11px] font-bold uppercase tracking-[0.03em] text-[#747b8a]">
                <th className="px-4 py-3">Employee Id</th>
                <th className="px-4 py-3">Employee Name</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Job Number</th>
                <th className="px-4 py-3 text-right">Regular Hours</th>
                <th className="px-4 py-3 text-right">Overtime Hours</th>
                {showDoubleTime ? <th className="px-4 py-3 text-right">Double Time</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={showDoubleTime ? 8 : 7} className="px-4 py-10 text-center text-[13px] font-semibold text-[#747b8a]">
                    Loading report...
                  </td>
                </tr>
              ) : lines.length ? (
                lines.map((line, index) => (
                  <tr
                    key={`${line.employeeId}-${line.date}-${line.jobNumber}-${index}`}
                    className="border-b border-[#e2e8f2] last:border-b-0 odd:bg-[#f8fbff]"
                  >
                    <td className="px-4 py-3 text-[var(--deshazo-text)]">{line.employeeId}</td>
                    <td className="px-4 py-3 font-semibold text-[var(--deshazo-text)]">{line.employeeName}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--deshazo-text)]">{formatDisplayDate(line.date)}</td>
                    <td className="px-4 py-3 text-[var(--deshazo-text)]">{line.department || '-'}</td>
                    <td className="px-4 py-3 font-medium text-[var(--deshazo-blue)]">{line.jobNumber}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--deshazo-text)]">{line.regularHours}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--deshazo-text)]">{line.overtimeHours}</td>
                    {showDoubleTime ? (
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--deshazo-text)]">{line.doubleHours}</td>
                    ) : null}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={showDoubleTime ? 8 : 7} className="px-4 py-10 text-center text-[13px] font-semibold text-[#747b8a]">
                    No labor recorded for this week.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
