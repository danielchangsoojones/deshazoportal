import { supabase } from './supabase'
import type {
  AssetInfoAnalytics,
  AssetIssue,
  AssetsPageAnalytics,
  AssetUnit,
  RecurringIssue,
} from './portalApi'

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

let cachedDataset: OpenRiskDataset | null = null
let pendingDataset: Promise<OpenRiskDataset> | null = null

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
  buildQuery?: (query: any) => any,
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
          query = buildQuery(query) as typeof query
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
  buildQuery?: (query: any) => any,
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

function parseRemarkText(value: unknown) {
  if (value == null || value === '') return ['']
  if (typeof value === 'string') return [value]
  if (!Array.isArray(value)) return [String(value)]

  if (value.length === 0) return ['']

  return value.map((item) => {
    if (item == null) return ''
    if (typeof item === 'string') return item
    if (typeof item === 'object') {
      const record = item as Record<string, unknown>
      const candidate = record.Remark ?? record.remark ?? record.notes ?? record.value ?? record.text
      return typeof candidate === 'string' ? candidate : ''
    }
    return String(item)
  })
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

function getLocationValue(unit: AssetUnit) {
  return normalizeKey(unit.warehouse_location)
}

function matchesLocations(unit: AssetUnit, locations: string[]) {
  if (locations.length === 0) return true
  const value = getLocationValue(unit)
  return locations.some((location) => value.includes(location.replace(/_([a-z]{2})$/, '')) || value === location)
}

function isWabashWorkOrder(workOrder: WorkOrderRow) {
  return /wabash/i.test([
    workOrder.bill_to_name,
    workOrder.customer,
    workOrder.customer_location_name,
    workOrder.service_location_name,
  ].filter(Boolean).join(' '))
}

function buildAssetName(dNumber: string, description?: string | null) {
  const cleanDescription = normalizeText(description)
  return cleanDescription ? `${dNumber} ${cleanDescription}` : dNumber
}

function buildIssueRows(
  inspection: InspectionRow,
  sections: SectionRow[],
  points: PointRow[],
) {
  const sectionLabels = buildSectionComponentLabels(sections)
  const sectionById = new Map(sections.map((section) => [section.id, section]))
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

    for (const remark of parseRemarkText(point.remarks)) {
      issues.push({
        category: normalizeText(point.point_name).toLowerCase(),
        safety_category: safetyCategory,
        inspection_date: formatDateLabel(inspection.inspection_date ?? inspection.completed_at) ?? '',
        component_type: sectionLabels.get(point.section_row_id) ?? 'component_1',
        remarks: remark,
      })
    }
  }

  return issues
}

