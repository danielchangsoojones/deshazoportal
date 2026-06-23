import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type {
  DeshazoCraneReport,
  DeshazoGeneralWorkItem,
  DeshazoHoist,
  DeshazoInspectionPhoto,
  DeshazoInspectionPoint,
  DeshazoSavedInspectionReport,
} from './deshazoExternalReports'
import { getCustomerDisplayName, getStoredCustomer } from './customerRouting'

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
  satisfactoryCount?: number
  totalPointCount?: number
}

type SectionedItem = ActionItem

type ServiceContactInfo = {
  customer: string
  contact: string
  location: string
  phone: string
  email: string
}

type ServiceTechnicianTime = {
  name: string
  start: string
  end: string
  total: string
}

type ServiceTicketPage = {
  kind: 'work' | 'attachments'
  item: DeshazoGeneralWorkItem
  itemIndex: number
}

type ConditionTone = 'success' | 'neutral' | 'repair' | 'monitor' | 'danger'

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

function formatFileDatePart(value?: string | null) {
  if (!value) return ''
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (dateOnlyMatch) return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}`
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return safeFilePart(value)
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(value?: string) {
  if (!value) return 'N/A'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed)
}

function formatTime(value?: string) {
  if (!value) return 'N/A'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'N/A'
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
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

function isTemplatePlaceholder(value?: string | null) {
  return /^\s*\{\{[^}]+\}\}\s*$/.test(value ?? '')
}

function getActivePortalCustomerName() {
  return getCustomerDisplayName(getStoredCustomer())
}

function getReportCustomerName(report: DeshazoSavedInspectionReport) {
  const rawPayload = report.summary?.rawPayload
  const candidates = [
    report.summary?.customerName,
    rawPayload && typeof rawPayload === 'object'
      ? getUnknownString(rawPayload as Record<string, unknown>, ['customerName', 'billToName'])
      : '',
    getActivePortalCustomerName(),
  ]

  return candidates.find((candidate) => candidate && !isTemplatePlaceholder(candidate)) || 'Customer'
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

function normalizeStatus(value?: string | null) {
  return (value ?? '').trim().toUpperCase()
}

function isNaStatus(value: string) {
  return value === 'N/A' || value === 'NA' || value === 'NOT APPLICABLE'
}

function isSatisfactoryStatus(value: string) {
  return value === 'SATISFACTORY'
}

function isRepairStatus(value: string) {
  return value === 'REPAIR' || /^REPAIRS?\b/.test(value) || /REPAIR (REQUIRED|NEEDED)/.test(value)
}

function isMonitorStatus(value: string) {
  return value === 'MONITOR' || value === 'MONITORING' || /^MONITOR\b/.test(value)
}

function isSafetyStatus(value: string) {
  return value === 'SAFETY' || value.includes('DO NOT OPERATE') || value.includes('UNSAFE')
}

function isKnownStatus(value: string) {
  return (
    isSatisfactoryStatus(value) ||
    isNaStatus(value) ||
    isRepairStatus(value) ||
    isMonitorStatus(value) ||
    isSafetyStatus(value)
  )
}

function getStatusTone(status: string): ConditionTone {
  const value = normalizeStatus(status)
  if (isSatisfactoryStatus(value)) return 'success'
  if (!value || isNaStatus(value)) return 'neutral'
  if (isRepairStatus(value)) return 'repair'
  if (isMonitorStatus(value)) return 'monitor'
  if (isSafetyStatus(value)) return 'danger'
  return 'neutral'
}

function getConditionTone(point: DeshazoInspectionPoint): ConditionTone {
  return getStatusTone(getPointDisplayValue(point))
}

function getConditionRank(point: DeshazoInspectionPoint) {
  const tone = getConditionTone(point)
  if (tone === 'repair') return 5
  if (tone === 'danger') return 4
  if (tone === 'monitor') return 3
  if (tone === 'success') return 2
  return 1
}

function mergePointCollections<T>(left: T[] | undefined, right: T[] | undefined) {
  return [...(left ?? []), ...(right ?? [])]
}

function getPointIdentity(point: DeshazoInspectionPoint) {
  return [
    point.id ?? '',
    point.order ?? '',
    (point.name ?? '').trim().toLowerCase(),
  ].join('|')
}

function dedupeInspectionPoints(points: DeshazoInspectionPoint[]) {
  const pointsByIdentity = new Map<string, DeshazoInspectionPoint>()

  points.forEach((point) => {
    const identity = getPointIdentity(point)
    const existingPoint = pointsByIdentity.get(identity)
    if (!existingPoint) {
      pointsByIdentity.set(identity, point)
      return
    }

    const preferredPoint = getConditionRank(point) > getConditionRank(existingPoint) ? point : existingPoint
    pointsByIdentity.set(identity, {
      ...preferredPoint,
      notes: preferredPoint.notes || existingPoint.notes || point.notes,
      remarks: mergePointCollections(existingPoint.remarks, point.remarks),
      photos: mergePointCollections(existingPoint.photos, point.photos),
    })
  })

  return Array.from(pointsByIdentity.values())
}

function resolveHoistSections(points: DeshazoInspectionPoint[], hoistCount: number) {
  if (hoistCount <= 1) return [dedupeInspectionPoints(points)]

  const groupedPoints = new Map<string, DeshazoInspectionPoint[]>()
  points.forEach((point) => {
    const identity = getPointIdentity(point)
    groupedPoints.set(identity, [...(groupedPoints.get(identity) ?? []), point])
  })

  const canDeinterleave = Array.from(groupedPoints.values()).some((group) => group.length >= hoistCount)
  if (!canDeinterleave) {
    const chunkSize = Math.max(1, Math.floor(points.length / hoistCount))
    return Array.from({ length: hoistCount }, (_, hoistIndex) => {
      const start = hoistIndex * chunkSize
      const end = hoistIndex === hoistCount - 1 ? points.length : start + chunkSize
      return dedupeInspectionPoints(points.slice(start, end))
    })
  }

  return Array.from({ length: hoistCount }, (_, hoistIndex) =>
    dedupeInspectionPoints(
      Array.from(groupedPoints.values())
        .map((group) => group[hoistIndex] ?? group[0])
        .filter((point): point is DeshazoInspectionPoint => Boolean(point)),
    ),
  )
}

function sortPoints(points: DeshazoInspectionPoint[]) {
  return [...points].sort((left, right) => {
    const leftOrder = typeof left.order === 'number' ? left.order : Number.MAX_SAFE_INTEGER
    const rightOrder = typeof right.order === 'number' ? right.order : Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder
  })
}

function getTextLength(value?: string | null) {
  return (value ?? '').trim().replace(/\s+/g, ' ').length
}

function hasLongCategoryText(value?: string | null) {
  const text = (value ?? '').trim()
  return getTextLength(text) > 54 || /[.!?].{10,}/.test(text)
}

function hasLongDetailRows(section: ResolvedSection) {
  return section.points.some((point) => hasLongCategoryText(point.name))
}

function hasLongActionItems(items: SectionedItem[]) {
  return items.some((item) => hasLongCategoryText(item.label))
}

function splitTextIntoBlocks(value: string, maxLength: number) {
  const text = value.trim().replace(/\s+/g, ' ')
  if (!text || text.length <= maxLength) return text ? [text] : ['']

  const blocks: string[] = []
  let current = ''

  text.split(' ').forEach((word) => {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxLength && current) {
      blocks.push(current)
      current = word
      return
    }

    if (word.length > maxLength) {
      if (current) blocks.push(current)
      for (let index = 0; index < word.length; index += maxLength) {
        blocks.push(word.slice(index, index + maxLength))
      }
      current = ''
      return
    }

    current = next
  })

  if (current) blocks.push(current)
  return blocks
}

function getStructureSectionName(craneReport: DeshazoCraneReport) {
  const structureType = craneReport.crane?.structure?.type || 'Structure'
  return structureType.split('-')[0]?.trim() || structureType
}

function getSectionDisplayName(value?: string | null) {
  const name = (value ?? '').trim()
  if (!name) return ''
  if (isTemplatePlaceholder(name)) return getActivePortalCustomerName()
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolveSections(craneReport: DeshazoCraneReport) {
  const sections: ResolvedSection[] = []
  const hoists = craneReport.crane?.hoists ?? []

  ;(craneReport.inspections ?? []).forEach((inspection) => {
    ;(inspection.sections ?? []).forEach((section) => {
      const sortedPoints = sortPoints(section.points ?? [])
      if (sortedPoints.length === 0) return
      const sectionName = section.name ?? ''

      if (sectionName.includes('craneStructureType')) {
        sections.push({ name: getStructureSectionName(craneReport), points: dedupeInspectionPoints(sortedPoints) })
        return
      }

      if (/trolley/i.test(sectionName) && /hoist/i.test(sectionName) && hoists.length > 0) {
        resolveHoistSections(sortedPoints, hoists.length).forEach((points, hoistIndex) => {
          if (points.length > 0) sections.push({ name: `Trolley Hoist ${hoistIndex + 1}`, points })
        })
        return
      }

      if (/hoist/i.test(sectionName) && hoists.length > 0) {
        resolveHoistSections(sortedPoints, hoists.length).forEach((points, hoistIndex) => {
          if (points.length > 0) sections.push({ name: `Hoist ${hoistIndex + 1}`, points })
        })
        return
      }

      sections.push({ name: getSectionDisplayName(sectionName) || inspection.type || 'Inspection Section', points: dedupeInspectionPoints(sortedPoints) })
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
      const condition = normalizeStatus(getPointDisplayValue(point))
      if (isRepairStatus(condition)) {
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

function getSafetyItems(craneReport: DeshazoCraneReport) {
  const items: SectionedItem[] = []

  resolveSections(craneReport).forEach((section) => {
    section.points.forEach((point) => {
      const condition = normalizeStatus(getPointDisplayValue(point))
      if (isSafetyStatus(condition)) {
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
      const condition = normalizeStatus(getPointDisplayValue(point))
      if ((notes || photos.length > 0) && !isRepairStatus(condition) && !isSafetyStatus(condition)) {
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

function renderSectionedItemGroup(
  group: { sectionName: string; items: SectionedItem[] },
  itemLabel: string,
  includePhotos = false,
  options: { showHeader?: boolean; totalCount?: number; forceLongLayout?: boolean } = {},
) {
  const showHeader = options.showHeader ?? true
  const totalCount = options.totalCount ?? group.items.length
  const longTextLayout = Boolean(options.forceLongLayout) || hasLongActionItems(group.items)
  return `
        <section class="page2-item-section">
          ${
            showHeader
              ? `<div class="page2-section-title">
                  <span>${escapeHtml(group.sectionName)}</span>
                  <span class="page2-section-count">${totalCount} ${escapeHtml(itemLabel)}${totalCount === 1 ? '' : 's'}</span>
                </div>`
              : ''
          }
          <div class="page2-points-box ${longTextLayout ? 'page2-points-box-long' : ''}">
            ${group.items
              .map(
                (item) => `
                  <div class="page2-point">
                    <div class="page2-point-name">${escapeHtml(item.label)}</div>
                    ${
                      item.status
                        ? `<div class="${page2StatusClass(item.status)}">${renderStatusLabel(item.status)}</div>`
                        : ''
                    }
                    ${
                      includePhotos && item.photos.length > 0
                        ? `<div class="page2-action-photos">
                            ${item.photos
                              .map(
                                (photo, photoIndex) => `
                                  <figure class="page2-action-photo">
                                    <img src="${escapeHtml(photo.content ?? '')}" alt="${escapeHtml(item.label)}" />
                                    <figcaption>${photoIndex + 1}/${item.photos.length}</figcaption>
                                  </figure>
                                `,
                              )
                              .join('')}
                          </div>`
                        : ''
                    }
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
      `
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
      const status = normalizeStatus(getPointDisplayValue(point))
      const tone = getStatusTone(status)
      if (tone === 'success') satisfactoryPointCount += 1
      else if (isNaStatus(status)) naPointCount += 1
      else if (tone === 'repair') repairCount += 1
      else if (tone === 'monitor' || tone === 'danger') safetyMonitorCount += 1
    })
  })

  return {
    repairCount,
    satisfactoryPointCount,
    safetyMonitorCount,
    naPointCount,
  }
}

