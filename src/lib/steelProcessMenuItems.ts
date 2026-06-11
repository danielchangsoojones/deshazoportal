import type { InspectionMenuItemSection } from './inspectionMenuItems'

export const steelProcessMenuItemsStorageKey = 'sat-brandco-steel-process-menu-items'

export type SteelProcessMenuItemsPayload = {
  updatedAt: string
  menuSections: InspectionMenuItemSection[]
}

export const fallbackSteelProcessMenuItemSections: InspectionMenuItemSection[] = [
  {
    title: 'Menu Items',
    items: [
      {
        id: 'steel-menu-material-package',
        label: 'Material package',
        description: 'Calculated steel material package from the process estimate.',
        rate: '6584.00',
        internalCost: '4823.00',
        customerPrice: '6584.00',
      },
      {
        id: 'steel-menu-cutting-prep',
        label: 'Cutting, drilling, prep',
        description: 'Calculated shop routing time for cutting, drilling, deburr, and prep.',
        rate: '450.00',
        internalCost: '295.00',
        customerPrice: '450.00',
      },
      {
        id: 'steel-menu-packaging',
        label: 'Palletizing & packaging',
        description: 'Calculated packaging and staging operation.',
        rate: '120.00',
        internalCost: '75.00',
        customerPrice: '120.00',
      },
      {
        id: 'steel-menu-freight',
        label: 'Estimated freight',
        description: 'Estimated LTL freight for one steel shipment.',
        rate: '380.00',
        internalCost: '300.00',
        customerPrice: '380.00',
      },
    ],
  },
]

export function readSteelProcessMenuItemSections() {
  if (typeof window === 'undefined') return fallbackSteelProcessMenuItemSections

  const savedPayload = window.localStorage.getItem(steelProcessMenuItemsStorageKey)
  if (!savedPayload) return fallbackSteelProcessMenuItemSections

  try {
    const parsedPayload = JSON.parse(savedPayload) as SteelProcessMenuItemsPayload
    return parsedPayload.menuSections?.[0]?.items?.length
      ? parsedPayload.menuSections
      : fallbackSteelProcessMenuItemSections
  } catch {
    return fallbackSteelProcessMenuItemSections
  }
}
