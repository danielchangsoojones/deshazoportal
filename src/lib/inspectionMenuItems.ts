import { supabase } from './supabase'

export type InspectionMenuItem = {
  id?: string
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
  id: string
  user_id: string
  section_title: string
  label: string
  description: string
  rate: string | number
  display_order: number
  sync_token: string
  updated_at: string
}

type EditableInspectionMenuItemsInsert = {
  id?: string
  user_id: string
  section_title: string
  label: string
  description: string
  rate: string
  display_order: number
  sync_token: string
}

function createMenuItemId() {
  return globalThis.crypto?.randomUUID?.()
}

function mapMenuItemsRows(userId: string, rows: EditableInspectionMenuItemsRow[]): InspectionMenuItemsRecord | null {
  if (rows.length === 0) return null

  const sectionMap = new Map<string, InspectionMenuItem[]>()
  let updatedAt = rows[0]?.updated_at ?? new Date().toISOString()

  rows.forEach((row) => {
    const items = sectionMap.get(row.section_title) ?? []
    items.push({
      id: row.id,
      label: row.label,
      description: row.description,
      rate: String(row.rate),
    })
    sectionMap.set(row.section_title, items)

    if (row.updated_at > updatedAt) updatedAt = row.updated_at
  })

  return {
    userId,
    menuSections: Array.from(sectionMap.entries()).map(([title, items]) => ({ title, items })),
    updatedAt,
  }
}

function flattenMenuSections(userId: string, syncToken: string, menuSections: InspectionMenuItemSection[]) {
  return menuSections.flatMap((section) =>
    section.items.map((item, itemIndex) => {
      const row: EditableInspectionMenuItemsInsert = {
        user_id: userId,
        section_title: section.title,
        label: item.label,
        description: item.description,
        rate: item.rate,
        display_order: itemIndex,
        sync_token: syncToken,
      }

      if (item.id) row.id = item.id
      else {
        const id = createMenuItemId()
        if (id) row.id = id
      }

      return row
    }),
  )
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
    .select('id, user_id, section_title, label, description, rate, display_order, sync_token, updated_at')
    .eq('user_id', userId)
    .order('section_title', { ascending: true })
    .order('display_order', { ascending: true })
    .order('label', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return mapMenuItemsRows(userId, (data ?? []) as EditableInspectionMenuItemsRow[])
}

export async function upsertInspectionMenuItems(menuSections: InspectionMenuItemSection[]) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const userId = await getCurrentUserId()
  const syncToken = createMenuItemId()
  if (!syncToken) {
    throw new Error('Menu items could not be saved because this browser could not create a sync id.')
  }
  const rows = flattenMenuSections(userId, syncToken, menuSections)

  if (rows.length === 0) {
    const { error: deleteAllError } = await supabase
      .from('editable_inspection_menu_items')
      .delete()
      .eq('user_id', userId)

    if (deleteAllError) {
      throw new Error(deleteAllError.message)
    }

    return {
      userId,
      menuSections: [],
      updatedAt: new Date().toISOString(),
    }
  }

  const { data, error } = await supabase
    .from('editable_inspection_menu_items')
    .upsert(rows, { onConflict: 'id' })
    .select('id, user_id, section_title, label, description, rate, display_order, sync_token, updated_at')
    .order('section_title', { ascending: true })
    .order('display_order', { ascending: true })
    .order('label', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  const { error: deleteStaleError } = await supabase
    .from('editable_inspection_menu_items')
    .delete()
    .eq('user_id', userId)
    .neq('sync_token', syncToken)

  if (deleteStaleError) {
    throw new Error(deleteStaleError.message)
  }

  return mapMenuItemsRows(userId, (data ?? []) as EditableInspectionMenuItemsRow[]) ?? {
    userId,
    menuSections: [],
    updatedAt: new Date().toISOString(),
  }
}
