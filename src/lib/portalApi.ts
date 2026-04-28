type ParseFunctionBody = Record<string, unknown>

const defaultParseBaseUrl =
  'https://blockstamp-production-2b9f8bfc27a8.herokuapp.com/parse/functions'

const parseBaseUrl =
  (import.meta.env.VITE_PORTAL_PARSE_BASE_URL as string | undefined)?.trim() ||
  defaultParseBaseUrl

const parseAppId =
  (import.meta.env.VITE_PORTAL_PARSE_APP_ID as string | undefined)?.trim() ||
  'blockstampprod395969600'

const parseRestApiKey = (import.meta.env.VITE_PORTAL_PARSE_REST_API_KEY as string | undefined)?.trim() || ''

// Avoid exposing a master key in the browser if possible.
// Prefer a server-side proxy for privileged Parse functions.
const parseMasterKey = (import.meta.env.VITE_PORTAL_PARSE_MASTER_KEY as string | undefined)?.trim() || ''

const isPortalApiConfigured =
  parseBaseUrl.startsWith('http') && parseAppId.length > 0 && (parseRestApiKey.length > 0 || parseMasterKey.length > 0)

const buildParseHeaders = () => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Parse-Application-Id': parseAppId,
  }

  if (parseRestApiKey) {
    headers['X-Parse-REST-API-Key'] = parseRestApiKey
  }

  if (parseMasterKey) {
    headers['X-Parse-Master-Key'] = parseMasterKey
  }

  return headers
}

