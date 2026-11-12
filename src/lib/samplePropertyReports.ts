import type { DeshazoSavedInspectionReport, DeshazoSavedInspectionReportMatch } from './deshazoExternalReports'
import type { Property } from './samplePropertyRisks'

const maintenanceVisits = [
  ['2026-11-05', 'Quarterly freight hoist inspection', 'Checked the hoist brake, limit switches, and pendant controls.'],
  ['2026-08-06', 'Quarterly freight hoist inspection', 'Inspected the suspension, hook latch, and load chain.'],
  ['2026-05-07', 'Quarterly freight hoist inspection', 'Tested controls and checked the chain guide and trolley travel.'],
  ['2026-02-05', 'Annual freight hoist inspection', 'Completed an annual visual and operational inspection of the freight hoist.'],
] as const

const repairVisits = [
  ['2026-10-22', 'Pendant strain relief replacement', 'Replaced the worn pendant strain relief, secured the cable, and verified operation from the loading area.'],
  ['2026-08-18', 'Upper limit switch adjustment', 'Adjusted the upper limit switch and checked that hoist travel stops at the correct height.'],
  ['2026-06-11', 'Hook latch replacement', 'Installed a new hook latch and verified that it closes and returns freely.'],
  ['2026-03-12', 'Trolley stop repair', 'Replaced a damaged end stop and tested the unloaded trolley across its travel range.'],
] as const

function sampleWorkOrder(property: Property, workOrderId: number, date: string, jobType: string, note: string): DeshazoSavedInspectionReport {
  const jobNo = `SAMPLE-${workOrderId}`
  const timestamp = `${date}T12:00:00Z`

  return {
    workOrderId, jobNo, jobType, syncedAt: timestamp,
    rawPayload: { workOrderId, jobNo, jobType, inspectionDate: timestamp, status: 'Completed' },
    summary: {
      workOrderId, jobNo, jobType, statusName: 'Completed',
      customerName: 'Branco Company (Sample)', customerLocationName: property.name,
      serviceLocationName: 'Sample service branch', customerAddress: property.location,
      customerLocationAddress: property.location, comment: note,
      startDate: timestamp, endDate: timestamp, completedAt: timestamp,
      salesOrderNo: '', customerPoNo: '', rawPayload: null,
    },
  }
}

export function samplePropertyMaintenanceReports(property: Property): DeshazoSavedInspectionReportMatch[] {
  return maintenanceVisits.map(([date, title, note], index) => {
    const report = sampleWorkOrder(property, 1004 - index, date, 'Preventative Maintenance', note)
    report.rawPayload.generalWork = [{ date: report.syncedAt, technician: 'Sample technician' }]
    report.rawPayload.cranes = [{
      crane: { description: 'Loading-area freight hoist', location: property.name, contactCode: 'SAMPLE-HOIST', serviceStatus: 'In Service' },
      inspections: [{
        type: title, date: report.syncedAt, completedAt: report.syncedAt,
        remarks: [{ content: note }],
        sections: [{
          name: 'Freight Hoist',
          points: [
            { name: 'Pendant controls', condition: 'Satisfactory' },
            { name: 'Upper and lower limits', condition: 'Satisfactory' },
            { name: 'Hook latch and load chain', condition: 'Satisfactory' },
          ],
        }],
      }],
    }]

    return { report, craneIndex: 0, inspectionDate: report.syncedAt }
  })
}

export function samplePropertyRepairReports(property: Property): DeshazoSavedInspectionReport[] {
  return repairVisits.map(([date, title, note], index) => {
    const report = sampleWorkOrder(property, 2004 - index, date, 'Repair', title)
    report.rawPayload.generalWork = [{
      date: report.syncedAt, tripNumber: 1, technician: 'Sample technician',
      serviceNotes: [{ note, createdAt: report.syncedAt }],
    }]

    return report
  })
}
