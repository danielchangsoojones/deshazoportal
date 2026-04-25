import { supabase } from './supabase'

type AssetNotificationSubscriberRow = {
  unit_id: string
  email: string
  new_reports: boolean
  repair_done: boolean
  updated_at: string
  updated_by: string
  updated_by_name: string
  updated_by_email: string
}

export type AssetNotificationSubscriberRecord = {
  unitId: string
  email: string
  newReports: boolean
  repairDone: boolean
  updatedAt: string
  updatedBy: string
  updatedByName: string
  updatedByEmail: string
}

const mapAssetNotificationSubscriber = (
  row: AssetNotificationSubscriberRow,
): AssetNotificationSubscriberRecord => ({
  unitId: row.unit_id,
  email: row.email,
  newReports: row.new_reports,
  repairDone: row.repair_done,
  updatedAt: row.updated_at,
  updatedBy: row.updated_by,
  updatedByName: row.updated_by_name,
  updatedByEmail: row.updated_by_email,
})

export async function listAssetNotificationSubscribers(unitId: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase
    .from('asset_notification_subscribers')
    .select('unit_id, email, new_reports, repair_done, updated_at, updated_by, updated_by_name, updated_by_email')
    .eq('unit_id', unitId)
    .order('email', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => mapAssetNotificationSubscriber(row as AssetNotificationSubscriberRow))
}

export async function upsertAssetNotificationSubscriber(input: {
  unitId: string
  email: string
  newReports: boolean
  repairDone: boolean
  updatedBy: string
  updatedByName: string
  updatedByEmail: string
}) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase
    .from('asset_notification_subscribers')
    .upsert(
      {
        unit_id: input.unitId,
        email: input.email,
        new_reports: input.newReports,
        repair_done: input.repairDone,
        updated_by: input.updatedBy,
        updated_by_name: input.updatedByName,
        updated_by_email: input.updatedByEmail,
      },
      { onConflict: 'unit_id,email' },
    )
    .select('unit_id, email, new_reports, repair_done, updated_at, updated_by, updated_by_name, updated_by_email')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapAssetNotificationSubscriber(data as AssetNotificationSubscriberRow)
}

export async function deleteAssetNotificationSubscriber(unitId: string, email: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { error } = await supabase
    .from('asset_notification_subscribers')
    .delete()
    .eq('unit_id', unitId)
    .eq('email', email)

  if (error) {
    throw new Error(error.message)
  }
}
