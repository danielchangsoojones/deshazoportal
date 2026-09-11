import { supabase } from './supabase'

type WabashWorkOrderLocationRow = {
  work_order_id: number
  job_no: string | null
  sales_order_no: string | null
  job_type: string | null
  status_name: string | null
  customer_location_name: string | null
  service_location_name: string | null
  bill_to_city: string | null
  bill_to_state: string | null
  customer_po_no: string | null
  comment: string | null
  start_date: string | null
  end_date: string | null
  completed_at: string | null
  raw_payload: Record<string, unknown> | null
}

export type WabashLocationMismatchJob = {
  workOrderId: number
  jobNo: string
  salesOrderNo: string
  jobType: string
  statusName: string
  branchName: string
  branchKey: string
  locationName: string
  locationCity: string
  locationState: string
  locationKey: string
  isPhoenixAzLocation: boolean
  billToLocation: string
  customerPoNo: string
  comment: string
  startDate: string
  endDate: string
  completedAt: string
  mismatchType: 'phoenix_az_location' | 'phoenix_jonestown' | 'phoenix_non_arizona' | 'branch_city_differs' | 'same_city'
}

export type WabashLocationPairSummary = {
  key: string
  branchName: string
  locationLabel: string
  count: number
  latestDate: string
  mismatchType: WabashLocationMismatchJob['mismatchType']
}

export type WabashLocationMismatchReport = {
  totalJobs: number
  mismatchJobs: number
  phoenixAzLocationJobs: number
  phoenixBranchJobs: number
  phoenixJonestownJobs: number
  phoenixNonArizonaJobs: number
  branchPairSummaries: WabashLocationPairSummary[]
  phoenixPairSummaries: WabashLocationPairSummary[]
  jobs: WabashLocationMismatchJob[]
  generatedAt: string
}

