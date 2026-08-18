import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { getCurrentUserTag, type UserTag } from './userTags'
import { useCustomerPath, useSelectedCustomer } from './customerRouting'

type PortalMenuItem = {
  label: string
  href?: string
}

const developerOnlyLabels = new Set(['Spend', 'Location Comparison', 'Document Reports', 'Customer Quotes'])
const financeReleasedCustomers = new Set(['wabash', 'o-neal-steel', 'oneal-steel'])
const financeReleasedLabels = new Set(['Spend', 'Location Comparison'])
const calendarMenuItem = { label: 'Calendar', href: '/calendar' }

function withCalendarMenuItem<T extends PortalMenuItem>(menuItems: T[]) {
  if (menuItems.some((item) => item.label === calendarMenuItem.label)) return menuItems

  const locationComparisonIndex = menuItems.findIndex((item) => item.label === 'Location Comparison')
  if (locationComparisonIndex === -1) return menuItems

  return [
    ...menuItems.slice(0, locationComparisonIndex + 1),
    calendarMenuItem as T,
    ...menuItems.slice(locationComparisonIndex + 1),
  ]
}

export function useDeveloperMenuItems<T extends PortalMenuItem>(menuItems: T[], activeKey: string) {
  const [userTag, setUserTag] = useState<UserTag | null>(null)
  const customerPath = useCustomerPath()
  const selectedCustomer = useSelectedCustomer()
  const isFinanceReleased = financeReleasedCustomers.has(selectedCustomer)

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
      withCalendarMenuItem(menuItems)
        .filter((item) => {
          const developerOnly =
            developerOnlyLabels.has(item.label) && !(isFinanceReleased && financeReleasedLabels.has(item.label))
          return userTag === 'developer' || !developerOnly
        })
        .map((item) => {
          const developerOnly =
            developerOnlyLabels.has(item.label) && !(isFinanceReleased && financeReleasedLabels.has(item.label))
          return {
            ...item,
            href: item.href?.startsWith('/') ? customerPath(item.href) : item.href,
            developerOnly,
            active: item.label === activeKey || item.href === activeKey,
          }
        }),
    [activeKey, customerPath, isFinanceReleased, menuItems, userTag],
  )
}
