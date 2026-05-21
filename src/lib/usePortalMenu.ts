import { useEffect, useState } from 'react'

const STORAGE_KEY = 'deshazo-portal-menu-open'

export function usePortalMenu(defaultValue = false) {
  const [menuOpen, setMenuOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultValue

    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'true') return true
    if (stored === 'false') return false
    return defaultValue
  })

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(menuOpen))
  }, [menuOpen])

  return { menuOpen, setMenuOpen }
}
