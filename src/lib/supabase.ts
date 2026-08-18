import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

const isConfigured = supabaseUrl.startsWith('http') && supabaseAnonKey.length > 0

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export async function getCurrentSupabaseUser(timeoutMs = 8000): Promise<User | null> {
  if (!supabase) return null

  let timeoutId = 0
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error('Supabase auth timed out.')), timeoutMs)
  })

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData.session?.user) return sessionData.session.user

    const { data, error } = await Promise.race([supabase.auth.getUser(), timeout])
    if (error) throw new Error(error.message)
    return data.user ?? null
  } catch {
    return null
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export { isConfigured }