async function loadDataset() {
  const now = Date.now()
  if (cachedDataset && now - cachedDataset.loadedAt < cacheTtlMs) {
    return cachedDataset
  }
  if (pendingDataset) {
    return pendingDataset
  }

  pendingDataset = (async () => {
    await requireAuthenticatedSession()

    const workOrders = await fetchAll<WorkOrderRow>(
      'deshazo_external_work_orders',
      'work_order_id,bill_to_name,customer,customer_location_name,service_location_name',
      undefined,
      500,
    )
    const wabashWorkOrders = workOrders.filter(isWabashWorkOrder)
    const workOrderById = new Map(wabashWorkOrders.map((workOrder) => [workOrder.work_order_id, workOrder]))
    const wabashCranes = await fetchByInChunks<CraneRow>(
      'deshazo_external_report_cranes',
      'id,work_order_id,contact_code,description,location',
      'work_order_id',
      Array.from(workOrderById.keys()),
    )
    const wabashCranesWithDNumbers = wabashCranes.filter((crane) => normalizeText(crane.contact_code))
    const craneById = new Map(wabashCranesWithDNumbers.map((crane) => [crane.id, crane]))
    const wabashInspections = await fetchByInChunks<InspectionRow>(
      'deshazo_external_report_inspections',
      'id,crane_row_id,inspection_date,completed_at',
      'crane_row_id',
      Array.from(craneById.keys()),
    )

    const latestByDNumber = new Map<string, { inspection: InspectionRow; crane: CraneRow; sortIndex: number }>()
    wabashInspections.forEach((inspection, sortIndex) => {
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
      (query) => query.in('condition', actionableConditions),
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
      const latestSections = sectionsByInspectionId.get(record.inspection.id) ?? []
      const latestPoints = pointsByInspectionId.get(record.inspection.id) ?? []
      const issues = buildIssueRows(record.inspection, latestSections, latestPoints)
      const safetyIssueCount = issues.filter((issue) => issue.safety_category === 'safety').length
      const monitorIssueCount = issues.filter((issue) => issue.safety_category === 'monitor').length

      totalSafetyIssues += safetyIssueCount
      totalMonitorIssues += monitorIssueCount

      const unit: AssetUnit = {
        unit_id: dNumber,
        unit_name: buildAssetName(dNumber, record.crane.description),
        warehouse_location: normalizeText(workOrder?.customer_location_name || workOrder?.service_location_name),
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
      return rightTotal - leftTotal || left.sortIndex - right.sortIndex || left.unit.unit_id.localeCompare(right.unit.unit_id)
    })

    cachedDataset = {
      assets,
      totalSafetyIssues,
      totalMonitorIssues,
      loadedAt: Date.now(),
    }
    pendingDataset = null
    return cachedDataset
  })().catch((error) => {
    pendingDataset = null
    throw error
  })

  return pendingDataset
}

export async function getSupabaseOpenRiskAssets(
  locations: string[] = [],
  currentPage = 0,
): Promise<AssetsPageAnalytics> {
  const dataset = await loadDataset()
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

export async function getSupabaseOpenRiskAssetInfo(unitId: string): Promise<AssetInfoAnalytics> {
  const dataset = await loadDataset()
  const dNumber = normalizeText(unitId).toUpperCase()
  const asset = dataset.assets.find((item) => item.unit.unit_id.toUpperCase() === dNumber)

  if (!asset) {
    throw new Error(`No Supabase Wabash asset was found for ${unitId}.`)
  }

  return {
    unit_location: asset.unit.warehouse_location,
    unit_internal_location: asset.unit.interior_location,
    unit_name: asset.unit.unit_name,
    issues: asset.issues,
  }
}

export async function getSupabaseOpenRiskRecurringIssues(unitId: string): Promise<RecurringIssue[]> {
  await requireAuthenticatedSession()
  const dNumber = normalizeText(unitId).toUpperCase()
  if (!dNumber) return []

  const cranes = await fetchAll<CraneRow>(
    'deshazo_external_report_cranes',
    'id,work_order_id,contact_code,description,location',
    (query) => query.eq('contact_code', dNumber),
  )
  if (cranes.length === 0) return []

  const workOrders = await fetchByInChunks<WorkOrderRow>(
    'deshazo_external_work_orders',
    'work_order_id,bill_to_name,customer,customer_location_name,service_location_name',
    'work_order_id',
    cranes.map((crane) => crane.work_order_id),
  )
  const wabashWorkOrderIds = new Set(workOrders.filter(isWabashWorkOrder).map((workOrder) => workOrder.work_order_id))
  const wabashCranes = cranes.filter((crane) => wabashWorkOrderIds.has(crane.work_order_id))
  if (wabashCranes.length === 0) return []

  const inspections = await fetchByInChunks<InspectionRow>(
    'deshazo_external_report_inspections',
    'id,crane_row_id,inspection_date,completed_at',
    'crane_row_id',
    wabashCranes.map((crane) => crane.id),
  )
  const sections = await fetchByInChunks<SectionRow>(
    'deshazo_external_report_sections',
    'id,inspection_row_id,section_name,section_index,section_order',
    'inspection_row_id',
    inspections.map((inspection) => inspection.id),
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
    (query) => query.in('condition', actionableConditions),
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
