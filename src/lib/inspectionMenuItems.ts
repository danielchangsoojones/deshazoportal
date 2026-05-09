import { callParseFunction } from './portalApi'
import { supabase } from './supabase'

export type InspectionMenuItem = {
  label: string
  description: string
  rate: string
}

export type InspectionMenuItemSection = {
  title: string
  items: InspectionMenuItem[]
}

export type InspectionMenuItemsRecord = {
  userId: string
  menuSections: InspectionMenuItemSection[]
  updatedAt: string
}

type InspectionMenuItemsResponse = {
  userId: string
  menuSections: InspectionMenuItemSection[]
  updatedAt: string
}

function extractMenuItemsResponse(value: unknown): InspectionMenuItemsResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>

  if ('result' in record) {
    return extractMenuItemsResponse(record.result)
  }

  if ('data' in record) {
    return extractMenuItemsResponse(record.data)
  }

  if (
    typeof record.userId === 'string' &&
    Array.isArray(record.menuSections) &&
    typeof record.updatedAt === 'string'
  ) {
    return record as InspectionMenuItemsResponse
  }

  return null
}

async function getCurrentAccessToken() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw new Error(error.message)
  }

  const accessToken = data.session?.access_token
  if (!accessToken) {
    throw new Error('Sign in to save menu items.')
  }

  return accessToken
}

export async function getInspectionMenuItems() {
  const accessToken = await getCurrentAccessToken()
  const response = await callParseFunction<unknown>('getEditableInspectionMenuItems', {
    accessToken,
  })

  return extractMenuItemsResponse(response)
}

export async function upsertInspectionMenuItems(menuSections: InspectionMenuItemSection[]) {
  const accessToken = await getCurrentAccessToken()
  const response = await callParseFunction<unknown>('upsertEditableInspectionMenuItems', {
    accessToken,
    menuSections,
  })
  const savedMenu = extractMenuItemsResponse(response)

  if (!savedMenu) {
    throw new Error('Menu items returned an unexpected response shape.')
  }

  return savedMenu
}
