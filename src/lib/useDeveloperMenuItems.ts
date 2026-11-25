import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { getCurrentUserTag, type UserTag } from './userTags'
import { useCustomerPath, useSelectedCustomer } from './customerRouting'

type PortalMenuItem = {
  label: string
  href: string
}

const developerOnlyLabels = new Set(['Spend', 'Location Comparison', 'Calendar', 'Document Reports', 'Customer Quotes'])
const detachedLabels = new Set(['Document Reports', 'Calendar'])
const financeReleasedCustomers = new Set(['wabash', 'o-neal-steel', 'oneal-steel'])
const financeReleasedLabels = new Set(['Spend', 'Location Comparison'])
const calendarMenuItem = { label: 'Calendar', href: '/calendar' }
const customerQuotesMenuItem = { label: 'Customer Quotes', href: '/customer-quotes' }
const wabashPortalMenuItems: PortalMenuItem[] = [
  { label: 'Home', href: '/dashboard' },
  { label: 'Open Risk Items', href: '/asset-fleet-assets?view=open-risk' },
  { label: 'Asset Fleet', href: '/asset-fleet' },
  { label: 'Asset Cross-Reference', href: '/wabash-asset-cross-reference' },
  { label: 'Spare Hoist Management', href: '/spare-hoist-management' },
  { label: 'Spend', href: '/spend' },
  { label: 'Location Comparison', href: '/location-comparison' },
  { label: 'Customer Quotes', href: '/customer-quotes' },
  { label: 'Custom Reports', href: '/custom-reports' },
  { label: 'Documents', href: '/deshazo-work-orders' },
  { label: 'Add User', href: '/add-user' },
  { label: 'Contact Us', href: '/contact-us' },
]

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

function withCustomerQuotesMenuItem<T extends PortalMenuItem>(menuItems: T[]) {
  if (menuItems.some((item) => item.label === customerQuotesMenuItem.label)) return menuItems

  const locationComparisonIndex = menuItems.findIndex((item) => item.label === 'Location Comparison')
  if (locationComparisonIndex !== -1) {
    return [
      ...menuItems.slice(0, locationComparisonIndex + 1),
      customerQuotesMenuItem as T,
      ...menuItems.slice(locationComparisonIndex + 1),
    ]
  }

  const customReportsIndex = menuItems.findIndex((item) => item.label === 'Custom Reports')
  if (customReportsIndex === -1) return menuItems

  return [
    ...menuItems.slice(0, customReportsIndex),
    customerQuotesMenuItem as T,
    ...menuItems.slice(customReportsIndex),
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
    () => {
      const orderedMenuItems = selectedCustomer === 'wabash'
        ? wabashPortalMenuItems
        : withCustomerQuotesMenuItem(withCalendarMenuItem(menuItems))

      return orderedMenuItems
        .filter((item) => !detachedLabels.has(item.label))
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
            href: item.href.startsWith('/') ? customerPath(item.href) : item.href,
            developerOnly,
            active: item.label === activeKey || item.href === activeKey,
          }
        })
    },
    [activeKey, customerPath, isFinanceReleased, menuItems, selectedCustomer, userTag],
  )
}
