import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import JSZip from 'jszip'
import { createClient } from '@supabase/supabase-js'

const defaultWorkbook = 'data/jpa/Service JPA - Master - May 2026 - Final.xlsx'
const skippedSheets = new Set(['JPA Summary', 'SVC Summary', 'ALL JOBS'])

function getArg(name, fallback = '') {
  const prefix = `--${name}=`
  const value = process.argv.find((arg) => arg.startsWith(prefix))
  return value ? value.slice(prefix.length) : fallback
}

function normalizeCustomerKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
}

function getCustomerFilterValue(value) {
  const normalized = normalizeCustomerKey(value)
  if (normalized === 'o-neal-steel' || normalized === 'oneal-steel') return "o'neal steel"
  return normalized.replace(/-/g, ' ')
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function parseEnvFile(filePath) {
  return Object.fromEntries(
    (awaitableRead(filePath) ?? '')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        return [
          line.slice(0, index),
          line.slice(index + 1).trim().replace(/^['"]|['"]$/g, ''),
        ]
      }),
  )
}

function awaitableRead(filePath) {
  try {
    return globalThis.__envCache?.get(filePath)
  } catch {
    return ''
  }
}

async function loadEnv(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    globalThis.__envCache = new Map([[filePath, text]])
    return parseEnvFile(filePath)
  } catch {
    return {}
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function columnLettersToIndex(letters) {
  let index = 0
  for (const char of letters) {
    index = index * 26 + char.charCodeAt(0) - 64
  }
  return index - 1
}

function escapeCsv(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function parseXmlAttributes(tag) {
  const attrs = {}
  for (const match of tag.matchAll(/\s([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) {
    attrs[match[1]] = match[2]
  }
  return attrs
}

function decodeXml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

function getZipText(zip, fileName) {
  const file = zip.file(fileName)
  if (!file) return null
  return file.async('text')
}

async function readSharedStrings(zip) {
  const text = await getZipText(zip, 'xl/sharedStrings.xml')
  if (!text) return []
  return Array.from(text.matchAll(/<si\b[\s\S]*?<\/si>/g)).map(([item]) => {
    const pieces = Array.from(item.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)).map((match) => decodeXml(match[1]))
    return pieces.join('')
  })
}

async function readWorkbookSheets(zip) {
  const [workbookXml, relsXml] = await Promise.all([
    getZipText(zip, 'xl/workbook.xml'),
    getZipText(zip, 'xl/_rels/workbook.xml.rels'),
  ])
  if (!workbookXml || !relsXml) throw new Error('Workbook metadata could not be read.')

  const relTargets = new Map()
  for (const rel of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const attrs = parseXmlAttributes(rel[0])
    if (attrs.Id && attrs.Target) {
      relTargets.set(attrs.Id, attrs.Target.replace(/^\/?xl\//, ''))
    }
  }

  return Array.from(workbookXml.matchAll(/<sheet\b[^>]*>/g)).map((sheet) => {
    const attrs = parseXmlAttributes(sheet[0])
    const relId = attrs['r:id']
    const target = relTargets.get(relId)
    return {
      name: decodeXml(attrs.name ?? ''),
      path: target ? `xl/${target}` : '',
    }
  }).filter((sheet) => sheet.name && sheet.path)
}

function parseCellValue(cellXml, sharedStrings) {
  const attrs = parseXmlAttributes(cellXml.match(/<c\b[^>]*>/)?.[0] ?? '')
  const inlineText = cellXml.match(/<is\b[\s\S]*?<t(?:\s[^>]*)?>([\s\S]*?)<\/t>[\s\S]*?<\/is>/)?.[1]
  if (inlineText !== undefined) return decodeXml(inlineText)

  const rawValue = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1]
  if (rawValue === undefined) return null
  if (attrs.t === 's') return sharedStrings[Number(rawValue)] ?? ''
  if (attrs.t === 'str') return decodeXml(rawValue)

  const numeric = Number(rawValue)
  return Number.isFinite(numeric) ? numeric : decodeXml(rawValue)
}

function parseSheetRows(sheetXml, sharedStrings) {
  const rows = []
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>[\s\S]*?<\/row>/g)) {
    const rowXml = rowMatch[0]
    const rowAttrs = parseXmlAttributes(rowXml.match(/<row\b[^>]*>/)?.[0] ?? '')
    const rowNumber = Number(rowAttrs.r)
    const values = []

    for (const cellMatch of rowXml.matchAll(/<c\b[^>]*>[\s\S]*?<\/c>/g)) {
      const cellXml = cellMatch[0]
      const attrs = parseXmlAttributes(cellXml.match(/<c\b[^>]*>/)?.[0] ?? '')
      const ref = attrs.r ?? ''
      const col = ref.match(/^[A-Z]+/)?.[0]
      if (!col) continue
      values[columnLettersToIndex(col)] = parseCellValue(cellXml, sharedStrings)
    }

    rows.push({ rowNumber, values })
  }

  return rows
}

function normalizeJobNo(value) {
  return String(value ?? '').trim()
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]+/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function parseImportPeriod(value) {
  const text = String(value ?? '').trim()
  const match = text.match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (!match) throw new Error(`Could not parse workbook month from "${text}".`)
  const monthIndex = new Date(`${match[1]} 1, ${match[2]}`).getMonth()
  if (!Number.isFinite(monthIndex)) throw new Error(`Could not parse workbook month from "${text}".`)
  return `${match[2]}-${String(monthIndex + 1).padStart(2, '0')}-01`
}

async function parseWorkbook(workbookPath, customerFilter, importCustomer) {
  const zip = await JSZip.loadAsync(await fs.readFile(workbookPath))
  const [sharedStrings, sheets] = await Promise.all([readSharedStrings(zip), readWorkbookSheets(zip)])
  const rows = []

  for (const sheet of sheets) {
    if (skippedSheets.has(sheet.name)) continue
    const sheetXml = await getZipText(zip, sheet.path)
    if (!sheetXml) continue
    const parsedRows = parseSheetRows(sheetXml, sharedStrings)
    const period = parseImportPeriod(parsedRows.find((row) => row.rowNumber === 2)?.values[0])

    for (const row of parsedRows) {
      if (row.rowNumber < 5) continue
      const jobNo = normalizeJobNo(row.values[1])
      const customer = String(row.values[2] ?? '').trim()
      if (!jobNo || !customer || !customerFilter.test(customer)) continue

      const partsRevenue = toNumber(row.values[3])
      const serviceRevenue = toNumber(row.values[4])
      if (partsRevenue === 0 && serviceRevenue === 0 && toNumber(row.values[5]) === 0) continue

      rows.push({
        import_period: period,
        source_month: period.slice(0, 7),
        source_file_name: path.basename(workbookPath),
        source_sheet_name: sheet.name,
        source_row_number: row.rowNumber,
        customer: importCustomer,
        job_no: jobNo,
        work_order_id: null,
        customer_location_name: null,
        service_location_name: null,
        location_label: null,
        parts_revenue: partsRevenue,
        service_revenue: serviceRevenue,
        raw_payload: {
          workbookCustomer: customer,
          workbookTotalRevenue: toNumber(row.values[5]),
          branchSheet: sheet.name,
        },
      })
    }
  }

  return rows
}

async function attachWorkOrders(env, rows, importCustomer) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
  if (!url || !key || rows.length === 0) return rows

  const supabase = createClient(url, key)
  const jobNos = Array.from(new Set(rows.map((row) => row.job_no)))
  const matches = []

  for (let index = 0; index < jobNos.length; index += 200) {
    const chunk = jobNos.slice(index, index + 200)
    const { data, error } = await supabase
      .from('deshazo_external_work_orders')
      .select('work_order_id, job_no, customer_location_name, service_location_name')
      .eq('customer', importCustomer)
      .in('job_no', chunk)

    if (error) throw new Error(`Work order lookup failed: ${error.message}`)
    matches.push(...(data ?? []))
  }

  const byJob = new Map(matches.map((row) => [row.job_no, row]))
  return rows.map((row) => {
    const match = byJob.get(row.job_no)
    return match ? {
      ...row,
      work_order_id: match.work_order_id,
      customer_location_name: match.customer_location_name,
      service_location_name: match.service_location_name,
      location_label: match.customer_location_name || match.service_location_name,
    } : row
  })
}

async function writeCsv(rows, outputPath) {
  const columns = [
    'import_period',
    'source_month',
    'source_file_name',
    'source_sheet_name',
    'source_row_number',
    'customer',
    'job_no',
    'work_order_id',
    'customer_location_name',
    'service_location_name',
    'location_label',
    'parts_revenue',
    'service_revenue',
    'raw_payload',
  ]
  const csv = [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => escapeCsv(
      column === 'raw_payload' ? JSON.stringify(row[column]) : row[column],
    )).join(',')),
  ].join('\n')
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, csv)
}

