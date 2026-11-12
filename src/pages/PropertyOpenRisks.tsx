import { Link, useSearchParams } from 'react-router-dom'
import { useCustomerPath } from '../lib/customerRouting'

import { priorities, propertyRiskFilters, sampleProperties, type Property, type PropertyRisk, type Priority } from '../lib/samplePropertyRisks'

function countByPriority(risks: PropertyRisk[]) {
  const counts: Record<Priority, number> = { High: 0, Medium: 0, Low: 0 }
  for (const risk of risks) counts[risk.priority] += 1
  return counts
}

function PropertyRiskCard({ property, risks, counts, detailPath }: { property: Property; risks: PropertyRisk[]; counts: Record<Priority, number>; detailPath: string }) {
  const highEnd = (counts.High / risks.length) * 100
  const mediumEnd = ((counts.High + counts.Medium) / risks.length) * 100
  const [high, medium, low] = priorities
  const gradient = `conic-gradient(${high.color} 0% ${highEnd}%, ${medium.color} ${highEnd}% ${mediumEnd}%, ${low.color} ${mediumEnd}% 100%)`

  return (
    <article className="overflow-hidden rounded-[10px] border border-[var(--deshazo-border)] bg-white shadow-[0_14px_30px_-28px_rgba(47,86,166,0.22)]">
      <div className="px-4 py-4">
        <h2 className="text-lg font-extrabold tracking-[-0.03em]">{property.name}</h2>
        <p className="mt-1 text-sm font-medium text-[#526078]">{property.location} · {property.type}</p>
      </div>
      <div className="border-t border-[var(--deshazo-border)] px-4 py-4">
        <div className="flex items-center gap-4">
          <div aria-hidden="true" className="relative h-12 w-12 shrink-0 rounded-full" style={{ background: gradient }}>
            <div className="absolute inset-[7px] rounded-full bg-white" />
          </div>
          <div>
            <p className="text-base font-extrabold">{risks.length} {risks.length === 1 ? 'open item' : 'open items'}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[#526078]">
              {priorities.map(({ label }) => <span key={label}>{counts[label]} {label.toLowerCase()}</span>)}
            </p>
          </div>
        </div>
        <Link
          to={detailPath}
          className="mt-4 flex min-h-9 items-center justify-center rounded-[4px] bg-[var(--deshazo-blue)] px-3 text-sm font-bold text-white hover:bg-[#274987]"
        >
          See Details<span className="sr-only"> for {property.name}</span>
        </Link>
      </div>
    </article>
  )
}

const selectClass = 'mt-1 min-h-10 w-full rounded-md border border-[var(--deshazo-border)] bg-white px-3 text-sm font-semibold'

export default function PropertyOpenRisks() {
  const customerPath = useCustomerPath()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = propertyRiskFilters(searchParams)
  const propertyId = filters.get('property') || ''
  const priority = filters.get('priority') || ''

  const updateFilter = (filter: 'property' | 'priority', value: string) => {
    const next = new URLSearchParams(filters)
    if (value) next.set(filter, value)
    else next.delete(filter)
    setSearchParams(next, { replace: true })
  }

  const properties = sampleProperties
    .filter((property) => !propertyId || property.id === propertyId)
    .map((property) => {
      const risks = property.risks.filter((risk) => !priority || risk.priority === priority)
      return { property, risks, counts: countByPriority(risks) }
    })
    .filter(({ risks }) => risks.length > 0)
    .sort((left, right) => (
      right.counts.High - left.counts.High ||
      right.counts.Medium - left.counts.Medium ||
      right.counts.Low - left.counts.Low ||
      left.property.name.localeCompare(right.property.name)
    ))
  const risks = properties.flatMap((entry) => entry.risks)
  const counts = countByPriority(risks)

  return (
    <section className="min-w-0 flex-1 space-y-6 px-5 py-5 sm:px-8 lg:px-10" aria-labelledby="property-risk-heading">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-[var(--deshazo-blue)]">Branco Company</p>
          <h1 id="property-risk-heading" className="mt-1 text-[clamp(28px,4vw,38px)] font-black tracking-[-0.04em]">Open Risk Items</h1>
          <p className="mt-1 text-sm text-[#526078]">Sample property portfolio</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm font-semibold">
            Property
            <select className={selectClass} value={propertyId} onChange={(event) => updateFilter('property', event.target.value)}>
              <option value="">All properties</option>
              {sampleProperties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Priority
            <select className={selectClass} value={priority} onChange={(event) => updateFilter('priority', event.target.value)}>
              <option value="">All priorities</option>
              {priorities.map(({ label }) => <option key={label}>{label}</option>)}
            </select>
          </label>
        </div>
      </header>

      <dl aria-label="Risk summary" aria-live="polite" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Properties', count: properties.length, color: '#a8b9d8' },
          { label: 'Open items', count: risks.length, color: '#a8b9d8' },
          ...priorities.map(({ label, color }) => ({ label: `${label} priority`, count: counts[label], color })),
        ].map(({ label, count, color }) => (
          <div key={label} className="rounded-[10px] border border-[var(--deshazo-border)] bg-white px-4 py-3">
            <dt className="text-sm font-semibold text-[#526078]">{label}</dt>
            <dd className="mt-1 text-2xl font-extrabold tracking-tight">{count}</dd>
            <div aria-hidden="true" className="mt-2 h-0.5 w-10 rounded-full" style={{ backgroundColor: color }} />
          </div>
        ))}
      </dl>

      <section aria-label="Properties ranked by risk priority" className="rounded-[14px] border border-[#bfcdf1] bg-[#e4ebfc] p-3 sm:p-4">
        {properties.length ? (
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
            {properties.map(({ property, risks, counts }) => {
              const detailParams = new URLSearchParams(filters)
              detailParams.set('property_id', property.id)
              return <PropertyRiskCard key={property.id} property={property} risks={risks} counts={counts} detailPath={customerPath(`/asset-info?${detailParams}`)} />
            })}
          </div>
        ) : (
          <p className="rounded-[10px] bg-white px-4 py-10 text-center text-sm font-semibold text-[#526078]">No open risks match these filters.</p>
        )}
      </section>
    </section>
  )
}
