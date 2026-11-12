import type { AssetsServicedAnalytics, AssetUnit } from './portalApi'
import { sampleProperties } from './samplePropertyRisks'

const boroughs = ['Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'Staten Island']

export const sampleFleetLocations = boroughs.map((label) => ({ label, value: label.toLowerCase().replaceAll(' ', '_') }))

const fleetByLocation = sampleFleetLocations.map((location) => ({
  ...location,
  units: sampleProperties.filter((property) => property.location.endsWith(location.label)).map((property, index): AssetUnit => ({
    unit_id: property.id,
    unit_name: property.name,
    warehouse_location: property.location,
    interior_location: property.type,
    inspection_date: index % 4 === 2 ? undefined : ['Nov 5, 2026', 'Oct 22, 2026', 'Oct 8, 2026'][index % 3],
    safety_issue_count: property.risks.filter(({ priority }) => priority === 'High').length,
    monitor_issue_count: property.risks.filter(({ priority }) => priority !== 'High').length,
  })),
}))

export const sampleFleetAreas = [...new Set(fleetByLocation.flatMap(({ units }) => units.map((unit) => unit.interior_location)))].sort()

export const getSampleFleetUnits = (locations: string[], areas: string[]) => fleetByLocation
  .filter(({ value }) => locations.length === 0 || locations.includes(value))
  .flatMap(({ units }) => units)
  .filter((unit) => areas.length === 0 || areas.includes(unit.interior_location))

const servicedAssets = fleetByLocation.map(({ label, value, units }) => {
  const serviced = units.filter((unit) => unit.inspection_date).length
  return {
    location: label, location_value: value,
    total_units: units.length, serviced_units: serviced,
    checked_in_display: `${serviced} of ${units.length} inspected`,
  }
})
const totalServiced = servicedAssets.reduce((sum, asset) => sum + asset.serviced_units, 0)

export const sampleFleetSummary: AssetsServicedAnalytics = {
  total_serviced_str: `${totalServiced} of ${sampleProperties.length} inspected`,
  total_units_count: sampleProperties.length,
  serviced_units_count: totalServiced,
  serviced_assets: servicedAssets,
}
