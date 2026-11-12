import type { InvoiceSpendAllocation } from './invoiceSpend'
import { sampleProperties } from './samplePropertyRisks'

const properties = [...sampleProperties.slice(0, 11), ...sampleProperties.filter(({ id }) => id === 'ridgemont-offices')]

export const sampleSpendLocations = properties.map(({ id, name }) => ({ value: id, label: name }))

const equipment = [
  ['Passenger elevator', 'Main lobby'], ['Freight elevator', 'Service core'],
  ['Freight hoist', 'Loading dock'], ['Air handling unit', 'Mechanical room'],
  ['Roof exhaust fan', 'Roof'], ['Sump pump', 'Basement'],
  ['Booster pump', 'Mechanical room'], ['Dock leveler', 'Loading dock'],
  ['Overhead door', 'Service entrance'], ['Access gate', 'Parking entrance'],
  ['Emergency generator', 'Service yard'], ['Fire alarm panel', 'Main lobby'],
] as const

const workTypes = [
  { kind: 'inspection', label: 'Inspection', base: 250, range: 620, partsShare: 0.08, monthOffset: 0 },
  { kind: 'repair', label: 'Repair', base: 700, range: 2800, partsShare: 0.42, monthOffset: 3 },
  { kind: 'installation', label: 'Installation', base: 1800, range: 4200, partsShare: 0.63, monthOffset: 7 },
] as const

const propertyCostFactors = [1.24, 1.13, 0.83, 0.72, 1.37, 0.67, 1.09, 0.76, 1.42, 0.96, 0.84, 1.02]

export function buildSamplePropertyInvoices(today = new Date()) {
  return properties.flatMap((property, propertyIndex) => equipment.flatMap(([description, area], assetIndex) => {
    const assetId = `SAMPLE-${propertyIndex + 1}-${String(assetIndex + 1).padStart(2, '0')}`
    return workTypes.map((work, workIndex) => {
      const monthOffset = (assetIndex + propertyIndex * 2 + work.monthOffset) % 12
      const month = new Date(today.getFullYear(), today.getMonth() - monthOffset, 1)
      const period = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`
      const variation = ((propertyIndex * 37 + assetIndex * 19 + workIndex * 41) % 101) / 100
      const total = Math.round((work.base + work.range * variation) * propertyCostFactors[propertyIndex])
      const invoiceId = `${assetId}-${workIndex + 1}`
      const allocation: InvoiceSpendAllocation = {
        id: invoiceId, invoiceId, customer: 'Branco Company', invoiceNumber: `INV-${invoiceId}`,
        invoiceDate: period, jobNumber: `JOB-${invoiceId}`, workOrderId: null, workOrderType: work.label,
        spendKind: work.kind, craneRowId: null, dNumber: assetId, craneDescription: description,
        craneLocation: area, locationLabel: property.name, allocationMethod: 'Direct', allocationCount: 1,
        invoiceTotal: total, allocatedAmount: total, sourceDocumentId: null, sourceDocumentBucket: '',
        sourceDocumentFilePath: '', sourceDocumentName: '',
      }
      return { property, allocation, parts: Math.round(total * work.partsShare) }
    })
  }))
}

export function getSamplePropertyAllocations(propertyId: string, assetId?: string) {
  return buildSamplePropertyInvoices()
    .filter(({ property, allocation }) => property.id === propertyId && (!assetId || allocation.dNumber === assetId))
    .map(({ allocation }) => allocation)
}
