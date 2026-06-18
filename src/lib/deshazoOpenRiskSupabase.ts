import { supabase } from './supabase'
import { getCustomerFilterValue, getStoredCustomer, normalizeCustomer } from './customerRouting'
import type {
  AssetInfoAnalytics,
  AssetIssue,
  AssetsServicedAnalytics,
  AssetsPageAnalytics,
  AssetUnit,
  RecurringIssue,
} from './portalApi'
import { getCustomerLocationLookup, getLocationOptionFromLabel, normalizeLocationValue } from './portalLocations'

const pageSize = 24
const cacheTtlMs = 5 * 60 * 1000
const actionableConditions = ['REPAIR', 'MONITOR', 'DO NOT OPERATE / SAFETY']
const recurringWindowMs = 365 * 24 * 60 * 60 * 1000

type WorkOrderRow = {
  work_order_id: string
  bill_to_name: string | null
  customer: string | null
  customer_location_name: string | null
  service_location_name: string | null
}

type CraneRow = {
  id: string
  work_order_id: string
  contact_code: string | null
  description: string | null
  location: string | null
}

type InspectionRow = {
  id: string
  crane_row_id: string
  inspection_date: string | null
  completed_at: string | null
}

type SectionRow = {
  id: string
  inspection_row_id: string
  section_name: string | null
  section_index: number | null
  section_order: number | null
}

type PointRow = {
  id: string
  section_row_id: string
  point_name: string | null
  condition: string | null
  remarks: unknown
  point_index: number | null
}

type AssetRecord = {
  unit: AssetUnit
  issues: AssetIssue[]
  sortIndex: number
}

type OpenRiskDataset = {
  assets: AssetRecord[]
  totalSafetyIssues: number
  totalMonitorIssues: number
  loadedAt: number
}

type SummaryViewRow = {
  unit_id: string
  unit_name: string | null
  warehouse_location: string | null
  interior_location: string | null
  inspection_date: string | null
  safety_issue_count: number | null
  monitor_issue_count: number | null
  total_issue_count: number | null
}

type IssueViewRow = {
  unit_id: string
  category: string | null
  safety_category: string | null
  inspection_date: string | null
  completed_at?: string | null
  component_type?: string | null
  remarks: string | null
  section_sort?: number | null
  point_sort?: number | null
  remark_sort?: number | null
}

type SupabaseQueryBuilder = {
  eq: (column: string, value: string) => SupabaseQueryBuilder
  in: (column: string, values: readonly string[]) => SupabaseQueryBuilder
}

let cachedDataset: OpenRiskDataset | null = null
let cachedDatasetCustomer = ''
let pendingDataset: Promise<OpenRiskDataset> | null = null
let pendingDatasetCustomer = ''

function resolveSelectedCustomer(customer?: string) {
  return getCustomerFilterValue(normalizeCustomer(customer) || getStoredCustomer())
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  return supabase
}

async function requireAuthenticatedSession() {
  const client = requireSupabase()
  const { data, error } = await client.auth.getSession()
  if (error) {
    throw new Error(error.message)
  }
  if (!data.session) {
    throw new Error('Sign in is required before loading Supabase Open Risk data.')
  }
}

async function fetchAll<T>(
  tableName: string,
  select: string,
  buildQuery?: (query: SupabaseQueryBuilder) => SupabaseQueryBuilder,
  chunkSize = 250,
) {
  const client = requireSupabase()
  const rows: T[] = []
  let from = 0

  while (true) {
    let data: unknown[] | null = null
    let error: { message: string } | null = null

    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        let query = client.from(tableName).select(select).range(from, from + chunkSize - 1)
        if (buildQuery) {
          query = buildQuery(query as unknown as SupabaseQueryBuilder) as unknown as typeof query
        }

        const response = await query
        data = response.data as unknown[] | null
        error = response.error
        break
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown Supabase response error.'
        const isLastAttempt = attempt === 3
        if (isLastAttempt) {
          throw new Error(`${tableName} rows ${from}-${from + chunkSize - 1}: ${message}`)
        }
        await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)))
      }
    }

    if (error) {
      throw new Error(`${tableName} rows ${from}-${from + chunkSize - 1}: ${error.message}`)
    }

    const pageRows = (data ?? []) as T[]
    rows.push(...pageRows)
    if (pageRows.length < chunkSize) break
    from += chunkSize
  }

  return rows
}