export async function callParseFunction<TResponse>(
  functionName: string,
  body: ParseFunctionBody = {},
  signal?: AbortSignal,
): Promise<TResponse> {
  if (!isPortalApiConfigured) {
    throw new Error(
      'Portal API is not configured. Add VITE_PORTAL_PARSE_REST_API_KEY or proxy this request through a backend.',
    )
  }

  const response = await fetch(`${parseBaseUrl}/${functionName}`, {
    method: 'POST',
    headers: buildParseHeaders(),
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Portal API request failed with status ${response.status}`)
  }

  return (await response.json()) as TResponse
}

export type LocationAnalytics = {
  location: string
  total_units: number
  total_invoices: number
  average_invoice_cost: number
  total_invoice_cost: number
  total_equipment_cost: number
  total_labor_cost: number
  total_parts_cost: number
}

export type TopLineSpendAnalytics = {
  total_equipment_spend: number
  total_labor_spend: number
  total_spend: number
  total_invoices: number
  topline_start_str: string
}

export type SpendTypeAnalytics = {
  category: string
  spend: number
}

export type MoMSpendAnalytics = {
  month: string
  spend: number
}

export type LocationSpendAnalytics = {
  location: string
  spend: number
}

export type TopIssueAnalytics = {
  category: string
  total: number
}

export type PortalPdfDocument = {
  inspection_date: string
  pdf: string
  type: string
  display_name: string
  location: string
}

export type ServicedAsset = {
  location: string
  location_value: string
  total_units: number
  serviced_units: number
  checked_in_display: string
}

export type AssetsServicedAnalytics = {
  total_serviced_str: string
  total_units_count: number
  serviced_units_count: number
  serviced_assets: ServicedAsset[]
}

export type AssetUnit = {
  unit_name: string
  unit_id: string
  warehouse_location: string
  interior_location: string
  inspection_date?: string
  safety_issue_count: number
  monitor_issue_count: number
}

export type AssetsPageAnalytics = {
  unit_array: AssetUnit[]
  total_unit_count?: number
  total_units_count?: number
  total_safety_issues?: number
  total_monitor_issues?: number
  total_pages?: number
  current_page?: number
  safety_issue_count?: number
  monitor_issue_count?: number
}

export type AssetIssue = {
  category: string
  safety_category: string
  remarks: string
  component_type: string
  inspection_date: string
}

export type AssetInfoAnalytics = {
  unit_location: string
  unit_internal_location: string
  unit_name: string
  issues: AssetIssue[]
}

export type RecurringIssue = {
  category_display_name: string
  occurrences: number
}

export type AssetPdfDocument = {
  inspection_date: string
  pdf: string
  type: string
  display_name: string
}

export type AssetPdfResponse = {
  results: AssetPdfDocument[]
  page: number
  page_size: number
  total_invoice_count: number
  total_pages: number
}

export type AssetPdfPageMatch = {
  document: AssetPdfDocument
  pageNumber: number
}

export type AssetPdfPageLookupResponse = {
  match: AssetPdfPageMatch | null
}

function extractArrayPayload<T>(value: unknown): T[] | null {
  if (Array.isArray(value)) {
    return value as T[]
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>

    if ('result' in record) {
      const fromResult = extractArrayPayload<T>(record.result)
      if (fromResult) return fromResult
    }

    if ('data' in record) {
      const fromData = extractArrayPayload<T>(record.data)
      if (fromData) return fromData
    }
  }

  return null
}

function extractObjectPayload<T>(value: unknown): T | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>

    if ('result' in record) {
      const fromResult = extractObjectPayload<T>(record.result)
      if (fromResult) return fromResult
    }

    if ('data' in record) {
      const fromData = extractObjectPayload<T>(record.data)
      if (fromData) return fromData
    }

    return value as T
  }

  return null
}

export async function getLocationAnalytics(signal?: AbortSignal) {
  const response = await callParseFunction<unknown>(
    'getLocationAnalytics',
    {},
    signal,
  )

  const data = extractArrayPayload<LocationAnalytics>(response)
  if (data) {
    return data
  }

  throw new Error('Location analytics returned an unexpected response shape.')
}

export async function getTopLineSpendAnalytics(signal?: AbortSignal) {
  const response = await callParseFunction<unknown>('getTopLineSpendAnalytics', {}, signal)

  const data = extractObjectPayload<TopLineSpendAnalytics>(response)
  if (data) {
    return data
  }

  throw new Error('Top line spend analytics returned an unexpected response shape.')
}

export async function getSpendTypes(signal?: AbortSignal) {
  const response = await callParseFunction<unknown>('getSpendTypes', {}, signal)

  const data = extractArrayPayload<SpendTypeAnalytics>(response)
  if (data) {
    return data
  }

  throw new Error('Spend types returned an unexpected response shape.')
}

export async function getMoMSpend(signal?: AbortSignal) {
  const response = await callParseFunction<unknown>('getMoMSpend', {}, signal)

  const data = extractArrayPayload<MoMSpendAnalytics>(response)
  if (data) {
    return data
  }

  throw new Error('Month over month spend returned an unexpected response shape.')
}

export async function getAvgMoM(signal?: AbortSignal) {
  const response = await callParseFunction<unknown>('getAvgMoM', {}, signal)

  const data = extractArrayPayload<MoMSpendAnalytics>(response)
  if (data) {
    return data
  }

  throw new Error('Average month over month values returned an unexpected response shape.')
}

export async function getLocationSpend(signal?: AbortSignal) {
  const response = await callParseFunction<unknown>('getLocationSpend', {}, signal)

  const data = extractArrayPayload<LocationSpendAnalytics>(response)
  if (data) {
    return data
  }

  throw new Error('Location spend returned an unexpected response shape.')
}

export async function getTopIssue(signal?: AbortSignal) {
  const response = await callParseFunction<unknown>('getTopIssue', {}, signal)

  const data = extractArrayPayload<TopIssueAnalytics>(response)
  if (data) {
    return data
  }

  throw new Error('Top issue analytics returned an unexpected response shape.')
}

export async function getAllPDFs(locations: string[] = [], signal?: AbortSignal) {
  const response = await callParseFunction<unknown>('getAllPDFs', { locations }, signal)

  const data = extractArrayPayload<PortalPdfDocument>(response)
  if (data) {
    return data
  }

  throw new Error('PDF documents returned an unexpected response shape.')
}

export async function getAssetsServiced(signal?: AbortSignal) {
  const response = await callParseFunction<unknown>('getAssetsServiced', {}, signal)

  const data = extractObjectPayload<AssetsServicedAnalytics>(response)
  if (data) {
    return data
  }

  throw new Error('Assets serviced analytics returned an unexpected response shape.')
}

export async function getAssets(locations: string[] = [], currentPage = 0, signal?: AbortSignal) {
  const response = await callParseFunction<unknown>('getAssets', { locations, current_page: currentPage }, signal)

  const data = extractObjectPayload<AssetsPageAnalytics>(response)
  if (data) {
    return data
  }

  throw new Error('Assets page returned an unexpected response shape.')
}

export async function getAssetInfo(unitId: string, signal?: AbortSignal) {
  const response = await callParseFunction<unknown>('getAssetInfo', { unit_id: unitId }, signal)

  const data = extractObjectPayload<AssetInfoAnalytics>(response)
  if (data) {
    return data
  }

  throw new Error('Asset info returned an unexpected response shape.')
}

export async function getAssetPDF(unitId: string, page: number, signal?: AbortSignal) {
  const response = await callParseFunction<unknown>(
    'getAssetPDF',
    { unit_id: unitId, page: String(page), include_meta: true },
    signal,
  )

  const data = extractObjectPayload<AssetPdfResponse>(response)
  if (data) {
    return data
  }

  throw new Error('Asset PDF documents returned an unexpected response shape.')
}

export async function findAssetPdfPage(
  unitId: string,
  dNumber: string,
  targetInspectionDate: string,
  signal?: AbortSignal,
) {
  const response = await callParseFunction<unknown>(
    'findAssetPdfPage',
    {
      unit_id: unitId,
      dNumber,
      ...(targetInspectionDate ? { targetInspectionDate } : {}),
    },
    signal,
  )

  const payload = extractObjectPayload<AssetPdfPageLookupResponse>(response)
  if (payload && 'match' in payload) {
    return payload
  }

  throw new Error('Asset PDF page lookup returned an unexpected response shape.')
}

export async function getRecurringIssues(unitId: string, signal?: AbortSignal) {
  const response = await callParseFunction<unknown>('getRecurringIssues', { unit_id: unitId }, signal)

  const unwrapped = response && typeof response === 'object' && !Array.isArray(response)
    ? (response as Record<string, unknown>)
    : null

  const inner = unwrapped?.result ?? unwrapped
  const arr = inner && typeof inner === 'object' && !Array.isArray(inner)
    ? (inner as Record<string, unknown>).recurring_issues
    : null

  if (Array.isArray(arr)) {
    return arr as RecurringIssue[]
  }

  throw new Error('Recurring issues returned an unexpected response shape.')
}

export { isPortalApiConfigured }
