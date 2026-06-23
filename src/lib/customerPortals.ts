import { buildCustomerPath, getCustomerDisplayName, normalizeCustomer } from './customerRouting'
import { supabase } from './supabase'

export type CustomerPortal = {
  customer: string
  label: string
  href: string
}

type CustomerPortalRow = {
  customer: string | null
}

const pageSize = 1000
const excludedCustomerSlugs = new Set(['legacy'])
const customerPortalSources = [
  { table: 'deshazo_external_work_orders', column: 'customer' },
  { table: 'deshazo_external_sync_checkpoints', column: 'customer' },
  { table: 'deshazo_external_sync_runs', column: 'customer' },
] as const

function toCustomerPortal(customer: string): CustomerPortal | null {
  const slug = normalizeCustomer(customer)
  if (!slug || excludedCustomerSlugs.has(slug)) return null

  return {
    customer: slug,
    label: getCustomerDisplayName(slug),
    href: buildCustomerPath(slug, '/dashboard'),
  }
}

async function addCustomerSourceRows(
  customersBySlug: Map<string, CustomerPortal>,
  source: (typeof customerPortalSources)[number],
) {
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase!
      .from(source.table)
      .select(source.column)
      .not(source.column, 'is', null)
      .order(source.column, { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

    const rows = (data ?? []) as CustomerPortalRow[]
    rows.forEach((row) => {
      const portal = toCustomerPortal(row.customer ?? '')
      if (portal && !customersBySlug.has(portal.customer)) {
        customersBySlug.set(portal.customer, portal)
      }
    })

    if (rows.length < pageSize) break
  }
}

export async function getCustomerPortals(): Promise<CustomerPortal[]> {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }

  const customersBySlug = new Map<string, CustomerPortal>()

  for (const source of customerPortalSources) {
    await addCustomerSourceRows(customersBySlug, source)
  }

  return Array.from(customersBySlug.values()).sort((left, right) => left.label.localeCompare(right.label))
}
