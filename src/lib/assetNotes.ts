import { supabase } from './supabase'

type AssetNoteRow = {
  id: string
  unit_id: string
  author_id: string
  author_name: string
  author_email: string
  note_text: string
  created_at: string
}

export type AssetNoteRecord = {
  id: string
  unitId: string
  authorId: string
  authorName: string
  authorEmail: string
  text: string
  createdAt: string
}

const mapAssetNote = (row: AssetNoteRow): AssetNoteRecord => ({
  id: row.id,
  unitId: row.unit_id,
  authorId: row.author_id,
  authorName: row.author_name,
  authorEmail: row.author_email,
  text: row.note_text,
  createdAt: row.created_at,
})

export async function listAssetNotes(unitId: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase
    .from('asset_notes')
    .select('id, unit_id, author_id, author_name, author_email, note_text, created_at')
    .eq('unit_id', unitId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => mapAssetNote(row as AssetNoteRow))
}

export async function createAssetNote(input: {
  unitId: string
  authorId: string
  authorName: string
  authorEmail: string
  text: string
}) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase
    .from('asset_notes')
    .insert({
      unit_id: input.unitId,
      author_id: input.authorId,
      author_name: input.authorName,
      author_email: input.authorEmail,
      note_text: input.text,
    })
    .select('id, unit_id, author_id, author_name, author_email, note_text, created_at')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapAssetNote(data as AssetNoteRow)
}
