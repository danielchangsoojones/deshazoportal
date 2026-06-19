import { getCustomerFilterValue } from './customerRouting'
import { supabase } from './supabase'

export type PortalLocationOption = {
  label: string
  value: string
}

export const fallbackPortalLocationOptions: PortalLocationOption[] = []
export const portalLocationOptions = fallbackPortalLocationOptions

type WorkOrderLocationRow = {
  raw_payload: Record<string, unknown> | null
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

export async function getCustomerLocationLookup(customer?: string): Promise<CustomerLocationLookup> {
  const selectedCustomer = getCustomerFilterValue(customer)
  const cachedLookup = locationCache.get(selectedCustomer)
  if (cachedLookup) return cachedLookup

  if (!supabase) {
    const lookup = { options: fallbackPortalLocationOptions, aliases: new Map<string, PortalLocationOption>() }
    locationCache.set(selectedCustomer, lookup)
    return lookup
  }

  const rows: WorkOrderLocationRow[] = []
  const pageSize = 1000

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('deshazo_external_work_orders')
      .select('raw_payload, customer_location_name, service_location_name')
      .ilike('customer', selectedCustomer)
      .range(offset, offset + pageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

    const pageRows = ((data ?? []) as unknown) as WorkOrderLocationRow[]
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

  const options = Array.from(labelsByValue.entries())
    .map(([value, label]) => ({ label, value }))
    .sort((left, right) => left.label.localeCompare(right.label))
  const lookup = { options, aliases }
  locationCache.set(selectedCustomer, lookup)
  return lookup
}

export async function getCustomerLocationOptions(customer?: string): Promise<PortalLocationOption[]> {
  const lookup = await getCustomerLocationLookup(customer)
  return lookup.options
}
