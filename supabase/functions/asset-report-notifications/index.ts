import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ParseFunctionBody = Record<string, unknown>

type AssetPdfDocument = {
  inspection_date?: string
  pdf?: string
  type?: string
  display_name?: string
}

type AssetPdfResponse = {
  results?: AssetPdfDocument[]
  total_pages?: number
  page?: number
}

type AssetInfoAnalytics = {
  unit_name?: string
  unit_location?: string
  unit_internal_location?: string
}

type SubscriberRow = {
  unit_id: string
  email: string
  new_reports: boolean
}

type EventRow = {
  event_key: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notification-secret',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
const fromEmail = Deno.env.get('ASSET_NOTIFICATION_FROM_EMAIL') ?? ''
const notificationSecret = Deno.env.get('ASSET_NOTIFICATION_FUNCTION_SECRET') ?? ''

const parseBaseUrl =
  Deno.env.get('PORTAL_PARSE_BASE_URL')?.trim() ||
  'https://blockstamp-production-2b9f8bfc27a8.herokuapp.com/parse/functions'
const parseAppId = Deno.env.get('PORTAL_PARSE_APP_ID')?.trim() || 'blockstampprod395969600'
const parseRestApiKey = Deno.env.get('PORTAL_PARSE_REST_API_KEY')?.trim() || ''
const parseMasterKey = Deno.env.get('PORTAL_PARSE_MASTER_KEY')?.trim() || ''

const requiredEnv = [
  ['SUPABASE_URL', supabaseUrl],
  ['SUPABASE_SERVICE_ROLE_KEY', supabaseServiceRoleKey],
  ['RESEND_API_KEY', resendApiKey],
  ['ASSET_NOTIFICATION_FROM_EMAIL', fromEmail],
  ['PORTAL_PARSE_REST_API_KEY or PORTAL_PARSE_MASTER_KEY', parseRestApiKey || parseMasterKey],
].filter(([, value]) => !value)

const supabase = requiredEnv.length === 0
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null

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

async function callParseFunction<TResponse>(
  functionName: string,
  body: ParseFunctionBody = {},
): Promise<TResponse> {
  const response = await fetch(`${parseBaseUrl}/${functionName}`, {
    method: 'POST',
    headers: buildParseHeaders(),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Parse request failed with status ${response.status}`)
  }

  return (await response.json()) as TResponse
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

async function getAssetInfo(unitId: string) {
  const response = await callParseFunction<unknown>('getAssetInfo', { unit_id: unitId })
  const data = extractObjectPayload<AssetInfoAnalytics>(response)

  if (data) {
    return data
  }

  throw new Error('Asset info returned an unexpected response shape.')
}

async function getAssetPdfPage(unitId: string, page: number) {
  const response = await callParseFunction<unknown>('getAssetPDF', {
    unit_id: unitId,
    page: String(page),
    include_meta: true,
  })
  const data = extractObjectPayload<AssetPdfResponse>(response)

  if (data) {
    return data
  }

  throw new Error('Asset PDF documents returned an unexpected response shape.')
}

async function getAllAssetPdfs(unitId: string) {
  const firstPage = await getAssetPdfPage(unitId, 1)
  const totalPages = Math.max(1, firstPage.total_pages ?? 1)
  const results = [...(firstPage.results ?? [])]

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await getAssetPdfPage(unitId, page)
    results.push(...(nextPage.results ?? []))
  }

  return results
}

function normalizeDocumentValue(value?: string) {
  return (value ?? '').trim()
}

function buildEventKey(unitId: string, document: AssetPdfDocument) {
  return [
    unitId.trim(),
    normalizeDocumentValue(document.display_name).toLowerCase(),
    normalizeDocumentValue(document.type).toLowerCase(),
    normalizeDocumentValue(document.inspection_date).toLowerCase(),
    normalizeDocumentValue(document.pdf),
  ].join('::')
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function sendResendEmail(input: {
  bcc: string[]
  subject: string
  html: string
}) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [fromEmail],
      bcc: input.bcc,
      subject: input.subject,
      html: input.html,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Resend request failed with status ${response.status}: ${body}`)
  }

  return await response.json()
}

function buildNewReportEmail(input: {
  unitId: string
  unitName: string
  unitLocation: string
  unitInternalLocation: string
  document: AssetPdfDocument
}) {
  const title = input.unitName || input.unitId
  const inspectionDate = normalizeDocumentValue(input.document.inspection_date) || 'Not available'
  const documentName = normalizeDocumentValue(input.document.display_name) || 'Asset report'
  const documentType = normalizeDocumentValue(input.document.type) || 'Report'
  const documentUrl = normalizeDocumentValue(input.document.pdf)

  const details = [
    ['Asset', title],
    ['Unit ID', input.unitId],
    ['Location', input.unitLocation || 'Not available'],
    ['Internal location', input.unitInternalLocation || 'Not available'],
    ['Document', documentName],
    ['Type', documentType],
    ['Inspection date', inspectionDate],
  ]

  const rows = details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;font-weight:700;border-bottom:1px solid #e5e7eb;">${escapeHtml(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(value)}</td></tr>`,
    )
    .join('')

  const linkBlock = documentUrl
    ? `<p style="margin:20px 0 0;"><a href="${escapeHtml(documentUrl)}" style="display:inline-block;background:#2f56a6;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Open Report</a></p>`
    : ''

  return {
    subject: `New asset report available for ${title}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
        <h1 style="font-size:22px;line-height:1.2;margin:0 0 16px;">New report available</h1>
        <p style="margin:0 0 18px;">A new report has been detected for asset <strong>${escapeHtml(title)}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tbody>${rows}</tbody>
        </table>
        ${linkBlock}
      </div>
    `,
  }
}

