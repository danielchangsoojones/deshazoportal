import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type {
  DeshazoCraneReport,
  DeshazoHoist,
  DeshazoInspectionPhoto,
  DeshazoInspectionPoint,
  DeshazoSavedInspectionReport,
} from './deshazoExternalReports'

type ActionItem = {
  label: string
  sectionName: string
  status: string
  notes: string
  photos: DeshazoInspectionPhoto[]
}

type ResolvedSection = {
  name: string
  points: DeshazoInspectionPoint[]
}

type SectionedItem = ActionItem

export const DESHAZO_PDF_PAGE_WIDTH_PX = 816
export const DESHAZO_PDF_PAGE_HEIGHT_PX = 1056
const pdfPageWidthPt = 612
const pdfPageHeightPt = 792

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '')
}

function formatDate(value?: string) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function formatTime(value?: string) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function toTitleCase(value?: string) {
  if (!value) return 'N/A'
  return value
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function getReportIdentifier(report: DeshazoSavedInspectionReport, craneReport?: DeshazoCraneReport | null) {
  const crane = craneReport?.crane || report.rawPayload.cranes?.[0]?.crane
  return crane?.contactCode || crane?.description || `WO ${report.workOrderId}`
}

function extractTripEmployeeNames(report: DeshazoSavedInspectionReport) {
  const rawPayload = report.summary?.rawPayload
  if (!rawPayload || typeof rawPayload !== 'object') return []
  const trips =
    'workOrderTrips' in rawPayload && Array.isArray(rawPayload.workOrderTrips)
      ? rawPayload.workOrderTrips
      : []

  return trips
    .flatMap((trip) =>
      trip && typeof trip === 'object' && Array.isArray((trip as Record<string, unknown>).workOrderEmployees)
        ? ((trip as Record<string, unknown>).workOrderEmployees as Array<Record<string, unknown>>)
        : [],
    )
    .map((employeeRow) => {
      const employee =
        employeeRow.employee && typeof employeeRow.employee === 'object'
          ? (employeeRow.employee as Record<string, unknown>)
          : null
      const firstName = typeof employee?.firstName === 'string' ? employee.firstName : ''
      const lastName = typeof employee?.lastName === 'string' ? employee.lastName : ''
      return [firstName, lastName].filter(Boolean).join(' ').trim()
    })
    .filter(Boolean)
}

function getLeadTechnician(report: DeshazoSavedInspectionReport, craneReport?: DeshazoCraneReport | null) {
  const fromGeneralWork = report.rawPayload.generalWork?.find((item) => item.technician)?.technician
  if (fromGeneralWork) return fromGeneralWork

  const tripEmployees = extractTripEmployeeNames(report)
  if (tripEmployees.length > 1) return tripEmployees[1]
  if (tripEmployees.length === 1) return tripEmployees[0]

  const fromCraneNotes = craneReport?.serviceNotes?.find((note) => note.author)?.author
  if (fromCraneNotes) return fromCraneNotes

  return 'Unknown technician'
}

function getPointDisplayValue(point: DeshazoInspectionPoint) {
  if (point.condition) return point.condition
  if (point.value !== undefined && point.value !== null && point.value !== '') return String(point.value)
  return 'N/A'
}

function getConditionTone(point: DeshazoInspectionPoint) {
  const value = getPointDisplayValue(point).toUpperCase()
  if (value === 'SATISFACTORY') return 'success'
  if (value === 'N/A') return 'neutral'
  if (value === 'REPAIR') return 'repair'
  return 'danger'
}

function sortPoints(points: DeshazoInspectionPoint[]) {
  return [...points].sort((left, right) => {
    const leftOrder = typeof left.order === 'number' ? left.order : Number.MAX_SAFE_INTEGER
    const rightOrder = typeof right.order === 'number' ? right.order : Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder
  })
}

function getStructureSectionName(craneReport: DeshazoCraneReport) {
  const structureType = craneReport.crane?.structure?.type || 'Structure'
  return structureType.split('-')[0]?.trim() || structureType
}

function resolveSections(craneReport: DeshazoCraneReport) {
  const sections: ResolvedSection[] = []
  const hoists = craneReport.crane?.hoists ?? []

  ;(craneReport.inspections ?? []).forEach((inspection) => {
    ;(inspection.sections ?? []).forEach((section) => {
      const sortedPoints = sortPoints(section.points ?? [])
      if (sortedPoints.length === 0) return

      if ((section.name ?? '').includes('craneStructureType')) {
        sections.push({ name: getStructureSectionName(craneReport), points: sortedPoints })
        return
      }

      if ((section.name ?? '').includes('Hoist') && hoists.length > 0) {
        const chunkSize = Math.max(1, Math.floor(sortedPoints.length / hoists.length))
        hoists.forEach((_, hoistIndex) => {
          const start = hoistIndex * chunkSize
          const end = hoistIndex === hoists.length - 1 ? sortedPoints.length : start + chunkSize
          const points = sortedPoints.slice(start, end)
          if (points.length > 0) sections.push({ name: `Hoist ${hoistIndex + 1}`, points })
        })
        return
      }

      sections.push({ name: section.name || inspection.type || 'Inspection Section', points: sortedPoints })
    })
  })

  return sections
}

function getPointNotes(point: DeshazoInspectionPoint) {
  const directNote = point.notes?.trim()
  if (directNote) return directNote
  return (point.remarks ?? [])
    .map((remark) => remark.content || remark.note || '')
    .filter(Boolean)
    .join(' ')
}

function getActionItems(craneReport: DeshazoCraneReport) {
  const items: ActionItem[] = []

  resolveSections(craneReport).forEach((section) => {
    section.points.forEach((point) => {
      const condition = getPointDisplayValue(point).toUpperCase()
      if (condition === 'REPAIR') {
        items.push({
          label: point.name ?? 'Unnamed point',
          sectionName: section.name,
          status: condition,
          notes: getPointNotes(point),
          photos: point.photos ?? [],
        })
      }
    })
  })

  return items
}

function getNotesAndPhotoItems(craneReport: DeshazoCraneReport) {
  const items: SectionedItem[] = []

  resolveSections(craneReport).forEach((section) => {
    section.points.forEach((point) => {
      const notes = getPointNotes(point)
      const photos = point.photos ?? []
      const condition = getPointDisplayValue(point).toUpperCase()
      if ((notes || photos.length > 0) && condition !== 'REPAIR') {
        items.push({
          label: point.name ?? 'Unnamed point',
          sectionName: section.name,
          status: condition,
          notes,
          photos,
        })
      }
    })
  })

  return items
}

function groupItemsBySection(items: SectionedItem[]) {
  return items.reduce<Array<{ sectionName: string; items: SectionedItem[] }>>((groups, item) => {
    const existingGroup = groups.find((group) => group.sectionName === item.sectionName)
    if (existingGroup) {
      existingGroup.items.push(item)
      return groups
    }
    groups.push({ sectionName: item.sectionName, items: [item] })
    return groups
  }, [])
}

function renderSectionedItems(items: SectionedItem[], itemLabel: string) {
  return groupItemsBySection(items)
    .map(
      (group) => `
        <section class="page2-item-section">
          <div class="page2-section-title">
            <span>${escapeHtml(group.sectionName)}</span>
            <span class="page2-section-count">${group.items.length} ${escapeHtml(itemLabel)}${group.items.length === 1 ? '' : 's'}</span>
          </div>
          <div class="page2-points-box">
            ${group.items
              .map(
                (item) => `
                  <div class="page2-point">
                    <div class="page2-point-name">${escapeHtml(item.label)}</div>
                    <div class="${page2StatusClass(item.status)}">${escapeHtml(toTitleCase(item.status))}</div>
                    ${
                      item.notes
                        ? `<div class="page2-note"><span>${item.status === 'REPAIR' ? 'Note:' : 'Notes:'}</span> ${escapeHtml(item.notes)}</div>`
                        : ''
                    }
                  </div>
                `,
              )
              .join('')}
          </div>
        </section>
      `,
    )
    .join('')
}

function getAllPhotos(craneReport: DeshazoCraneReport) {
  const photos: Array<DeshazoInspectionPhoto & { caption: string }> = []

  ;(craneReport.serviceAttachments ?? []).forEach((photo) => {
    photos.push({ ...photo, caption: 'Service Attachment' })
  })

  ;(craneReport.inspections ?? []).forEach((inspection) => {
    ;(inspection.photos ?? []).forEach((photo) => {
      photos.push({ ...photo, caption: inspection.type || 'Inspection Photo' })
    })
    resolveSections({ ...craneReport, inspections: [inspection] }).forEach((section) => {
      section.points.forEach((point) => {
        ;(point.photos ?? []).forEach((photo) => {
          photos.push({ ...photo, caption: point.name ?? section.name ?? 'Inspection Point' })
        })
      })
    })
  })

  return photos
}

function getInspectionStats(craneReport: DeshazoCraneReport) {
  let repairCount = 0
  let satisfactoryPointCount = 0
  let safetyMonitorCount = 0
  let naPointCount = 0

  resolveSections(craneReport).forEach((section) => {
    section.points.forEach((point) => {
      const tone = getConditionTone(point)
      if (tone === 'success') satisfactoryPointCount += 1
      else if (tone === 'neutral') naPointCount += 1
      else if (tone === 'repair') repairCount += 1
      else safetyMonitorCount += 1
    })
  })

  return {
    repairCount,
    satisfactoryPointCount,
    safetyMonitorCount,
    naPointCount,
  }
}

function toneClass(point: DeshazoInspectionPoint) {
  const tone = getConditionTone(point)
  if (tone === 'success') return 'status status-success'
  if (tone === 'neutral') return 'status status-neutral'
  return 'status status-danger'
}

function page2StatusClass(status: string) {
  const normalizedStatus = status.toUpperCase()
  if (normalizedStatus === 'SATISFACTORY') return 'page2-point-status page2-status-success'
  if (normalizedStatus === 'N/A') return 'page2-point-status page2-status-neutral'
  return 'page2-point-status page2-status-danger'
}

function buildEquipmentLines(
  craneReport: DeshazoCraneReport,
  accessor: (craneReport: DeshazoCraneReport) => string,
  hoistAccessor: (hoist: DeshazoHoist) => string,
) {
  const lines = [`Crane: ${accessor(craneReport) || 'N/A'}`]
  ;(craneReport.crane?.hoists ?? []).forEach((hoist, index) => {
    lines.push(`Hoist ${index + 1}: ${hoistAccessor(hoist) || 'N/A'}`)
  })
  return lines
}

function getOverviewNote(report: DeshazoSavedInspectionReport, craneReport: DeshazoCraneReport) {
  for (const inspection of craneReport.inspections ?? []) {
    const inspectionRemark = inspection.remarks?.find((remark) => remark.content || remark.note)
    if (inspectionRemark) return inspectionRemark.content || inspectionRemark.note || ''

    for (const section of inspection.sections ?? []) {
      for (const point of section.points ?? []) {
        const note = getPointNotes(point)
        if (note) return note
      }
    }
  }

  return (
    craneReport.serviceNotes?.find((note) => note.note)?.note ||
    report.rawPayload.generalWork?.find((item) => item.serviceNotes?.length)?.serviceNotes?.[0]?.note ||
    report.summary?.comment ||
    'Inspection data synced from Supabase.'
  )
}

export function getDeshazoInspectionReportHtml(report: DeshazoSavedInspectionReport, selectedCraneIndex = 0) {
  const selectedCrane = report.rawPayload.cranes?.[selectedCraneIndex] ?? report.rawPayload.cranes?.[0] ?? null
  if (!selectedCrane) return '<div class="pdf-page"><div class="body">No crane inspection data found.</div></div>'

  const stats = getInspectionStats(selectedCrane)
  const actionItems = getActionItems(selectedCrane)
  const notesAndPhotoItems = getNotesAndPhotoItems(selectedCrane)
  const photos = getAllPhotos(selectedCrane).slice(0, 18)
  const sections = resolveSections(selectedCrane)
  const primaryCrane = selectedCrane.crane
  const overviewDate = selectedCrane.inspections?.find((inspection) => inspection.completedAt)?.completedAt || report.summary?.completedAt

  const renderDetailSections = (detailSections: ResolvedSection[]) =>
    detailSections
      .map((section) => {
        const satisfactoryCount = section.points.filter((point) => getConditionTone(point) === 'success').length
        return `
          <section class="detail-section">
            <div class="detail-header">${escapeHtml(section.name)} <span>${satisfactoryCount}/${section.points.length || 0} Satisfactory</span></div>
            <div class="detail-grid">
              ${section.points
                .map(
                  (point) => `
                    <div class="detail-row">
                      <div class="detail-label">${escapeHtml(point.name ?? 'Inspection point')}</div>
                      <div class="${toneClass(point)}">${escapeHtml(toTitleCase(getPointDisplayValue(point)))}</div>
                    </div>
                  `,
                )
                .join('')}
            </div>
          </section>
        `
      })
      .join('')

  const firstPageSections = sections.length > 2 ? sections.slice(0, 2) : sections
  const secondPageSections = sections.length > 2 ? sections.slice(2) : []
  const firstPageSectionsMarkup = renderDetailSections(firstPageSections)
  const secondPageSectionsMarkup = secondPageSections.length
    ? `<div class="page2-continuation">${renderDetailSections(secondPageSections)}</div>`
    : ''

  const firstPageActions = actionItems
    .slice(0, 6)
    .map(
      (item) => `
        <div class="mini-action-row">
          <div>${escapeHtml(item.sectionName)}:<br />${escapeHtml(item.label)}</div>
          <div><span class="action-pill">${escapeHtml(toTitleCase(item.status))}</span></div>
        </div>
      `,
    )
    .join('')

  const firstPageActionPanel = actionItems.length
    ? `
      <div class="panel panel-danger">
        <div class="panel-title">Action Items ${actionItems.length}</div>
        <div class="panel-body"><div class="mini-action-grid">${firstPageActions}</div></div>
      </div>
    `
    : ''

  const photoMarkup = photos.length
    ? `
      <section class="photos-section">
        <div class="photo-grid">
          ${photos
            .map(
              (photo) => `
                <figure class="photo-card">
                  <img src="${escapeHtml(photo.content ?? '')}" alt="${escapeHtml(photo.caption)}" />
                  <figcaption>${escapeHtml(photo.caption)}</figcaption>
                </figure>
              `,
            )
            .join('')}
        </div>
      </section>
    `
    : ''

  const page2MainContent = actionItems.length
    ? `
      <div class="page2-title page2-title-repair">ACTION LIST - REPAIR ITEMS</div>
      ${renderSectionedItems(actionItems, 'Repair item')}
      <div class="page2-title page2-title-pictures">ADDITIONAL DETAILS - PICTURES</div>
      ${photoMarkup}
    `
    : notesAndPhotoItems.length
      ? `
        <div class="page2-title">NOTES AND PHOTOS</div>
        ${renderSectionedItems(notesAndPhotoItems, 'item')}
        ${photoMarkup}
      `
      : `
        <div class="page2-title page2-title-pictures-only">ADDITIONAL DETAILS - PICTURES</div>
        ${photoMarkup}
      `

  return `
    <div class="pdf-page">
      <div class="hero">
        <div>
          <div class="brand">DESHAZO</div>
          <div class="brand-sub">Cranes / Service / Automation</div>
        </div>
        <div class="hero-meta">
          <div>DESHAZO Branch: <strong>${escapeHtml(report.summary?.serviceLocationName || '001 California')}</strong></div>
          <div>Branch Contact Phone: —</div>
        </div>
        <div class="hero-title">Inspection Report</div>
      </div>

      <div class="body">
        <div class="summary-top">
          <div><strong>${escapeHtml(getReportIdentifier(report, selectedCrane))}</strong> performed by: ${escapeHtml(getLeadTechnician(report, selectedCrane))}</div>
          <div>Type: <strong>${escapeHtml(toTitleCase(selectedCrane.inspections?.[0]?.type))}</strong></div>
          <div>Date: <strong>${escapeHtml(formatDate(selectedCrane.inspections?.[0]?.date || report.summary?.endDate || report.rawPayload.inspectionDate))}</strong></div>
        </div>

        <div class="summary-grid">
          <div class="summary-cell"><div class="summary-label">Structure</div><div class="summary-value">${escapeHtml(primaryCrane?.structure?.type || primaryCrane?.description || 'Not available')}</div></div>
          <div class="summary-cell"><div class="summary-label">Job #</div><div class="summary-value">${escapeHtml(report.summary?.jobNo || report.summary?.salesOrderNo || report.jobNo || String(report.workOrderId))}</div></div>
          <div class="summary-cell"><div class="summary-label">Description</div><div class="summary-value">${escapeHtml(primaryCrane?.description || 'Not available')}</div></div>
          <div class="summary-cell"><div class="summary-label">Customer</div><div class="summary-value">${escapeHtml(report.summary?.customerName || 'Wabash')}</div></div>
          <div class="summary-cell"><div class="summary-label">Purchase Order</div><div class="summary-value">${escapeHtml(report.summary?.customerPoNo || 'UNAVAILABLE')}</div></div>
          <div class="summary-cell"><div class="summary-label">Location</div><div class="summary-value">${escapeHtml(primaryCrane?.location || 'N/A')}</div></div>
          <div class="summary-cell"><div class="summary-label">Customer Address</div><div class="summary-value">${escapeHtml(report.summary?.customerLocationAddress || report.summary?.customerAddress || 'N/A')}</div></div>
          <div class="summary-cell"><div class="summary-label">Status</div><div class="summary-value">${escapeHtml(report.summary?.statusName || 'Saved')}</div></div>
          <div class="summary-cell"><div class="summary-label">Manufacturer</div><div class="summary-value">${buildEquipmentLines(selectedCrane, (crane) => crane.crane?.structure?.manufacturer || 'N/A', (hoist) => hoist.manufacturer || 'N/A').map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div></div>
          <div class="summary-cell"><div class="summary-label">Serial Number</div><div class="summary-value">${buildEquipmentLines(selectedCrane, (crane) => crane.crane?.structure?.serialNumber || 'N/A', (hoist) => hoist.serialNumber || 'N/A').map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div></div>
          <div class="summary-cell"><div class="summary-label">Capacity</div><div class="summary-value">${buildEquipmentLines(selectedCrane, (crane) => crane.crane?.structure?.capacity || 'N/A', (hoist) => hoist.capacity || 'N/A').map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div></div>
          <div class="summary-cell"><div class="summary-label">Model #</div><div class="summary-value">${buildEquipmentLines(selectedCrane, (crane) => crane.crane?.structure?.model || crane.crane?.structure?.serialNumber || 'N/A', (hoist) => hoist.model || 'N/A').map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div></div>
        </div>

        <div class="stats-grid">
          <div class="stat-card"><div class="stat-value danger-text">${stats.repairCount}</div><div class="stat-label danger-text">Repair</div></div>
          <div class="stat-card"><div class="stat-value">${stats.satisfactoryPointCount}</div><div class="stat-label">Satisfactory Items</div></div>
          <div class="stat-card"><div class="stat-value">${stats.safetyMonitorCount}</div><div class="stat-label">Safety and Monitor Items</div></div>
          <div class="stat-card"><div class="stat-value">${stats.naPointCount}</div><div class="stat-label">N/A Items</div></div>
        </div>

        ${firstPageActionPanel}

        <div class="panel">
          <div class="panel-title">Inspection Overview</div>
          <div class="panel-body overview-grid">
            <div>${escapeHtml(getOverviewNote(report, selectedCrane))}</div>
            <div>${escapeHtml(overviewDate ? formatTime(overviewDate) : 'N/A')}</div>
            <div>By ${escapeHtml(getLeadTechnician(report, selectedCrane))}</div>
          </div>
        </div>

        ${firstPageSectionsMarkup}
        <div class="footer">Page 1/2</div>
      </div>
    </div>

    <div class="pdf-page">
      <div class="body body-full body-page2">
        <div class="page2-header">
          <div>
            <div class="page2-brand">DESHA<span>Z</span>O</div>
            <div class="page2-brand-sub">Cranes / Service / Automation</div>
          </div>
          <div class="page2-meta">
            <div><span>Purchase Order:</span> ${escapeHtml(report.summary?.customerPoNo || 'UNAVAILABLE')}</div>
            <div><span>Job #:</span> ${escapeHtml(report.summary?.jobNo || report.summary?.salesOrderNo || report.jobNo || String(report.workOrderId))}</div>
            <div><span>Service Location:</span> ${escapeHtml(report.summary?.serviceLocationName || '001 California')}</div>
            <div><span>Customer Name:</span> ${escapeHtml(report.summary?.customerName || 'Wabash')}</div>
          </div>
        </div>
        <div class="page2-content">
          ${secondPageSectionsMarkup}
          ${page2MainContent}
        </div>
        <div class="page2-dot">.</div>
        <div class="footer footer-page2">Page 2/2</div>
      </div>
    </div>
  `
}

export function getDeshazoInspectionReportStyles(mode: 'pdf' | 'preview' = 'pdf') {
  const rootPosition =
    mode === 'preview'
      ? 'position: static; left: auto; top: auto;'
      : 'position: fixed; left: -10000px; top: 0;'
  const pageSpacing = mode === 'preview' ? '.pdf-page + .pdf-page { margin-top: 24px; }' : ''

  return `
    .deshazo-pdf-root {
      ${rootPosition}
      width: ${DESHAZO_PDF_PAGE_WIDTH_PX}px;
      background: #fff;
      color: #171821;
      font-family: Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
    }
    .pdf-page {
      width: ${DESHAZO_PDF_PAGE_WIDTH_PX}px;
      height: ${DESHAZO_PDF_PAGE_HEIGHT_PX}px;
      background: #fff;
      overflow: hidden;
      border: 1px solid #d7d7d7;
      box-sizing: border-box;
      page-break-after: always;
    }
    ${pageSpacing}
    .hero { display: grid; grid-template-columns: 1.25fr 1fr .9fr; gap: 14px; height: 86px; padding: 15px 24px 12px; background: #f6b23b; color: #000; }
    .brand { font-size: 40px; font-weight: 900; letter-spacing: -1.5px; line-height: .9; }
    .brand-sub { margin-top: 5px; font-size: 10px; font-weight: 900; text-transform: uppercase; }
    .hero-meta { padding-top: 3px; font-size: 13px; font-weight: 400; line-height: 1.5; }
    .hero-title { display: flex; justify-content: flex-end; align-items: center; font-size: 30px; line-height: 1.05; font-weight: 900; text-transform: uppercase; }
    .body { padding: 17px 24px 18px; }
    .body-full { height: ${DESHAZO_PDF_PAGE_HEIGHT_PX - 2}px; }
    .body-page2 { position: relative; padding: 25px 24px 18px; }
    .summary-top { display: grid; grid-template-columns: 1.7fr 1fr 1fr; gap: 12px; padding-bottom: 11px; border-bottom: 1px solid #cfcfcf; font-size: 13px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid #d8d8d8; border-left: 1px solid #d8d8d8; }
    .summary-cell { min-height: 50px; padding: 6px 7px; border-right: 1px solid #d8d8d8; border-bottom: 1px solid #d8d8d8; font-size: 12px; }
    .summary-label { font-size: 11px; font-weight: 700; text-transform: none; color: #111; }
    .summary-value { margin-top: 4px; font-weight: 600; line-height: 1.24; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); background: #f3f3f3; border-left: 1px solid #d8d8d8; border-right: 1px solid #d8d8d8; border-bottom: 1px solid #d8d8d8; }
    .stat-card { padding: 7px 8px 9px; text-align: center; border-right: 1px solid #d8d8d8; }
    .stat-card:last-child { border-right: 0; }
    .stat-value { font-size: 42px; font-weight: 900; line-height: .95; }
    .stat-label { margin-top: 5px; font-size: 13px; font-weight: 700; }
    .danger-text { color: #b81717; }
    .panel { margin-top: 10px; border: 1px solid #d8d8d8; }
    .panel.panel-danger { background: #fff2f2; border-color: #efcccc; }
    .panel-title { padding: 7px 10px; font-size: 13px; font-weight: 700; border-bottom: 1px solid #d8d8d8; }
    .panel.panel-danger .panel-title { color: #7e0e0e; border-color: #efcccc; }
    .panel-body { padding: 9px 10px; }
    .mini-action-grid { display: grid; grid-template-columns: 1fr; gap: 7px; }
    .mini-action-row { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 10px; align-items: center; font-size: 12px; }
    .action-pill { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-width: 80px; height: 18px; padding: 0 9px; background: #f7d4d4; color: #8d1111; font-size: 12px; font-weight: 700; line-height: 1; }
    .overview-grid { display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 12px; font-size: 13px; }
    .detail-section { padding-top: 13px; margin-top: 13px; border-top: 1px solid #dadada; break-inside: avoid; }
    .detail-header { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; margin-bottom: 7px; font-size: 13px; font-weight: 700; }
    .detail-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px 16px; }
    .detail-row { display: grid; grid-template-columns: minmax(0, 1fr) 100px; align-items: center; gap: 7px; min-height: 18px; font-size: 13px; }
    .detail-label { min-width: 0; line-height: 1.18; }
    .status { display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 100px; height: 18px; padding: 0 7px; text-align: center; font-size: 12px; font-weight: 700; line-height: 1; white-space: nowrap; }
    .status-success { background: #bff2be; color: #1f6a2e; }
    .status-neutral { background: #d9d9d9; color: #4d4d4d; }
    .status-danger { background: #f7c7c7; color: #a61616; }
    .page2-header { display: grid; grid-template-columns: 250px 1fr; align-items: start; gap: 24px; padding: 0 0 9px; border-bottom: 3px solid #f0aa2e; }
    .page2-brand { font-size: 30px; font-weight: 900; letter-spacing: -1px; line-height: .9; color: #050505; }
    .page2-brand span { color: #f0aa2e; }
    .page2-brand-sub { margin-top: 5px; font-size: 9.8px; font-weight: 900; line-height: 1; text-transform: uppercase; }
    .page2-meta { display: grid; grid-template-columns: 1fr 96px; gap: 6px 32px; justify-self: end; width: 366px; font-size: 12px; line-height: 1.32; }
    .page2-meta span { font-weight: 700; }
    .page2-content { margin-top: 28px; }
    .page2-continuation { margin-bottom: 24px; }
    .page2-continuation .detail-section:first-child { margin-top: 0; }
    .page2-title { margin-left: 5px; padding-bottom: 13px; border-bottom: 1px solid #b81717; font-size: 16px; font-weight: 700; line-height: 1.05; text-transform: uppercase; color: #171821; }
    .page2-title-repair { color: #b81717; }
    .page2-title-pictures { margin-top: 22px; border-bottom-color: #d8d8d8; color: #171821; }
    .page2-title-pictures-only { margin-top: 20px; }
    .page2-item-section { margin: 12px 0 0 13px; }
    .page2-section-title { display: flex; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 700; line-height: 1.1; }
    .page2-section-count { color: #b81717; font-size: 10px; font-weight: 700; }
    .page2-points-box { margin-top: 8px; min-height: 66px; border: 1px solid #d8d8d8; padding: 8px 11px; }
    .page2-point { margin: 0; font-size: 12px; }
    .page2-point + .page2-point { margin-top: 12px; padding-top: 10px; border-top: 1px solid #e2e2e2; }
    .page2-point-name { font-size: 12px; font-weight: 700; line-height: 1.15; }
    .page2-point-status { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-width: 86px; height: 18px; margin: 7px 0 0 18px; padding: 0 10px; font-size: 10px; font-weight: 700; line-height: 1; white-space: nowrap; }
    .page2-status-success { background: #bff2be; color: #1f6a2e; }
    .page2-status-neutral { background: #d9d9d9; color: #4d4d4d; }
    .page2-status-danger { background: #e8c7c9; color: #9d1c1c; }
    .page2-note { margin-top: 7px; font-size: 10px; line-height: 1.35; }
    .page2-note span { font-weight: 700; }
    .page2-dot { position: absolute; left: 18px; top: 470px; font-size: 10px; line-height: 1; }
    .photos-section { padding-top: 18px; margin-top: 12px; }
    .photo-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .photo-card { margin: 0; border: 1px solid #d8d8d8; background: #f7f7f7; break-inside: avoid; }
    .photo-card img { display: block; width: 100%; height: 150px; object-fit: cover; background: #fff; }
    .photo-card figcaption { padding: 8px 10px; font-size: 12px; font-weight: 700; color: rgba(21, 24, 33, 0.7); }
    .footer { margin-top: 12px; padding-top: 9px; border-top: 1px solid #dadada; font-size: 10px; color: #5d6576; text-align: right; }
    .footer-page2 { position: absolute; right: 18px; bottom: 14px; margin-top: 0; padding-top: 0; border-top: 0; font-size: 9px; color: #171821; }
    .empty-note { font-size: 13px; color: rgba(21, 24, 33, 0.68); }
  `
}

function createRenderRoot(report: DeshazoSavedInspectionReport, selectedCraneIndex: number) {
  const root = document.createElement('div')
  root.className = 'deshazo-pdf-root'
  root.innerHTML = `<style>${getDeshazoInspectionReportStyles()}</style>${getDeshazoInspectionReportHtml(report, selectedCraneIndex)}`
  document.body.appendChild(root)
  return root
}

async function waitForImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve()
            return
          }
          image.onload = () => resolve()
          image.onerror = () => resolve()
        }),
    ),
  )
}

