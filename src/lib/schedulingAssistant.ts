import { supabase } from './supabase'
import type { DeshazoScheduleEvent, DeshazoScheduleResource } from './deshazoSchedule'
import type { DeshazoWorkOrder } from './deshazoWorkOrders'

export type ScheduleAssistantChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ScheduleSuggestionEvidence = {
  kind: string
  label: string
  referenceId: string
}

export type ScheduleSuggestion = {
  id: string
  resourceId: string
  workOrderId: string
  start: string
  end: string
  label: string
  confidence: number
  rationale: string[]
  warnings: string[]
  evidence: ScheduleSuggestionEvidence[]
}

export type ScheduleAssistantResponse = {
  answer: string
  summary: string
  suggestions: ScheduleSuggestion[]
  meta?: {
    pipeline: string
    openaiInterpreterUsed: boolean
    candidateCount: number
    originalCounts: {
      resources: number
      events: number
      pendingWorkOrders: number
    }
    usage: {
      openai: { inputTokens: number; outputTokens: number }
      fable: { inputTokens: number; outputTokens: number }
    }
    estimatedCostUsd: number
  }
}

type SchedulingAssistantRequest = {
  message: string
  history: ScheduleAssistantChatMessage[]
  range: { start: string; end: string }
  serviceLocationId: number | null
  resources: DeshazoScheduleResource[]
  events: DeshazoScheduleEvent[]
  pendingWorkOrders: DeshazoWorkOrder[]
}

function compactText(value: string | null | undefined, maxLength = 240) {
  return (value || '').trim().slice(0, maxLength)
}

function compactResource(resource: DeshazoScheduleResource) {
  return {
    id: String(resource.id),
    name: compactText(resource.title || resource.name || resource.employeeName || resource.extendedProps?.title || resource.extendedProps?.name || resource.extendedProps?.employeeName, 120),
    group: compactText(resource.group || resource.extendedProps?.group, 120),
    serviceLocationName: compactText(resource.serviceLocationName, 120),
  }
}

function compactEvent(event: DeshazoScheduleEvent) {
  const tooltip = event.extendedProps?.tooltipData || event.tooltipData
  const workOrder = tooltip?.workOrderTrip?.workOrder
  return {
    id: String(event.id),
    resourceIds: event.resourceIds?.map(String) || (event.resourceId == null ? [] : [String(event.resourceId)]),
    title: compactText(event.title, 160),
    start: event.start || tooltip?.startDate || tooltip?.workOrderTrip?.startDate || '',
    end: event.end || tooltip?.endDate || tooltip?.workOrderTrip?.endDate || '',
    isDayOff: Boolean(tooltip?.isDayOff),
    employeeName: compactText(tooltip?.employeeName, 120),
    reason: compactText(tooltip?.reason, 160),
    customerName: compactText(tooltip?.customerName, 160),
    location: compactText(tooltip?.location, 200),
    workOrderId: String(tooltip?.workOrderTrip?.workOrderId || workOrder?.id || ''),
    jobNo: compactText(workOrder?.jobNo, 80),
    jobType: compactText(workOrder?.jobType, 80),
    status: compactText(workOrder?.status?.name, 80),
  }
}

function compactWorkOrder(workOrder: DeshazoWorkOrder) {
  const location = workOrder.customerLocation
  return {
    id: String(workOrder.id),
    jobNo: compactText(workOrder.jobNo, 80),
    jobType: compactText(workOrder.jobType, 80),
    customerName: compactText(workOrder.customerWorkOrder?.customerName, 160),
    address: compactText([
      location?.shipToCity,
      location?.shipToState,
      location?.shipToZipCode,
    ].filter(Boolean).join(', '), 160),
    serviceRequested: compactText(workOrder.svcCommentText || workOrder.comment, 500),
    requestedStart: workOrder.startDate || '',
    requestedEnd: workOrder.endDate || '',
    serviceLocationId: workOrder.serviceLocation?.id || null,
    serviceLocationName: compactText(workOrder.serviceLocation?.name, 120),
    status: compactText(workOrder.status?.name, 80),
  }
}

export async function requestScheduleAssistant(input: SchedulingAssistantRequest): Promise<ScheduleAssistantResponse> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const message = input.message.trim()
  if (!message) throw new Error('Enter a scheduling question.')

  const { data, error } = await supabase.functions.invoke<ScheduleAssistantResponse>('scheduling-assistant', {
    body: {
      message: message.slice(0, 2_000),
      history: input.history.slice(-8).map((item) => ({
        role: item.role,
        content: item.content.slice(0, 2_000),
      })),
      schedule: {
        range: input.range,
        serviceLocationId: input.serviceLocationId,
        resources: input.resources.slice(0, 300).map(compactResource),
        events: input.events.slice(0, 3_000).map(compactEvent),
        pendingWorkOrders: input.pendingWorkOrders.slice(0, 200).map(compactWorkOrder),
      },
    },
  })

  if (error) {
    const context = (error as { context?: Response }).context
    if (context) {
      try {
        const body = await context.clone().json() as { error?: string }
        if (body.error) throw new Error(body.error)
      } catch (contextError) {
        if (contextError instanceof Error && contextError.message !== 'Unexpected end of JSON input' && !contextError.name.includes('SyntaxError')) {
          throw contextError
        }
      }
    }
    throw new Error(error.message || 'The scheduling assistant request failed.')
  }
  if (!data || !Array.isArray(data.suggestions)) throw new Error('The scheduling assistant returned an unexpected response.')
  return data
}
