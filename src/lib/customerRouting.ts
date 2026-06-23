import { useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'

const storageKey = 'deshazo-selected-customer'
const defaultCustomer = 'wabash'
const customerSlugToFilterValue: Record<string, string> = {
  'o-neal-steel': "o'neal steel",
  'oneal-steel': "o'neal steel",
}

const customerDisplayNames: Record<string, string> = {
  wabash: 'Wabash',
  'o-neal-steel': "O'Neal Steel",
  'oneal-steel': "O'Neal Steel",
}

export function normalizeCustomer(value?: string | null) {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
}

export function getStoredCustomer() {
  if (typeof window === 'undefined') return defaultCustomer
  return normalizeCustomer(window.localStorage.getItem(storageKey)) || defaultCustomer
}

export function getCustomerFilterValue(customer?: string | null) {
  const normalizedCustomer = normalizeCustomer(customer) || defaultCustomer
  return customerSlugToFilterValue[normalizedCustomer] ?? normalizedCustomer
}

export function getCustomerDisplayName(customer?: string | null) {
  const normalizedCustomer = normalizeCustomer(customer) || defaultCustomer
  if (customerDisplayNames[normalizedCustomer]) return customerDisplayNames[normalizedCustomer]

  const filterValue = getCustomerFilterValue(normalizedCustomer)
  return filterValue
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function buildCustomerPath(customer: string, path: string) {
  const selectedCustomer = normalizeCustomer(customer) || defaultCustomer
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `/${selectedCustomer}${normalizedPath}`
}

export function useSelectedCustomer() {
  const { customer } = useParams()
  const selectedCustomer = useMemo(() => normalizeCustomer(customer) || getStoredCustomer(), [customer])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, selectedCustomer)
  }, [selectedCustomer])

  return selectedCustomer
}

export function useCustomerPath() {
  const selectedCustomer = useSelectedCustomer()
  return useMemo(
    () => (path: string) => buildCustomerPath(selectedCustomer, path),
    [selectedCustomer],
  )
}
