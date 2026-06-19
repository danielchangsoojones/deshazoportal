import { useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'

const storageKey = 'deshazo:selectedCustomer'
const defaultCustomer = 'wabash'

const customerSlugToFilterValue: Record<string, string> = {
  wabash: 'wabash',
  'oneal-steel': "o'neal steel",
  'o-neal-steel': "o'neal steel",
}

const customerDisplayNames: Record<string, string> = {
  wabash: 'Wabash',
  'oneal-steel': "O'Neal Steel",
  'o-neal-steel': "O'Neal Steel",
}

export function normalizeCustomer(value?: string | null) {
  return (value ?? '').trim().toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function getStoredCustomer() {
  if (typeof window === 'undefined') return defaultCustomer
  return normalizeCustomer(window.localStorage.getItem(storageKey)) || defaultCustomer
}

export function getCustomerFromCurrentPath() {
  if (typeof window === 'undefined') return ''
  const firstPathSegment = window.location.pathname.split('/').filter(Boolean)[0] ?? ''
  return normalizeCustomer(firstPathSegment)
}

export function getCustomerFilterValue(customer?: string | null) {
  const normalizedCustomer = normalizeCustomer(customer) || getCustomerFromCurrentPath() || getStoredCustomer()
  return customerSlugToFilterValue[normalizedCustomer] ?? normalizedCustomer.replace(/-/g, ' ')
}

export function getCustomerDisplayName(customer?: string | null) {
  const normalizedCustomer = normalizeCustomer(customer) || getCustomerFromCurrentPath() || getStoredCustomer()
  if (customerDisplayNames[normalizedCustomer]) return customerDisplayNames[normalizedCustomer]

  return getCustomerFilterValue(normalizedCustomer)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

export function buildCustomerPath(customer: string, path: string) {
  const selectedCustomer = normalizeCustomer(customer) || defaultCustomer
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `/${selectedCustomer}${normalizedPath}`
}

export function useSelectedCustomer() {
  const { customer } = useParams()
  const selectedCustomer = useMemo(() => normalizeCustomer(customer) || getCustomerFromCurrentPath() || getStoredCustomer(), [customer])

  useEffect(() => {
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
