import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { getCurrentUserTag, type UserTag } from './userTags'
import { useCustomerPath, useSelectedCustomer } from './customerRouting'

type PortalMenuItem = {
  label: string
  href?: string
}

const developerOnlyLabels = new Set(['Spend', 'Location Comparison', 'Document Reports', 'Customer Quotes'])
const spendReleasedCustomers = new Set(['wabash', 'o-neal-steel', 'oneal-steel'])

export function useDeveloperMenuItems<T extends PortalMenuItem>(menuItems: T[], activeKey: string) {
  const [userTag, setUserTag] = useState<UserTag | null>(null)
  const customerPath = useCustomerPath()
  const selectedCustomer = useSelectedCustomer()
  const isSpendReleased = spendReleasedCustomers.has(selectedCustomer)

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
        .filter((item) => {
          const developerOnly = developerOnlyLabels.has(item.label) && !(item.label === 'Spend' && isSpendReleased)
          return userTag === 'developer' || !developerOnly
        })
        .map((item) => {
          const developerOnly = developerOnlyLabels.has(item.label) && !(item.label === 'Spend' && isSpendReleased)
          return {
            ...item,
            href: item.href?.startsWith('/') ? customerPath(item.href) : item.href,
            developerOnly,
            active: item.label === activeKey || item.href === activeKey,
          }
        }),
    [activeKey, customerPath, isSpendReleased, menuItems, userTag],
  )
}