export function getDeshazoInspectionPdfFileName(report: DeshazoSavedInspectionReport, selectedCraneIndex = 0) {
  const selectedCrane = report.rawPayload.cranes?.[selectedCraneIndex] ?? report.rawPayload.cranes?.[0] ?? null
  const identifier = getReportIdentifier(report, selectedCrane)
  const jobNo = report.summary?.jobNo || report.summary?.salesOrderNo || report.jobNo || String(report.workOrderId)
  const customer = report.summary?.customerName || 'Wabash'
  const type = toTitleCase(selectedCrane?.inspections?.[0]?.type || report.jobType || 'Inspection')
  return `${safeFilePart(identifier)}-job#${safeFilePart(jobNo)}-${safeFilePart(customer)}-${safeFilePart(type)}.pdf`
}

export async function createDeshazoInspectionPdfBlob(report: DeshazoSavedInspectionReport, selectedCraneIndex = 0) {
  const root = createRenderRoot(report, selectedCraneIndex)

  try {
    await waitForImages(root)
    const pages = Array.from(root.querySelectorAll<HTMLElement>('.pdf-page'))
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true })

    for (let index = 0; index < pages.length; index += 1) {
      const canvas = await html2canvas(pages[index], {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
        allowTaint: true,
        logging: false,
      })
      const imageData = canvas.toDataURL('image/png')
      if (index > 0) pdf.addPage('letter', 'portrait')
      pdf.addImage(imageData, 'PNG', 0, 0, pdfPageWidthPt, pdfPageHeightPt)
    }

    return pdf.output('blob')
  } finally {
    root.remove()
  }
}

export async function downloadDeshazoInspectionPdf(report: DeshazoSavedInspectionReport, selectedCraneIndex = 0) {
  const blob = await createDeshazoInspectionPdfBlob(report, selectedCraneIndex)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = getDeshazoInspectionPdfFileName(report, selectedCraneIndex)
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
