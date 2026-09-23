export type WabashReportingOverrideInput = {
  customer?: string | null
  workOrderId?: number | string | null
  jobNo?: string | null
  dNumber?: string | null
}

export type WabashReportingLocationOverride = {
  locationName: string
  locationCity: string
  locationState: string
  locationLabel: string
  locationValue: string
  reason: string
}

const WABASH_PHOENIX_INSTALLATION_WORK_ORDER_ID = 61077
const WABASH_PHOENIX_INSTALLATION_JOB_NO = '0265909'
const WABASH_PHOENIX_WARRANTY_SERVICE_WORK_ORDER_ID = 69702
const WABASH_PHOENIX_WARRANTY_SERVICE_JOB_NO = '0273329'
const WABASH_PHOENIX_REPAIR_WORK_ORDER_ID = 71785
const WABASH_PHOENIX_REPAIR_JOB_NO = '0275240'
const WABASH_PHOENIX_INSTALLATION_D_NUMBERS = new Set(['D567216', 'D567217', 'D567218', 'D567219'])

export const WABASH_PHOENIX_INSTALLATION_OVERRIDE: WabashReportingLocationOverride = {
  // Corrects the known source-data location mismatch where Phoenix work was imported
  // under another Wabash ship-to location in the database.
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
  const dNumber = String(input.dNumber ?? '').trim().toUpperCase()

  // Business-critical Wabash exception:
  // - WO 61077 / Job 0265909 is the high-dollar Phoenix installation that was created
  //   in DeShazo under Jonestown before Wabash's Phoenix location was available.
  // - WO 71785 / Job 0275240 is the follow-on PHX repair/adder for that newly installed
  //   system ("Added Hoist /Trolley/Remotes"). It was imported under Moreno Valley,
  //   but should report with the Phoenix installation so the install and repair spend
  //   stay together. Keep source data unchanged; bucket app-level reports to Phoenix.
  // - WO 69702 / Job 0273329 is the no-charge warranty/service call immediately after
  //   the install ("2 cranes down"). It has no finance spend, but belongs with the same
  //   Phoenix system for reporting and work-order context.
  // Do not remove this unless it is replaced by an explicit reporting-overrides table
  // or another durable rule.
  if (
    isWabashContext &&
    (
      workOrderId === String(WABASH_PHOENIX_INSTALLATION_WORK_ORDER_ID) ||
      jobNo === WABASH_PHOENIX_INSTALLATION_JOB_NO ||
      workOrderId === String(WABASH_PHOENIX_WARRANTY_SERVICE_WORK_ORDER_ID) ||
      jobNo === WABASH_PHOENIX_WARRANTY_SERVICE_JOB_NO ||
      workOrderId === String(WABASH_PHOENIX_REPAIR_WORK_ORDER_ID) ||
      jobNo === WABASH_PHOENIX_REPAIR_JOB_NO ||
      WABASH_PHOENIX_INSTALLATION_D_NUMBERS.has(dNumber)
    )
  ) {
    return WABASH_PHOENIX_INSTALLATION_OVERRIDE
  }

  return null
}

export function applyWabashReportingLocationLabel(input: WabashReportingOverrideInput, fallbackLabel?: string | null) {
  return getWabashReportingLocationOverride(input)?.locationLabel ?? (fallbackLabel ?? '').trim()
}

export function getWabashReportingCraneSourceWorkOrderId(input: WabashReportingOverrideInput) {
  const customerKey = normalizeComparable(input.customer)
  const isWabashContext = !customerKey || customerKey === 'wabash'
  const workOrderId = normalizeWorkOrderId(input.workOrderId)
  const jobNo = String(input.jobNo ?? '').trim()

  if (
    isWabashContext &&
    (
      workOrderId === String(WABASH_PHOENIX_WARRANTY_SERVICE_WORK_ORDER_ID) ||
      jobNo === WABASH_PHOENIX_WARRANTY_SERVICE_JOB_NO ||
      workOrderId === String(WABASH_PHOENIX_REPAIR_WORK_ORDER_ID) ||
      jobNo === WABASH_PHOENIX_REPAIR_JOB_NO
    )
  ) {
    return WABASH_PHOENIX_INSTALLATION_WORK_ORDER_ID
  }

  return typeof input.workOrderId === 'number' ? input.workOrderId : null
}
