import { useEffect, useMemo, useState } from 'react'
import { getDeshazoSchedule, type DeshazoScheduleResource } from '../lib/deshazoSchedule'
import type { DeshazoServiceLocation } from '../lib/deshazoReports'

type FleetManagementProps = {
  serviceLocationId: number | null
  serviceLocations: DeshazoServiceLocation[]
}

type FleetStatus = 'In service' | 'Service due' | 'Inspection due' | 'Spare'

type EstimatedVehicle = {
  id: string
  unitNumber: string
  site: string
  assignedTo: string
  year: number
  model: string
  type: string
  odometer: number
  utilization: number
  serviceMiles: number
  inspectionDue: string
  status: FleetStatus
}

const fallbackLocations: DeshazoServiceLocation[] = [
  { id: 32, name: 'Richmond' },
  { id: 28, name: 'Cincinnati' },
  { id: 17, name: 'Northeast' },
]

const vehicleModels = [
  { model: 'Ford F-250 Super Duty', type: 'Service body' },
  { model: 'Chevrolet Silverado 2500HD', type: 'Service body' },
  { model: 'Ram 2500 Tradesman', type: 'Pickup' },
  { model: 'Ford Transit 250', type: 'Parts van' },
  { model: 'Chevrolet Express 2500', type: 'Parts van' },
]

const hashText = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10)

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const startOfWeek = (date: Date) => {
  const next = new Date(date)
  const day = next.getDay()
  next.setDate(next.getDate() - (day === 0 ? 6 : day - 1))
  next.setHours(0, 0, 0, 0)
  return next
}

const resourceName = (resource: DeshazoScheduleResource) =>
  resource.title || resource.name || resource.employeeName || resource.extendedProps?.title || resource.extendedProps?.name || resource.extendedProps?.employeeName || `Technician ${resource.id}`

const resourceLocation = (resource: DeshazoScheduleResource) =>
  resource.serviceLocationName || resource.group || resource.extendedProps?.group || ''

const locationCode = (location: string) =>
  location
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 2).toUpperCase())
    .join('') || 'HQ'

const estimatedTechnicians = (locations: DeshazoServiceLocation[]) =>
  locations.flatMap((location) => {
    const count = 5 + (hashText(location.name) % 6)
    return Array.from({ length: count }, (_, index) => ({
      id: `estimated-${location.id}-${index + 1}`,
      name: `Estimated technician ${String(index + 1).padStart(2, '0')}`,
      site: location.name,
    }))
  })

const buildVehicle = (input: { key: string; name: string; site: string; index: number; spare?: boolean }): EstimatedVehicle => {
  const hash = hashText(`${input.key}-${input.site}-${input.index}`)
  const model = vehicleModels[hash % vehicleModels.length]
  const serviceMiles = input.spare ? 4200 : 5200 - (hash % 7200)
  const status: FleetStatus = input.spare
    ? 'Spare'
    : serviceMiles <= 0
      ? 'Service due'
      : hash % 11 === 0
        ? 'Inspection due'
        : 'In service'
  const dueDate = addDays(new Date(), status === 'Inspection due' ? 8 + (hash % 20) : 45 + (hash % 240))

  return {
    id: `demo-${input.key}`,
    unitNumber: `EST-${locationCode(input.site)}-${String(input.index + 1).padStart(3, '0')}`,
    site: input.site,
    assignedTo: input.spare ? 'Unassigned spare' : input.name,
    year: 2019 + (hash % 7),
    model: model.model,
    type: model.type,
    odometer: 24000 + (hash % 96000),
    utilization: input.spare ? 18 + (hash % 22) : 62 + (hash % 32),
    serviceMiles,
    inspectionDue: isoDate(dueDate),
    status,
  }
}

