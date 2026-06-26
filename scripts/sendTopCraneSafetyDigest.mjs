import { existsSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const defaultWindowDays = 30
const defaultMinimumIssues = 10
const defaultLimit = 20
const pageSize = 1000
const chunkSize = 200
const safetyConditions = new Set(['REPAIR', 'DO NOT OPERATE / SAFETY'])

loadLocalEnv()

const args = parseArgs(process.argv.slice(2))
const dryRun = Boolean(args.dryRun)
const scheduled = Boolean(args.scheduled)
const force = Boolean(args.force)
const scheduleTimeZone = normalizeText(args.scheduleTimeZone ?? process.env.TOP_CRANE_SAFETY_SCHEDULE_TIME_ZONE) || 'America/New_York'
const scheduleWeekday = clampInteger(args.scheduleWeekday ?? process.env.TOP_CRANE_SAFETY_SCHEDULE_WEEKDAY, 1, 0, 6)
const scheduleHour = clampInteger(args.scheduleHour ?? process.env.TOP_CRANE_SAFETY_SCHEDULE_HOUR, 4, 0, 23)
const windowDays = clampInteger(args.windowDays ?? process.env.TOP_CRANE_SAFETY_WINDOW_DAYS, defaultWindowDays, 1, 366)
const minimumIssues = clampInteger(args.minimumIssues ?? process.env.TOP_CRANE_SAFETY_MINIMUM_ISSUES, defaultMinimumIssues, 0, 10000)
const limit = clampInteger(args.limit ?? process.env.TOP_CRANE_SAFETY_LIMIT, defaultLimit, 1, 100)
const endDate = normalizeDate(args.endDate ?? process.env.TOP_CRANE_SAFETY_END_DATE) ?? toIsoDate(new Date())
const startDate = normalizeDate(args.startDate ?? process.env.TOP_CRANE_SAFETY_START_DATE) ?? addDays(endDate, -windowDays)
const customerFilter = normalizeText(args.customer ?? process.env.TOP_CRANE_SAFETY_CUSTOMER).toLowerCase()
const recipients = normalizeRecipients(args.recipients ?? process.env.TOP_CRANE_SAFETY_RECIPIENTS)

const supabaseUrl = normalizeText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
const supabaseServiceRoleKey = normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY)
const resendApiKey = normalizeText(process.env.RESEND_API_KEY)
const fromEmail = normalizeText(process.env.TOP_CRANE_SAFETY_FROM_EMAIL || process.env.ASSET_NOTIFICATION_FROM_EMAIL)

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

async function main() {
  if (scheduled && !force && !isScheduledSendWindow(new Date())) {
    console.log(JSON.stringify({
      skipped: true,
      reason: 'Outside scheduled send window.',
      scheduleTimeZone,
      scheduleWeekday,
      scheduleHour,
    }, null, 2))
    return
  }

  validateRequiredEnv()

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const rows = await loadSafetyIssueRows(supabase)
  const items = buildDigestItems(rows)
  const email = buildEmail(items)

  if (dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      startDate,
      endDate,
      minimumIssues,
      limit,
      customer: customerFilter || null,
      rowCount: rows.length,
      itemCount: items.length,
      recipients,
      subject: email.subject,
      items,
    }, null, 2))
    return
  }

  const resendResponse = await sendResendEmail(email)
  console.log(JSON.stringify({
    dryRun: false,
    sent: true,
    startDate,
    endDate,
    minimumIssues,
    limit,
    customer: customerFilter || null,
    rowCount: rows.length,
    itemCount: items.length,
    recipientCount: recipients.length,
    resendResponse,
  }, null, 2))
}

