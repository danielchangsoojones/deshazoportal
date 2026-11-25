import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

async function importTypeScriptModule(sourcePath) {
  const source = await readFile(sourcePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  })
  const tempDir = await mkdtemp(join(tmpdir(), 'deshazo-dnumber-search-'))
  const modulePath = join(tempDir, 'dNumberSearch.mjs')
  await writeFile(modulePath, transpiled.outputText)
  // A file:// URL keeps the dynamic import working on Windows, where absolute paths are not valid specifiers.
  return import(pathToFileURL(modulePath).href)
}

const search = await importTypeScriptModule(new URL('../src/lib/dNumberSearch.ts', import.meta.url))

/**
 * Minimal stand-in for the supabase-js client. `respond(call)` receives the recorded
 * query ({ table, columns, filters }) and returns `{ data, error }` or throws.
 */
function createFakeClient({ respond, session = { user: { id: 'user-1' } }, sessionError = null } = {}) {
  const calls = []

  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: sessionError }),
    },
    from(table) {
      return {
        select(columns) {
          const call = { table, columns, filters: [], signal: null }
          calls.push(call)
          const builder = {
            eq: (column, value) => (call.filters.push(['eq', column, value]), builder),
            in: (column, values) => (call.filters.push(['in', column, [...values]]), builder),
            or: (filters) => (call.filters.push(['or', filters]), builder),
            order: (column, options) => (call.filters.push(['order', column, options?.ascending ?? true]), builder),
            limit: (count) => (call.filters.push(['limit', count]), builder),
            abortSignal: (signal) => ((call.signal = signal), builder),
            then: (onFulfilled, onRejected) =>
              Promise.resolve()
                .then(() => respond(call))
                .then((response) => response ?? { data: [], error: null })
                .then(onFulfilled, onRejected),
          }
          return builder
        },
      }
    },
  }

  return { client, calls }
}

function filterValue(call, kind, column) {
  return call.filters.find(([type, col]) => type === kind && (column === undefined || col === column))
}

// --- normalization ---------------------------------------------------------------

test('normalizes case, whitespace, separators and a missing D prefix', () => {
  assert.equal(search.normalizeDNumberInput('d012345'), 'D012345')
  assert.equal(search.normalizeDNumberInput('  D 012 345 '), 'D012345')
  assert.equal(search.normalizeDNumberInput('D-012345'), 'D012345')
  assert.equal(search.normalizeDNumberInput('D#012345'), 'D012345')
  assert.equal(search.normalizeDNumberInput('012345'), 'D012345')
  assert.equal(search.normalizeDNumberInput(''), '')
  assert.equal(search.normalizeDNumberInput(undefined), '')
  assert.equal(search.normalizeDNumberInput('  -- '), '')
})

test('rejects input that cannot be a D number', () => {
  for (const input of ['', 'D', 'crane', 'X012345', 'DX12', 'D1234567890123']) {
    assert.equal(search.parseDNumberQuery(input).isValid, false, `expected ${JSON.stringify(input)} to be invalid`)
  }
  // Rare non-numeric suffixes exist in the data (e.g. D509501F) and stay searchable.
  assert.equal(search.parseDNumberQuery('d509501f').isValid, true)
})

test('adds the zero-padded 6-digit form for short numeric input', () => {
  assert.deepEqual(search.parseDNumberQuery('12345').exactCandidates, ['D12345', 'D012345'])
  assert.deepEqual(search.parseDNumberQuery('D12').exactCandidates, ['D12', 'D000012'])
  assert.deepEqual(search.parseDNumberQuery('D012345').exactCandidates, ['D012345'])
})

test('strips surplus leading zeros down to 6 digits only', () => {
  assert.deepEqual(search.parseDNumberQuery('D0012345').exactCandidates, ['D0012345', 'D012345'])
  assert.deepEqual(search.parseDNumberQuery('D1234567').exactCandidates, ['D1234567'])
})

// --- prefix ranges -----------------------------------------------------------------

test('computes the exclusive upper bound of a D-number prefix', () => {
  assert.equal(search.getPrefixUpperBound('D52'), 'D53')
  assert.equal(search.getPrefixUpperBound('D0129'), 'D013')
  assert.equal(search.getPrefixUpperBound('D5268'), 'D5269')
  assert.equal(search.getPrefixUpperBound('D99'), 'E')
  assert.equal(search.getPrefixUpperBound('D0'), 'D1')
})

test('only builds a prefix range for numeric input of suggestion length', () => {
  assert.equal(search.parseDNumberQuery('D5').prefixRange, null)
  assert.deepEqual(search.parseDNumberQuery('52').prefixRange, { lower: 'D52', upper: 'D53' })
  assert.equal(search.parseDNumberQuery('D509501F').prefixRange, null)
})

