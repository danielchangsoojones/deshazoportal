import JSZip from 'jszip'
import { supabase } from './supabase'

export const WABASH_ASSET_BUCKET = 'wabash-asset-cross-reference'

export type WabashAssetRow = {
  id: string
  import_id: string
  plant: string | null
  wabash_asset_number: string | null
  equipment_type: string | null
  structural_support: string | null
  below_hook_device_type: string | null
  serial_number: string | null
  rated_capacity: string | null
  location: string | null
  certification: string | null
  d_number: string | null
  candidate_d_numbers: string[]
  match_status: 'confirmed' | 'candidate' | 'review' | 'unmatched'
  match_method: string | null
  source_row_number: number
  sheet_name: string
}

type ParsedRow = {
  sheetName: string
  rowNumber: number
  fields: Record<string, string>
  plant: string | null
  assetNumber: string | null
  equipmentType: string | null
  structuralSupport: string | null
  belowHookDeviceType: string | null
  serialNumber: string | null
  capacity: string | null
  location: string | null
  certification: string | null
}

type CraneMatchRow = {
  id: string
  contact_code: string | null
  description: string | null
  location: string | null
  work_order_id: number | null
  structure_serial_number: string | null
}

type HoistMatchRow = { serial_number: string | null; crane_row_id: string; customer: string }

function decodeXml(value: string) {
  return value.replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
}