function validateRequiredEnv() {
  const missing = [
    ['SUPABASE_URL', supabaseUrl],
    ['SUPABASE_SERVICE_ROLE_KEY', supabaseServiceRoleKey],
    ['RESEND_API_KEY', resendApiKey],
    ['TOP_CRANE_SAFETY_FROM_EMAIL or ASSET_NOTIFICATION_FROM_EMAIL', fromEmail],
  ].filter(([, value]) => !value)

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.map(([name]) => name).join(', ')}`)
  }

  if (recipients.length === 0) {
    throw new Error('Set TOP_CRANE_SAFETY_RECIPIENTS or pass --recipients=email@example.com before sending.')
  }
}

async function loadSafetyIssueRows(supabase) {
  const inspections = await fetchAll(
    supabase
      .from('deshazo_external_report_inspections')
      .select('id,crane_row_id,inspection_date,completed_at')
      .or(`inspection_date.gte.${startDate},and(inspection_date.is.null,completed_at.gte.${startDate})`)
      .or(`inspection_date.lte.${endDate},and(inspection_date.is.null,completed_at.lt.${addDays(endDate, 1)})`)
      .order('inspection_date', { ascending: false }),
  )

  const filteredInspections = inspections.filter((inspection) => {
    const issueDate = getInspectionDate(inspection).slice(0, 10)
    return issueDate >= startDate && issueDate <= endDate
  })

  if (filteredInspections.length === 0) return []

  const craneIds = unique(filteredInspections.map((inspection) => inspection.crane_row_id).filter(Boolean))
  const cranes = await fetchByInChunks(
    supabase,
    'deshazo_external_report_cranes',
    'id,work_order_id,contact_code,description,location',
    'id',
    craneIds,
  )
  const craneById = new Map(cranes.map((crane) => [crane.id, crane]))

  const workOrderIds = unique(cranes.map((crane) => crane.work_order_id).filter(Boolean))
  const workOrders = await fetchByInChunks(
    supabase,
    'deshazo_external_work_orders',
    'work_order_id,bill_to_name,customer,customer_location_name,service_location_name',
    'work_order_id',
    workOrderIds,
  )
  const workOrderById = new Map(workOrders.map((workOrder) => [workOrder.work_order_id, workOrder]))

  const customerCraneIds = new Set(
    cranes
      .filter((crane) => {
        const workOrder = workOrderById.get(crane.work_order_id)
        const customer = normalizeCustomer(workOrder)
        return customerFilter ? customer === customerFilter : true
      })
      .map((crane) => crane.id),
  )

  const customerInspections = filteredInspections.filter((inspection) => customerCraneIds.has(inspection.crane_row_id))
  if (customerInspections.length === 0) return []

  const sections = await fetchByInChunks(
    supabase,
    'deshazo_external_report_sections',
    'id,inspection_row_id,section_name,section_index,section_order',
    'inspection_row_id',
    customerInspections.map((inspection) => inspection.id),
  )
  if (sections.length === 0) return []

  const sectionById = new Map(sections.map((section) => [section.id, section]))
  const inspectionById = new Map(customerInspections.map((inspection) => [inspection.id, inspection]))
  const points = await fetchByInChunks(
    supabase,
    'deshazo_external_report_points',
    'id,section_row_id,point_name,condition,remarks,point_index',
    'section_row_id',
    sections.map((section) => section.id),
  )

  return points
    .filter((point) => safetyConditions.has(normalizeCondition(point.condition)))
    .flatMap((point) => {
      const section = sectionById.get(point.section_row_id)
      const inspection = section ? inspectionById.get(section.inspection_row_id) : null
      const crane = inspection ? craneById.get(inspection.crane_row_id) : null
      const workOrder = crane ? workOrderById.get(crane.work_order_id) : null
      const unitId = normalizeText(crane?.contact_code).toUpperCase()

      if (!section || !inspection || !crane || !workOrder || !unitId) return []

      return [{
        issueId: point.id,
        customer: normalizeCustomer(workOrder) || 'unknown',
        unitId,
        unitName: buildUnitName(crane),
        location: normalizeText(workOrder.customer_location_name || workOrder.service_location_name),
        inspectionId: inspection.id,
        inspectionDate: getInspectionDate(inspection),
        category: normalizeText(point.point_name).toLowerCase() || 'uncategorized',
        condition: normalizeCondition(point.condition),
        remarks: normalizeRemarks(point.remarks),
      }]
    })
}

async function fetchAll(query) {
  const rows = []
  let from = 0

  while (true) {
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)

    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
    from += pageSize
  }

  return rows
}

async function fetchByInChunks(supabase, table, select, column, values) {
  const rows = []
  const distinctValues = unique(values)

  for (let index = 0; index < distinctValues.length; index += chunkSize) {
    const chunk = distinctValues.slice(index, index + chunkSize)
    rows.push(...await fetchAll(
      supabase
        .from(table)
        .select(select)
        .in(column, chunk),
    ))
  }

  return rows
}

function buildDigestItems(rows) {
  const grouped = new Map()

  for (const row of rows) {
    const key = `${row.customer}::${row.unitId}`
    const group = grouped.get(key) ?? {
      customer: row.customer,
      unitId: row.unitId,
      unitName: row.unitName,
      location: row.location,
      issueIds: new Set(),
      inspectionIds: new Set(),
      latestInspectionDate: '',
      categories: new Map(),
      conditions: new Map(),
      sampleRemarks: [],
    }

    group.issueIds.add(row.issueId)
    group.inspectionIds.add(row.inspectionId)
    if (row.inspectionDate && (!group.latestInspectionDate || row.inspectionDate > group.latestInspectionDate)) {
      group.latestInspectionDate = row.inspectionDate
    }

    group.categories.set(row.category, (group.categories.get(row.category) ?? 0) + 1)
    group.conditions.set(row.condition, (group.conditions.get(row.condition) ?? 0) + 1)

    if (row.remarks && group.sampleRemarks.length < 3 && !group.sampleRemarks.includes(row.remarks)) {
      group.sampleRemarks.push(row.remarks)
    }

    grouped.set(key, group)
  }

  return Array.from(grouped.values())
    .map((group) => ({
      customer: group.customer,
      unitId: group.unitId,
      unitName: group.unitName,
      location: group.location,
      issueCount: group.issueIds.size,
      inspectionCount: group.inspectionIds.size,
      latestInspectionDate: group.latestInspectionDate,
      categories: rankMap(group.categories).slice(0, 5),
      conditions: rankMap(group.conditions),
      sampleRemarks: group.sampleRemarks,
    }))
    .filter((item) => item.issueCount > minimumIssues)
    .sort((left, right) =>
      right.issueCount - left.issueCount ||
      right.inspectionCount - left.inspectionCount ||
      left.unitId.localeCompare(right.unitId)
    )
    .slice(0, limit)
}

function buildEmail(items) {
  const scope = customerFilter ? ` for ${customerFilter}` : ''
  const subject = `Top cranes with safety issues${scope}: ${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`
  const rows = items.map((item, index) => {
    const categories = item.categories.map((category) => `${escapeHtml(category.name)} (${category.count})`).join(', ')
    const conditions = item.conditions.map((condition) => `${escapeHtml(condition.name)} (${condition.count})`).join(', ')
    const remarks = item.sampleRemarks.length > 0
      ? `<div style="margin-top:6px;color:#4b5563;">${item.sampleRemarks.map((remark) => escapeHtml(remark)).join('<br>')}</div>`
      : ''

    return `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;font-weight:700;">${index + 1}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;">
          <div style="font-weight:700;color:#111827;">${escapeHtml(item.unitId)}</div>
          <div style="color:#4b5563;">${escapeHtml(item.unitName || item.unitId)}</div>
          <div style="color:#6b7280;">${escapeHtml(item.customer)}${item.location ? ` - ${escapeHtml(item.location)}` : ''}</div>
          ${remarks}
        </td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:#b91c1c;">${item.issueCount}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;">${item.inspectionCount}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;">${formatDisplayDate(item.latestInspectionDate)}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;">${categories || 'Uncategorized'}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;">${conditions || 'Safety'}</td>
      </tr>
    `
  }).join('')

  const content = items.length > 0
    ? `
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
        <thead>
          <tr style="background:#f9fafb;color:#374151;">
            <th align="left" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">Rank</th>
            <th align="left" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">Crane</th>
            <th align="right" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">Safety issues</th>
            <th align="right" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">Inspections</th>
            <th align="left" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">Latest inspection</th>
            <th align="left" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">Top categories</th>
            <th align="left" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">Conditions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `
    : `
      <p style="padding:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
        No cranes had more than ${minimumIssues} safety issues in this window.
      </p>
    `

  return {
    subject,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:980px;margin:0 auto;color:#111827;">
        <h1 style="font-size:22px;line-height:1.2;margin:0 0 10px;">Top crane safety issues</h1>
        <p style="margin:0 0 18px;color:#4b5563;">
          Cranes with more than ${minimumIssues} safety issues from ${formatDisplayDate(startDate)} through ${formatDisplayDate(endDate)}.
        </p>
        ${content}
      </div>
    `,
  }
}

async function sendResendEmail(email) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [fromEmail],
      bcc: recipients,
      subject: email.subject,
      html: email.html,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Resend request failed with status ${response.status}: ${body}`)
  }

  return response.json()
}