async function insertEventLog(input: {
  unitId: string
  eventType: 'new_report'
  eventKey: string
  eventLabel: string
  documentType: string
  inspectionDate: string
  documentUrl: string
  status: 'baselined' | 'sent'
  recipientCount: number
  metadata?: Record<string, unknown>
}) {
  if (!supabase) {
    throw new Error('Supabase client is not configured for this function.')
  }

  const { error } = await supabase
    .from('asset_notification_events')
    .insert({
      unit_id: input.unitId,
      event_type: input.eventType,
      event_key: input.eventKey,
      event_label: input.eventLabel,
      document_type: input.documentType,
      inspection_date: input.inspectionDate,
      document_url: input.documentUrl,
      first_sent_at: input.status === 'sent' ? new Date().toISOString() : null,
      last_status: input.status,
      recipient_count: input.recipientCount,
      metadata: input.metadata ?? {},
    })

  if (error) {
    throw new Error(error.message)
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (requiredEnv.length > 0 || !supabase) {
      const missing = requiredEnv.map(([name]) => name)
      console.error('Missing required function secrets:', missing)
      return new Response(
        JSON.stringify({
          error: 'Missing required function secrets.',
          missing,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (notificationSecret) {
      const receivedSecret = request.headers.get('x-notification-secret') ?? ''
      if (receivedSecret !== notificationSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
    const mode = body?.mode === 'baseline' ? 'baseline' : 'send'
    const requestedUnitId = typeof body?.unitId === 'string' ? body.unitId.trim() : ''

    const { data: subscriberRows, error: subscriberError } = await supabase
      .from('asset_notification_subscribers')
      .select('unit_id, email, new_reports')
      .eq('new_reports', true)

    if (subscriberError) {
      throw new Error(subscriberError.message)
    }

    const filteredSubscribers = (subscriberRows as SubscriberRow[] | null)?.filter((row) =>
      requestedUnitId ? row.unit_id === requestedUnitId : true,
    ) ?? []

    const unitIds = Array.from(new Set(filteredSubscribers.map((row) => row.unit_id).filter(Boolean)))

    const summary = {
      mode,
      processedUnits: 0,
      baselinedEvents: 0,
      sentEvents: 0,
      skippedEvents: 0,
      errors: [] as Array<{ unitId: string; message: string }>,
    }

    for (const unitId of unitIds) {
      try {
        const recipients = filteredSubscribers
          .filter((row) => row.unit_id === unitId)
          .map((row) => row.email)

        if (recipients.length === 0) {
          continue
        }

        const [assetInfo, documents] = await Promise.all([
          getAssetInfo(unitId),
          getAllAssetPdfs(unitId),
        ])

        if (documents.length === 0) {
          summary.processedUnits += 1
          continue
        }

        const eventKeys = documents.map((document) => buildEventKey(unitId, document))
        const { data: existingEvents, error: existingEventsError } = await supabase
          .from('asset_notification_events')
          .select('event_key')
          .eq('unit_id', unitId)
          .eq('event_type', 'new_report')
          .in('event_key', eventKeys)

        if (existingEventsError) {
          throw new Error(existingEventsError.message)
        }

        const seenKeys = new Set(((existingEvents as EventRow[] | null) ?? []).map((row) => row.event_key))

        for (const document of documents) {
          const eventKey = buildEventKey(unitId, document)
          if (seenKeys.has(eventKey)) {
            summary.skippedEvents += 1
            continue
          }

          const eventLabel = normalizeDocumentValue(document.display_name) || 'Asset report'
          const documentType = normalizeDocumentValue(document.type)
          const inspectionDate = normalizeDocumentValue(document.inspection_date)
          const documentUrl = normalizeDocumentValue(document.pdf)

          if (mode === 'baseline') {
            await insertEventLog({
              unitId,
              eventType: 'new_report',
              eventKey,
              eventLabel,
              documentType,
              inspectionDate,
              documentUrl,
              status: 'baselined',
              recipientCount: 0,
              metadata: { mode: 'baseline' },
            })
            summary.baselinedEvents += 1
            continue
          }

          const email = buildNewReportEmail({
            unitId,
            unitName: normalizeDocumentValue(assetInfo.unit_name) || unitId,
            unitLocation: normalizeDocumentValue(assetInfo.unit_location),
            unitInternalLocation: normalizeDocumentValue(assetInfo.unit_internal_location),
            document,
          })

          await sendResendEmail({
            bcc: recipients,
            subject: email.subject,
            html: email.html,
          })

          await insertEventLog({
            unitId,
            eventType: 'new_report',
            eventKey,
            eventLabel,
            documentType,
            inspectionDate,
            documentUrl,
            status: 'sent',
            recipientCount: recipients.length,
            metadata: {
              mode: 'send',
            },
          })
          summary.sentEvents += 1
        }

        summary.processedUnits += 1
      } catch (error) {
        console.error('Unit processing failed', {
          unitId,
          message: error instanceof Error ? error.message : 'Unknown error',
        })
        summary.errors.push({
          unitId,
          message: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Function failed', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
