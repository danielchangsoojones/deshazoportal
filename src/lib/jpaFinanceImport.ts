import JSZip from 'jszip'
import { getCustomerDisplayName, getCustomerFilterValue } from './customerRouting'
import { supabase } from './supabase'

const skippedSheets = new Set(['JPA Summary', 'SVC Summary', 'ALL JOBS'])
const monthNumbersByName = new Map([
  ['jan', 1],
  ['january', 1],
  ['feb', 2],
  ['february', 2],
  ['mar', 3],
  ['march', 3],
  ['apr', 4],
  ['april', 4],
  ['may', 5],
  ['jun', 6],
  ['june', 6],
  ['jul', 7],
  ['july', 7],
  ['aug', 8],
  ['august', 8],
  ['sep', 9],
  ['sept', 9],
  ['september', 9],
  ['oct', 10],
  ['october', 10],
  ['nov', 11],
  ['november', 11],
  ['dec', 12],
  ['december', 12],
])

type SheetInfo = {
  name: string
  path: string
}

type ParsedRow = {
  rowNumber: number
  values: unknown[]
}

type FinanceImportRow = {
  import_period: string
  source_month: string
  source_file_name: string
  source_sheet_name: string
  source_row_number: number
  customer: string
  job_no: string
  work_order_id: number | null
  customer_location_name: string | null
  service_location_name: string | null
  location_label: string | null
  parts_revenue: number
  service_revenue: number
  raw_payload: {
    workbookCustomer: string
    workbookTotalRevenue: number
    branchSheet: string
  }
}

type WorkOrderMatch = {
  work_order_id: number
  job_no: string | null
  customer_location_name: string | null
  service_location_name: string | null
}

export type JpaFinanceImportResult = {
  files: number
  rows: number
  matchedWorkOrders: number
  partsTotal: number
  serviceTotal: number
  total: number
}