function getNestedObject(value: Record<string, unknown> | null, key: string) {
  const nested = value?.[key]
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : null
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function getBranchKey(branchName: string) {
  return normalizeKey(branchName.replace(/^\d+\s+/, ''))
}

function getLocationKey(city: string, state: string) {
  return normalizeKey([city, state].filter(Boolean).join(' '))
}

function parseWorkOrderLocation(row: WabashWorkOrderLocationRow): WabashLocationMismatchJob {
  const rawPayload = row.raw_payload ?? null
  const customerLocation = getNestedObject(rawPayload, 'customerLocation')
  const serviceLocation = getNestedObject(rawPayload, 'serviceLocation')
  const locationCity = getString(customerLocation?.shipToCity)
  const locationState = getString(customerLocation?.shipToState)
  const branchName = row.service_location_name?.trim() || getString(serviceLocation?.name) || 'Unassigned branch'
  const fallbackLocationName = row.customer_location_name?.trim() || [locationCity, locationState].filter(Boolean).join(', ')
  const locationName = fallbackLocationName || 'Unassigned location'
  const branchKey = getBranchKey(branchName)
  const locationKey = getLocationKey(locationCity || locationName, locationState)
  const billToLocation = [row.bill_to_city, row.bill_to_state].filter(Boolean).join(', ')
  const isPhoenixBranch = branchKey.includes('phoenix')
  const isPhoenixAzLocation = normalizeKey(locationCity) === 'phoenix' && normalizeKey(locationState) === 'az'
  const isJonestownLocation = normalizeKey([locationName, locationCity, locationState].join(' ')).includes('jonestown')
  const isArizonaLocation = normalizeKey(locationState) === 'az' || normalizeKey(locationState) === 'arizona'
  const branchMatchesLocation =
    Boolean(branchKey && locationKey) &&
    (locationKey.includes(branchKey) || branchKey.includes(locationCity ? normalizeKey(locationCity) : locationKey))

  let mismatchType: WabashLocationMismatchJob['mismatchType'] = 'same_city'
  if (isPhoenixAzLocation) {
    mismatchType = 'phoenix_az_location'
  } else if (isPhoenixBranch && isJonestownLocation) {
    mismatchType = 'phoenix_jonestown'
  } else if (isPhoenixBranch && !isArizonaLocation) {
    mismatchType = 'phoenix_non_arizona'
  } else if (!branchMatchesLocation) {
    mismatchType = 'branch_city_differs'
  }

  return {
    workOrderId: row.work_order_id,
    jobNo: row.job_no ?? '',
    salesOrderNo: row.sales_order_no ?? '',
    jobType: row.job_type ?? '',
    statusName: row.status_name ?? '',
    branchName,
    branchKey,
    locationName,
    locationCity,
    locationState,
    locationKey,
    isPhoenixAzLocation,
    billToLocation,
    customerPoNo: row.customer_po_no ?? '',
    comment: row.comment ?? '',
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? '',
    completedAt: row.completed_at ?? '',
    mismatchType,
  }
}

function dateScore(value: string) {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function getJobDate(job: WabashLocationMismatchJob) {
  return job.startDate || job.endDate || job.completedAt
}

function summarizePairs(jobs: WabashLocationMismatchJob[]) {
  const summariesByKey = new Map<string, WabashLocationPairSummary>()

  jobs.forEach((job) => {
    const locationLabel = [job.locationName, job.locationCity && job.locationState ? `${job.locationCity}, ${job.locationState}` : '']
      .filter(Boolean)
      .join(' / ')
    const key = `${job.branchName}::${locationLabel}`
    const current = summariesByKey.get(key)
    const jobDate = getJobDate(job)

    if (current) {
      current.count += 1
      if (dateScore(jobDate) > dateScore(current.latestDate)) current.latestDate = jobDate
      if (job.mismatchType === 'phoenix_jonestown') current.mismatchType = job.mismatchType
      return
    }

    summariesByKey.set(key, {
      key,
      branchName: job.branchName,
      locationLabel,
      count: 1,
      latestDate: jobDate,
      mismatchType: job.mismatchType,
    })
  })

  return Array.from(summariesByKey.values()).sort((left, right) =>
    right.count - left.count ||
    dateScore(right.latestDate) - dateScore(left.latestDate) ||
    left.branchName.localeCompare(right.branchName),
  )
}

export async function getWabashLocationMismatchReport(): Promise<WabashLocationMismatchReport> {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const rows: WabashWorkOrderLocationRow[] = []
  const batchSize = 1000

  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await supabase
      .from('deshazo_external_work_orders')
      .select(
        'work_order_id, job_no, sales_order_no, job_type, status_name, customer_location_name, service_location_name, bill_to_city, bill_to_state, customer_po_no, comment, start_date, end_date, completed_at, raw_payload',
      )
      .eq('customer', 'wabash')
      .order('start_date', { ascending: false, nullsFirst: false })
      .order('end_date', { ascending: false, nullsFirst: false })
      .order('work_order_id', { ascending: false })
      .range(offset, offset + batchSize - 1)

    if (error) throw new Error(error.message)

    const nextRows = (data ?? []) as WabashWorkOrderLocationRow[]
    rows.push(...nextRows)
    if (nextRows.length < batchSize) break
  }

  const jobs = rows.map(parseWorkOrderLocation)
  const mismatchJobs = jobs.filter((job) => job.mismatchType !== 'same_city')
  const phoenixAzLocationJobs = jobs.filter((job) => job.isPhoenixAzLocation)
  const phoenixBranchJobs = jobs.filter((job) => job.branchKey.includes('phoenix'))
  const phoenixJonestownJobs = phoenixBranchJobs.filter((job) => job.mismatchType === 'phoenix_jonestown')
  const phoenixNonArizonaJobs = phoenixBranchJobs.filter((job) => job.mismatchType === 'phoenix_non_arizona')

  return {
    totalJobs: jobs.length,
    mismatchJobs: mismatchJobs.length,
    phoenixAzLocationJobs: phoenixAzLocationJobs.length,
    phoenixBranchJobs: phoenixBranchJobs.length,
    phoenixJonestownJobs: phoenixJonestownJobs.length,
    phoenixNonArizonaJobs: phoenixNonArizonaJobs.length,
    branchPairSummaries: summarizePairs(mismatchJobs),
    phoenixPairSummaries: summarizePairs(phoenixBranchJobs),
    jobs,
    generatedAt: new Date().toISOString(),
  }
}