function attrs(tag: string) {
  const values: Record<string, string> = {}
  for (const match of tag.matchAll(/\s([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) values[match[1]] = match[2]
  return values
}

function columnIndex(letters: string) {
  return [...letters].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1
}

async function xml(zip: JSZip, path: string) {
  return zip.file(path)?.async('text') ?? null
}

async function parseWorkbook(file: File) {
  const zip = await JSZip.loadAsync(file)
  const [workbookXml, relsXml, sharedXml] = await Promise.all([
    xml(zip, 'xl/workbook.xml'), xml(zip, 'xl/_rels/workbook.xml.rels'), xml(zip, 'xl/sharedStrings.xml'),
  ])
  if (!workbookXml || !relsXml) throw new Error(`${file.name}: workbook metadata could not be read.`)

  const relTargets = new Map<string, string>()
  for (const relation of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const item = attrs(relation[0])
    if (item.Id && item.Target) relTargets.set(item.Id, item.Target.replace(/^\/?xl\//, ''))
  }
  const sharedStrings = sharedXml
    ? Array.from(sharedXml.matchAll(/<si\b[\s\S]*?<\/si>/g), ([item]) =>
      Array.from(item.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g), (match) => decodeXml(match[1])).join(''))
    : []
  const sheets: { name: string; rows: { rowNumber: number; cells: unknown[] }[] }[] = []

  for (const match of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const sheetAttrs = attrs(match[0])
    const target = relTargets.get(sheetAttrs['r:id'])
    if (!sheetAttrs.name || !target) continue
    const sheetPath = `xl/${target}`
    const sheetXml = await xml(zip, sheetPath)
    if (!sheetXml) continue
    const rows = Array.from(sheetXml.matchAll(/<row\b[^>]*>[\s\S]*?<\/row>/g), ([rowXml]) => {
      const rowTag = rowXml.match(/<row\b[^>]*>/)?.[0] ?? ''
      const rowNumber = Number(attrs(rowTag).r)
      const cells: unknown[] = []
      for (const cellMatch of rowXml.matchAll(/<c\b[^>]*>[\s\S]*?<\/c>/g)) {
        const cellXml = cellMatch[0]
        const cellAttrs = attrs(cellXml.match(/<c\b[^>]*>/)?.[0] ?? '')
        const col = cellAttrs.r?.match(/^[A-Z]+/)?.[0]
        if (!col) continue
        const inline = cellXml.match(/<is\b[\s\S]*?<t(?:\s[^>]*)?>([\s\S]*?)<\/t>[\s\S]*?<\/is>/)?.[1]
        const raw = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        if (inline !== undefined) cells[columnIndex(col)] = decodeXml(inline)
        else if (raw !== undefined) cells[columnIndex(col)] = cellAttrs.t === 's' ? sharedStrings[Number(raw)] ?? '' : decodeXml(raw)
      }
      return { rowNumber, cells }
    })
    sheets.push({ name: decodeXml(sheetAttrs.name), rows })
  }
  return sheets
}

function normHeader(value: unknown) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function fieldFrom(fields: Record<string, string>, terms: string[]) {
  const entry = Object.entries(fields).find(([key]) => terms.some((term) => key.includes(term)))
  return entry?.[1]?.trim() || null
}

function meaningful(value: string | null) {
  return value && !/^(n\/?a|none|no serial(?: number)?|unknown|tbd|-)$/i.test(value.trim()) ? value.trim() : null
}

async function parseRows(file: File) {
  const rows: ParsedRow[] = []
  const sheetNames: string[] = []
  for (const sheet of await parseWorkbook(file)) {
    const headerRowIndex = sheet.rows.findIndex(({ cells }) => cells.some((cell) => /unique equipment identifier/i.test(String(cell ?? ''))))
    if (headerRowIndex < 0) continue
    const headers = sheet.rows[headerRowIndex].cells.map(normHeader)
    const getFields = (values: unknown[]) => Object.fromEntries(headers.flatMap((header, index) => header ? [[header, String(values[index] ?? '').trim()]] : []))
    for (const source of sheet.rows.slice(headerRowIndex + 1)) {
      const fields = getFields(source.cells)
      const assetNumber = meaningful(fieldFrom(fields, ['unique equipment identifier']))
      if (!Object.values(fields).some((value) => value.trim())) continue
      rows.push({
        sheetName: sheet.name,
        rowNumber: source.rowNumber,
        fields,
        plant: meaningful(fieldFrom(fields, ['plant'])),
        assetNumber,
        equipmentType: meaningful(fieldFrom(fields, ['equipment type'])),
        structuralSupport: meaningful(fieldFrom(fields, ['structural support tie in'])),
        belowHookDeviceType: meaningful(fieldFrom(fields, ['type of below the hook lifting device', 'type of below the hook device'])),
        serialNumber: meaningful(fieldFrom(fields, ['mfg serial number', 'serial number'])),
        capacity: meaningful(fieldFrom(fields, ['rated capacity'])),
        location: meaningful(fieldFrom(fields, ['location of the device'])),
        certification: meaningful(fieldFrom(fields, ['certified device', 'can the unit be certified'])),
      })
    }
    sheetNames.push(sheet.name)
  }
  if (!rows.length) throw new Error(`${file.name}: no equipment rows with the expected identifier column were found.`)
  return { rows, sheetNames }
}

async function fetchAllCraneRows(): Promise<CraneMatchRow[]> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const all: CraneMatchRow[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from('deshazo_external_report_cranes')
      .select('id,contact_code,description,location,work_order_id,structure_serial_number')
      .eq('customer', 'wabash').order('id').range(from, from + pageSize - 1)
    if (error) throw new Error(`Could not read Wabash crane records: ${error.message}`)
    const page = (data ?? []) as CraneMatchRow[]
    all.push(...page)
    if (page.length < pageSize) break
  }
  return all
}

async function fetchSerialMatches(rows: CraneMatchRow[], serialNumbers: string[]) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const byCraneId = new Map<string, Set<string>>()
  const serials = Array.from(new Set(serialNumbers.filter(Boolean)))
  const craneIdToD = new Map(rows.filter((row) => row.id && row.contact_code).map((row) => [row.id, row.contact_code!]))
  for (let i = 0; i < serials.length; i += 80) {
    const { data, error } = await supabase.from('deshazo_external_report_hoists')
      .select('serial_number,crane_row_id,customer').eq('customer', 'wabash').in('serial_number', serials.slice(i, i + 80))
    if (error) throw new Error(`Could not compare hoist serial numbers: ${error.message}`)
    for (const item of (data ?? []) as HoistMatchRow[]) {
      const dNumber = craneIdToD.get(item.crane_row_id)
      const serial = item.serial_number?.trim().toUpperCase()
      if (!dNumber || !serial) continue
      const set = byCraneId.get(serial) ?? new Set<string>()
      set.add(dNumber)
      byCraneId.set(serial, set)
    }
  }
  return byCraneId
}

function exactToken(description: string | null, assetNumber: string) {
  const normalized = assetNumber.trim().toUpperCase()
  if (!description || !normalized || normalized.length < 3) return false
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^A-Z0-9])${escaped}($|[^A-Z0-9])`, 'i').test(description)
}

async function digest(file: File) {
  const bytes = await file.arrayBuffer()
  const result = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function uploadWabashAssetFiles(files: File[], userId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  let uploadedFiles = 0
  let importedRows = 0
  let confirmed = 0
  let candidate = 0
  let review = 0
  let unmatched = 0

  for (const file of files) {
    if (!/\.xlsx?$/i.test(file.name)) throw new Error(`${file.name} is not an Excel workbook.`)
    if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} exceeds the 20 MB upload limit.`)
    const { rows, sheetNames } = await parseRows(file)
    const fileSha = await digest(file)
    const { data: priorImports, error: priorError } = await supabase.from('wabash_asset_imports')
      .select('id').eq('file_sha256', fileSha).eq('is_duplicate', false).limit(1)
    if (priorError) throw new Error(`Could not check duplicate workbooks: ${priorError.message}`)
    const isDuplicate = Boolean(priorImports?.length)
    const importId = crypto.randomUUID()
    const safeFileName = file.name.replace(/[^A-Za-z0-9._-]/g, '_')
    const storagePath = `${importId}/${safeFileName}`
    const { error: storageError } = await supabase.storage.from(WABASH_ASSET_BUCKET).upload(storagePath, file, {
      contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    })
    if (storageError) throw new Error(`Could not save ${file.name} in Supabase Storage: ${storageError.message}`)

    const { error: importError } = await supabase.from('wabash_asset_imports').insert({
      id: importId,
      file_name: file.name,
      storage_path: storagePath,
      file_sha256: fileSha,
      sheet_names: sheetNames,
      source_row_count: isDuplicate ? 0 : rows.length,
      is_duplicate: isDuplicate,
      duplicate_of_import_id: priorImports?.[0]?.id ?? null,
      imported_by: userId,
    })
    if (importError) throw new Error(`Workbook saved but import registration failed: ${importError.message}`)
    uploadedFiles += 1
    if (isDuplicate) continue

    const cranes = await fetchAllCraneRows()
    const serialMatches = await fetchSerialMatches(cranes, rows.flatMap((row) => row.serialNumber ? [row.serialNumber] : []))
    const normalizedSerialMatches = new Map(Array.from(serialMatches.entries(), ([serial, dNumbers]) => [serial.trim().toUpperCase(), dNumbers]))
    const classified = rows.map((row) => {
      const idCandidates = new Set(cranes.filter((crane) => exactToken(crane.description, row.assetNumber!)).map((crane) => crane.contact_code!).filter(Boolean))
      const serialCandidates = row.serialNumber ? normalizedSerialMatches.get(row.serialNumber.trim().toUpperCase()) ?? new Set<string>() : new Set<string>()
      const combined = Array.from(new Set([...idCandidates, ...serialCandidates])).sort()
      let matchStatus: 'confirmed' | 'candidate' | 'review' | 'unmatched' = 'unmatched'
      let dNumber: string | null = null
      let matchMethod: string | null = null
      if (idCandidates.size > 1 || serialCandidates.size > 1 || (idCandidates.size && serialCandidates.size && [...idCandidates].some((id) => !serialCandidates.has(id)))) {
        matchStatus = 'review'
        matchMethod = 'identifier and/or serial point to multiple or conflicting D-numbers'
      } else if (idCandidates.size === 1 && serialCandidates.size === 1 && [...idCandidates][0] === [...serialCandidates][0]) {
        matchStatus = 'confirmed'
        dNumber = [...idCandidates][0]
        matchMethod = 'exact identifier token and exact serial agree'
      } else if (idCandidates.size === 1 || serialCandidates.size === 1) {
        matchStatus = 'candidate'
        dNumber = [...(idCandidates.size ? idCandidates : serialCandidates)][0]
        matchMethod = idCandidates.size ? 'exact identifier token in Wabash crane description' : 'exact hoist serial number'
      } else if (!row.assetNumber) {
        matchStatus = 'review'
        matchMethod = 'source row has no usable Wabash asset identifier or D-number match'
      }
      return {
        import_id: importId, sheet_name: row.sheetName, source_row_number: row.rowNumber,
        plant: row.plant, wabash_asset_number: row.assetNumber, equipment_type: row.equipmentType,
        structural_support: row.structuralSupport, below_hook_device_type: row.belowHookDeviceType,
        serial_number: row.serialNumber, rated_capacity: row.capacity, location: row.location,
        certification: row.certification, d_number: dNumber, candidate_d_numbers: combined,
        match_status: matchStatus, match_method: matchMethod, source_payload: row.fields,
      }
    })
    for (let i = 0; i < classified.length; i += 400) {
      const { error } = await supabase.from('wabash_asset_cross_references').insert(classified.slice(i, i + 400))
      if (error) throw new Error(`Workbook saved, but row import failed at ${i + 1}: ${error.message}`)
    }
    importedRows += classified.length
    for (const row of classified) {
      if (row.match_status === 'confirmed') confirmed += 1
      else if (row.match_status === 'candidate') candidate += 1
      else if (row.match_status === 'review') review += 1
      else unmatched += 1
    }
  }
  return { uploadedFiles, importedRows, confirmed, candidate, review, unmatched }
}
