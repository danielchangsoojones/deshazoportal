import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { getCurrentUserTag, type UserTag } from './userTags'
import { useCustomerPath } from './customerRouting'

type PortalMenuItem = {
  label: string
  href?: string
}

export function useDeveloperMenuItems<T extends PortalMenuItem>(menuItems: T[], activeKey: string) {
  const [userTag, setUserTag] = useState<UserTag | null>(null)
  const customerPath = useCustomerPath()

  useEffect(() => {
    let cancelled = false

    async function loadUserTag() {
      if (!supabase) return

      const { data } = await supabase.auth.getUser()
      const userId = data.user?.id
      if (!userId) return

      const nextUserTag = await getCurrentUserTag(userId)
      if (!cancelled) setUserTag(nextUserTag)
    }

    loadUserTag().catch(() => {
      if (!cancelled) setUserTag(null)
    })

    return () => {
      cancelled = true
    }
  }, [])

  return useMemo(
    () =>
      menuItems
        .filter((item) => userTag === 'developer' || item.label !== 'Documents')
        .map((item) => ({
          ...item,
          href: item.href?.startsWith('/') ? customerPath(item.href) : item.href,
          developerOnly: item.label === 'Documents',
          active: item.label === activeKey || item.href === activeKey,
        })),
    [activeKey, customerPath, menuItems, userTag],
  )
}
