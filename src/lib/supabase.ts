import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

const isConfigured = supabaseUrl.startsWith('http') && supabaseAnonKey.length > 0

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

function clearSupabaseAuthStorage() {
  if (typeof window === 'undefined') return

  Object.keys(window.localStorage)
    .filter((key) => key.startsWith('sb-') && key.endsWith('-auth-token'))
    .forEach((key) => window.localStorage.removeItem(key))
}

export async function getCurrentSupabaseUser(timeoutMs = 8000): Promise<User | null> {
  if (!supabase) return null

  let timeoutId = 0
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error('Supabase auth timed out.')), timeoutMs)
  })

  try {
    const { data, error } = await Promise.race([supabase.auth.getUser(), timeout])
    if (error) throw new Error(error.message)
    return data.user ?? null
  } catch (error) {
    clearSupabaseAuthStorage()
    return null
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export { isConfigured }
