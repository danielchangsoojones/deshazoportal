import { supabase } from './supabase'
import { getCurrentUserBranches } from './userTags'

export type InspectionMenuItem = {
  id?: string
  userId?: string
  label: string
  description: string
  rate: string
  internalCost?: string
  customerPrice?: string
  updatedAt?: string
  sourceDocumentId?: string | null
  sourceDocumentName?: string | null
  sourceDocumentBucket?: string | null
  sourceDocumentFilePath?: string | null
  branches?: string[]
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
  label: string
  description: string
  rate: string | number
  internal_cost: string | number | null
  customer_price: string | number | null
  source_document_id: string | null
  source_document_name: string | null
  source_document_bucket: string | null
  source_document_file_path: string | null
  branches: string[] | null
  display_order: number
  sync_token: string
  updated_at: string
}

type EditableInspectionMenuItemsInsert = {
  id?: string
  user_id: string
  label: string
  description: string
  rate: string
  internal_cost: string
  customer_price: string
  source_document_id?: string | null
  source_document_name?: string | null
  source_document_bucket?: string | null
  source_document_file_path?: string | null
  branches: string[]
  display_order: number
  sync_token: string
}

const inspectionMenuItemsSelect = `
  id,
  user_id,
  label,
  description,
  rate,
  internal_cost,
  customer_price,
  source_document_id,
  source_document_name,
  source_document_bucket,
  source_document_file_path,
  branches,
  display_order,
  sync_token,
  updated_at
`

function createMenuItemId() {
  return globalThis.crypto?.randomUUID?.()
}

function mapMenuItemsRows(userId: string, rows: EditableInspectionMenuItemsRow[]): InspectionMenuItemsRecord | null {
  if (rows.length === 0) return null

  const items: InspectionMenuItem[] = []
  let updatedAt = rows[0]?.updated_at ?? new Date().toISOString()

  rows.forEach((row) => {
    const internalCost = row.internal_cost == null ? String(row.rate) : String(row.internal_cost)
    const customerPrice = row.customer_price == null ? String(row.rate) : String(row.customer_price)

    items.push({
      id: row.id,
      userId: row.user_id,
      label: row.label,
      description: row.description,
      rate: internalCost,
      internalCost,
      customerPrice,
      updatedAt: row.updated_at,
      sourceDocumentId: row.source_document_id,
      sourceDocumentName: row.source_document_name,
      sourceDocumentBucket: row.source_document_bucket,
      sourceDocumentFilePath: row.source_document_file_path,
      branches: row.branches ?? [],
    })

    if (row.updated_at > updatedAt) updatedAt = row.updated_at
  })

  return {
    userId,
    menuSections: [{ title: 'Menu Items', items }],
    updatedAt,
  }
}

