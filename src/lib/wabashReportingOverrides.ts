export type WabashReportingOverrideInput = {
  customer?: string | null
  workOrderId?: number | string | null
  jobNo?: string | null
}

export type WabashReportingLocationOverride = {
  locationName: string
  locationCity: string
  locationState: string
  locationLabel: string
  locationValue: string
  reason: string
}

export const WABASH_PHOENIX_INSTALLATION_OVERRIDE: WabashReportingLocationOverride = {
  locationName: 'Phoenix, AZ',
  locationCity: 'Phoenix',
  locationState: 'AZ',
  locationLabel: 'Phoenix, AZ',
  locationValue: 'phoenix_az',
  reason: 'Reporting override: Phoenix installation job originally imported with Jonestown ship-to.',
}

function normalizeComparable(value?: string | null) {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function normalizeWorkOrderId(value?: number | string | null) {
  return String(value ?? '').trim()
}

export function getWabashReportingLocationOverride(
  input: WabashReportingOverrideInput,
): WabashReportingLocationOverride | null {
  const customerKey = normalizeComparable(input.customer)
  const isWabashContext = !customerKey || customerKey === 'wabash'
  const workOrderId = normalizeWorkOrderId(input.workOrderId)
  const jobNo = String(input.jobNo ?? '').trim()

  // Business-critical Wabash exception: WO 61077 / Job 0265909 is the high-dollar
  // Phoenix installation that was created in DeShazo under Jonestown before Wabash's
  // Phoenix location was available. Keep the source data unchanged, but bucket every
  // app-level Wabash report/dashboard/filter to Phoenix, AZ. Do not remove this unless
  // it is replaced by an explicit reporting-overrides table or another durable rule.
  if (isWabashContext && (workOrderId === '61077' || jobNo === '0265909')) {
    return WABASH_PHOENIX_INSTALLATION_OVERRIDE
  }

  return null
}

export function applyWabashReportingLocationLabel(input: WabashReportingOverrideInput, fallbackLabel?: string | null) {
  return getWabashReportingLocationOverride(input)?.locationLabel ?? (fallbackLabel ?? '').trim()
}