function asArray<T>(value: T | T[] | undefined | null) {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function normalizeGeneralWorkItems(report: DeshazoSavedInspectionReport) {
  return asArray(report.rawPayload.generalWork as DeshazoGeneralWorkItem | DeshazoGeneralWorkItem[] | undefined)
}

function getUnknownString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return ''
}

function getNoteText(note: unknown) {
  if (typeof note === 'string') return note.trim()
  if (!note || typeof note !== 'object') return ''
  return getUnknownString(note as Record<string, unknown>, ['note', 'content', 'text', 'value', 'description'])
}

function getServiceNoteTexts(item: DeshazoGeneralWorkItem) {
  const record = item as Record<string, unknown>
  return [
    ...asArray(record.serviceNotes).map(getNoteText),
    ...asArray(record.notes).map(getNoteText),
  ].filter(Boolean)
}

function getMaterialTexts(item: DeshazoGeneralWorkItem) {
  const record = item as Record<string, unknown>
  const directMaterials = asArray(record.materialsOrdered).length > 0
    ? asArray(record.materialsOrdered)
    : asArray(record.materials)
  const batchMaterials = asArray(record.materialBatches)
    .flatMap((batch) => batch && typeof batch === 'object' ? asArray((batch as Record<string, unknown>).materials) : [])

  return [...directMaterials, ...batchMaterials]
    .map((material) => {
      if (typeof material === 'string') return material.trim()
      if (!material || typeof material !== 'object') return ''
      const materialRecord = material as Record<string, unknown>
      const title = getUnknownString(materialRecord, ['title', 'name', 'partNumber', 'part_number'])
      const description = getUnknownString(materialRecord, ['description', 'desc'])
      const quantity = getUnknownString(materialRecord, ['quantity', 'qty'])
      return [quantity ? `${quantity}x` : '', title, description].filter(Boolean).join(' - ')
    })
    .filter(Boolean)
}

function getGeneralWorkPhotos(item: DeshazoGeneralWorkItem) {
  return asArray((item as Record<string, unknown>).photos) as DeshazoInspectionPhoto[]
}

function getPhotoContent(photo: DeshazoInspectionPhoto) {
  const record = photo as Record<string, unknown>
  return getUnknownString(record, ['content', 'contentUrl', 'url', 'src'])
}

function getNestedRecord(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function joinAddressParts(parts: Array<string | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(' - ')
}

function getServiceContactInfo(report: DeshazoSavedInspectionReport): ServiceContactInfo {
  const rawPayload = report.summary?.rawPayload
  const customerLocation = getNestedRecord(rawPayload, 'customerLocation')
  const customer = getReportCustomerName(report)
  const contact = getUnknownString(rawPayload ?? {}, ['confirmTo', 'contactName', 'contact']) || '--'
  const phone = getUnknownString(customerLocation ?? rawPayload ?? {}, ['telephoneNo', 'phone', 'contactPhone']) || '--'
  const email = getUnknownString(rawPayload ?? {}, ['emailAddress', 'email']) || '--'
  const customerLocationAddress = customerLocation
    ? joinAddressParts([
        getUnknownString(customerLocation, ['shipToAddress1']),
        getUnknownString(customerLocation, ['shipToAddress2']),
        getUnknownString(customerLocation, ['shipToAddress3']),
        [
          getUnknownString(customerLocation, ['shipToCity']),
          getUnknownString(customerLocation, ['shipToState']),
          getUnknownString(customerLocation, ['shipToZipCode']),
        ].filter(Boolean).join(', '),
      ])
    : ''
  const locationAddress = customerLocationAddress || report.summary?.customerLocationAddress || [
      getUnknownString(customerLocation ?? {}, ['shipToCity']),
      getUnknownString(customerLocation ?? {}, ['shipToState']),
      getUnknownString(customerLocation ?? {}, ['shipToZipCode']),
    ].filter(Boolean).join(', ')

  return {
    customer: customerLocation
      ? `${customer} @ ${getUnknownString(customerLocation, ['shipToName', 'shipToCity']) || report.summary?.customerLocationName || 'Location'}`
      : customer,
    contact,
    location: locationAddress || report.summary?.customerLocationAddress || report.summary?.customerLocationName || 'N/A',
    phone,
    email,
  }
}

function getBranchName(report: DeshazoSavedInspectionReport) {
  const rawPayload = report.summary?.rawPayload
  const serviceLocation = getNestedRecord(rawPayload, 'serviceLocation')
  return report.summary?.serviceLocationName || getUnknownString(serviceLocation ?? {}, ['name']) || 'N/A'
}

function formatServiceDate(value?: string) {
  if (!value) return 'N/A'
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (dateOnlyMatch) return `${dateOnlyMatch[2]}/${dateOnlyMatch[3]}/${dateOnlyMatch[1]}`
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).format(parsed)
}

function formatShortTime(value?: string) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function getServiceTechnicianTime(report: DeshazoSavedInspectionReport, item: DeshazoGeneralWorkItem): ServiceTechnicianTime[] {
  const rawPayload = report.summary?.rawPayload
  const trips = rawPayload && Array.isArray(rawPayload.workOrderTrips)
    ? rawPayload.workOrderTrips as Array<Record<string, unknown>>
    : []
  const trip = trips.find((entry) => String(entry.tripNumber ?? '') === String(item.tripNumber ?? '')) ?? trips[0]
  const employees = trip && Array.isArray(trip.workOrderEmployees)
    ? trip.workOrderEmployees as Array<Record<string, unknown>>
    : []
  const names = employees
    .map((entry) => {
      const employee = getNestedRecord(entry, 'employee')
      return [getUnknownString(employee ?? {}, ['firstName']), getUnknownString(employee ?? {}, ['lastName'])]
        .filter(Boolean)
        .join(' ')
        .trim()
    })
    .filter(Boolean)

  const technician = item.technician || names[0] || 'Unknown technician'
  const record = item as Record<string, unknown>
  const start = getUnknownString(record, ['startTime', 'startedAt', 'start'])
  const end = getUnknownString(record, ['endTime', 'endedAt', 'end'])
  const total = getUnknownString(record, ['totalHours', 'hours', 'total'])

  return [{
    name: technician,
    start: formatShortTime(start) || '--',
    end: formatShortTime(end) || '--',
    total: total || '--',
  }]
}

function getServiceTicketRequestedText(report: DeshazoSavedInspectionReport) {
  const rawPayload = report.summary?.rawPayload
  if (!rawPayload || typeof rawPayload !== 'object') return report.summary?.comment || ''
  return getUnknownString(rawPayload, ['svcCommentText', 'dispatchNotes', 'comment'])
}

function getServiceSafetyRecord(item: DeshazoGeneralWorkItem) {
  const record = item as Record<string, unknown>
  return getNestedRecord(record, 'jsa') ||
    getNestedRecord(record, 'jobSafetyAnalysis') ||
    getNestedRecord(record, 'safetyAnalysis') ||
    getNestedRecord(record, 'safety')
}

