import { getCustomerFilterValue, getStoredCustomer, normalizeCustomer } from './customerRouting'
import { supabase } from './supabase'

export type PortalLocationOption = {
  label: string
  value: string
}

export const fallbackPortalLocationOptions: PortalLocationOption[] = [
  { label: 'Apollo Beach, FL', value: 'apollo_beach_fl' },
  { label: 'Cadiz, KY', value: 'cadiz_ky' },
  { label: 'Cleburne, TX', value: 'cleburne_tx' },
  { label: 'Elroy, WI', value: 'elroy_wi' },
  { label: 'Fond du Lac, WI', value: 'fond_du_lac_wi' },
  { label: 'Goshen, IN', value: 'goshen_in' },
  { label: 'Griffin, GA', value: 'griffin_ga' },
  { label: 'Groveport, OH', value: 'groveport_oh' },
  { label: 'Harrison, AK', value: 'harrison_ak' },
  { label: 'Jonestown, PA', value: 'jonestown_pa' },
  { label: 'Ligonier, IN', value: 'ligonier_in' },
  { label: 'Little Falls, MN', value: 'little_falls_mn' },
  { label: 'Maustin, WI', value: 'maustin_wi' },
  { label: 'Moreno Valley, CA', value: 'moreno_valley_ca' },
  { label: 'New Lisbon, WI', value: 'new_lisbon_wi' },
  { label: 'Perris, CA', value: 'perris_ca' },
] as const

export const portalLocationOptions = fallbackPortalLocationOptions

type WorkOrderLocationRow = {
  raw_payload: Record<string, unknown> | null
  customer_location_name: string | null
  service_location_name: string | null
}

type CustomerLocationRpcRow = {
  location_label: string | null
  city_label: string | null
  customer_location_name: string | null
  service_location_name: string | null
}

type CustomerLocationLookup = {
  options: PortalLocationOption[]
  aliases: Map<string, PortalLocationOption>
}

const locationCache = new Map<string, CustomerLocationLookup>()

export function normalizeLocationValue(value?: string | null) {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function getNestedRecord(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function getStringValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

function getWorkOrderCityState(row: WorkOrderLocationRow) {
  const customerLocation = getNestedRecord(row.raw_payload, 'customerLocation')
  const city = getStringValue(customerLocation, 'shipToCity')
  const state = getStringValue(customerLocation, 'shipToState')
  const cityState = [city, state].filter(Boolean).join(', ')
  if (cityState) return cityState

  return (row.customer_location_name || row.service_location_name || '').trim()
}

function getWorkOrderCity(row: WorkOrderLocationRow) {
  const customerLocation = getNestedRecord(row.raw_payload, 'customerLocation')
  return getStringValue(customerLocation, 'shipToCity')
}

export function getLocationOptionFromLabel(label: string): PortalLocationOption | null {
  const trimmedLabel = label.trim()
  const value = normalizeLocationValue(trimmedLabel)
  return trimmedLabel && value ? { label: trimmedLabel, value } : null
}

function addLocationAlias(aliases: Map<string, PortalLocationOption>, label: string | null | undefined, option: PortalLocationOption) {
  const aliasValue = normalizeLocationValue(label)
  if (!aliasValue || aliases.has(aliasValue)) return
  aliases.set(aliasValue, option)
}

function buildLocationLookupFromRows(rows: CustomerLocationRpcRow[]) {
  const labelsByValue = new Map<string, string>()
  const aliases = new Map<string, PortalLocationOption>()

  rows.forEach((row) => {
    const label = (row.location_label || row.customer_location_name || row.service_location_name || '').trim()
    const option = getLocationOptionFromLabel(label)
    if (!option) return
    labelsByValue.set(option.value, option.label)
    addLocationAlias(aliases, option.label, option)
    addLocationAlias(aliases, row.city_label, option)
    addLocationAlias(aliases, row.customer_location_name, option)
    addLocationAlias(aliases, row.service_location_name, option)
  })

  const locations = Array.from(labelsByValue.entries())
    .map(([value, label]) => ({ label, value }))
    .sort((left, right) => left.label.localeCompare(right.label))

  return { locations, aliases }
}

function isMissingLocationRpcError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /schema cache|Could not find|PGRST202|function|does not exist/i.test(message)
}

export async function getCustomerLocationLookup(customer?: string): Promise<CustomerLocationLookup> {
  if (!supabase) {
    const aliases = new Map<string, PortalLocationOption>()
    fallbackPortalLocationOptions.forEach((option) => addLocationAlias(aliases, option.label, option))
    return { options: fallbackPortalLocationOptions, aliases }
  }

  const selectedCustomer = getCustomerFilterValue(normalizeCustomer(customer) || getStoredCustomer())
  const cachedLookup = locationCache.get(selectedCustomer)
  if (cachedLookup) return cachedLookup

  try {
    const { data, error } = await supabase.rpc('get_deshazo_customer_locations', { p_customer: selectedCustomer })
    if (error) {
      throw new Error(error.message)
    }

    const { locations, aliases } = buildLocationLookupFromRows((data ?? []) as CustomerLocationRpcRow[])
    if (locations.length > 0) {
      const lookup = { options: locations, aliases }
      locationCache.set(selectedCustomer, lookup)
      return lookup
    }
  } catch (error) {
    if (!isMissingLocationRpcError(error)) {
      throw error
    }
  }

  const rows: WorkOrderLocationRow[] = []
  const pageSize = 1000

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('deshazo_external_work_orders')
      .select('raw_payload, customer_location_name, service_location_name')
      .eq('customer', selectedCustomer)
      .range(offset, offset + pageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

    const pageRows = (data ?? []) as WorkOrderLocationRow[]
    rows.push(...pageRows)
    if (pageRows.length < pageSize) break
  }

  const labelsByValue = new Map<string, string>()
  const aliases = new Map<string, PortalLocationOption>()

  rows.forEach((row) => {
    const label = getWorkOrderCityState(row)
    const option = getLocationOptionFromLabel(label)
    if (!option) return
    labelsByValue.set(option.value, option.label)
    addLocationAlias(aliases, option.label, option)
    addLocationAlias(aliases, getWorkOrderCity(row), option)
    addLocationAlias(aliases, row.customer_location_name, option)
    addLocationAlias(aliases, row.service_location_name, option)
  })

  const locations = Array.from(labelsByValue.entries())
    .map(([value, label]) => ({ label, value }))
    .sort((left, right) => left.label.localeCompare(right.label))

  const nextLocations = locations.length > 0 ? locations : fallbackPortalLocationOptions
  if (locations.length === 0) {
    nextLocations.forEach((option) => addLocationAlias(aliases, option.label, option))
  }

  const lookup = { options: nextLocations, aliases }
  locationCache.set(selectedCustomer, lookup)
  return lookup
}

export async function getCustomerLocationOptions(customer?: string): Promise<PortalLocationOption[]> {
  const lookup = await getCustomerLocationLookup(customer)
  return lookup.options
}