function normalizeCustomerComparable(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function workbookCustomerMatchesSelectedCustomer(workbookCustomer: string, selectedCustomerName: string) {
  return normalizeCustomerComparable(workbookCustomer) === normalizeCustomerComparable(selectedCustomerName)
}

function columnLettersToIndex(letters: string) {
  let index = 0
  for (const char of letters) {
    index = index * 26 + char.charCodeAt(0) - 64
  }
  return index - 1
}

function parseXmlAttributes(tag: string) {
  const attrs: Record<string, string> = {}
  for (const match of tag.matchAll(/\s([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) {
    attrs[match[1]] = match[2]
  }
  return attrs
}

function decodeXml(value: string) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

async function getZipText(zip: JSZip, fileName: string) {
  return zip.file(fileName)?.async('text') ?? null
}

async function readSharedStrings(zip: JSZip) {
  const text = await getZipText(zip, 'xl/sharedStrings.xml')
  if (!text) return []
  return Array.from(text.matchAll(/<si\b[\s\S]*?<\/si>/g)).map(([item]) => {
    const pieces = Array.from(item.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)).map((match) => decodeXml(match[1]))
    return pieces.join('')
  })
}

async function readWorkbookSheets(zip: JSZip) {
  const [workbookXml, relsXml] = await Promise.all([
    getZipText(zip, 'xl/workbook.xml'),
    getZipText(zip, 'xl/_rels/workbook.xml.rels'),
  ])
  if (!workbookXml || !relsXml) throw new Error('Workbook metadata could not be read.')

  const relTargets = new Map<string, string>()
  for (const rel of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const attrs = parseXmlAttributes(rel[0])
    if (attrs.Id && attrs.Target) {
      relTargets.set(attrs.Id, attrs.Target.replace(/^\/?xl\//, ''))
    }
  }

  return Array.from(workbookXml.matchAll(/<sheet\b[^>]*>/g))
    .map<SheetInfo | null>((sheet) => {
      const attrs = parseXmlAttributes(sheet[0])
      const relId = attrs['r:id']
      const target = relId ? relTargets.get(relId) : ''
      if (!attrs.name || !target) return null
      return {
        name: decodeXml(attrs.name),
        path: `xl/${target}`,
      }
    })
    .filter((sheet): sheet is SheetInfo => Boolean(sheet))
}

function parseCellValue(cellXml: string, sharedStrings: string[]) {
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

function parseSheetRows(sheetXml: string, sharedStrings: string[]) {
  const rows: ParsedRow[] = []
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>[\s\S]*?<\/row>/g)) {
    const rowXml = rowMatch[0]
    const rowAttrs = parseXmlAttributes(rowXml.match(/<row\b[^>]*>/)?.[0] ?? '')
    const rowNumber = Number(rowAttrs.r)
    const values: unknown[] = []

    for (const cellMatch of rowXml.matchAll(/<c\b[^>]*>[\s\S]*?<\/c>/g)) {
      const cellXml = cellMatch[0]
      const attrs = parseXmlAttributes(cellXml.match(/<c\b[^>]*>/)?.[0] ?? '')
      const col = attrs.r?.match(/^[A-Z]+/)?.[0]
      if (!col) continue
      values[columnLettersToIndex(col)] = parseCellValue(cellXml, sharedStrings)
    }

    rows.push({ rowNumber, values })
  }

  return rows
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]+/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function formatImportPeriod(year: string, month: number) {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function tryParseImportPeriod(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return null

  const monthNameYear = text.match(/(?:^|[^A-Za-z])([A-Za-z]{3,9})[^A-Za-z0-9]+((?:19|20)\d{2})(?:$|[^0-9])/)
  const yearMonthName = text.match(/(?:^|[^0-9])((?:19|20)\d{2})[^A-Za-z0-9]+([A-Za-z]{3,9})(?:$|[^A-Za-z])/)
  const yearMonthNumber = text.match(/(?:^|[^0-9])((?:19|20)\d{2})[-_ .]*(0?[1-9]|1[0-2])(?:$|[^0-9])/)
  const monthNumberYear = text.match(/(?:^|[^0-9])(0?[1-9]|1[0-2])[-_ .]+((?:19|20)\d{2})(?:$|[^0-9])/)

  if (monthNameYear) {
    const month = monthNumbersByName.get(monthNameYear[1].toLowerCase())
    if (month) return formatImportPeriod(monthNameYear[2], month)
  }

  if (yearMonthName) {
    const month = monthNumbersByName.get(yearMonthName[2].toLowerCase())
    if (month) return formatImportPeriod(yearMonthName[1], month)
  }

  if (yearMonthNumber) {
    return formatImportPeriod(yearMonthNumber[1], Number(yearMonthNumber[2]))
  }

  if (monthNumberYear) {
    return formatImportPeriod(monthNumberYear[2], Number(monthNumberYear[1]))
  }

  return null
}

function parseImportPeriod(value: unknown, fileName: string, sheetName: string) {
  const period = tryParseImportPeriod(value) ?? tryParseImportPeriod(fileName)
  if (period) return period

  const text = String(value ?? '').trim()
  throw new Error(`Could not parse workbook month for "${fileName}" sheet "${sheetName}" from "${text}" or the filename.`)
}

async function parseWorkbook(file: File, selectedCustomerName: string, importCustomer: string) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const [sharedStrings, sheets] = await Promise.all([readSharedStrings(zip), readWorkbookSheets(zip)])
  const rows: FinanceImportRow[] = []

  for (const sheet of sheets) {
    if (skippedSheets.has(sheet.name)) continue
    const sheetXml = await getZipText(zip, sheet.path)
    if (!sheetXml) continue
    const parsedRows = parseSheetRows(sheetXml, sharedStrings)
    const period = parseImportPeriod(parsedRows.find((row) => row.rowNumber === 2)?.values[0], file.name, sheet.name)

    for (const row of parsedRows) {
      if (row.rowNumber < 5) continue
      const jobNo = String(row.values[1] ?? '').trim()
      const workbookCustomer = String(row.values[2] ?? '').trim()
      if (!jobNo || !workbookCustomer || !workbookCustomerMatchesSelectedCustomer(workbookCustomer, selectedCustomerName)) continue

      const partsRevenue = toNumber(row.values[3])
      const serviceRevenue = toNumber(row.values[4])
      if (partsRevenue === 0 && serviceRevenue === 0 && toNumber(row.values[5]) === 0) continue

      rows.push({
        import_period: period,
        source_month: period.slice(0, 7),
        source_file_name: file.name,
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
          workbookCustomer,
          workbookTotalRevenue: toNumber(row.values[5]),
          branchSheet: sheet.name,
        },
      })
    }
  }

  return rows
}

async function attachWorkOrders(rows: FinanceImportRow[], importCustomer: string) {
  if (!supabase || rows.length === 0) return rows

  const jobNos = Array.from(new Set(rows.map((row) => row.job_no)))
  const matches: WorkOrderMatch[] = []

  for (let index = 0; index < jobNos.length; index += 200) {
    const chunk = jobNos.slice(index, index + 200)
    const { data, error } = await supabase
      .from('deshazo_external_work_orders')
      .select('work_order_id, job_no, customer_location_name, service_location_name')
      .eq('customer', importCustomer)
      .in('job_no', chunk)

    if (error) throw new Error(`Work order lookup failed: ${error.message}`)
    matches.push(...((data ?? []) as WorkOrderMatch[]))
  }

  const byJob = new Map(matches.filter((row) => row.job_no).map((row) => [row.job_no ?? '', row]))
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

async function uploadRows(rows: FinanceImportRow[]) {
  if (!supabase) throw new Error('Supabase is not configured.')

  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500)
    const { error } = await supabase
      .from('deshazo_jpa_finance_invoices')
      .upsert(chunk, {
        onConflict: 'source_file_name,source_sheet_name,source_row_number,customer,job_no',
      })

    if (error) throw new Error(`Finance invoice upload failed: ${error.message}`)
  }
}

export async function uploadJpaFinanceFiles(files: File[], selectedCustomer: string): Promise<JpaFinanceImportResult> {
  const importCustomer = getCustomerFilterValue(selectedCustomer)
  const customerName = getCustomerDisplayName(selectedCustomer)
  const parsedRows = (
    await Promise.all(files.map((file) => parseWorkbook(file, customerName, importCustomer)))
  ).flat()
  const rows = await attachWorkOrders(parsedRows, importCustomer)

  await uploadRows(rows)

  const partsTotal = rows.reduce((sum, row) => sum + row.parts_revenue, 0)
  const serviceTotal = rows.reduce((sum, row) => sum + row.service_revenue, 0)

  return {
    files: files.length,
    rows: rows.length,
    matchedWorkOrders: rows.filter((row) => row.work_order_id).length,
    partsTotal: Number(partsTotal.toFixed(2)),
    serviceTotal: Number(serviceTotal.toFixed(2)),
    total: Number((partsTotal + serviceTotal).toFixed(2)),
  }
}