async function fetchByInChunks<T>(
  tableName: string,
  select: string,
  columnName: string,
  values: string[],
  buildQuery?: (query: SupabaseQueryBuilder) => SupabaseQueryBuilder,
  chunkSize = 200,
) {
  const uniqueValues = Array.from(new Set(values.filter(Boolean)))
  if (uniqueValues.length === 0) return []

  const chunks: string[][] = []
  for (let index = 0; index < uniqueValues.length; index += chunkSize) {
    chunks.push(uniqueValues.slice(index, index + chunkSize))
  }

  const rows: T[] = []
  const concurrency = 4
  for (let index = 0; index < chunks.length; index += concurrency) {
    const batch = chunks.slice(index, index + concurrency)
    const batchRows = await Promise.all(batch.map((chunk) =>
      fetchAll<T>(
        tableName,
        select,
        (query) => {
          let nextQuery = query.in(columnName, chunk)
          if (buildQuery) {
            nextQuery = buildQuery(nextQuery)
          }
        return nextQuery
      },
        250,
      ),
    ))
    rows.push(...batchRows.flat())
  }

  return rows
}

function normalizeText(value?: string | null) {
  return (value ?? '').trim()
}

function normalizeKey(value?: string | null) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function formatDateLabel(value?: string | null) {
  if (!value) return undefined
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function getDateTime(value?: string | null) {
  if (!value) return -Infinity
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? -Infinity : parsed
}

function mapConditionToSafetyCategory(value?: string | null) {
  const normalized = normalizeText(value).toUpperCase()
  if (normalized === 'MONITOR') return 'monitor'
  if (normalized === 'REPAIR' || normalized === 'DO NOT OPERATE / SAFETY') return 'safety'
  return null
}

function parseRemarkTexts(value: unknown) {
  if (value == null || value === '') return []
  if (typeof value === 'string') return [value].filter(Boolean)
  if (!Array.isArray(value)) return [String(value)].filter(Boolean)

  if (value.length === 0) return []

  return value.map((item) => {
    if (item == null) return ''
    if (typeof item === 'string') return item
    if (typeof item === 'object') {
      const record = item as Record<string, unknown>
      const candidate = record.Remark ?? record.remark ?? record.content ?? record.notes ?? record.value ?? record.text
      return typeof candidate === 'string' ? candidate : ''
    }
    return String(item)
  }).map((remark) => remark.trim()).filter(Boolean)
}

function ensureSentencePunctuation(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function formatRemarks(value: unknown) {
  return parseRemarkTexts(value).map(ensureSentencePunctuation).join(' ')
}

function buildIssueRowsFromView(rows: IssueViewRow[]) {
  const sortedRows = [...rows].sort((left, right) =>
    (left.section_sort ?? 0) - (right.section_sort ?? 0) ||
    (left.point_sort ?? 0) - (right.point_sort ?? 0) ||
    (left.remark_sort ?? 0) - (right.remark_sort ?? 0),
  )
  const issuesByKey = new Map<string, AssetIssue>()

  for (const row of sortedRows) {
    const category = normalizeText(row.category).toLowerCase()
    const safetyCategory = normalizeText(row.safety_category).toLowerCase()
    const inspectionDate = formatDateLabel(row.inspection_date ?? row.completed_at) ?? ''
    const componentType = normalizeText(row.component_type) || 'component_1'
    const key = [
      category,
      safetyCategory,
      row.inspection_date ?? row.completed_at ?? '',
      componentType,
    ].join('|')
    const remarks = ensureSentencePunctuation(normalizeText(row.remarks))
    const existing = issuesByKey.get(key)

    if (existing) {
      existing.remarks = [existing.remarks, remarks].filter(Boolean).join(' ')
      continue
    }

    issuesByKey.set(key, {
      category,
      safety_category: safetyCategory,
      inspection_date: inspectionDate,
      component_type: componentType,
      remarks,
    })
  }

  return Array.from(issuesByKey.values())
}

function buildSectionComponentLabels(sections: SectionRow[]) {
  const sortedSections = [...sections].sort((left, right) => {
    const leftOrder = left.section_order ?? left.section_index ?? 0
    const rightOrder = right.section_order ?? right.section_index ?? 0
    return leftOrder - rightOrder || left.id.localeCompare(right.id)
  })

  const counts = new Map<string, number>()
  const labels = new Map<string, string>()

  for (const section of sortedSections) {
    const rawName = normalizeText(section.section_name)
    const lowerName = rawName.toLowerCase()
    const base = lowerName.includes('hoist')
      ? 'hoist'
      : lowerName.includes('cranestructuretype')
        ? 'bridge'
        : normalizeKey(rawName) || 'component'
    const nextCount = (counts.get(base) ?? 0) + 1
    counts.set(base, nextCount)
    labels.set(section.id, `${base}_${nextCount}`)
  }

  return labels
}

function isHoistSection(section?: SectionRow) {
  return normalizeText(section?.section_name).toLowerCase().includes('hoist')
}

function getLocationValue(unit: AssetUnit) {
  return normalizeLocationValue(unit.warehouse_location)
}

function getCanonicalLocationOption(label: string | null | undefined, aliases: Map<string, { label: string; value: string }>) {
  const alias = aliases.get(normalizeLocationValue(label))
  if (alias) return alias
  return getLocationOptionFromLabel(normalizeText(label))
}

function matchesLocations(unit: AssetUnit, locations: string[]) {
  if (locations.length === 0) return true
  const value = getLocationValue(unit)
  return locations.some((location) => value.includes(location.replace(/_([a-z]{2})$/, '')) || value === location)
}

function buildAssetName(dNumber: string, description?: string | null) {
  const cleanDescription = normalizeText(description)
  return cleanDescription ? `${dNumber} ${cleanDescription}` : dNumber
}

function isMissingViewError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /does not exist|schema cache|Could not find|PGRST202|PGRST205|permission denied for view|function/i.test(message)
}

async function fetchOpenRiskRpcRows<T>(functionName: string, customer: string) {
  const client = requireSupabase()
  const { data, error } = await client.rpc(functionName, { p_customer: customer })
  if (error) {
    throw new Error(error.message)
  }
  return (data ?? []) as T[]
}

async function fetchOpenRiskViewRows(customer: string) {
  const [summaries, issueRows] = await Promise.all([
    fetchAll<SummaryViewRow>(
      'deshazo_open_risk_asset_summaries',
      'unit_id,unit_name,warehouse_location,interior_location,inspection_date,safety_issue_count,monitor_issue_count,total_issue_count',
      (query) => query.eq('customer', customer),
      1000,
    ),
    fetchAll<IssueViewRow>(
      'deshazo_open_risk_latest_issue_rows',
      'unit_id,category,safety_category,inspection_date,completed_at,component_type,remarks,section_sort,point_sort,remark_sort',
      (query) => query.eq('customer', customer),
      1000,
    ),
  ])

  return { summaries, issueRows }
}

async function loadDatasetFromViews(customer: string): Promise<OpenRiskDataset> {
  const locationLookupPromise = getCustomerLocationLookup(customer)
  let summaries: SummaryViewRow[] = []
  let issueRows: IssueViewRow[] = []

  try {
    ;[summaries, issueRows] = await Promise.all([
      fetchOpenRiskRpcRows<SummaryViewRow>('get_deshazo_open_risk_asset_summaries', customer),
      fetchOpenRiskRpcRows<IssueViewRow>('get_deshazo_open_risk_latest_issue_rows', customer),
    ])
  } catch (error) {
    if (!isMissingViewError(error)) {
      throw error
    }
    ;({ summaries, issueRows } = await fetchOpenRiskViewRows(customer))
  }

  const locationLookup = await locationLookupPromise

  const issueRowsByUnitId = new Map<string, IssueViewRow[]>()
  for (const row of issueRows) {
    const unitId = normalizeText(row.unit_id).toUpperCase()
    if (!unitId) continue
    const group = issueRowsByUnitId.get(unitId) ?? []
    group.push(row)
    issueRowsByUnitId.set(unitId, group)
  }

  const assets = summaries.map<AssetRecord>((summary, index) => {
    const unitId = normalizeText(summary.unit_id).toUpperCase()
    const locationOption = getCanonicalLocationOption(summary.warehouse_location, locationLookup.aliases)
    const issues = buildIssueRowsFromView(issueRowsByUnitId.get(unitId) ?? [])
    const safetyIssueCount = issues.filter((issue) => issue.safety_category === 'safety').length
    const monitorIssueCount = issues.filter((issue) => issue.safety_category === 'monitor').length
    return {
      unit: {
        unit_id: unitId,
        unit_name: normalizeText(summary.unit_name) || unitId,
        warehouse_location: locationOption?.label ?? normalizeText(summary.warehouse_location),
        interior_location: normalizeText(summary.interior_location),
        inspection_date: formatDateLabel(summary.inspection_date),
        safety_issue_count: safetyIssueCount,
        monitor_issue_count: monitorIssueCount,
      },
      issues,
      sortIndex: index,
    }
  })

  assets.sort((left, right) => {
    const leftTotal = left.unit.safety_issue_count + left.unit.monitor_issue_count
    const rightTotal = right.unit.safety_issue_count + right.unit.monitor_issue_count
    return rightTotal - leftTotal || left.sortIndex - right.sortIndex
  })

  return {
    assets,
    totalSafetyIssues: assets.reduce((sum, asset) => sum + asset.unit.safety_issue_count, 0),
    totalMonitorIssues: assets.reduce((sum, asset) => sum + asset.unit.monitor_issue_count, 0),
    loadedAt: Date.now(),
  }
}

function buildIssueRows(
  inspection: InspectionRow,
  sections: SectionRow[],
  points: PointRow[],
) {
  const sectionLabels = buildSectionComponentLabels(sections)
  const sectionById = new Map(sections.map((section) => [section.id, section]))
  const hoistPointOccurrences = new Map<string, number>()
  const sortedPoints = [...points].sort((left, right) => {
    const leftSection = sectionById.get(left.section_row_id)
    const rightSection = sectionById.get(right.section_row_id)
    const leftSectionOrder = leftSection?.section_order ?? leftSection?.section_index ?? 0
    const rightSectionOrder = rightSection?.section_order ?? rightSection?.section_index ?? 0
    return leftSectionOrder - rightSectionOrder || (left.point_index ?? 0) - (right.point_index ?? 0) || left.id.localeCompare(right.id)
  })
  const issues: AssetIssue[] = []

  for (const point of sortedPoints) {
    const safetyCategory = mapConditionToSafetyCategory(point.condition)
    if (!safetyCategory) continue

    const section = sectionById.get(point.section_row_id)
    const pointKey = `${point.section_row_id}:${normalizeText(point.point_name).toLowerCase()}`
    const hoistOccurrence = (hoistPointOccurrences.get(pointKey) ?? 0) + 1
    hoistPointOccurrences.set(pointKey, hoistOccurrence)
    const componentType = isHoistSection(section)
      ? `hoist_${hoistOccurrence}`
      : sectionLabels.get(point.section_row_id) ?? 'component_1'

    issues.push({
      category: normalizeText(point.point_name).toLowerCase(),
      safety_category: safetyCategory,
      inspection_date: formatDateLabel(inspection.inspection_date ?? inspection.completed_at) ?? '',
      component_type: componentType,
      remarks: formatRemarks(point.remarks),
    })
  }

  return issues
}

async function loadLatestAssetDetailFromTables(dNumber: string, customer: string): Promise<AssetInfoAnalytics | null> {
  const cranes = await fetchAll<CraneRow>(
    'deshazo_external_report_cranes',
    'id,work_order_id,contact_code,description,location',
    (query) => query.eq('customer', customer).eq('contact_code', dNumber),
  )
  if (cranes.length === 0) return null

  const workOrders = await fetchByInChunks<WorkOrderRow>(
    'deshazo_external_work_orders',
    'work_order_id,bill_to_name,customer,customer_location_name,service_location_name',
    'work_order_id',
    cranes.map((crane) => crane.work_order_id),
    (query) => query.eq('customer', customer),
  )
  const workOrderById = new Map(workOrders.map((workOrder) => [workOrder.work_order_id, workOrder]))
  const customerCranes = cranes.filter((crane) => workOrderById.has(crane.work_order_id))
  if (customerCranes.length === 0) return null

  const craneById = new Map(customerCranes.map((crane) => [crane.id, crane]))
  const inspections = await fetchByInChunks<InspectionRow>(
    'deshazo_external_report_inspections',
    'id,crane_row_id,inspection_date,completed_at',
    'crane_row_id',
    Array.from(craneById.keys()),
    (query) => query.eq('customer', customer),
  )
  if (inspections.length === 0) return null

  const latestInspection = [...inspections].sort((left, right) =>
    getDateTime(right.inspection_date ?? right.completed_at) - getDateTime(left.inspection_date ?? left.completed_at) ||
    right.id.localeCompare(left.id),
  )[0]
  const latestCrane = craneById.get(latestInspection.crane_row_id)
  if (!latestCrane) return null

  const sections = await fetchAll<SectionRow>(
    'deshazo_external_report_sections',
    'id,inspection_row_id,section_name,section_index,section_order',
    (query) => query.eq('customer', customer).eq('inspection_row_id', latestInspection.id),
    500,
  )
  const points = await fetchByInChunks<PointRow>(
    'deshazo_external_report_points',
    'id,section_row_id,point_name,condition,remarks,point_index',
    'section_row_id',
    sections.map((section) => section.id),
    (query) => query.eq('customer', customer).in('condition', actionableConditions),
    200,
  )
  const workOrder = workOrderById.get(latestCrane.work_order_id)

  return {
    unit_location: normalizeText(workOrder?.customer_location_name || workOrder?.service_location_name),
    unit_internal_location: normalizeText(latestCrane.location),
    unit_name: buildAssetName(dNumber, latestCrane.description),
    issues: buildIssueRows(latestInspection, sections, points),
  }
}

async function loadDatasetFromTables(customer: string): Promise<OpenRiskDataset> {
  const locationLookup = await getCustomerLocationLookup(customer)
  const workOrders = await fetchAll<WorkOrderRow>(
    'deshazo_external_work_orders',
    'work_order_id,bill_to_name,customer,customer_location_name,service_location_name',
    (query) => query.eq('customer', customer),
    500,
  )
  const workOrderById = new Map(workOrders.map((workOrder) => [workOrder.work_order_id, workOrder]))
  const customerCranes = await fetchByInChunks<CraneRow>(
    'deshazo_external_report_cranes',
    'id,work_order_id,contact_code,description,location',
    'work_order_id',
    Array.from(workOrderById.keys()),
    (query) => query.eq('customer', customer),
  )
  const customerCranesWithDNumbers = customerCranes.filter((crane) => normalizeText(crane.contact_code))
  const craneById = new Map(customerCranesWithDNumbers.map((crane) => [crane.id, crane]))
  const customerInspections = await fetchByInChunks<InspectionRow>(
    'deshazo_external_report_inspections',
    'id,crane_row_id,inspection_date,completed_at',
    'crane_row_id',
    Array.from(craneById.keys()),
    (query) => query.eq('customer', customer),
  )

  const latestByDNumber = new Map<string, { inspection: InspectionRow; crane: CraneRow; sortIndex: number }>()
  customerInspections.forEach((inspection, sortIndex) => {
    const crane = craneById.get(inspection.crane_row_id)
    const dNumber = normalizeText(crane?.contact_code).toUpperCase()
    if (!crane || !dNumber) return

    const current = latestByDNumber.get(dNumber)
    const nextTime = getDateTime(inspection.inspection_date ?? inspection.completed_at)
    const currentTime = current ? getDateTime(current.inspection.inspection_date ?? current.inspection.completed_at) : -Infinity
    if (!current || nextTime > currentTime || (nextTime === currentTime && sortIndex > current.sortIndex)) {
      latestByDNumber.set(dNumber, { inspection, crane, sortIndex })
    }
  })

  const latestInspections = Array.from(latestByDNumber.values()).map((record) => record.inspection)
  const latestInspectionIds = latestInspections.map((inspection) => inspection.id)
  const latestSections = await fetchByInChunks<SectionRow>(
    'deshazo_external_report_sections',
    'id,inspection_row_id,section_name,section_index,section_order',
    'inspection_row_id',
    latestInspectionIds,
    (query) => query.eq('customer', customer),
  )
  const sectionById = new Map(latestSections.map((section) => [section.id, section]))
  const sectionsByInspectionId = new Map<string, SectionRow[]>()

  for (const section of latestSections) {
    const group = sectionsByInspectionId.get(section.inspection_row_id) ?? []
    group.push(section)
    sectionsByInspectionId.set(section.inspection_row_id, group)
  }

  const actionablePoints = await fetchByInChunks<PointRow>(
    'deshazo_external_report_points',
    'id,section_row_id,point_name,condition,remarks,point_index',
    'section_row_id',
    Array.from(sectionById.keys()),
    (query) => query.eq('customer', customer).in('condition', actionableConditions),
  )

  const pointsByInspectionId = new Map<string, PointRow[]>()
  for (const point of actionablePoints) {
    const section = sectionById.get(point.section_row_id)
    if (!section) continue
    const group = pointsByInspectionId.get(section.inspection_row_id) ?? []
    group.push(point)
    pointsByInspectionId.set(section.inspection_row_id, group)
  }

  let totalSafetyIssues = 0
  let totalMonitorIssues = 0

  const assets = Array.from(latestByDNumber.entries()).map<AssetRecord>(([dNumber, record]) => {
    const workOrder = workOrderById.get(record.crane.work_order_id)
    const latestSectionsForInspection = sectionsByInspectionId.get(record.inspection.id) ?? []
    const latestPoints = pointsByInspectionId.get(record.inspection.id) ?? []
    const issues = buildIssueRows(record.inspection, latestSectionsForInspection, latestPoints)
    const safetyIssueCount = issues.filter((issue) => issue.safety_category === 'safety').length
    const monitorIssueCount = issues.filter((issue) => issue.safety_category === 'monitor').length

    totalSafetyIssues += safetyIssueCount
    totalMonitorIssues += monitorIssueCount
    const locationOption = getCanonicalLocationOption(
      workOrder?.customer_location_name || workOrder?.service_location_name,
      locationLookup.aliases,
    )

    const unit: AssetUnit = {
      unit_id: dNumber,
      unit_name: buildAssetName(dNumber, record.crane.description),
      warehouse_location: locationOption?.label ?? normalizeText(workOrder?.customer_location_name || workOrder?.service_location_name),
      interior_location: normalizeText(record.crane.location),
      inspection_date: formatDateLabel(record.inspection.inspection_date ?? record.inspection.completed_at),
      safety_issue_count: safetyIssueCount,
      monitor_issue_count: monitorIssueCount,
    }

    return { unit, issues, sortIndex: record.sortIndex }
  })

  assets.sort((left, right) => {
    const leftTotal = left.unit.safety_issue_count + left.unit.monitor_issue_count
    const rightTotal = right.unit.safety_issue_count + right.unit.monitor_issue_count
    return rightTotal - leftTotal || left.sortIndex - right.sortIndex
  })

  return {
    assets,
    totalSafetyIssues,
    totalMonitorIssues,
    loadedAt: Date.now(),
  }
}

async function loadDataset(customer?: string) {
  const selectedCustomer = resolveSelectedCustomer(customer)
  const now = Date.now()
  if (cachedDataset && cachedDatasetCustomer === selectedCustomer && now - cachedDataset.loadedAt < cacheTtlMs) {
    return cachedDataset
  }
  if (pendingDataset && pendingDatasetCustomer === selectedCustomer) {
    return pendingDataset
  }

  pendingDatasetCustomer = selectedCustomer
  pendingDataset = (async () => {
    await requireAuthenticatedSession()

    try {
      cachedDataset = await loadDatasetFromViews(selectedCustomer)
      cachedDatasetCustomer = selectedCustomer
      pendingDataset = null
      pendingDatasetCustomer = ''
      return cachedDataset
    } catch {
      // Fall back to direct report-table loading if the compact views are unavailable.
    }

    cachedDataset = await loadDatasetFromTables(selectedCustomer)
    cachedDatasetCustomer = selectedCustomer
    pendingDataset = null
    pendingDatasetCustomer = ''
    return cachedDataset
  })().catch((error) => {
    pendingDataset = null
    pendingDatasetCustomer = ''
    throw error
  })

  return pendingDataset
}

export async function getSupabaseOpenRiskAssets(
  locations: string[] = [],
  currentPage = 0,
  customer?: string,
): Promise<AssetsPageAnalytics> {
  const dataset = await loadDataset(customer)
  const filteredAssets = dataset.assets.filter((asset) => matchesLocations(asset.unit, locations))
  const pageStart = Math.max(0, currentPage) * pageSize
  const pageAssets = filteredAssets.slice(pageStart, pageStart + pageSize)

  return {
    unit_array: pageAssets.map((asset) => asset.unit),
    total_unit_count: filteredAssets.length,
    total_safety_issues: filteredAssets.reduce((sum, asset) => sum + asset.unit.safety_issue_count, 0),
    total_monitor_issues: filteredAssets.reduce((sum, asset) => sum + asset.unit.monitor_issue_count, 0),
    total_pages: Math.max(1, Math.ceil(filteredAssets.length / pageSize)),
    current_page: currentPage,
  }
}

export async function getSupabaseAssetFleetServiced(customer?: string): Promise<AssetsServicedAnalytics> {
  const dataset = await loadDataset(customer)
  const locationLookup = await getCustomerLocationLookup(customer)
  const assetsByLocation = new Map<string, AssetRecord[]>()
  const locationLabelsByValue = new Map<string, string>()

  for (const asset of dataset.assets) {
    const locationOption = getCanonicalLocationOption(asset.unit.warehouse_location, locationLookup.aliases)
    if (!locationOption) continue
    const group = assetsByLocation.get(locationOption.value) ?? []
    group.push(asset)
    assetsByLocation.set(locationOption.value, group)
    locationLabelsByValue.set(locationOption.value, locationOption.label)
  }

  const knownLocationValues = new Set(locationLookup.options.map((location) => location.value))
  const assetOnlyLocations = Array.from(locationLabelsByValue.entries())
    .filter(([locationValue]) => !knownLocationValues.has(locationValue))
    .map(([value, label]) => ({ value, label }))

  const servicedAssets = [...locationLookup.options, ...assetOnlyLocations].map((locationOption) => {
    const locationValue = locationOption.value
    const group = assetsByLocation.get(locationValue) ?? []
    const assetCount = group.length
    const safetyIssueCount = group.reduce((sum, asset) => sum + asset.unit.safety_issue_count, 0)
    const monitorIssueCount = group.reduce((sum, asset) => sum + asset.unit.monitor_issue_count, 0)
    const totalOpenIssues = safetyIssueCount + monitorIssueCount

    return {
      location: locationOption.label,
      location_value: locationValue,
      total_units: assetCount,
      serviced_units: assetCount,
      checked_in_display: `${assetCount} Assets`,
      total_open_issues: totalOpenIssues,
      safety_issue_count: safetyIssueCount,
      monitor_issue_count: monitorIssueCount,
    }
  }).sort((left, right) => left.location.localeCompare(right.location))

  const totalAssets = servicedAssets.reduce((sum, location) => sum + location.total_units, 0)
  const totalSafetyIssues = servicedAssets.reduce((sum, location) => sum + (location.safety_issue_count ?? 0), 0)
  const totalMonitorIssues = servicedAssets.reduce((sum, location) => sum + (location.monitor_issue_count ?? 0), 0)
  const totalOpenIssues = totalSafetyIssues + totalMonitorIssues

  return {
    total_serviced_str: `${totalAssets} Assets`,
    total_units_count: totalAssets,
    serviced_units_count: totalAssets,
    total_open_issues: totalOpenIssues,
    safety_issue_count: totalSafetyIssues,
    monitor_issue_count: totalMonitorIssues,
    serviced_assets: servicedAssets,
  }
}

export async function getSupabaseAssetFleetAssets(
  locations: string[] = [],
  currentPage = 0,
  customer?: string,
): Promise<AssetsPageAnalytics> {
  return getSupabaseOpenRiskAssets(locations, currentPage, customer)
}

export async function getSupabaseOpenRiskAssetInfo(unitId: string, customer?: string): Promise<AssetInfoAnalytics> {
  const selectedCustomer = resolveSelectedCustomer(customer)
  const dNumber = normalizeText(unitId).toUpperCase()
  const tableDetail = await loadLatestAssetDetailFromTables(dNumber, selectedCustomer)
  if (tableDetail) return tableDetail

  const dataset = await loadDataset(selectedCustomer)
  const asset = dataset.assets.find((item) => item.unit.unit_id.toUpperCase() === dNumber)

  if (!asset) {
    throw new Error(`No Supabase ${selectedCustomer} asset was found for ${unitId}.`)
  }

  return {
    unit_location: asset.unit.warehouse_location,
    unit_internal_location: asset.unit.interior_location,
    unit_name: asset.unit.unit_name,
    issues: asset.issues,
  }
}

export async function getSupabaseOpenRiskRecurringIssues(unitId: string, customer?: string): Promise<RecurringIssue[]> {
  await requireAuthenticatedSession()
  const selectedCustomer = resolveSelectedCustomer(customer)
  const dNumber = normalizeText(unitId).toUpperCase()
  if (!dNumber) return []

  try {
    const rows = await fetchAll<IssueViewRow>(
      'deshazo_open_risk_issue_rows',
      'unit_id,category,inspection_date,completed_at',
      (query) => query.eq('customer', selectedCustomer).eq('unit_id', dNumber),
      1000,
    )
    const cutoff = Date.now() - recurringWindowMs
    const categoryCounts = new Map<string, number>()

    for (const row of rows) {
      const issueTime = getDateTime(row.inspection_date ?? row.completed_at)
      if (issueTime < cutoff) continue
      const category = normalizeText(row.category) || 'uncategorized'
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1)
    }

    return Array.from(categoryCounts.entries())
      .filter(([, occurrences]) => occurrences > 4)
      .map(([category_display_name, occurrences]) => ({ category_display_name, occurrences }))
      .sort((left, right) => right.occurrences - left.occurrences || left.category_display_name.localeCompare(right.category_display_name))
  } catch (error) {
    if (!isMissingViewError(error)) {
      throw error
    }
  }

  const cranes = await fetchAll<CraneRow>(
    'deshazo_external_report_cranes',
    'id,work_order_id,contact_code,description,location',
    (query) => query.eq('customer', selectedCustomer).eq('contact_code', dNumber),
  )
  if (cranes.length === 0) return []

  const workOrders = await fetchByInChunks<WorkOrderRow>(
    'deshazo_external_work_orders',
    'work_order_id,bill_to_name,customer,customer_location_name,service_location_name',
    'work_order_id',
    cranes.map((crane) => crane.work_order_id),
    (query) => query.eq('customer', selectedCustomer),
  )
  const customerWorkOrderIds = new Set(workOrders.map((workOrder) => workOrder.work_order_id))
  const customerCranes = cranes.filter((crane) => customerWorkOrderIds.has(crane.work_order_id))
  if (customerCranes.length === 0) return []

  const inspections = await fetchByInChunks<InspectionRow>(
    'deshazo_external_report_inspections',
    'id,crane_row_id,inspection_date,completed_at',
    'crane_row_id',
    customerCranes.map((crane) => crane.id),
    (query) => query.eq('customer', selectedCustomer),
  )
  const sections = await fetchByInChunks<SectionRow>(
    'deshazo_external_report_sections',
    'id,inspection_row_id,section_name,section_index,section_order',
    'inspection_row_id',
    inspections.map((inspection) => inspection.id),
    (query) => query.eq('customer', selectedCustomer),
  )
  const sectionById = new Map(sections.map((section) => [section.id, section]))
  const sectionsByInspectionId = new Map<string, SectionRow[]>()
  for (const section of sections) {
    const group = sectionsByInspectionId.get(section.inspection_row_id) ?? []
    group.push(section)
    sectionsByInspectionId.set(section.inspection_row_id, group)
  }
  const points = await fetchByInChunks<PointRow>(
    'deshazo_external_report_points',
    'id,section_row_id,point_name,condition,remarks,point_index',
    'section_row_id',
    Array.from(sectionById.keys()),
    (query) => query.eq('customer', selectedCustomer).in('condition', actionableConditions),
  )
  const pointsByInspectionId = new Map<string, PointRow[]>()
  for (const point of points) {
    const section = sectionById.get(point.section_row_id)
    if (!section) continue
    const group = pointsByInspectionId.get(section.inspection_row_id) ?? []
    group.push(point)
    pointsByInspectionId.set(section.inspection_row_id, group)
  }

  const cutoff = Date.now() - recurringWindowMs
  const categoryCounts = new Map<string, number>()

  for (const inspection of inspections) {
    const issueTime = getDateTime(inspection.inspection_date ?? inspection.completed_at)
    if (issueTime < cutoff) continue
    const issues = buildIssueRows(
      inspection,
      sectionsByInspectionId.get(inspection.id) ?? [],
      pointsByInspectionId.get(inspection.id) ?? [],
    )
    for (const issue of issues) {
      const category = issue.category || 'uncategorized'
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1)
    }
  }

  return Array.from(categoryCounts.entries())
    .filter(([, occurrences]) => occurrences > 4)
    .map(([category_display_name, occurrences]) => ({ category_display_name, occurrences }))
    .sort((left, right) => right.occurrences - left.occurrences || left.category_display_name.localeCompare(right.category_display_name))
}