async function uploadRows(env, rows) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to upload finance rows.')
  }

  const supabase = createClient(url, key)
  const { error } = await supabase
    .from('deshazo_jpa_finance_invoices')
    .upsert(rows, {
      onConflict: 'source_file_name,source_sheet_name,source_row_number,customer,job_no',
    })

  if (error) throw new Error(`Finance invoice upload failed: ${error.message}`)
}

const workbookPath = path.resolve(getArg('file', defaultWorkbook))
const customer = getArg('customer', 'Wabash')
const customerKey = getArg('customer-key', customer)
const importCustomer = getCustomerFilterValue(customerKey)
const dryRun = hasFlag('dry-run') || !hasFlag('upload')
const shouldLookupWorkOrders = hasFlag('lookup-work-orders') || hasFlag('upload')
const outputPath = path.resolve(getArg('out', 'data/jpa/wabash-may-2026-import.csv'))
const env = await loadEnv(path.resolve(getArg('env', '.env.local')))
const customerFilter = new RegExp(escapeRegExp(customer), 'i')

const parsedRows = await parseWorkbook(workbookPath, customerFilter, importCustomer)
const rows = shouldLookupWorkOrders ? await attachWorkOrders(env, parsedRows, importCustomer) : parsedRows
const partsTotal = rows.reduce((sum, row) => sum + row.parts_revenue, 0)
const serviceTotal = rows.reduce((sum, row) => sum + row.service_revenue, 0)
const matchedWorkOrders = rows.filter((row) => row.work_order_id).length

await writeCsv(rows, outputPath)

console.log(JSON.stringify({
  workbook: workbookPath,
  output: outputPath,
  dryRun,
  customer: importCustomer,
  rows: rows.length,
  matchedWorkOrders,
  partsTotal: Number(partsTotal.toFixed(2)),
  serviceTotal: Number(serviceTotal.toFixed(2)),
  total: Number((partsTotal + serviceTotal).toFixed(2)),
}, null, 2))

if (!dryRun) {
  await uploadRows(env, rows)
  console.log(`Uploaded ${rows.length} finance invoice rows.`)
}