function flattenMenuSections(
  userId: string,
  syncToken: string,
  branches: string[],
  menuSections: InspectionMenuItemSection[],
) {
  return menuSections.flatMap((section) =>
    section.items.map((item) => {
      if (item.userId && item.userId !== userId) return null

      const internalCost = item.internalCost ?? item.rate
      const customerPrice = item.customerPrice ?? item.rate

      const row: EditableInspectionMenuItemsInsert = {
        user_id: userId,
        label: item.label,
        description: item.description,
        rate: internalCost,
        internal_cost: internalCost,
        customer_price: customerPrice,
        source_document_id: item.sourceDocumentId ?? null,
        source_document_name: item.sourceDocumentName ?? null,
        source_document_bucket: item.sourceDocumentBucket ?? null,
        source_document_file_path: item.sourceDocumentFilePath ?? null,
        branches,
        display_order: 0,
        sync_token: syncToken,
      }

      if (item.id) row.id = item.id
      else {
        const id = createMenuItemId()
        if (id) row.id = id
      }

      return row
    }).filter((row): row is EditableInspectionMenuItemsInsert => Boolean(row)),
  ).map((row, displayOrder) => ({ ...row, display_order: displayOrder }))
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
    .select(inspectionMenuItemsSelect)
    .order('updated_at', { ascending: false })
    .order('display_order', { ascending: true })
    .order('label', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return mapMenuItemsRows(userId, (data ?? []) as EditableInspectionMenuItemsRow[])
}

function mergeMenuItemRows(rows: EditableInspectionMenuItemsRow[]) {
  const rowsById = new Map<string, EditableInspectionMenuItemsRow>()

  rows.forEach((row) => {
    if (!rowsById.has(row.id)) rowsById.set(row.id, row)
  })

  return Array.from(rowsById.values()).sort((firstRow, secondRow) => {
    const updatedComparison = secondRow.updated_at.localeCompare(firstRow.updated_at)
    if (updatedComparison !== 0) return updatedComparison

    if (firstRow.display_order !== secondRow.display_order) return firstRow.display_order - secondRow.display_order
    return firstRow.label.localeCompare(secondRow.label)
  })
}

function parseRateSearchValue(searchValue: string) {
  const normalizedValue = searchValue.replace(/[$,\s]/g, '')
  if (!normalizedValue || !/^-?\d+(\.\d+)?$/.test(normalizedValue)) return null

  return Number(normalizedValue)
}

export async function searchInspectionMenuItems(searchValue: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const userId = await getCurrentUserId()
  const normalizedSearchValue = searchValue.trim()
  if (!normalizedSearchValue) return null

  const likeSearchValue = `%${normalizedSearchValue}%`
  const rateSearchValue = parseRateSearchValue(normalizedSearchValue)
  const searchLimit = 100

  const labelSearch = supabase
    .from('editable_inspection_menu_items')
    .select(inspectionMenuItemsSelect)
    .ilike('label', likeSearchValue)
    .order('updated_at', { ascending: false })
    .order('display_order', { ascending: true })
    .order('label', { ascending: true })
    .limit(searchLimit)

  const descriptionSearch = supabase
    .from('editable_inspection_menu_items')
    .select(inspectionMenuItemsSelect)
    .ilike('description', likeSearchValue)
    .order('updated_at', { ascending: false })
    .order('display_order', { ascending: true })
    .order('label', { ascending: true })
    .limit(searchLimit)

  const rateSearch = rateSearchValue == null
    ? Promise.resolve({ data: [], error: null })
    : supabase
        .from('editable_inspection_menu_items')
        .select(inspectionMenuItemsSelect)
        .eq('rate', rateSearchValue)
        .order('updated_at', { ascending: false })
        .order('display_order', { ascending: true })
        .order('label', { ascending: true })
        .limit(searchLimit)

  const internalCostSearch = rateSearchValue == null
    ? Promise.resolve({ data: [], error: null })
    : supabase
        .from('editable_inspection_menu_items')
        .select(inspectionMenuItemsSelect)
        .eq('internal_cost', rateSearchValue)
        .order('updated_at', { ascending: false })
        .order('display_order', { ascending: true })
        .order('label', { ascending: true })
        .limit(searchLimit)

  const customerPriceSearch = rateSearchValue == null
    ? Promise.resolve({ data: [], error: null })
    : supabase
        .from('editable_inspection_menu_items')
        .select(inspectionMenuItemsSelect)
        .eq('customer_price', rateSearchValue)
        .order('updated_at', { ascending: false })
        .order('display_order', { ascending: true })
        .order('label', { ascending: true })
        .limit(searchLimit)

  const results = await Promise.all([labelSearch, descriptionSearch, rateSearch, internalCostSearch, customerPriceSearch])
  const error = results.find((result) => result.error)?.error
  if (error) {
    throw new Error(error.message)
  }

  const rows = mergeMenuItemRows(
    results.flatMap((result) => (result.data ?? []) as EditableInspectionMenuItemsRow[]),
  ).slice(0, searchLimit)

  return mapMenuItemsRows(userId, rows) ?? {
    userId,
    menuSections: [],
    updatedAt: new Date().toISOString(),
  }
}

export async function upsertInspectionMenuItems(menuSections: InspectionMenuItemSection[]) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const userId = await getCurrentUserId()
  const branches = await getCurrentUserBranches(userId)
  const syncToken = createMenuItemId()
  if (!syncToken) {
    throw new Error('Menu items could not be saved because this browser could not create a sync id.')
  }
  const rows = flattenMenuSections(userId, syncToken, branches, menuSections)

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
    .select(inspectionMenuItemsSelect)
    .order('updated_at', { ascending: false })
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

export async function deleteInspectionMenuItem(menuItemId: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('editable_inspection_menu_items')
    .delete()
    .eq('id', menuItemId)
    .eq('user_id', userId)
    .select('id')

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).length > 0
}
