/**
 * D# (DeShazo crane number) search.
 *
 * The portal identifies an asset by its crane `contact_code` (for example `D012345`),
 * stored in Supabase `deshazo_external_report_cranes` and scoped by `customer`.
 * AssetInfo and the Asset Fleet list both key on that value through `?unit_id=`, so
 * the search resolves free-form input to a D# and links there.
 *
 * Every lookup is customer scoped: placeholder D#s such as `D000000` exist under many
 * customers, and a portal user must only reach assets of the customer they are viewing.
 *
 * Query shape is chosen for the live `(customer, contact_code)` btree index. The
 * database collation is `en_US.UTF-8`, where `LIKE 'D12%'` cannot use that index
 * (about 1s on Wabash), so prefix lookups use an equivalent half-open range instead
 * (`>= 'D12' AND < 'D13'`, about 2ms).
 *
 * This module intentionally has no runtime imports so it can be unit tested with
 * `node --test`; the Supabase client is injected by the caller.
 */

export const D_NUMBER_TABLE = 'deshazo_external_report_cranes'
/** Canonical D# shape in the data: `D` + 6 digits (9,088 of 9,090 distinct values). */
export const D_NUMBER_DIGITS = 6
/** Shortest normalized input (including the `D`) that triggers suggestions, e.g. `D52`. */
export const MIN_SUGGESTION_LENGTH = 3
export const MAX_SUGGESTIONS = 8

// Each D# appears once per work order (about 24 rows per D# on average), so the scans
// fetch enough rows to collect distinct D#s. Responses are small and compress well.
const SUGGESTION_SCAN_LIMIT = 1000
const EXACT_SCAN_LIMIT = 200
const DETAIL_SCAN_LIMIT = 500

const VALID_D_NUMBER = /^D\d[0-9A-Z]{0,10}$/
const DIGIT_D_NUMBER = /^D(\d+)$/

export type DNumberQuery = {
  /** Uppercased input with separators removed, `D` added to digits-only input. */
  normalized: string
  isValid: boolean
  /** Values an exact lookup should match, most likely first. */
  exactCandidates: string[]
  /** Half-open range covering every D# that starts with `normalized`. */
  prefixRange: { lower: string; upper: string } | null
}

export type DNumberMatch = {
  dNumber: string
  description: string
  location: string
  latestWorkOrderId: number | null
}

export type DNumberSearchErrorKind = 'aborted' | 'session' | 'network' | 'config' | 'unknown'

export class DNumberSearchError extends Error {
  readonly kind: DNumberSearchErrorKind

  constructor(kind: DNumberSearchErrorKind, message: string) {
    super(message)
    this.name = 'DNumberSearchError'
    this.kind = kind
  }
}

type BackendError = { message?: string | null; code?: string | null; name?: string | null; status?: number | null }
type BackendResponse = { data: unknown[] | null; error: BackendError | null }

/** The subset of the supabase-js query builder this module uses. */
export interface DNumberQueryBuilder extends PromiseLike<BackendResponse> {
  eq(column: string, value: string): DNumberQueryBuilder
  in(column: string, values: readonly string[]): DNumberQueryBuilder
  or(filters: string): DNumberQueryBuilder
  order(column: string, options?: { ascending?: boolean }): DNumberQueryBuilder
  limit(count: number): DNumberQueryBuilder
  abortSignal(signal: AbortSignal): DNumberQueryBuilder
}

/** The subset of the supabase-js client this module uses. */
export interface DNumberSearchClient {
  auth: {
    getSession(): PromiseLike<{ data: { session: unknown | null }; error: BackendError | null }>
  }
  from(table: string): { select(columns: string): DNumberQueryBuilder }
}

export type DNumberSearchOptions = {
  /** Customer filter value as stored in Supabase, e.g. `wabash`. */
  customer: string
  input: string
  signal?: AbortSignal
}

type CraneRow = {
  contact_code?: string | null
  description?: string | null
  location?: string | null
  work_order_id?: number | string | null
}

export function normalizeDNumberInput(raw: string | null | undefined): string {
  const compact = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!compact) return ''
  return /^\d+$/.test(compact) ? `D${compact}` : compact
}

/**
 * Smallest string greater than every string starting with `prefix`, for a `D` + digits
 * prefix: `D0129` -> `D013`, `D52` -> `D53`, `D999` -> `E`.
 */
export function getPrefixUpperBound(prefix: string): string {
  const head = prefix.replace(/9+$/, '')
  if (head === 'D') return 'E'
  return `${head.slice(0, -1)}${Number(head.slice(-1)) + 1}`
}

