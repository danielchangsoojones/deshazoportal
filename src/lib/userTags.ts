import { supabase } from './supabase'

export type UserTag = 'developer' | 'normal'

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
