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

type EditableInspectionMenuItemsRow = {
  user_id: string
  menu_sections: unknown
  updated_at: string
}

function isMenuItem(value: unknown): value is InspectionMenuItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false

  const item = value as Record<string, unknown>
  return (
    typeof item.label === 'string'
    && typeof item.description === 'string'
    && typeof item.rate === 'string'
  )
}

function isMenuItemSection(value: unknown): value is InspectionMenuItemSection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false

  const section = value as Record<string, unknown>
  return (
    typeof section.title === 'string'
    && Array.isArray(section.items)
    && section.items.every(isMenuItem)
  )
}

function mapMenuItemsRow(row: EditableInspectionMenuItemsRow): InspectionMenuItemsRecord {
  const menuSections = Array.isArray(row.menu_sections)
    ? row.menu_sections.filter(isMenuItemSection)
    : []

  return {
    userId: row.user_id,
    menuSections,
    updatedAt: row.updated_at,
  }
}

async function getCurrentUserId() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase.auth.getUser()

  if (error) {
    throw new Error(error.message)
  }

  if (!data.user) {
    throw new Error('Sign in to save menu items.')
  }

  return data.user.id
}

export async function getInspectionMenuItems() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('editable_inspection_menu_items')
    .select('user_id, menu_sections, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data ? mapMenuItemsRow(data as EditableInspectionMenuItemsRow) : null
}

export async function upsertInspectionMenuItems(menuSections: InspectionMenuItemSection[]) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('editable_inspection_menu_items')
    .upsert(
      {
        user_id: userId,
        menu_sections: menuSections,
      },
      { onConflict: 'user_id' },
    )
    .select('user_id, menu_sections, updated_at')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapMenuItemsRow(data as EditableInspectionMenuItemsRow)
}
