import { supabase } from './supabase'

type AssetCompanyInternalIdRow = {
  unit_id: string
  unique_company_internal_id: string
  updated_at: string
  updated_by: string
  updated_by_name: string
  updated_by_email: string
}

export type AssetCompanyInternalIdRecord = {
  unitId: string
  value: string
  updatedAt: string
  updatedBy: string
  updatedByName: string
  updatedByEmail: string
}

const mapAssetCompanyInternalId = (row: AssetCompanyInternalIdRow): AssetCompanyInternalIdRecord => ({
  unitId: row.unit_id,
  value: row.unique_company_internal_id,
  updatedAt: row.updated_at,
  updatedBy: row.updated_by,
  updatedByName: row.updated_by_name,
  updatedByEmail: row.updated_by_email,
})

export async function getAssetCompanyInternalId(unitId: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase
    .from('asset_company_internal_ids')
    .select('unit_id, unique_company_internal_id, updated_at, updated_by, updated_by_name, updated_by_email')
    .eq('unit_id', unitId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data ? mapAssetCompanyInternalId(data as AssetCompanyInternalIdRow) : null
}

export async function upsertAssetCompanyInternalId(input: {
  unitId: string
  value: string
  updatedBy: string
  updatedByName: string
  updatedByEmail: string
}) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase
    .from('asset_company_internal_ids')
    .upsert(
      {
        unit_id: input.unitId,
        unique_company_internal_id: input.value,
        updated_by: input.updatedBy,
        updated_by_name: input.updatedByName,
        updated_by_email: input.updatedByEmail,
      },
      { onConflict: 'unit_id' },
    )
    .select('unit_id, unique_company_internal_id, updated_at, updated_by, updated_by_name, updated_by_email')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapAssetCompanyInternalId(data as AssetCompanyInternalIdRow)
}