function getSelectedLabels(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return []
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) {
      return value
        .map((entry) => {
          if (typeof entry === 'string') return entry
          if (entry && typeof entry === 'object') {
            return getUnknownString(entry as Record<string, unknown>, ['label', 'name', 'title', 'value'])
          }
          return ''
        })
        .filter(Boolean)
    }
  }
  return []
}

function getSafetyAnswer(record: Record<string, unknown> | null, keys: string[], fallback = 'YES') {
  if (!record) return fallback
  const value = getUnknownString(record, keys)
  if (!value) return fallback
  return value.toUpperCase() === 'TRUE' ? 'YES' : value.toUpperCase() === 'FALSE' ? 'NO' : value
}

function renderCheckList(labels: string[], selectedLabels: string[]) {
  const selected = new Set(selectedLabels.map((label) => label.toLowerCase()))
  return labels.map((label) => {
    const checked = selected.size === 0 ? false : selected.has(label.toLowerCase())
    return `<div class="service-check-row">${checked ? '<span class="service-check">✓</span>' : '<span class="service-check-space"></span>'}<span>${escapeHtml(label)}</span></div>`
  }).join('')
}

function renderServiceJsa(report: DeshazoSavedInspectionReport, item: DeshazoGeneralWorkItem) {
  const safety = getServiceSafetyRecord(item)
  const hazardLabels = [
    'FALLING DEBRIS',
    'FALL HAZARD',
    'FIRE / EXPLOSION',
    'ARCING',
    'ELECTROCUTION',
    'OVERHEAD HAZARDS',
    'HEAT / COLD',
    'AIRBORNE PARTICLES',
    'CHEMICALS',
    'UTILITIES',
    'MOBILE EQUIPMENT',
    'MOVING HAZARDS',
    'ENVIRONMENTAL',
    'PINCHING / CRUSHING',
    'PRESSURIZED SYSTEMS',
    'RIGGED LOADS',
    'SLIPPING / TRIPPING',
    'FLYING DEBRIS',
    'FLOOR OPENINGS',
    'SUBFLOORS',
  ]
  const ppeLabels = [
    'SAFETY GLASSES',
    'HARD HATS',
    'STEEL TOED SHOES',
    'FALL PROTECTION',
    'HEARING PROTECTION',
    'FACE SHIELD',
    'GLOVES',
    'RESPIRATORS',
    'LONG SLEEVES',
    'FIRE RETARDANT',
    'BARRICADES',
    'TAPE / WARNING SIGNS',
    'FIRE EXTINGUISHER',
    'LOCKOUT/TAGOUT',
    'TAG LINES',
    'HOUSE KEEPING',
    'VENT OR FAN',
    'HOLE COVERS',
    'MSDS/CHEM PROTECTION',
    'FIRE BLANKETS',
  ]
  const hazards = getSelectedLabels(safety, ['hazards', 'hazardRecognition', 'selectedHazards'])
  const ppe = getSelectedLabels(safety, ['ppe', 'safeguards', 'selectedPpe', 'selectedSafeguards'])
  const otherHazards = safety
    ? getUnknownString(safety, ['otherHazards', 'otherHazardsPresent', 'hazardsDescription'])
    : ''
  const safeguards = safety
    ? getUnknownString(safety, ['additionalSafeguards', 'safeguardsDescription'])
    : ''
  const date = item.date || report.summary?.startDate || report.summary?.endDate || report.rawPayload.inspectionDate
  const technician = item.technician || getLeadTechnician(report)

  return `
    <section class="service-jsa">
      <div class="service-date-bar"><span>DATE: ${escapeHtml(formatServiceDate(date))}</span><span>LEAD: ${escapeHtml(technician)}</span></div>
      <div class="service-jsa-body">
        <div class="service-jsa-title">JOB SAFETY ANALYSIS (JSA)</div>
        <div class="service-jsa-columns">
          <div>
            <div class="service-jsa-subtitle">HAZARD RECOGNITION</div>
            <div class="service-check-grid">${renderCheckList(hazardLabels, hazards)}</div>
          </div>
          <div>
            <div class="service-jsa-subtitle">PPE &amp; SAFEGUARDS</div>
            <div class="service-check-grid">${renderCheckList(ppeLabels, ppe)}</div>
          </div>
        </div>
        <div class="service-jsa-question">
          <strong>DESCRIBE ANY OTHER HAZARDS PRESENT FOR THIS WORK:</strong>
          <span>${escapeHtml(otherHazards || 'None')}</span>
          <em>By ${escapeHtml(technician)}</em>
        </div>
        <div class="service-jsa-question">
          <strong>DESCRIBE SAFEGUARDS TO ADDRESS THESE ADDITIONAL HAZARDS:</strong>
          <span>${escapeHtml(safeguards || 'None')}</span>
          <em>By ${escapeHtml(technician)}</em>
        </div>
        <div class="service-jsa-question service-jsa-line"><strong>HAVE ALL EQUIPMENT, PRE-SHIFT INSPECTIONS AND SAFETY CHECKS BEEN COMPLETED?:</strong> ${escapeHtml(getSafetyAnswer(safety, ['equipmentChecksCompleted', 'preShiftCompleted']))}</div>
        <div class="service-jsa-question service-jsa-line"><strong>HAVE ALL TECHNICIANS REVIEWED THE JSA AND VERIFIED THE PROPER PPE AND SAFEGUARDS?:</strong> ${escapeHtml(getSafetyAnswer(safety, ['techniciansReviewed', 'ppeVerified']))}</div>
      </div>
    </section>
  `
}

function renderServiceHeader(report: DeshazoSavedInspectionReport, compact: boolean) {
  const branchName = getBranchName(report)
  const jobNo = report.summary?.jobNo || report.summary?.salesOrderNo || report.jobNo || String(report.workOrderId)
  const customer = getReportCustomerName(report)
  const po = report.summary?.customerPoNo || 'UNAVAILABLE'

  if (compact) {
    return `
      <div class="service-header service-header-compact">
        <div>
          <div class="service-brand">DESHA<span>Z</span>O</div>
          <div class="service-brand-sub">Cranes / Service / Automation</div>
        </div>
        <div class="service-compact-meta">
          <div>Purchase Order: <strong>${escapeHtml(po)}</strong></div>
          <div>Job #: <strong>${escapeHtml(jobNo)}</strong></div>
          <div>Service Location: <strong>${escapeHtml(branchName)}</strong></div>
          <div>Customer Name: <strong>${escapeHtml(customer)}</strong></div>
        </div>
      </div>
    `
  }

  const contactPhone = getNestedRecord(report.summary?.rawPayload, 'serviceLocation')
    ? getUnknownString(getNestedRecord(report.summary?.rawPayload, 'serviceLocation') ?? {}, ['contactPhone'])
    : ''

  return `
    <div class="service-header service-header-hero">
      <div>
        <div class="service-brand">DESHA<span>Z</span>O</div>
        <div class="service-brand-sub">Cranes / Service / Automation</div>
      </div>
      <div class="service-branch">
        <div>DESHAZO Branch: <strong>${escapeHtml(branchName)}</strong></div>
        <div>Branch Contact Phone: <strong>${escapeHtml(contactPhone || '---')}</strong></div>
      </div>
      <div class="service-report-title">SERVICE REPORT</div>
    </div>
  `
}

function renderServiceInfo(report: DeshazoSavedInspectionReport) {
  const contact = getServiceContactInfo(report)
  const jobNo = report.summary?.jobNo || report.summary?.salesOrderNo || report.jobNo || String(report.workOrderId)

  return `
    <section class="service-box">
      <div class="service-box-title">SERVICE INFORMATION</div>
      <div class="service-box-grid">
        <div>Customer: <strong>${escapeHtml(contact.customer)}</strong></div>
        <div>Contact: <strong>${escapeHtml(contact.contact)}</strong></div>
        <div>Location: <strong>${escapeHtml(contact.location)}</strong></div>
        <div>Phone: <strong>${escapeHtml(contact.phone)}</strong></div>
        <div>Job #: <strong>${escapeHtml(jobNo)}</strong></div>
        <div>Email: <strong>${escapeHtml(contact.email)}</strong></div>
      </div>
    </section>
  `
}

function renderRequestedSection(report: DeshazoSavedInspectionReport) {
  const requestedText = getServiceTicketRequestedText(report)
  if (!requestedText) return ''

  return `
    <section class="service-box service-box-requested">
      <div class="service-box-title">SERVICE REQUESTED</div>
      <div class="service-box-body">${escapeHtml(requestedText)}</div>
    </section>
  `
}

function renderMaterials(item: DeshazoGeneralWorkItem) {
  const materials = getMaterialTexts(item)

  return `
    <div class="service-work-heading">Materials</div>
    ${
      materials.length > 0
        ? `<ul class="service-list">${materials.map((material) => `<li>${escapeHtml(material)}</li>`).join('')}</ul>`
        : '<p class="service-note muted">No information to show</p>'
    }
  `
}

function renderGeneralServiceWork(item: DeshazoGeneralWorkItem, includeMaterials: boolean) {
  const notes = getServiceNoteTexts(item)
  const technician = item.technician || 'Unknown technician'

  return `
    <section class="service-work">
      <div class="service-work-title">GENERAL SERVICE WORK</div>
      <div class="service-work-body">
        <div class="service-work-heading">Service Performed</div>
        ${
          notes.length > 0
            ? notes.map((note) => `<div class="service-work-note"><span>${escapeHtml(note)}</span><strong>By ${escapeHtml(technician)}</strong></div>`).join('')
            : '<p class="service-note muted">No service notes entered.</p>'
        }
        ${
          includeMaterials
            ? `<div class="service-divider"></div>${renderMaterials(item)}`
            : ''
        }
      </div>
    </section>
  `
}