function parseArgs(argv) {
  return argv.reduce((parsed, arg) => {
    if (arg === '--dry-run') {
      parsed.dryRun = true
      return parsed
    }

    if (arg === '--scheduled') {
      parsed.scheduled = true
      return parsed
    }

    if (arg === '--force') {
      parsed.force = true
      return parsed
    }

    if (!arg.startsWith('--')) return parsed
    const [key, ...valueParts] = arg.slice(2).split('=')
    parsed[toCamelCase(key)] = valueParts.join('=')
    return parsed
  }, {})
}

function isScheduledSendWindow(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: scheduleTimeZone,
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(value)

  const weekdayName = parts.find((part) => part.type === 'weekday')?.value ?? ''
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName)

  return weekday === scheduleWeekday && hour === scheduleHour
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

function loadLocalEnv() {
  for (const fileName of ['.env.local', '.env']) {
    if (!existsSync(fileName)) continue

    const lines = readFileSync(fileName, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue

      const index = trimmed.indexOf('=')
      const key = trimmed.slice(0, index).trim()
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
      if (!(key in process.env)) process.env[key] = value
    }
  }
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeCondition(value) {
  return normalizeText(value).toUpperCase()
}

function normalizeCustomer(workOrder) {
  return normalizeText(workOrder?.customer || workOrder?.bill_to_name).toLowerCase()
}

function normalizeRecipients(value) {
  return Array.from(
    new Set(
      normalizeText(value)
        .split(',')
        .map((recipient) => recipient.trim().toLowerCase())
        .filter((recipient) => recipient.includes('@')),
    ),
  )
}

function normalizeDate(value) {
  const text = normalizeText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(Math.trunc(parsed), max))
}

function toIsoDate(value) {
  return value.toISOString().slice(0, 10)
}

function addDays(value, days) {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return toIsoDate(parsed)
}

function getInspectionDate(inspection) {
  return normalizeText(inspection.inspection_date || inspection.completed_at)
}

function buildUnitName(crane) {
  return [normalizeText(crane.contact_code).toUpperCase(), normalizeText(crane.description)]
    .filter(Boolean)
    .join(' ')
}

function normalizeRemarks(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeRemarkItem(item))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  return normalizeRemarkItem(value).replace(/\s+/g, ' ').trim()
}

function normalizeRemarkItem(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value !== 'object') return String(value)

  return normalizeText(
    value.Remark ??
    value.remark ??
    value.content ??
    value.notes ??
    value.value ??
    value.text,
  )
}

function rankMap(map) {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
}

function unique(values) {
  return Array.from(new Set(values))
}

function escapeHtml(value) {
  return normalizeText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatDisplayDate(value) {
  if (!value) return 'Not available'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
