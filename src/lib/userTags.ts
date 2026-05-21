import { supabase } from './supabase'

export type UserTag = 'developer' | 'normal'

type UserTagDisplayRow = {
  user_id: string
  display_name: string | null
}

export async function getCurrentUserTag(userId: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase
    .from('user_tags')
    .select('tag')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data?.tag as UserTag | undefined) ?? null
}

export async function getUserDisplayNames(userIds: string[]) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))
  if (uniqueUserIds.length === 0) return {}

  const { data, error } = await supabase
    .from('user_tag_display_names')
    .select('user_id, display_name')
    .in('user_id', uniqueUserIds)

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as UserTagDisplayRow[]).reduce<Record<string, string>>((displayNames, row) => {
    const displayName = row.display_name?.trim()
    if (displayName) {
      displayNames[row.user_id] = displayName
    }
    return displayNames
  }, {})
}