export function parseDNumberQuery(raw: string | null | undefined): DNumberQuery {
  const normalized = normalizeDNumberInput(raw)
  if (!VALID_D_NUMBER.test(normalized)) {
    return { normalized, isValid: false, exactCandidates: [], prefixRange: null }
  }

  const candidates = new Set([normalized])
  const digits = DIGIT_D_NUMBER.exec(normalized)?.[1]
  if (digits) {
    if (digits.length < D_NUMBER_DIGITS) {
      // `12345` and `D12345` usually mean `D012345`.
      candidates.add(`D${digits.padStart(D_NUMBER_DIGITS, '0')}`)
    } else if (digits.length > D_NUMBER_DIGITS) {
      // `D0012345` -> `D012345`: drop surplus leading zeros only.
      candidates.add(`D${digits.replace(new RegExp(`^0+(?=\\d{${D_NUMBER_DIGITS}})`), '')}`)
    }
  }

  const prefixRange = digits && normalized.length >= MIN_SUGGESTION_LENGTH
    ? { lower: normalized, upper: getPrefixUpperBound(normalized) }
    : null

  return { normalized, isValid: true, exactCandidates: Array.from(candidates), prefixRange }
}

/**
 * PostgREST `or` filter for suggestions: the prefix range plus any exact candidates
 * outside it (such as the zero-padded form). Values are validated `[0-9A-Z]`, so they
 * need no escaping.
 */
export function buildSuggestionFilter(query: DNumberQuery): string | null {
  if (!query.isValid || query.normalized.length < MIN_SUGGESTION_LENGTH) return null

  const parts: string[] = []
  const range = query.prefixRange
  if (range) {
    parts.push(`and(contact_code.gte.${range.lower},contact_code.lt.${range.upper})`)
  }

  const outsideRange = query.exactCandidates.filter(
    (candidate) => !range || candidate < range.lower || candidate >= range.upper,
  )
  if (outsideRange.length > 0) {
    parts.push(`contact_code.in.(${outsideRange.join(',')})`)
  }

  return parts.length > 0 ? parts.join(',') : null
}

function normalizeCode(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function toWorkOrderId(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : null
}

/** Distinct D#s, exact candidates first (in candidate order), then ascending. */
export function rankDNumbers(codes: readonly unknown[], exactCandidates: readonly string[], limit = MAX_SUGGESTIONS) {
  const distinct = new Set(codes.map(normalizeCode).filter(Boolean))
  const exact = exactCandidates.filter((candidate) => distinct.has(candidate))
  const rest = Array.from(distinct)
    .filter((code) => !exact.includes(code))
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
  return [...exact, ...rest].slice(0, Math.max(0, limit))
}

/**
 * Collapse one-row-per-work-order crane rows into one match per D#, using the most
 * recent work order for the description and location. Results follow `order`; a D#
 * without detail rows is still returned.
 */
export function collapseCraneRows(rows: readonly CraneRow[], order: readonly string[]): DNumberMatch[] {
  const latest = new Map<string, DNumberMatch>()

  for (const row of rows) {
    const dNumber = normalizeCode(row.contact_code)
    if (!dNumber) continue

    const workOrderId = toWorkOrderId(row.work_order_id)
    const current = latest.get(dNumber)
    const isNewer = !current || (workOrderId ?? -Infinity) > (current.latestWorkOrderId ?? -Infinity)
    if (isNewer) {
      latest.set(dNumber, {
        dNumber,
        description: normalizeText(row.description) || current?.description || '',
        location: normalizeText(row.location) || current?.location || '',
        latestWorkOrderId: workOrderId,
      })
    } else {
      // Older rows only fill gaps the latest row left empty.
      current.description ||= normalizeText(row.description)
      current.location ||= normalizeText(row.location)
    }
  }

  return order.map((dNumber) => latest.get(dNumber) ?? { dNumber, description: '', location: '', latestWorkOrderId: null })
}

export function toDNumberSearchError(error: unknown): DNumberSearchError {
  if (error instanceof DNumberSearchError) return error

  const record = (error && typeof error === 'object' ? error : {}) as BackendError
  const name = normalizeText(record.name)
  const code = normalizeText(record.code)
  const message = normalizeText(record.message) || (typeof error === 'string' ? error : '') || 'Unknown search error.'

  // postgrest-js reports a failed fetch as an error object `{ message: '<Name>: <msg>', code: '<code>' }`.
  if (name === 'AbortError' || code === '20' || /^AbortError\b|\baborted\b/i.test(message)) {
    return new DNumberSearchError('aborted', message)
  }
  if (record.status === 401 || /^PGRST30\d$/.test(code) || /jwt|not authenticated|session/i.test(message)) {
    return new DNumberSearchError('session', message)
  }
  if (name === 'TypeError' || /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message)) {
    return new DNumberSearchError('network', message)
  }
  return new DNumberSearchError('unknown', message)
}

