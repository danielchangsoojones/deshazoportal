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

export { isPortalApiConfigured }
