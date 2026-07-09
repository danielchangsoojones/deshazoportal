import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type UserProfile = {
  userId: string
  name: string
  email: string
  phone: string
  createdAt: string
  updatedAt: string
}

type UserProfileRow = {
  user_id: string
  name: string
  email: string
  phone: string
  created_at: string
  updated_at: string
}

const userProfileSelect = 'user_id, name, email, phone, created_at, updated_at'

function mapUserProfile(row: UserProfileRow): UserProfile {
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getUserDisplayName(user: User) {
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Portal User'
  )
}

export function getDefaultUserProfile(user: User): UserProfile {
  const now = new Date().toISOString()

  return {
    userId: user.id,
    name: getUserDisplayName(user),
    email: user.email ?? '',
    phone: '',
    createdAt: now,
    updatedAt: now,
  }
}

export async function getCurrentUserProfile(user: User) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select(userProfileSelect)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data ? mapUserProfile(data as UserProfileRow) : getDefaultUserProfile(user)
}

export async function saveCurrentUserProfile(user: User, profile: Pick<UserProfile, 'name' | 'email' | 'phone'>) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const name = profile.name.trim()
  const email = profile.email.trim()
  const phone = profile.phone.trim()

  if (!name) {
    throw new Error('Enter your name.')
  }

  if (!email) {
    throw new Error('Enter your email.')
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(
      {
        user_id: user.id,
        name,
        email,
        phone,
      },
      { onConflict: 'user_id' },
    )
    .select(userProfileSelect)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapUserProfile(data as UserProfileRow)
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