test('builds an index-friendly suggestion filter', () => {
  assert.equal(
    search.buildSuggestionFilter(search.parseDNumberQuery('D52681')),
    'and(contact_code.gte.D52681,contact_code.lt.D52682),contact_code.in.(D052681)',
  )
  assert.equal(
    search.buildSuggestionFilter(search.parseDNumberQuery('D526816')),
    'and(contact_code.gte.D526816,contact_code.lt.D526817)',
  )
  assert.equal(search.buildSuggestionFilter(search.parseDNumberQuery('d509501f')), 'contact_code.in.(D509501F)')
  assert.equal(search.buildSuggestionFilter(search.parseDNumberQuery('D5')), null)
  assert.equal(search.buildSuggestionFilter(search.parseDNumberQuery('crane')), null)
})

// --- ranking and collapsing --------------------------------------------------------

test('ranks distinct D numbers with exact candidates first', () => {
  const codes = ['D526819', 'D526816', 'd526816 ', 'D052681', 'D526810', null, '']
  assert.deepEqual(
    search.rankDNumbers(codes, ['D52681', 'D052681'], 3),
    ['D052681', 'D526810', 'D526816'],
  )
})

test('collapses one row per work order into the latest details per D number', () => {
  const rows = [
    { contact_code: 'D526816', description: 'Old name', location: 'Bay 1', work_order_id: 100 },
    { contact_code: 'D526816', description: '5 ton bridge', location: '', work_order_id: '200' },
    { contact_code: 'D519449', description: null, location: 'Bay 9', work_order_id: 50 },
  ]
  assert.deepEqual(search.collapseCraneRows(rows, ['D526816', 'D519449', 'D000001']), [
    { dNumber: 'D526816', description: '5 ton bridge', location: 'Bay 1', latestWorkOrderId: 200 },
    { dNumber: 'D519449', description: '', location: 'Bay 9', latestWorkOrderId: 50 },
    { dNumber: 'D000001', description: '', location: '', latestWorkOrderId: null },
  ])
})

// --- links -------------------------------------------------------------------------

test('links to AssetInfo by D number, URL-encoded', () => {
  assert.equal(search.buildAssetInfoHref('/wabash/asset-info', 'D526816'), '/wabash/asset-info?unit_id=D526816')
  assert.equal(search.buildAssetInfoHref('/wabash/asset-info', 'D1&x=2'), '/wabash/asset-info?unit_id=D1%26x%3D2')
})

// --- error classification ----------------------------------------------------------

test('classifies backend failures so the UI can say what went wrong', () => {
  const kind = (error) => search.toDNumberSearchError(error).kind
  assert.equal(kind({ message: 'AbortError: signal is aborted without reason', code: '20' }), 'aborted')
  assert.equal(kind(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })), 'aborted')
  assert.equal(kind({ message: 'JWT expired', code: 'PGRST301' }), 'session')
  assert.equal(kind({ message: 'TypeError: Failed to fetch', code: '' }), 'network')
  assert.equal(kind(new TypeError('Load failed')), 'network')
  assert.equal(kind({ message: 'permission denied for table', code: '42501' }), 'unknown')
  assert.equal(kind('boom'), 'unknown')

  const existing = new search.DNumberSearchError('config', 'x')
  assert.equal(search.toDNumberSearchError(existing), existing)
})

test('describes errors without blaming the D number', () => {
  const describe = (kind) => search.describeDNumberSearchError(new search.DNumberSearchError(kind, 'x'))
  assert.match(describe('session'), /sign in/i)
  assert.match(describe('network'), /connection/i)
  assert.equal(describe('aborted'), '')
  for (const kind of ['session', 'network', 'config', 'unknown']) {
    assert.doesNotMatch(describe(kind), /no asset/i)
  }
})

// --- findDNumberMatches ------------------------------------------------------------

test('exact lookup is customer scoped and resolves short input to the padded D number', async () => {
  const { client, calls } = createFakeClient({
    respond: () => ({
      data: [
        { contact_code: 'D012345', description: 'Jib crane', location: 'Dock', work_order_id: 900 },
        { contact_code: 'D012345', description: 'Jib crane (old)', location: 'Dock', work_order_id: 100 },
      ],
      error: null,
    }),
  })
  const controller = new AbortController()

  const matches = await search.findDNumberMatches(client, { customer: 'wabash', input: ' 12345 ', signal: controller.signal })

  assert.deepEqual(matches, [{ dNumber: 'D012345', description: 'Jib crane', location: 'Dock', latestWorkOrderId: 900 }])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].table, 'deshazo_external_report_cranes')
  assert.deepEqual(filterValue(calls[0], 'eq', 'customer'), ['eq', 'customer', 'wabash'])
  assert.deepEqual(filterValue(calls[0], 'in', 'contact_code'), ['in', 'contact_code', ['D12345', 'D012345']])
  assert.equal(calls[0].signal, controller.signal)
})