function FleetIcon({ name, className = 'h-5 w-5' }: { name: 'truck' | 'wrench' | 'gauge' | 'pin' | 'search' | 'alert'; className?: string }) {
  const paths = {
    truck: <><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
    wrench: <path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.4 2.4-3-3 2.4-2.4Z" />,
    gauge: <><path d="M4 17a8 8 0 1 1 16 0" /><path d="m12 14 4-4" /><path d="M7 17h10" /></>,
    pin: <><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" /><circle cx="12" cy="10" r="2" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    alert: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5m0 3h.01" /></>,
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

const statusClass = (status: FleetStatus) => {
  if (status === 'Service due') return 'border-[#efc2c2] bg-[#fdf1f1] text-[#b23b3b]'
  if (status === 'Inspection due') return 'border-[#f6d58e] bg-[#fff7e8] text-[#9a640c]'
  if (status === 'Spare') return 'border-[#d3dbea] bg-[#f4f7fb] text-[#697586]'
  return 'border-[#b8dece] bg-[#edf8f3] text-[#367861]'
}

export default function FleetManagement({ serviceLocationId, serviceLocations }: FleetManagementProps) {
  const [resources, setResources] = useState<DeshazoScheduleResource[]>([])
  const [loading, setLoading] = useState(true)
  const [sourceNotice, setSourceNotice] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | FleetStatus>('All')
  const [selectedVehicleId, setSelectedVehicleId] = useState('')

  const availableLocations = serviceLocations.length > 0 ? serviceLocations : fallbackLocations
  const selectedLocation = serviceLocationId
    ? availableLocations.find((location) => location.id === serviceLocationId)
    : undefined

  useEffect(() => {
    let cancelled = false
    const start = startOfWeek(new Date())
    getDeshazoSchedule({
      startDate: isoDate(start),
      endDate: isoDate(addDays(start, 13)),
      serviceLocationId,
    })
      .then((response) => {
        if (cancelled) return
        setResources(response.resources)
        setSourceNotice(response.resources.length === 0 ? 'No technicians were returned for this schedule window, so site-level staffing estimates are shown.' : '')
      })
      .catch(() => {
        if (cancelled) return
        setResources([])
        setSourceNotice('The technician schedule was unavailable, so site-level staffing estimates are shown.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [serviceLocationId])

  const vehicles = useMemo(() => {
    const scopedLocations = selectedLocation ? [selectedLocation] : availableLocations
    const fallbackSite = selectedLocation?.name || scopedLocations[0]?.name || 'DeShazo service'
    const technicians = resources.length > 0
      ? resources.map((resource, index) => ({
          id: String(resource.id),
          name: resourceName(resource),
          site: resourceLocation(resource) || scopedLocations[index % scopedLocations.length]?.name || fallbackSite,
        }))
      : estimatedTechnicians(scopedLocations)
    const assigned = technicians.map((technician, index) => buildVehicle({
      key: technician.id,
      name: technician.name,
      site: technician.site,
      index,
    }))
    const techniciansBySite = new Map<string, number>()
    technicians.forEach((technician) => techniciansBySite.set(technician.site, (techniciansBySite.get(technician.site) ?? 0) + 1))
    const spares = Array.from(techniciansBySite.entries()).flatMap(([site, count], siteIndex) =>
      Array.from({ length: Math.max(1, Math.ceil(count / 8)) }, (_, spareIndex) => buildVehicle({
        key: `spare-${siteIndex}-${spareIndex}`,
        name: 'Unassigned spare',
        site,
        index: assigned.length + siteIndex * 3 + spareIndex,
        spare: true,
      })),
    )
    return [...assigned, ...spares]
  }, [availableLocations, resources, selectedLocation])

  const filteredVehicles = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return vehicles.filter((vehicle) => {
      const matchesStatus = statusFilter === 'All' || vehicle.status === statusFilter
      const matchesQuery = !normalized || `${vehicle.unitNumber} ${vehicle.site} ${vehicle.assignedTo} ${vehicle.model} ${vehicle.type}`.toLowerCase().includes(normalized)
      return matchesStatus && matchesQuery
    })
  }, [query, statusFilter, vehicles])

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null
  const activeCount = vehicles.filter((vehicle) => vehicle.status === 'In service').length
  const attentionCount = vehicles.filter((vehicle) => vehicle.status === 'Service due' || vehicle.status === 'Inspection due').length
  const spareCount = vehicles.filter((vehicle) => vehicle.status === 'Spare').length
  const averageUtilization = vehicles.length ? Math.round(vehicles.reduce((sum, vehicle) => sum + vehicle.utilization, 0) / vehicles.length) : 0
  const siteSummary = Array.from(new Set(vehicles.map((vehicle) => vehicle.site))).map((site) => {
    const siteVehicles = vehicles.filter((vehicle) => vehicle.site === site)
    return { site, count: siteVehicles.length, attention: siteVehicles.filter((vehicle) => vehicle.status === 'Service due' || vehicle.status === 'Inspection due').length }
  }).sort((left, right) => right.count - left.count)

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-[var(--deshazo-text)]">
      <header className="border-b border-[#d3dbea] bg-[radial-gradient(circle_at_85%_-20%,rgba(49,90,168,.15),transparent_34%),linear-gradient(135deg,#fff,#f4f7fc)] px-5 py-6 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1520px]">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--deshazo-blue-soft)]"><FleetIcon name="truck" className="h-4 w-4" /> Operations asset planning</div>
              <h1 className="mt-3 !font-sans !text-[clamp(2rem,4vw,3.25rem)] !font-black !tracking-[-0.045em] !text-[var(--deshazo-blue)]">Fleet Management</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-[#747b8a]">A planning model for service trucks, parts vans, assignments, utilization, and maintenance readiness.</p>
            </div>
            <div className="max-w-lg rounded-md border border-[#f0d58b] bg-[#fff9e7] px-4 py-3 text-[11px] font-semibold leading-5 text-[#7a560f]">
              <strong className="font-black">Estimated demo fleet:</strong> vehicle records are generated from service sites and scheduled technician headcount. They are not production asset records.
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Estimated vehicles', value: vehicles.length, detail: `${resources.length || 'Estimated'} technician assignments`, icon: 'truck' as const },
              { label: 'In service', value: activeCount, detail: `${vehicles.length ? Math.round((activeCount / vehicles.length) * 100) : 0}% ready for dispatch`, icon: 'gauge' as const },
              { label: 'Needs attention', value: attentionCount, detail: 'Service or inspection window', icon: 'wrench' as const },
              { label: 'Spare capacity', value: spareCount, detail: `${averageUtilization}% average utilization`, icon: 'pin' as const },
            ].map((metric) => (
              <div key={metric.label} className="rounded-md border border-[#d3dbea] bg-white p-4 shadow-[0_14px_36px_-30px_rgba(6,24,73,.45)]">
                <div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#747b8a]">{metric.label}</p><p className="mt-2 font-mono text-[30px] font-bold tracking-[-0.06em] text-[var(--deshazo-blue)]">{loading ? '—' : metric.value}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#b8c9f5] bg-[#eef3ff] text-[var(--deshazo-blue)]"><FleetIcon name={metric.icon} className="h-[18px] w-[18px]" /></span></div>
                <p className="mt-3 text-[11px] font-semibold text-[#8992a1]">{metric.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1520px] px-5 py-6 sm:px-8 lg:px-10">
        {sourceNotice ? <div className="mb-4 flex items-start gap-2 rounded-md border border-[#d3dbea] bg-white px-4 py-3 text-[11px] font-semibold text-[#697586]"><FleetIcon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-[#a96d09]" />{sourceNotice}</div> : null}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,.65fr)]">
          <section className="overflow-hidden rounded-md border border-[#d3dbea] bg-white shadow-[0_18px_45px_-35px_rgba(6,24,73,.42)]">
            <div className="flex flex-col gap-3 border-b border-[#dfe5ef] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div><h2 className="text-[15px] font-black text-[var(--deshazo-text)]">Estimated vehicle register</h2><p className="mt-1 text-[11px] font-medium text-[#8992a1]">{filteredVehicles.length} of {vehicles.length} modeled vehicles</p></div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="flex h-9 items-center gap-2 rounded-md border border-[#c7d1e2] bg-white px-3 focus-within:border-[var(--deshazo-blue)]"><FleetIcon name="search" className="h-4 w-4 text-[#8992a1]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search unit, site, technician" className="w-full min-w-0 bg-transparent text-[11px] font-semibold outline-none sm:w-[220px]" /></label>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'All' | FleetStatus)} className="h-9 rounded-md border border-[#c7d1e2] bg-white px-3 text-[11px] font-bold text-[#5f6876] outline-none">
                  {(['All', 'In service', 'Service due', 'Inspection due', 'Spare'] as const).map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead><tr className="border-b border-[#dfe5ef] bg-[#f8fafd] text-[9px] font-black uppercase tracking-[0.14em] text-[#7c8594]"><th className="px-5 py-3">Unit</th><th className="px-3 py-3">Assignment</th><th className="px-3 py-3">Vehicle</th><th className="px-3 py-3">Odometer</th><th className="px-3 py-3">Utilization</th><th className="px-3 py-3">Next action</th><th className="px-5 py-3 text-right">Status</th></tr></thead>
                <tbody>
                  {filteredVehicles.map((vehicle) => (
                    <tr key={vehicle.id} onClick={() => setSelectedVehicleId(vehicle.id)} className={`cursor-pointer border-b border-[#e6eaf1] last:border-0 hover:bg-[#f7f9fd] ${selectedVehicleId === vehicle.id ? 'bg-[#eef4ff]' : ''}`}>
                      <td className="px-5 py-4"><p className="font-mono text-[11px] font-bold text-[var(--deshazo-blue)]">{vehicle.unitNumber}</p><p className="mt-1 text-[10px] font-semibold text-[#8b94a3]">{vehicle.site}</p></td>
                      <td className="px-3 py-4"><p className="text-[11px] font-bold text-[var(--deshazo-text)]">{vehicle.assignedTo}</p><p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-[#8b94a3]">Estimated assignment</p></td>
                      <td className="px-3 py-4"><p className="text-[11px] font-bold text-[#4f5968]">{vehicle.year} {vehicle.model}</p><p className="mt-1 text-[10px] text-[#8992a1]">{vehicle.type}</p></td>
                      <td className="px-3 py-4 font-mono text-[11px] font-bold text-[#5f6876]">{vehicle.odometer.toLocaleString()} mi</td>
                      <td className="px-3 py-4"><div className="flex items-center gap-2"><div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#e7ebf2]"><div className="h-full rounded-full bg-[var(--deshazo-blue-soft)]" style={{ width: `${vehicle.utilization}%` }} /></div><span className="font-mono text-[10px] font-bold text-[#747b8a]">{vehicle.utilization}%</span></div></td>
                      <td className="px-3 py-4 text-[10px] font-semibold text-[#646d7d]">{vehicle.serviceMiles <= 0 ? `${Math.abs(vehicle.serviceMiles).toLocaleString()} mi overdue` : `Service in ${vehicle.serviceMiles.toLocaleString()} mi`}</td>
                      <td className="px-5 py-4 text-right"><span className={`inline-flex rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-[0.07em] ${statusClass(vehicle.status)}`}>{vehicle.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && filteredVehicles.length === 0 ? <p className="px-5 py-10 text-center text-[12px] font-semibold text-[#7c8594]">No estimated vehicles match these filters.</p> : null}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-md border border-[#d3dbea] bg-white p-5 shadow-[0_18px_45px_-35px_rgba(6,24,73,.42)]">
              <div className="flex items-center justify-between"><div><h2 className="text-[15px] font-black text-[var(--deshazo-text)]">Fleet by service site</h2><p className="mt-1 text-[11px] text-[#8992a1]">Modeled from staffing coverage</p></div><FleetIcon name="pin" className="h-5 w-5 text-[var(--deshazo-blue)]" /></div>
              <div className="mt-5 space-y-4">{siteSummary.slice(0, 12).map((site) => <div key={site.site}><div className="flex items-center justify-between gap-3"><span className="truncate text-[11px] font-bold text-[var(--deshazo-text)]">{site.site}</span><span className="font-mono text-[10px] font-bold text-[#747b8a]">{site.count}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e9edf4]"><div className="h-full rounded-full bg-gradient-to-r from-[var(--deshazo-blue)] to-[#6f8fd0]" style={{ width: `${Math.max(8, (site.count / Math.max(...siteSummary.map((item) => item.count), 1)) * 100)}%` }} /></div>{site.attention ? <p className="mt-1 text-[9px] font-bold text-[#a96d09]">{site.attention} estimated action item{site.attention === 1 ? '' : 's'}</p> : null}</div>)}</div>
            </section>

            <section className="rounded-md border border-[#d3dbea] bg-white p-5 shadow-[0_18px_45px_-35px_rgba(6,24,73,.42)]">
              <h2 className="text-[15px] font-black text-[var(--deshazo-text)]">{selectedVehicle ? selectedVehicle.unitNumber : 'Select a vehicle'}</h2>
              {selectedVehicle ? <><p className="mt-1 text-[11px] font-semibold text-[#8992a1]">{selectedVehicle.year} {selectedVehicle.model}</p><dl className="mt-5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 text-[11px]"><dt className="font-semibold text-[#7c8594]">Assigned technician</dt><dd className="text-right font-bold text-[var(--deshazo-text)]">{selectedVehicle.assignedTo}</dd><dt className="font-semibold text-[#7c8594]">Home site</dt><dd className="text-right font-bold text-[var(--deshazo-text)]">{selectedVehicle.site}</dd><dt className="font-semibold text-[#7c8594]">Annual inspection</dt><dd className="text-right font-mono font-bold text-[var(--deshazo-text)]">{new Date(`${selectedVehicle.inspectionDue}T12:00:00`).toLocaleDateString()}</dd><dt className="font-semibold text-[#7c8594]">Planning status</dt><dd><span className={`rounded-md border px-2 py-1 text-[9px] font-black uppercase ${statusClass(selectedVehicle.status)}`}>{selectedVehicle.status}</span></dd></dl><div className="mt-5 rounded-md border border-dashed border-[#c7d1e2] bg-[#f8fafd] px-3 py-3 text-[10px] font-semibold leading-5 text-[#747b8a]">Demo details are deterministic planning assumptions. Connect a telematics or fleet system before using mileage, maintenance, assignment, or compliance information operationally.</div></> : <p className="mt-4 text-[11px] font-semibold leading-5 text-[#8992a1]">Choose a row to review its estimated assignment and maintenance assumptions.</p>}
            </section>
          </aside>
        </div>
        <p className="mt-5 text-center text-[9px] font-bold uppercase tracking-[0.18em] text-[#9aa2ae]">Demonstration workspace · No production vehicle records</p>
      </div>
    </div>
  )
}