function renderAttachmentPage(report: DeshazoSavedInspectionReport, item: DeshazoGeneralWorkItem) {
  const photos = getGeneralWorkPhotos(item).filter((photo) => getPhotoContent(photo))
  const technician = item.technician || 'Unknown technician'
  const timeRows = getServiceTechnicianTime(report, item)

  return `
    <section class="service-ticket-section service-materials">${renderMaterials(item)}</section>
    <section class="service-ticket-section service-attachments">
      <div class="service-section-heading">Attachments</div>
      ${
        photos.length > 0
          ? `<div class="service-photo-grid">${
              photos.slice(0, 6).map((photo) => `
                <figure class="service-photo">
                  <img src="${escapeHtml(getPhotoContent(photo))}" alt="Service attachment" />
                  <figcaption>By ${escapeHtml(technician)}</figcaption>
                </figure>
              `).join('')
            }</div>`
          : '<p class="service-note muted">No attachments to show</p>'
      }
    </section>
    <table class="service-time-table">
      <thead><tr><th>TECHNICIAN(S)</th><th>START TIME</th><th>END TIME</th><th>TOTAL</th></tr></thead>
      <tbody>
        ${timeRows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.start)}</td><td>${escapeHtml(row.end)}</td><td>${escapeHtml(row.total)}</td></tr>`).join('')}
        <tr class="service-time-total"><td></td><td></td><td>TOTALS</td><td>${escapeHtml(timeRows[0]?.total || '--')}</td></tr>
      </tbody>
    </table>
  `
}

function buildServiceTicketPages(items: DeshazoGeneralWorkItem[]): ServiceTicketPage[] {
  return items.flatMap((item, itemIndex) => {
    const pages: ServiceTicketPage[] = [{ kind: 'work', item, itemIndex }]
    if (getGeneralWorkPhotos(item).some((photo) => getPhotoContent(photo))) {
      pages.push({ kind: 'attachments', item, itemIndex })
    }
    return pages
  })
}

function getHasSummaryOnlyServiceTicketData(report: DeshazoSavedInspectionReport) {
  return Boolean(
    report.summary ||
    getServiceTicketRequestedText(report) ||
    report.jobNo ||
    report.workOrderId,
  )
}

function getSummaryOnlyServiceTicketHtml(report: DeshazoSavedInspectionReport) {
  if (!getHasSummaryOnlyServiceTicketData(report)) {
    return '<div class="pdf-page"><div class="body"><div class="empty-note">No crane inspection or service ticket data found.</div></div></div>'
  }

  return `
    <div class="pdf-page">
      <div class="body-service body-service-first">
        ${renderServiceHeader(report, false)}
        ${renderServiceInfo(report)}
        ${renderRequestedSection(report)}
        <div class="service-unsigned">WORK ORDER NOT SIGNED.</div>
        <div class="footer footer-page2">Page 1/1</div>
      </div>
    </div>
  `
}

function getServiceTicketHtml(report: DeshazoSavedInspectionReport) {
  const generalWorkItems = normalizeGeneralWorkItems(report)

  if (generalWorkItems.length === 0) {
    return getSummaryOnlyServiceTicketHtml(report)
  }

  const pages = buildServiceTicketPages(generalWorkItems)
  const totalPages = pages.length

  return pages.map((page, index) => {
    const isFirstPage = index === 0
    const compactHeader = !isFirstPage

    return `
      <div class="pdf-page">
        <div class="body-service ${isFirstPage ? 'body-service-first' : 'body-service-continuation'}">
          ${renderServiceHeader(report, compactHeader)}
          ${isFirstPage ? `${renderServiceInfo(report)}${renderRequestedSection(report)}` : ''}
          ${
            page.kind === 'work'
              ? `${renderServiceJsa(report, page.item)}${renderGeneralServiceWork(page.item, !getGeneralWorkPhotos(page.item).some((photo) => getPhotoContent(photo)))}`
              : renderAttachmentPage(report, page.item)
          }
          <div class="footer footer-page2">Page ${index + 1}/${totalPages}</div>
        </div>
      </div>
    `
  }).join('')
}

function toneClass(point: DeshazoInspectionPoint) {
  const status = normalizeStatus(getPointDisplayValue(point))
  const tone = getConditionTone(point)
  if (tone === 'success') return 'status status-success'
  if (tone === 'neutral' && status && !isKnownStatus(status)) return 'status status-plain'
  if (tone === 'neutral') return 'status status-neutral'
  if (tone === 'monitor') return 'status status-monitor status-with-icons'
  if (isSafetyStatus(status)) return 'status status-danger status-long-label'
  return 'status status-danger status-with-icons'
}

function page2StatusClass(status: string) {
  const tone = getStatusTone(status)
  if (tone === 'success') return 'page2-point-status page2-status-success'
  if (tone === 'neutral' && normalizeStatus(status) && !isKnownStatus(normalizeStatus(status))) return 'page2-point-status page2-status-plain'
  if (tone === 'neutral') return 'page2-point-status page2-status-neutral'
  if (tone === 'monitor') return 'page2-point-status page2-status-monitor status-with-icons'
  if (isSafetyStatus(normalizeStatus(status))) return 'page2-point-status page2-status-danger status-long-label'
  return 'page2-point-status page2-status-danger status-with-icons'
}

function renderStatusLabel(status: string) {
  const normalizedStatus = normalizeStatus(status)
  const label = isSafetyStatus(normalizedStatus)
    ? 'Safety'
    : isNaStatus(normalizedStatus)
      ? 'N/A'
      : isKnownStatus(normalizedStatus)
        ? toTitleCase(status)
        : status.trim() || '-'
  if (!isRepairStatus(normalizedStatus) && !isMonitorStatus(normalizedStatus)) return escapeHtml(label)

  const iconClass = isMonitorStatus(normalizedStatus) ? 'status-icon-monitor' : 'status-icon-repair'
  return `
    <span class="status-icon ${iconClass}"></span>
    <span>${escapeHtml(label)}</span>
    <span class="status-camera"></span>
  `
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
  if (!selectedCrane) return getServiceTicketHtml(report)

  const stats = getInspectionStats(selectedCrane)
  const actionItems = getActionItems(selectedCrane)
  const safetyItems = getSafetyItems(selectedCrane)
  const notesAndPhotoItems = getNotesAndPhotoItems(selectedCrane)
  const actionPhotoUrls = new Set(
    [...actionItems, ...safetyItems].flatMap((item) => item.photos.map((photo) => photo.content).filter(Boolean)),
  )
  const photos = getAllPhotos(selectedCrane)
    .filter((photo) => !actionPhotoUrls.has(photo.content))
  const sections = resolveSections(selectedCrane)
  const primaryCrane = selectedCrane.crane
  const overviewDate = selectedCrane.inspections?.find((inspection) => inspection.completedAt)?.completedAt || report.summary?.completedAt

  const renderDetailSections = (detailSections: ResolvedSection[]) =>
    detailSections
      .map((section) => {
        const satisfactoryCount = section.satisfactoryCount ?? section.points.filter((point) => getConditionTone(point) === 'success').length
        const totalPointCount = section.totalPointCount ?? section.points.length
        const longTextLayout = hasLongDetailRows(section)
        return `
          <section class="detail-section">
            <div class="detail-header">${escapeHtml(section.name)} <span>${satisfactoryCount}/${totalPointCount || 0} Satisfactory</span></div>
            <div class="detail-grid ${longTextLayout ? 'detail-grid-long' : ''}">
              ${section.points
                .map(
                  (point) => `
                    <div class="detail-row">
                      <div class="detail-label">${escapeHtml(point.name ?? 'Inspection point')}</div>
                      <div class="${toneClass(point)}">${renderStatusLabel(getPointDisplayValue(point))}</div>
                    </div>
                  `,
                )
                .join('')}
            </div>
          </section>
        `
      })
      .join('')

  const estimateDetailSectionHeight = (section: ResolvedSection) => {
    if (hasLongDetailRows(section)) {
      return 38 + section.points.reduce((total, point) => {
        const labelHeight = Math.ceil(getTextLength(point.name ?? 'Inspection point') / 84) * 14
        return total + Math.max(26, labelHeight + 10)
      }, 0)
    }
    const visualRows = Math.ceil(section.points.length / 3)
    return 44 + visualRows * 24
  }

  const makeDetailSectionChunk = (section: ResolvedSection, points: DeshazoInspectionPoint[]): ResolvedSection => ({
    ...section,
    points,
    satisfactoryCount: section.satisfactoryCount ?? section.points.filter((point) => getConditionTone(point) === 'success').length,
    totalPointCount: section.totalPointCount ?? section.points.length,
  })

  const splitOversizedDetailPoint = (point: DeshazoInspectionPoint, maxLength = 900) => {
    const name = point.name ?? 'Inspection point'
    const parts = splitTextIntoBlocks(name, maxLength)
    if (parts.length <= 1) return [point]
    return parts.map((part, index) => ({
      ...point,
      name: index === 0 ? part : `${part}`,
    }))
  }

  const splitDetailSectionIntoPageBlocks = (section: ResolvedSection, usableHeight: number) => {
    const blocks: Array<{ html: string; estimatedHeight: number }> = []
    const points = section.points.flatMap((point) => splitOversizedDetailPoint(point))
    let currentPoints: DeshazoInspectionPoint[] = []

    points.forEach((point) => {
      const candidate = makeDetailSectionChunk(section, [...currentPoints, point])
      const candidateHeight = estimateDetailSectionHeight(candidate) + 22
      if (currentPoints.length > 0 && candidateHeight > usableHeight) {
        const chunk = makeDetailSectionChunk(section, currentPoints)
        blocks.push({
          html: `<div class="page2-continuation">${renderDetailSections([chunk])}</div>`,
          estimatedHeight: estimateDetailSectionHeight(chunk) + 22,
        })
        currentPoints = [point]
        return
      }

      currentPoints.push(point)
    })

    if (currentPoints.length > 0) {
      const chunk = makeDetailSectionChunk(section, currentPoints)
      blocks.push({
        html: `<div class="page2-continuation">${renderDetailSections([chunk])}</div>`,
        estimatedHeight: estimateDetailSectionHeight(chunk) + 22,
      })
    }

    return blocks
  }

  const packPageBlocks = (blocks: Array<{ html: string; estimatedHeight: number }>) => {
    const packedPages: string[] = []
    let currentPageBlocks: string[] = []
    let currentHeight = 0
    const usableHeight = 690

    blocks.forEach((block) => {
      const shouldStartNextPage =
        currentPageBlocks.length > 0 && currentHeight + block.estimatedHeight > usableHeight

      if (shouldStartNextPage) {
        packedPages.push(currentPageBlocks.join(''))
        currentPageBlocks = []
        currentHeight = 0
      }

      currentPageBlocks.push(block.html)
      currentHeight += block.estimatedHeight
    })

    if (currentPageBlocks.length > 0) packedPages.push(currentPageBlocks.join(''))
    return packedPages
  }

  const estimateSectionedItemHeight = (item: SectionedItem, includePhotos = false) => {
    let height = hasLongCategoryText(item.label) ? Math.max(42, Math.ceil(getTextLength(item.label) / 82) * 15 + 20) : 34
    if (includePhotos && item.photos.length > 0) height += Math.ceil(item.photos.length / 3) * 145 + 12
    if (item.notes) height += Math.max(22, Math.ceil(item.notes.length / 82) * 15)
    return height
  }

  const makeTitleBlock = (titleHtml: string, estimatedHeight = 38) => ({
    html: titleHtml,
    estimatedHeight,
  })

  const makeSectionedItemChunks = (item: SectionedItem, includePhotos: boolean) => {
    const chunks: SectionedItem[] = []
    const labelParts = splitTextIntoBlocks(item.label, 1850)
    const noteParts = item.notes ? splitTextIntoBlocks(item.notes, 2100) : ['']
    const firstNote = noteParts[0] ?? ''
    const canAttachFirstNote =
      labelParts.length === 1 &&
      Boolean(firstNote) &&
      18 + estimateSectionedItemHeight({ ...item, label: labelParts[0] ?? item.label, notes: firstNote, photos: [] }, false) <= 620

    labelParts.forEach((label, index) => {
      chunks.push({
        ...item,
        label,
        notes: canAttachFirstNote && index === 0 ? firstNote : '',
        photos: [],
      })
    })

    noteParts.slice(canAttachFirstNote ? 1 : 0).forEach((notes) => {
      if (!notes) return
      chunks.push({
        ...item,
        label: `${item.label} (continued)`,
        notes,
        photos: [],
      })
    })

    if (includePhotos && item.photos.length > 0) {
      for (let index = 0; index < item.photos.length; index += 3) {
        const photoLabel = labelParts.length > 1
          ? `${labelParts[labelParts.length - 1]} (continued)`
          : `${item.label}${chunks.length ? ' (continued)' : ''}`
        chunks.push({
          ...item,
          label: photoLabel,
          notes: '',
          photos: item.photos.slice(index, index + 3),
        })
      }
    }

    return chunks.length > 0 ? chunks : [{ ...item, photos: includePhotos ? item.photos : [] }]
  }

  const chunkSectionedGroupBlocks = (
    group: { sectionName: string; items: SectionedItem[] },
    itemLabel: string,
    includePhotos = false,
    options: { forceLongLayout?: boolean } = {},
  ) => {
    const blocks: Array<{ html: string; estimatedHeight: number }> = []
    blocks.push({
      html: `
        <section class="page2-item-section page2-item-section-header">
          <div class="page2-section-title">
            <span>${escapeHtml(group.sectionName)}</span>
            <span class="page2-section-count">${group.items.length} ${escapeHtml(itemLabel)}${group.items.length === 1 ? '' : 's'}</span>
          </div>
        </section>
      `,
      estimatedHeight: 24,
    })

    group.items.forEach((item) => {
      makeSectionedItemChunks(item, includePhotos).forEach((itemChunk) => {
        blocks.push({
          html: renderSectionedItemGroup(
            { sectionName: group.sectionName, items: [itemChunk] },
            itemLabel,
            includePhotos,
            { showHeader: false, totalCount: group.items.length, forceLongLayout: options.forceLongLayout },
          ),
          estimatedHeight: 18 + estimateSectionedItemHeight(itemChunk, includePhotos),
        })
      })
    })

    return blocks
  }

  const chunkPhotoBlocks = (reportPhotos: Array<DeshazoInspectionPhoto & { caption: string }>) => {
    const blocks: Array<{ html: string; estimatedHeight: number }> = []
    const chunkSize = 9
    for (let index = 0; index < reportPhotos.length; index += chunkSize) {
      const chunk = reportPhotos.slice(index, index + chunkSize)
      blocks.push({
        html: `
          <section class="photos-section">
            <div class="photo-grid">
              ${chunk
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
        `,
        estimatedHeight: 32 + Math.ceil(chunk.length / 3) * 184,
      })
    }
    return blocks
  }

  const usesLongFirstPageActionLayout = hasLongActionItems(actionItems)
  const firstPageActionRows = usesLongFirstPageActionLayout ? actionItems.length : Math.ceil(actionItems.length / 3)
  const firstPageActionPanelHeight = actionItems.length > 0 ? 32 + firstPageActionRows * (usesLongFirstPageActionLayout ? 45 : 36) : 0
  const firstPageFixedContentHeight = 345 + firstPageActionPanelHeight
  const firstPageAvailableSectionHeight = Math.max(0, 870 - firstPageFixedContentHeight)
  const firstPageSections: ResolvedSection[] = []
  const continuationSections: ResolvedSection[] = []
  let firstPageSectionsHeight = 0
  let canPlaceMoreFirstPageSections = true

  sections.forEach((section) => {
    if (!canPlaceMoreFirstPageSections) {
      continuationSections.push(section)
      return
    }

    const sectionPoints = section.points.flatMap((point) => splitOversizedDetailPoint(point))
    const fullSection = makeDetailSectionChunk(section, sectionPoints)
    const sectionHeight = estimateDetailSectionHeight(fullSection) + 18

    if (firstPageSectionsHeight + sectionHeight <= firstPageAvailableSectionHeight) {
      firstPageSections.push(fullSection)
      firstPageSectionsHeight += sectionHeight
      return
    }

    const availableHeight = firstPageAvailableSectionHeight - firstPageSectionsHeight
    let fittingPointCount = 0

    for (let index = 0; index < sectionPoints.length; index += 1) {
      const candidate = makeDetailSectionChunk(section, sectionPoints.slice(0, index + 1))
      const candidateHeight = estimateDetailSectionHeight(candidate) + 18
      if (candidateHeight > availableHeight) break
      fittingPointCount = index + 1
    }

    if (fittingPointCount > 0) {
      firstPageSections.push(makeDetailSectionChunk(section, sectionPoints.slice(0, fittingPointCount)))
      continuationSections.push(makeDetailSectionChunk(section, sectionPoints.slice(fittingPointCount)))
      canPlaceMoreFirstPageSections = false
      return
    }

    continuationSections.push(fullSection)
    canPlaceMoreFirstPageSections = false
  })
  const firstPageSectionsMarkup = renderDetailSections(firstPageSections)
  const continuationBlocks = continuationSections.flatMap((section) =>
    splitDetailSectionIntoPageBlocks(section, 690),
  )
  const defaultBridgePointNames = [
    'Motors',
    'Bridge Brakes',
    'Control Panels',
    'Wheels',
    'Disconnect Switch/Power Supply',
    'Conductors/Festoon System',
    'Gear Box',
    'Fluid Levels/Gaskets/Seals',
    'Travel Limits/Stops',
    'Rated Load Marking',
    'Alignment & Tracking',
    'Runway Beams/Rail',
    'Bridge Girders',
    'End Trucks',
  ]
  const defaultHoistPointNames = [
    'Motors',
    'Brakes',
    'Control Panel',
    'Mechanical Brake',
    'Limit Switches/Stops',
    'Gear Box',
    'Fluid Levels/Gaskets/Seals',
    'Upper Sheaves',
    'Rope Drum',
    'Lower Block',
    'Rope/Chain',
    'Rope/Chain Guides',
    'Hook',
    'Couplings',
    'Wheels/Pinions',
    'Push Button Station/Radio',
    'Festoons',
    'Hoist Brake Operation',
    'Clearances',
  ]
  const zeroCountSections: ResolvedSection[] = sections.some((section) => section.points.length > 0)
    ? sections
    : [
        {
          name: getStructureSectionName(selectedCrane),
          points: defaultBridgePointNames.map((name) => ({ name })),
        },
        ...Array.from(
          { length: Math.max(1, selectedCrane.crane?.hoists?.length ?? 1) },
          (_, hoistIndex) => ({
            name: `Hoist ${hoistIndex + 1}`,
            points: defaultHoistPointNames.map((name) => ({ name })),
          }),
        ),
      ]
  const hasZeroInspectionCounts =
    stats.repairCount === 0 &&
    stats.satisfactoryPointCount === 0 &&
    stats.safetyMonitorCount === 0 &&
    stats.naPointCount === 0 &&
    sections.length === 0

  const renderZeroCountSection = (section: ResolvedSection) => `
    <section class="zero-section">
      <div class="zero-section-title">${escapeHtml(section.name)}</div>
      <div class="zero-grid">
        ${section.points
          .map(
            (point) => `
              <div class="zero-point">
                <span>${escapeHtml(point.name ?? 'Inspection point')}</span>
                <span>-</span>
              </div>
            `,
          )
          .join('')}
      </div>
    </section>
  `

  if (hasZeroInspectionCounts) {
    return `
      <div class="pdf-page">
        <div class="hero zero-hero">
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

        <div class="body body-zero">
          <div class="zero-top">
            <div><strong>${escapeHtml(getReportIdentifier(report, selectedCrane))}</strong> performed by: <strong>${escapeHtml(getLeadTechnician(report, selectedCrane))}</strong></div>
            <div>Type: <strong>${escapeHtml(toTitleCase(selectedCrane.inspections?.[0]?.type || report.jobType || 'Inspection'))}</strong></div>
            <div>Date: <strong>${escapeHtml(formatDate(selectedCrane.inspections?.[0]?.date || report.summary?.endDate || report.rawPayload.inspectionDate))}</strong></div>
          </div>

          <div class="zero-info-grid">
            <div><span>Structure:</span> <strong>${escapeHtml(primaryCrane?.structure?.type || primaryCrane?.description || 'Not available')}</strong></div>
            <div><span>Description:</span> <strong>${escapeHtml(primaryCrane?.description || 'Not available')}</strong></div>
            <div><span>Customer:</span> <strong>${escapeHtml(getReportCustomerName(report))}</strong></div>
            <div><span>Purchase Order:</span> <strong>${escapeHtml(report.summary?.customerPoNo || 'UNAVAILABLE')}</strong></div>
            <div><span>Job #:</span> <strong>${escapeHtml(report.summary?.jobNo || report.summary?.salesOrderNo || report.jobNo || String(report.workOrderId))}</strong></div>
            <div><span>Location:</span> <strong>${escapeHtml(primaryCrane?.location || report.summary?.customerLocationName || 'N/A')}</strong></div>
            <div><span>Customer Address:</span> <strong>${escapeHtml(report.summary?.customerLocationAddress || report.summary?.customerAddress || 'N/A')}</strong></div>
            <div><span>Manufacturer:</span> ${buildEquipmentLines(selectedCrane, (crane) => crane.crane?.structure?.manufacturer || 'Unknown', (hoist) => hoist.manufacturer || 'Unknown').map((line) => `<strong>${escapeHtml(line)}</strong>`).join('<br />')}</div>
            <div><span>Serial Number:</span> ${buildEquipmentLines(selectedCrane, (crane) => crane.crane?.structure?.serialNumber || 'Unknown', (hoist) => hoist.serialNumber || 'Unknown').map((line) => `<strong>${escapeHtml(line)}</strong>`).join('<br />')}</div>
            <div><span>Capacity:</span> ${buildEquipmentLines(selectedCrane, (crane) => crane.crane?.structure?.capacity || 'Unknown', (hoist) => hoist.capacity || 'Unknown').map((line) => `<strong>${escapeHtml(line)}</strong>`).join('<br />')}</div>
            <div><span>Model #:</span> ${buildEquipmentLines(selectedCrane, (crane) => crane.crane?.structure?.model || 'Unknown', (hoist) => hoist.model || 'Unknown').map((line) => `<strong>${escapeHtml(line)}</strong>`).join('<br />')}</div>
          </div>

          <div class="stats-grid zero-stats">
            <div class="stat-card"><div class="stat-value danger-text">0</div><div class="stat-label danger-text">Repair</div></div>
            <div class="stat-card"><div class="stat-value">0</div><div class="stat-label">Satisfactory Items</div></div>
            <div class="stat-card"><div class="stat-value">0</div><div class="stat-label">Safety and Monitor Items</div></div>
            <div class="stat-card"><div class="stat-value">0</div><div class="stat-label">N/A Items</div></div>
          </div>

          <div class="zero-sections">
            ${zeroCountSections.map(renderZeroCountSection).join('')}
          </div>

          <div class="footer">Page 1/1</div>
        </div>
      </div>
    `
  }

  const firstPageActions = actionItems
    .map(
      (item) => `
        <div class="mini-action-row">
          <div class="mini-action-label">${escapeHtml(item.sectionName)}:<br />${escapeHtml(item.label)}</div>
          <div class="mini-action-status"><span class="action-pill status-with-icons">${renderStatusLabel(item.status)}</span></div>
        </div>
      `,
    )
    .join('')

  const firstPageActionPanel = actionItems.length
    ? `
      <div class="panel panel-danger">
        <div class="panel-title">Action Items ${actionItems.length}</div>
        <div class="panel-body panel-body-actions"><div class="mini-action-grid ${usesLongFirstPageActionLayout ? 'mini-action-grid-long' : ''}">${firstPageActions}</div></div>
      </div>
    `
    : ''

  const followUpBlocks: Array<{ html: string; estimatedHeight: number }> = []

  if (actionItems.length > 0) {
    const actionBlocks = groupItemsBySection(actionItems).flatMap((group) =>
      chunkSectionedGroupBlocks(group, 'Repair item', true),
    )
    followUpBlocks.push(makeTitleBlock('<div class="page2-title page2-title-repair">ACTION LIST - REPAIR ITEMS</div>'), ...actionBlocks)
  }

  if (safetyItems.length > 0) {
    const safetyBlocks = groupItemsBySection(safetyItems).flatMap((group) =>
      chunkSectionedGroupBlocks(group, 'Safety item', true, { forceLongLayout: true }),
    )
    followUpBlocks.push(makeTitleBlock(`<div class="page2-title page2-title-safety ${actionItems.length ? 'page2-title-after-list' : ''}">SAFETY ITEMS</div>`), ...safetyBlocks)
  }

  if (notesAndPhotoItems.length > 0) {
    const notesBlocks = groupItemsBySection(notesAndPhotoItems).flatMap((group) =>
      chunkSectionedGroupBlocks(group, 'item'),
    )
    followUpBlocks.push(makeTitleBlock(`<div class="page2-title ${actionItems.length || safetyItems.length ? 'page2-title-notes' : ''}">NOTES AND PHOTOS</div>`), ...notesBlocks)
  }

  if (photos.length > 0) {
    followUpBlocks.push(
      makeTitleBlock(`<div class="page2-title ${actionItems.length || safetyItems.length || notesAndPhotoItems.length ? 'page2-title-pictures' : 'page2-title-pictures-only'}">ADDITIONAL DETAILS - PICTURES</div>`),
      ...chunkPhotoBlocks(photos),
    )
  }

  const remainingPageContents = packPageBlocks([...continuationBlocks, ...followUpBlocks])
  const totalPages = 1 + remainingPageContents.length

  const renderContinuationPage = (content: string, pageNumber: number) => `
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
            <div><span>Customer Name:</span> ${escapeHtml(getReportCustomerName(report))}</div>
          </div>
        </div>
        <div class="page2-content">
          ${content}
        </div>
        <div class="footer footer-page2">Page ${pageNumber}/${totalPages}</div>
      </div>
    </div>
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
          <div class="summary-cell"><div class="summary-label">Customer</div><div class="summary-value">${escapeHtml(getReportCustomerName(report))}</div></div>
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
        <div class="footer">Page 1/${totalPages}</div>
      </div>
    </div>

    ${remainingPageContents.map((content, index) => renderContinuationPage(content, index + 2)).join('')}
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
    .hero { display: grid; grid-template-columns: 1.25fr 1fr .9fr; gap: 14px; height: 82px; padding: 14px 24px 10px; background: #f6b23b; color: #000; }
    .zero-hero { height: 86px; align-items: start; }
    .brand { font-size: 38px; font-weight: 900; letter-spacing: -1.5px; line-height: .9; }
    .brand-sub { margin-top: 4px; font-size: 9.5px; font-weight: 900; text-transform: uppercase; }
    .hero-meta { padding-top: 2px; font-size: 12px; font-weight: 400; line-height: 1.45; }
    .hero-title { display: flex; justify-content: flex-end; align-items: center; font-size: 28px; line-height: 1.05; font-weight: 900; text-transform: uppercase; }
    .body { box-sizing: border-box; padding: 14px 24px 36px; }
    .body-zero { padding: 18px 24px 16px; }
    .zero-top { display: grid; grid-template-columns: 1.5fr .7fr .7fr; gap: 0; border-bottom: 1px solid #bdbdbd; font-size: 12px; }
    .zero-top > div { min-height: 42px; padding: 12px 8px 8px 6px; border-right: 1px solid #bdbdbd; box-sizing: border-box; }
    .zero-top > div:last-child { border-right: 0; }
    .zero-info-grid { display: grid; grid-template-columns: repeat(4, 1fr); border-bottom: 1px solid #bdbdbd; font-size: 11px; }
    .zero-info-grid > div { min-height: 31px; padding: 6px 8px 4px 6px; border-right: 1px solid #bdbdbd; box-sizing: border-box; line-height: 1.18; }
    .zero-info-grid > div:nth-child(4n) { border-right: 0; }
    .zero-info-grid span { font-weight: 400; }
    .zero-stats { margin: 0; border: 0; }
    .zero-stats .stat-card { min-height: 66px; padding-top: 8px; background: #f0f0f0; }
    .zero-stats .stat-value { font-size: 34px; }
    .zero-sections { margin-top: 15px; }
    .zero-section { margin-top: 14px; padding-bottom: 13px; border-bottom: 3px solid #e0e0e0; }
    .zero-section-title { margin: 0 0 9px 5px; font-size: 12px; font-weight: 800; line-height: 1.1; }
    .zero-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px 10px; }
    .zero-point { display: grid; grid-template-columns: minmax(0, 1fr) 14px; gap: 5px; align-items: baseline; min-height: 14px; font-size: 11px; line-height: 1.12; }
    .zero-point span:first-child { min-width: 0; }
    .zero-point span:last-child { text-align: right; }
    .body-full { height: ${DESHAZO_PDF_PAGE_HEIGHT_PX - 2}px; }
    .body-page2 { position: relative; padding: 25px 24px 58px; }
    .summary-top { display: grid; grid-template-columns: 1.7fr 1fr 1fr; gap: 12px; padding-bottom: 9px; border-bottom: 1px solid #cfcfcf; font-size: 12px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid #d8d8d8; border-left: 1px solid #d8d8d8; }
    .summary-cell { min-height: 46px; padding: 5px 7px; border-right: 1px solid #d8d8d8; border-bottom: 1px solid #d8d8d8; font-size: 11px; }
    .summary-label { font-size: 10.5px; font-weight: 700; text-transform: none; color: #111; }
    .summary-value { margin-top: 3px; font-weight: 600; line-height: 1.22; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); background: #f3f3f3; border-left: 1px solid #d8d8d8; border-right: 1px solid #d8d8d8; border-bottom: 1px solid #d8d8d8; }
    .stat-card { padding: 6px 8px 8px; text-align: center; border-right: 1px solid #d8d8d8; }
    .stat-card:last-child { border-right: 0; }
    .stat-value { font-size: 38px; font-weight: 900; line-height: .95; }
    .stat-label { margin-top: 4px; font-size: 12px; font-weight: 700; }
    .danger-text { color: #b81717; }
    .panel { margin-top: 8px; border: 1px solid #d8d8d8; }
    .panel.panel-danger { background: #fff2f2; border-color: #efcccc; }
    .panel-title { padding: 6px 10px; font-size: 12px; font-weight: 700; border-bottom: 1px solid #d8d8d8; }
    .panel.panel-danger .panel-title { color: #7e0e0e; border-color: #efcccc; }
    .panel-body { padding: 8px 10px; }
    .panel-body-actions { padding: 0; }
    .mini-action-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .mini-action-row { display: grid; grid-template-columns: minmax(0, 1fr) 84px; gap: 6px; align-items: center; min-height: 34px; padding: 5px 8px; border-right: 1px solid #efcccc; border-bottom: 1px solid #efcccc; font-size: 9.5px; }
    .mini-action-row:nth-child(3n) { border-right: 0; }
    .mini-action-row:nth-last-child(-n+3) { border-bottom: 0; }
    .mini-action-label { min-width: 0; line-height: 1.08; }
    .mini-action-status { display: flex; align-items: center; justify-content: flex-end; }
    .mini-action-grid-long { display: block; }
    .mini-action-grid-long .mini-action-row { grid-template-columns: minmax(0, 1fr) 118px; min-height: 45px; padding: 8px 10px; border-right: 0; font-size: 11.5px; }
    .mini-action-grid-long .mini-action-row:last-child { border-bottom: 0; }
    .mini-action-grid-long .mini-action-label { line-height: 1.12; }
    .mini-action-grid-long .mini-action-status { justify-content: flex-end; }
    .mini-action-grid-long .action-pill { width: 102px; min-height: 19px; font-size: 10px; }
    .action-pill { display: inline-grid; grid-auto-flow: column; align-items: center; justify-content: center; box-sizing: border-box; width: 82px; min-height: 18px; padding: 2px 5px; background: #f7d4d4; color: #8d1111; font-size: 9.5px; font-weight: 700; line-height: 1; text-align: center; vertical-align: middle; overflow: visible; }
    .overview-grid { display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 12px; font-size: 12px; }
    .detail-section { padding-top: 11px; margin-top: 11px; border-top: 1px solid #dadada; break-inside: avoid; }
    .detail-header { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; margin-bottom: 6px; font-size: 12px; font-weight: 700; }
    .detail-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px 14px; }
    .detail-row { display: grid; grid-template-columns: minmax(0, 1fr) 92px; align-items: center; gap: 7px; min-height: 21px; font-size: 12px; }
    .detail-label { min-width: 0; line-height: 1.18; }
    .detail-grid-long { display: block; }
    .detail-grid-long .detail-row { grid-template-columns: minmax(0, 1fr) 118px; min-height: 35px; gap: 14px; padding: 7px 10px; border-bottom: 1px solid #dadada; font-size: 11.5px; }
    .detail-grid-long .detail-row:last-child { border-bottom: 0; }
    .detail-grid-long .detail-label { line-height: 1.14; }
    .detail-grid-long .status { width: 112px; min-height: 21px; }
    .status { display: inline-grid; align-items: center; justify-content: center; box-sizing: border-box; width: 92px; min-height: 22px; padding: 3px 6px 2px; text-align: center; font-size: 11px; font-weight: 700; line-height: 1; white-space: nowrap; overflow: visible; }
    .status-long-label { min-height: 28px; padding: 4px 6px; line-height: 1.08; white-space: normal; overflow-wrap: anywhere; }
    .status-with-icons { justify-content: space-between; gap: 4px; }
    .status-with-icons { grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; }
    .status-with-icons > span:nth-child(2) { min-width: 0; text-align: center; align-self: center; }
    .status-icon { position: relative; display: inline-block; flex: 0 0 auto; width: 11px; height: 11px; }
    .status-icon-repair { background: currentColor; clip-path: polygon(50% 0, 90% 15%, 86% 62%, 50% 100%, 14% 62%, 10% 15%); }
    .status-icon-repair::after { content: "i"; position: absolute; inset: 0; color: #fff; font-family: Georgia, serif; font-size: 8px; font-weight: 900; font-style: italic; line-height: 11px; text-align: center; }
    .status-icon-monitor { width: 12px; height: 12px; }
    .status-icon-monitor::before { content: ""; position: absolute; left: 2px; top: 0; width: 8px; height: 11px; background: currentColor; clip-path: polygon(50% 0, 100% 100%, 0 100%); }
    .status-icon-monitor::after { content: ""; position: absolute; left: 3px; top: 5px; width: 6px; height: 1px; background: #fbf4bf; box-shadow: 0 3px 0 #fbf4bf; }
    .status-camera { position: relative; display: inline-block; flex: 0 0 auto; width: 11px; height: 8px; border-radius: 2px; background: currentColor; }
    .status-camera::before { content: ""; position: absolute; left: 2px; top: -2px; width: 4px; height: 2px; border-radius: 1px 1px 0 0; background: currentColor; }
    .status-camera::after { content: ""; position: absolute; left: 4px; top: 2px; width: 3px; height: 3px; border-radius: 50%; background: #fff; opacity: .9; }
    .status-success { background: #bff2be; color: #1f6a2e; }
    .status-neutral { background: #d9d9d9; color: #4d4d4d; }
    .status-danger { background: #f7c7c7; color: #a61616; }
    .status-monitor { background: #fbf4bf; color: #8b7a00; }
    .status-plain { justify-self: end; width: auto; min-width: 16px; background: transparent; color: #171821; font-weight: 700; }
    .page2-header { display: grid; grid-template-columns: 250px 1fr; align-items: start; gap: 24px; padding: 0 0 9px; border-bottom: 3px solid #f0aa2e; }
    .page2-brand { font-size: 30px; font-weight: 900; letter-spacing: -1px; line-height: .9; color: #050505; }
    .page2-brand span { color: #f0aa2e; }
    .page2-brand-sub { margin-top: 5px; font-size: 9.8px; font-weight: 900; line-height: 1; text-transform: uppercase; }
    .page2-meta { display: grid; grid-template-columns: 1fr 96px; gap: 6px 32px; justify-self: end; width: 366px; font-size: 12px; line-height: 1.32; }
    .page2-meta span { font-weight: 700; }
    .page2-content { margin-top: 22px; padding-bottom: 34px; }
    .page2-continuation { margin-bottom: 18px; }
    .page2-continuation .detail-section:first-child { margin-top: 0; }
    .page2-title { margin-left: 5px; padding-bottom: 11px; border-bottom: 1px solid #b81717; font-size: 15px; font-weight: 700; line-height: 1.05; text-transform: uppercase; color: #171821; }
    .page2-title-repair { color: #b81717; }
    .page2-title-safety { color: #b81717; }
    .page2-title-after-list { margin-top: 22px; }
    .page2-title-notes { margin-top: 22px; }
    .page2-title-pictures { margin-top: 22px; border-bottom-color: #d8d8d8; color: #171821; }
    .page2-title-pictures-only { margin-top: 20px; }
    .page2-item-section { margin: 12px 0 0 13px; }
    .page2-section-title { display: flex; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 700; line-height: 1.1; }
    .page2-section-count { color: #b81717; font-size: 10px; font-weight: 700; }
    .page2-points-box { margin-top: 8px; min-height: 66px; border: 1px solid #d8d8d8; padding: 8px 11px; }
    .page2-point { margin: 0; font-size: 12px; }
    .page2-point + .page2-point { margin-top: 12px; padding-top: 10px; border-top: 1px solid #e2e2e2; }
    .page2-point-name { font-size: 12px; font-weight: 700; line-height: 1.15; }
    .page2-point-status { display: inline-grid; align-items: center; justify-content: center; box-sizing: border-box; min-width: 104px; min-height: 22px; margin: 7px 0 0 18px; padding: 3px 8px 2px; font-size: 10px; font-weight: 700; line-height: 1; text-align: center; vertical-align: middle; white-space: nowrap; overflow: visible; }
    .page2-point-status.status-long-label { min-height: 30px; padding: 4px 7px; line-height: 1.08; white-space: normal; overflow-wrap: anywhere; }
    .page2-points-box-long { padding: 0; }
    .page2-points-box-long .page2-point { display: grid; grid-template-columns: minmax(0, 1fr) 116px; gap: 14px; align-items: start; padding: 9px 11px; break-inside: avoid; page-break-inside: avoid; }
    .page2-points-box-long .page2-point + .page2-point { margin-top: 0; padding-top: 9px; }
    .page2-points-box-long .page2-point-status { margin: 0; justify-self: end; }
    .page2-points-box-long .page2-action-photos,
    .page2-points-box-long .page2-note { grid-column: 1 / -1; }
    .page2-status-success { background: #bff2be; color: #1f6a2e; }
    .page2-status-neutral { background: #d9d9d9; color: #4d4d4d; }
    .page2-status-danger { background: #e8c7c9; color: #9d1c1c; }
    .page2-status-monitor { background: #fbf4bf; color: #8b7a00; }
    .page2-status-plain { min-width: 16px; margin-left: 0; background: transparent; color: #171821; font-weight: 700; }
    .page2-action-photos { display: grid; grid-template-columns: repeat(3, 164px); gap: 8px 10px; margin: 9px 0 0 18px; }
    .page2-action-photo { position: relative; width: 164px; height: 132px; margin: 0; background: #ecdcdc; overflow: hidden; }
    .page2-action-photo img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .page2-action-photo figcaption { position: absolute; top: 5px; right: 5px; padding: 2px 5px; border-radius: 2px; background: rgba(255,255,255,0.9); font-size: 9px; font-weight: 800; color: #8d1111; line-height: 1; }
    .page2-note { margin-top: 7px; font-size: 10px; line-height: 1.35; }
    .page2-note span { font-weight: 700; }
    .page2-dot { position: absolute; left: 18px; top: 470px; font-size: 10px; line-height: 1; }
    .body-service { position: relative; box-sizing: border-box; height: ${DESHAZO_PDF_PAGE_HEIGHT_PX - 2}px; padding: 0 18px 58px; font-size: 12px; color: #000; }
    .body-service-continuation { padding-top: 25px; }
    .service-header { display: grid; align-items: start; color: #000; }
    .service-header-hero { grid-template-columns: 1.15fr .9fr .8fr; gap: 20px; margin: 0 -18px 14px; padding: 16px 25px 20px; background: #f9b636; }
    .service-header-compact { grid-template-columns: 1fr 1.55fr; gap: 22px; padding: 0 6px 10px; border-bottom: 3px solid #f9b636; }
    .service-brand { font-size: 34px; font-weight: 900; letter-spacing: -1.1px; line-height: .86; }
    .service-brand span { color: #f9b636; }
    .service-header-hero .service-brand span { color: #000; background: #f9b636; }
    .service-brand-sub { margin-top: 8px; font-size: 10px; font-weight: 900; line-height: 1; text-transform: uppercase; }
    .service-branch { padding-top: 5px; font-size: 14px; line-height: 1.75; }
    .service-report-title { justify-self: end; padding-top: 16px; font-size: 20px; font-weight: 900; text-transform: uppercase; }
    .service-compact-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 24px; justify-self: end; width: 360px; padding-top: 5px; font-size: 12px; line-height: 1.25; }
    .service-box { margin: 10px 0 0; border: 1px solid #f9b636; }
    .service-box-title { display: flex; align-items: flex-start; box-sizing: border-box; min-height: 24px; padding: 5px 6px 3px; background: #f9b636; font-size: 11px; font-weight: 900; line-height: 1; text-transform: uppercase; overflow: hidden; }
    .service-box-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 18px 42px; padding: 12px 20px; font-size: 11px; line-height: 1.25; }
    .service-box-body { padding: 11px 20px; font-size: 11px; line-height: 1.2; }
    .service-box-requested { margin-top: 10px; }
    .service-date-bar { display: flex; align-items: flex-start; justify-content: space-between; box-sizing: border-box; min-height: 24px; margin-top: 20px; padding: 5px 6px 3px; background: #f9b636; font-size: 11px; font-weight: 900; line-height: 1; overflow: hidden; }
    .service-jsa-body { padding: 10px 24px 13px; background: #f0f0f0; }
    .service-jsa-title { text-align: center; font-size: 13px; font-weight: 900; }
    .service-jsa-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 42px; margin-top: 7px; }
    .service-jsa-subtitle { margin-bottom: 8px; text-align: center; font-size: 11px; font-weight: 900; }
    .service-check-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
    .service-check-row { display: grid; grid-template-columns: 18px 1fr; align-items: center; min-height: 15px; font-size: 10.5px; line-height: 1; }
    .service-check, .service-check-space { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 3px; font-size: 11px; font-weight: 900; }
    .service-check { background: #b9f7bf; color: #08751c; }
    .service-jsa-question { display: grid; grid-template-columns: minmax(0, 1fr) 112px 120px; gap: 12px; margin-top: 11px; font-size: 10.5px; line-height: 1.18; }
    .service-jsa-question strong { grid-column: 1 / -1; font-size: 11px; }
    .service-jsa-question em { font-style: normal; }
    .service-jsa-line { display: block; margin-top: 12px; }
    .service-work { margin-top: 16px; }
    .service-work-title { padding: 5px 8px; background: #f0f0f0; font-size: 12px; font-weight: 900; text-align: center; text-transform: uppercase; }
    .service-work-body { padding: 12px 16px 0; }
    .service-work-heading { margin-bottom: 12px; font-size: 11px; font-weight: 900; }
    .service-work-note { display: grid; grid-template-columns: minmax(0, 1fr) 130px; gap: 18px; margin-bottom: 10px; font-size: 11px; line-height: 1.18; }
    .service-work-note strong { align-self: end; font-size: 10.5px; font-weight: 500; text-align: right; }
    .service-divider { margin: 10px 0 10px; border-top: 1px solid #cfcfcf; }
    .service-ticket-section { margin-top: 20px; break-inside: avoid; }
    .service-materials { margin-top: 20px; padding: 0 8px 8px; border-bottom: 1px solid #cfcfcf; }
    .service-section-heading { margin: 0 0 12px 8px; font-size: 11px; font-weight: 900; }
    .service-note { margin: 0 0 8px; font-size: 11px; line-height: 1.35; color: #000; }
    .service-note.muted { color: #333; }
    .service-list { margin: 0; padding-left: 18px; font-size: 11px; line-height: 1.35; }
    .service-list li + li { margin-top: 5px; }
    .service-photo-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 20px; }
    .service-photo { position: relative; display: flex; align-items: center; justify-content: center; height: 188px; margin: 0; border: 1px solid #c9c9c9; background: #fff; overflow: hidden; }
    .service-photo img { display: block; max-width: 100%; max-height: 178px; object-fit: contain; }
    .service-photo figcaption { position: absolute; right: 16px; bottom: 14px; padding: 6px 8px; border-radius: 4px; background: #f9b636; color: #fff; font-size: 10px; }
    .service-time-table { position: absolute; left: 18px; right: 18px; bottom: 74px; width: calc(100% - 36px); border-collapse: collapse; font-size: 10.5px; text-align: center; }
    .service-time-table th { background: #cfcfcf; font-weight: 500; }
    .service-time-table th, .service-time-table td { height: 17px; border: 1px solid #fff; padding: 0 4px; }
    .service-time-total td { background: #cfcfcf; }
    .service-time-total td:nth-child(3) { background: #f9b636; }
    .service-unsigned { margin: 28px 0 0 28px; color: #e2173f; font-size: 12px; font-weight: 900; text-transform: uppercase; }
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
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img'))
  await Promise.all(
    images.map(async (image) => {
      const src = image.currentSrc || image.src
      if (!src || src.startsWith('data:') || src.startsWith('blob:')) return

      try {
        const response = await fetch(src, { mode: 'cors', credentials: 'omit' })
        if (!response.ok) return

        const blob = await response.blob()
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
        })

        image.crossOrigin = 'anonymous'
        image.referrerPolicy = 'no-referrer'
        image.src = dataUrl
      } catch {
        // Keep the original URL if the host does not allow CORS; html2canvas can still try useCORS below.
      }
    }),
  )

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
  const jobNo = report.summary?.jobNo || report.summary?.salesOrderNo || report.jobNo || String(report.workOrderId)
  const customer = getReportCustomerName(report)
  const type = toTitleCase(selectedCrane?.inspections?.[0]?.type || report.jobType || 'Inspection')
  const date = formatFileDatePart(
    selectedCrane?.inspections?.[0]?.date ||
    selectedCrane?.inspections?.[0]?.completedAt ||
    report.summary?.startDate ||
    report.summary?.endDate ||
    report.summary?.completedAt ||
    report.rawPayload.inspectionDate ||
    report.syncedAt,
  )

  return [
    'job',
    safeFilePart(jobNo),
    safeFilePart(customer),
    safeFilePart(type),
    date,
  ].filter(Boolean).join('-') + '.pdf'
}

export async function createDeshazoInspectionPdfBlob(
  report: DeshazoSavedInspectionReport,
  selectedCraneIndex = 0,
  options: { canvasScale?: number } = {},
) {
  const root = createRenderRoot(report, selectedCraneIndex)
  const canvasScale = options.canvasScale ?? 3

  try {
    await waitForImages(root)
    const pages = Array.from(root.querySelectorAll<HTMLElement>('.pdf-page'))
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true })

    for (let index = 0; index < pages.length; index += 1) {
      const canvas = await html2canvas(pages[index], {
        backgroundColor: '#ffffff',
        scale: canvasScale,
        useCORS: true,
        allowTaint: false,
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