test('exact lookup returns every matching variant when more than one exists', async () => {
  const { client } = createFakeClient({
    respond: () => ({
      data: [
        { contact_code: 'D012345', work_order_id: 2 },
        { contact_code: 'D12345', work_order_id: 1 },
      ],
      error: null,
    }),
  })
  const matches = await search.findDNumberMatches(client, { customer: 'wabash', input: 'D12345' })
  assert.deepEqual(matches.map((match) => match.dNumber), ['D12345', 'D012345'])
})

test('exact lookup returns no matches when the customer has no such D number', async () => {
  const { client } = createFakeClient({ respond: () => ({ data: [], error: null }) })
  assert.deepEqual(await search.findDNumberMatches(client, { customer: 'wabash', input: 'D999999' }), [])
})

test('invalid input never reaches the database', async () => {
  const { client, calls } = createFakeClient({ respond: () => assert.fail('should not query') })
  assert.deepEqual(await search.findDNumberMatches(client, { customer: 'wabash', input: 'crane 5' }), [])
  assert.deepEqual(await search.suggestDNumbers(client, { customer: 'wabash', input: 'D5' }), [])
  assert.equal(calls.length, 0)
})

test('a missing customer or session fails loudly instead of searching unscoped', async () => {
  const { client, calls } = createFakeClient({ respond: () => assert.fail('should not query') })
  await assert.rejects(
    search.findDNumberMatches(client, { customer: '  ', input: 'D012345' }),
    (error) => error.kind === 'config',
  )

  const signedOut = createFakeClient({ session: null, respond: () => assert.fail('should not query') })
  await assert.rejects(
    search.findDNumberMatches(signedOut.client, { customer: 'wabash', input: 'D012345' }),
    (error) => error.kind === 'session',
  )
  assert.equal(calls.length + signedOut.calls.length, 0)
})

test('backend and network failures surface as typed errors, not "not found"', async () => {
  const expired = createFakeClient({ respond: () => ({ data: null, error: { message: 'JWT expired', code: 'PGRST301' } }) })
  await assert.rejects(
    search.findDNumberMatches(expired.client, { customer: 'wabash', input: 'D012345' }),
    (error) => error.kind === 'session',
  )

  const offline = createFakeClient({ respond: () => { throw new TypeError('Failed to fetch') } })
  await assert.rejects(
    search.findDNumberMatches(offline.client, { customer: 'wabash', input: 'D012345' }),
    (error) => error.kind === 'network',
  )
})

// --- suggestDNumbers ---------------------------------------------------------------

test('suggestions scan the prefix range, then load details for the top distinct D numbers', async () => {
  const { client, calls } = createFakeClient({
    respond: (call) => {
      if (call.columns === 'contact_code') {
        return {
          data: ['D052681', 'D526810', 'D526810', 'D526811', 'D526812', 'D526816'].map((contact_code) => ({ contact_code })),
          error: null,
        }
      }
      return {
        data: [
          { contact_code: 'D526811', description: 'Monorail', location: 'Line 2', work_order_id: 10 },
          { contact_code: 'D052681', description: 'Hoist', location: 'Bay 3', work_order_id: 20 },
        ],
        error: null,
      }
    },
  })

  const matches = await search.suggestDNumbers(client, { customer: 'wabash', input: 'd52681', limit: 3 })

  assert.deepEqual(matches, [
    { dNumber: 'D052681', description: 'Hoist', location: 'Bay 3', latestWorkOrderId: 20 },
    { dNumber: 'D526810', description: '', location: '', latestWorkOrderId: null },
    { dNumber: 'D526811', description: 'Monorail', location: 'Line 2', latestWorkOrderId: 10 },
  ])

  assert.equal(calls.length, 2)
  const [scan, details] = calls
  assert.deepEqual(filterValue(scan, 'eq', 'customer'), ['eq', 'customer', 'wabash'])
  assert.deepEqual(filterValue(scan, 'or'), ['or', 'and(contact_code.gte.D52681,contact_code.lt.D52682),contact_code.in.(D052681)'])
  assert.deepEqual(filterValue(details, 'eq', 'customer'), ['eq', 'customer', 'wabash'])
  assert.deepEqual(filterValue(details, 'in', 'contact_code'), ['in', 'contact_code', ['D052681', 'D526810', 'D526811']])
  assert.deepEqual(filterValue(details, 'order', 'work_order_id'), ['order', 'work_order_id', false])
})

test('suggestions skip the detail query when nothing matches', async () => {
  const { client, calls } = createFakeClient({ respond: () => ({ data: [], error: null }) })
  assert.deepEqual(await search.suggestDNumbers(client, { customer: 'wabash', input: 'D999' }), [])
  assert.equal(calls.length, 1)
})
