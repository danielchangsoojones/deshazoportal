import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getUserDisplayName, getUserInitials } from '../lib/userProfile'

type ProfileMenuProps = {
  user: User
  onSignOut: () => void | Promise<void>
  tone?: 'blue' | 'light'
}

export default function ProfileMenu({ user, onSignOut, tone = 'blue' }: ProfileMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const fullName = getUserDisplayName(user)
  const initials = getUserInitials(user)
  const photoUrl =
    user.user_metadata?.avatar_url ||
    user.user_metadata?.picture ||
    user.user_metadata?.photo_url ||
    ''
  const provider = user.app_metadata?.provider
  const role = user.role || 'authenticated'

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
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--deshazo-border)] bg-white text-[var(--deshazo-text)] shadow-[0_24px_70px_-38px_rgba(17,24,39,0.45)]">
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
                <p className="truncate text-sm font-semibold text-[rgba(21,24,33,0.58)]">{user.email}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 px-4 py-4 text-sm">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[rgba(21,24,33,0.45)]">Account</p>
              <p className="mt-1 font-bold text-[rgba(21,24,33,0.78)]">{role}</p>
            </div>
            {provider ? (
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[rgba(21,24,33,0.45)]">Provider</p>
                <p className="mt-1 font-bold capitalize text-[rgba(21,24,33,0.78)]">{provider}</p>
              </div>
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
