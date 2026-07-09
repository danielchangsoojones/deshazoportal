import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  getCurrentUserProfile,
  getDefaultUserProfile,
  getUserDisplayName,
  getUserInitials,
  saveCurrentUserProfile,
  type UserProfile,
} from '../lib/userProfile'

type ProfileMenuProps = {
  user: User
  onSignOut: () => void | Promise<void>
  onProfileUpdated?: (profile: UserProfile) => void
  tone?: 'blue' | 'light'
}

export default function ProfileMenu({ user, onSignOut, onProfileUpdated, tone = 'blue' }: ProfileMenuProps) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [profile, setProfile] = useState<UserProfile>(() => getDefaultUserProfile(user))
  const [draftProfile, setDraftProfile] = useState(() => ({
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
  }))
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const menuRef = useRef<HTMLDivElement | null>(null)
  const onProfileUpdatedRef = useRef(onProfileUpdated)
  const fullName = profile.name || getUserDisplayName(user)
  const initials = getUserInitials({ ...user, user_metadata: { ...user.user_metadata, full_name: fullName } })
  const photoUrl =
    user.user_metadata?.avatar_url ||
    user.user_metadata?.picture ||
    user.user_metadata?.photo_url ||
    ''

  useEffect(() => {
    let active = true
    setProfileLoading(true)
    setProfileMessage('')

    getCurrentUserProfile(user)
      .then((savedProfile) => {
        if (!active) return
        setProfile(savedProfile)
        setDraftProfile({
          name: savedProfile.name,
          email: savedProfile.email,
          phone: savedProfile.phone,
        })
        onProfileUpdatedRef.current?.(savedProfile)
      })
      .catch((error) => {
        if (!active) return
        setProfileMessage(error instanceof Error ? error.message : 'Unable to load profile.')
      })
      .finally(() => {
        if (active) setProfileLoading(false)
      })

    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    onProfileUpdatedRef.current = onProfileUpdated
  }, [onProfileUpdated])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!profileMessage) return

    const timeoutId = window.setTimeout(() => {
      setProfileMessage('')
    }, 3000)

    return () => window.clearTimeout(timeoutId)
  }, [profileMessage])

  const openEditor = () => {
    setDraftProfile({
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
    })
    setProfileMessage('')
    setEditing(true)
  }

  const saveProfile = async () => {
    setProfileSaving(true)
    setProfileMessage('')

    try {
      const savedProfile = await saveCurrentUserProfile(user, draftProfile)
      setProfile(savedProfile)
      setDraftProfile({
        name: savedProfile.name,
        email: savedProfile.email,
        phone: savedProfile.phone,
      })
      setEditing(false)
      setProfileMessage('Profile saved.')
      onProfileUpdatedRef.current?.(savedProfile)
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Unable to save profile.')
    } finally {
      setProfileSaving(false)
    }
  }

  const buttonClassName =
    tone === 'light'
      ? 'border-white/30 bg-white/15 text-white hover:bg-white/25'
      : 'border-white/80 bg-white text-[var(--deshazo-blue)] hover:bg-white/90'

  return (
    <div ref={menuRef} className="relative flex justify-end">
      <button
        type="button"
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        className={`inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 text-sm font-black shadow-[0_10px_24px_-18px_rgba(17,24,39,0.5)] transition ${buttonClassName}`}
        aria-expanded={open}
        aria-label="Open profile menu"
      >
        {photoUrl ? (
          <img src={photoUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span>{initials}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--deshazo-border)] bg-white text-[var(--deshazo-text)] shadow-[0_24px_70px_-38px_rgba(17,24,39,0.45)]">
          <div className="border-b border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-base font-black text-[var(--deshazo-blue)] shadow-[0_10px_24px_-18px_rgba(47,86,166,0.45)]">
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-black">{fullName}</p>
                <p className="truncate text-sm font-semibold text-[rgba(21,24,33,0.58)]">{profile.email || user.email}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 px-4 py-4 text-sm">
            {editing ? (
              <div className="space-y-3">
                {[
                  ['name', 'Name', draftProfile.name],
                  ['email', 'Email', draftProfile.email],
                  ['phone', 'Phone number', draftProfile.phone],
                ].map(([field, label, value]) => (
                  <label key={field} className="block">
                    <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[rgba(21,24,33,0.45)]">{label}</span>
                    <input
                      type={field === 'email' ? 'email' : 'text'}
                      value={value}
                      onChange={(event) => {
                        const nextValue = event.currentTarget.value
                        setDraftProfile((currentDraft) => ({ ...currentDraft, [field]: nextValue }))
                      }}
                      className="mt-1 h-10 w-full rounded-xl border border-[var(--deshazo-border)] bg-white px-3 text-sm font-bold text-[var(--deshazo-text)] outline-none transition focus:border-[var(--deshazo-blue)] focus:ring-4 focus:ring-[rgba(47,86,166,0.12)]"
                    />
                  </label>
                ))}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveProfile}
                    disabled={profileSaving}
                    className="inline-flex flex-1 items-center justify-center rounded-xl bg-[var(--deshazo-blue)] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[var(--deshazo-blue-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {profileSaving ? 'Saving...' : 'Save profile'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="inline-flex items-center justify-center rounded-xl border border-[var(--deshazo-border)] bg-white px-4 py-2.5 text-sm font-black text-[var(--deshazo-blue)] transition hover:bg-[var(--deshazo-surface)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={openEditor}
                  disabled={profileLoading}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--deshazo-blue)] px-4 py-2.5 text-sm font-black text-white shadow-[0_10px_24px_-20px_rgba(47,86,166,0.45)] transition hover:bg-[var(--deshazo-blue-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Edit profile
                </button>
              </>
            )}
            {profileMessage ? (
              <p className="rounded-xl border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] px-3 py-2 text-xs font-bold text-[rgba(21,24,33,0.72)]">
                {profileMessage}
              </p>
            ) : null}
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex w-full items-center justify-center rounded-xl border border-[var(--deshazo-border)] bg-white px-4 py-2.5 text-sm font-black text-[var(--deshazo-blue)] shadow-[0_10px_24px_-20px_rgba(47,86,166,0.45)] transition hover:bg-[var(--deshazo-surface)]"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