/** User-facing copy for a failed search. */
export function describeDNumberSearchError(error: DNumberSearchError) {
  switch (error.kind) {
    case 'session':
      return 'Your session expired. Sign in again to search.'
    case 'network':
      return 'Search is unreachable. Check your connection and try again.'
    case 'config':
      return 'Search is unavailable right now.'
    case 'aborted':
      return ''
    default:
      return 'Search failed. Please try again.'
  }
}

export function buildAssetInfoHref(assetInfoPath: string, dNumber: string) {
  return `${assetInfoPath}?unit_id=${encodeURIComponent(dNumber)}`
}

function withSignal(builder: DNumberQueryBuilder, signal?: AbortSignal) {
  return signal ? builder.abortSignal(signal) : builder
}

async function run(builder: DNumberQueryBuilder) {
  let response: BackendResponse
  try {
    response = await builder
  } catch (error) {
    throw toDNumberSearchError(error)
  }
  if (response.error) throw toDNumberSearchError(response.error)
  return (response.data ?? []) as CraneRow[]
}

async function ensureSession(client: DNumberSearchClient) {
  let result: Awaited<ReturnType<DNumberSearchClient['auth']['getSession']>>
  try {
    result = await client.auth.getSession()
  } catch (error) {
    throw toDNumberSearchError(error)
  }
  if (result.error || !result.data.session) {
    throw new DNumberSearchError('session', result.error?.message || 'No active session.')
  }
}

function requireCustomer(customer: string) {
  const value = customer.trim()
  if (!value) throw new DNumberSearchError('config', 'No customer is selected.')
  return value
}

/**
 * Resolve input to the matching D#s for one customer. Usually zero or one match; more
 * than one when, for example, both `D12345` and `D012345` exist.
 */
export async function findDNumberMatches(
  client: DNumberSearchClient,
  { customer, input, signal }: DNumberSearchOptions,
): Promise<DNumberMatch[]> {
  const query = parseDNumberQuery(input)
  if (!query.isValid) return []
  const customerValue = requireCustomer(customer)
  await ensureSession(client)

  const rows = await run(withSignal(
    client
      .from(D_NUMBER_TABLE)
      .select('contact_code,description,location,work_order_id')
      .eq('customer', customerValue)
      .in('contact_code', query.exactCandidates)
      .order('work_order_id', { ascending: false })
      .limit(EXACT_SCAN_LIMIT),
    signal,
  ))

  const order = rankDNumbers(rows.map((row) => row.contact_code), query.exactCandidates, query.exactCandidates.length)
  return collapseCraneRows(rows, order)
}

/** Typeahead suggestions: D#s starting with the input, exact or zero-padded matches first. */
export async function suggestDNumbers(
  client: DNumberSearchClient,
  { customer, input, signal, limit = MAX_SUGGESTIONS }: DNumberSearchOptions & { limit?: number },
): Promise<DNumberMatch[]> {
  const query = parseDNumberQuery(input)
  const filter = buildSuggestionFilter(query)
  if (!filter) return []
  const customerValue = requireCustomer(customer)
  await ensureSession(client)

  const codeRows = await run(withSignal(
    client
      .from(D_NUMBER_TABLE)
      .select('contact_code')
      .eq('customer', customerValue)
      .or(filter)
      .order('contact_code', { ascending: true })
      .limit(SUGGESTION_SCAN_LIMIT),
    signal,
  ))

  const codes = rankDNumbers(codeRows.map((row) => row.contact_code), query.exactCandidates, limit)
  if (codes.length === 0) return []

  const detailRows = await run(withSignal(
    client
      .from(D_NUMBER_TABLE)
      .select('contact_code,description,location,work_order_id')
      .eq('customer', customerValue)
      .in('contact_code', codes)
      .order('work_order_id', { ascending: false })
      .limit(DETAIL_SCAN_LIMIT),
    signal,
  ))

  return collapseCraneRows(detailRows, codes)
}
