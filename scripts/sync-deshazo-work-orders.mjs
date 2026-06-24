const apiBaseUrl =
  process.env.DESHAZO_SYNC_API_BASE_URL ||
  process.env.VITE_DESHAZO_SYNC_API_BASE_URL ||
  process.env.VITE_PORTAL_PARSE_BASE_URL ||
  'https://blockstamp-production-2b9f8bfc27a8.herokuapp.com'

const apiKey = process.env.DESHAZO_EXTERNAL_API_KEY || process.env.VITE_DESHAZO_EXTERNAL_API_KEY || ''
const apiPath = process.env.DESHAZO_SYNC_API_PATH || '/api/external/work-orders/sync'
const pageSize = Number(process.env.DESHAZO_NIGHTLY_SYNC_PAGE_SIZE || 50)
const maxPages = Number(process.env.DESHAZO_NIGHTLY_SYNC_MAX_PAGES || 5)
const mode = process.env.DESHAZO_NIGHTLY_SYNC_MODE || 'latestByDate'
const dryRun = process.env.DESHAZO_NIGHTLY_SYNC_DRY_RUN === 'true'

function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`)
  }
}

function buildSyncUrl() {
  requirePositiveInteger(pageSize, 'DESHAZO_NIGHTLY_SYNC_PAGE_SIZE')
  requirePositiveInteger(maxPages, 'DESHAZO_NIGHTLY_SYNC_MAX_PAGES')

  const normalizedApiPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const url = new URL(normalizedApiPath, apiBaseUrl)
  url.searchParams.set('page', '1')
  url.searchParams.set('pageSize', String(pageSize))
  url.searchParams.set('maxPages', String(maxPages))

  if (mode === 'latestByDate') {
    url.searchParams.set('latestByDate', 'true')
  } else if (mode === 'nextMissingByDate') {
    url.searchParams.set('nextMissingByDate', 'true')
  } else if (mode !== 'standard') {
    throw new Error('DESHAZO_NIGHTLY_SYNC_MODE must be latestByDate, nextMissingByDate, or standard.')
  }

  return url
}

async function main() {
  if (!apiKey) {
    throw new Error('DESHAZO_EXTERNAL_API_KEY is required for the nightly DeShazo sync job.')
  }

  const startedAt = new Date()
  const url = buildSyncUrl()
  console.log(`Starting DeShazo nightly work-order sync at ${startedAt.toISOString()}.`)
  console.log(`Mode=${mode}; pageSize=${pageSize}; maxPages=${maxPages}; endpoint=${url.origin}${url.pathname}`)

  if (dryRun) {
    console.log(`Dry run enabled. Would call: ${url.toString()}`)
    return
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-API-Key': apiKey,
    },
  })

  const responseText = await response.text()
  let body = responseText
  try {
    body = JSON.parse(responseText)
  } catch {
    // Keep non-JSON backend responses visible in logs.
  }

  if (!response.ok) {
    console.error('DeShazo nightly sync failed.', body)
    throw new Error(`External sync failed with status ${response.status}.`)
  }

  console.log('DeShazo nightly sync completed.', JSON.stringify(body, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exit(1)
})
