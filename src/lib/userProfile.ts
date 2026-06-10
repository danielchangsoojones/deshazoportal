import type { User } from '@supabase/supabase-js'

export function getUserDisplayName(user: User) {
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Portal User'
  )
}

export function getUserInitials(user: User) {
  const fullName = getUserDisplayName(user)

  return (
    fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase())
      .join('') || 'DP'
  )
}
