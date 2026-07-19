import type { NotebookSource } from './equipmentNotebookApi'

export type GreenFileEntry = {
  id: string
  label: string
  page: number
  partNumber?: string
  details: string
  tags: string[]
}

export type GreenFileManual = {
  id: string
  title: string
  shortTitle: string
  manufacturer: string
  documentNumber: string
  revision: string
  pages: number
  sourceIndex: number
  officialPdfUrl?: string
  officialProductUrl?: string
  sourceLabel?: string
  entries: GreenFileEntry[]
}

export type GreenFileSection = {
  id: string
  title: string
  subtitle: string
  accent: string
  manuals: GreenFileManual[]
}

export const demoCrane = {
  id: 'CR-2407',
  name: 'Bay 4 Production Crane',
  location: 'North Plant · Fabrication Bay 4',
  serialNumber: 'DSZ-24-0187',
  capacity: '10 ton',
  span: '62 ft 6 in',
  serviceClass: 'CMAA Class D',
  installed: 'March 2024',
}

export const greenFileSections: GreenFileSection[] = [
  {
    id: 'mechanical',
    title: 'Mechanical Lifting',
    subtitle: 'Hoist and trolley assemblies',
    accent: '#28766e',
    manuals: [
      {
        id: 'hoist-om',
        title: 'SHB Low Headroom Trolley Hoist Owner’s Manual',
        shortTitle: 'SHB Hoist O&M Manual',
        manufacturer: 'Harrington Hoists',
        documentNumber: 'SHB010–SHB100',
        revision: 'Effective October 24, 2024',
        pages: 48,
        sourceIndex: -101,
        officialPdfUrl: '/green-files/manuals/harrington-shb-owners-manual.pdf',
        officialProductUrl: 'https://cdn.harringtonhoists.com/manual-trolley-hoists/shb',
        sourceLabel: 'Official Harrington owner’s manual',
        entries: [
          { id: 'hoist-specs', label: 'SHB specifications and dimensions', page: 8, details: 'Capacities, product codes, headroom, lift, flange-width adjustment, load chain, and weights.', tags: ['capacity', 'model', 'serial', 'dimensions'] },
          { id: 'trolley-adjustment', label: 'Trolley adjustment and beam installation', page: 11, details: 'Spacer arrangements, suspension shafts, flange clearance, and beam installation.', tags: ['trolley', 'beam', 'flange', 'spacer'] },
          { id: 'trial-operation', label: 'Preoperational checks and trial operation', page: 18, details: 'Required checks before placing the trolley hoist into service.', tags: ['preoperational', 'trial', 'inspection'] },
          { id: 'hoist-operation', label: 'Safe hoist and trolley operation', page: 20, details: 'Operating requirements and prohibited practices for the SHB trolley hoist.', tags: ['operation', 'safety', 'lifting'] },
          { id: 'inspection-criteria', label: 'Frequent and periodic inspection criteria', page: 24, details: 'Inspection classification, records, methods, and discard criteria.', tags: ['inspection', 'frequent', 'periodic', 'hook', 'chain'] },
          { id: 'maintenance-parts', label: 'Maintenance, troubleshooting, and parts list', page: 32, details: 'Lubrication and handling, troubleshooting beginning on page 34, and illustrated parts beginning on page 36.', tags: ['maintenance', 'lubrication', 'troubleshooting', 'parts'] },
        ],
      },
    ],
  },
  {
    id: 'structural',
    title: 'Structural Framework',
    subtitle: 'Bridge, runway, and rail installation',
    accent: '#3b6d96',
    manuals: [
      {
        id: 'bridge-install',
        title: 'Free Standing Steel Work Station Bridge Crane Manual',
        shortTitle: 'Bridge Installation Manual',
        manufacturer: 'Gorbel',
        documentNumber: 'MAN-US076',
        revision: 'Official installation and maintenance manual',
        pages: 32,
        sourceIndex: -103,
        officialPdfUrl: '/green-files/manuals/gorbel-man-us076-bridge-crane.pdf',
        officialProductUrl: 'https://www.gorbel.com/service-support/archived-installation-manuals',
        sourceLabel: 'Official Gorbel installation manual',
        entries: [
          { id: 'foundation', label: 'Foundation and support requirements', page: 5, details: 'Slab, anchor, support-center, and installation requirements for the free-standing system.', tags: ['foundation', 'anchor', 'support', 'slab'] },
          { id: 'runway-assembly', label: 'Runway and header assembly', page: 11, details: 'Runway connections, header installation, leveling, and alignment.', tags: ['runway', 'header', 'alignment', 'bolts'] },
          { id: 'bridge-assembly', label: 'Bridge and end-truck installation', page: 17, details: 'Bridge installation, end trucks, end stops, and rolling-surface checks.', tags: ['bridge', 'end truck', 'end stop', 'alignment'] },
          { id: 'final-inspection', label: 'Final inspection and maintenance', page: 28, details: 'Final system checks, inspection points, and maintenance guidance.', tags: ['inspection', 'maintenance', 'torque'] },
        ],
      },
    ],
  },
  {
    id: 'electrical',
    title: 'Electrical Power',
    subtitle: 'Controls, drives, and electrification',
    accent: '#aa7a20',
    manuals: [
      {
        id: 'vfd',
        title: 'Variable Frequency Drive Programming Manual',
        shortTitle: 'VFD Manual',
        manufacturer: 'Magnetek',
        documentNumber: '144-23910 R8',
        revision: 'November 2022',
        pages: 248,
        sourceIndex: -106,
        officialPdfUrl: '/green-files/manuals/magnetek-impulse-series-4.pdf',
        officialProductUrl: 'https://www.cmco.com/en-ca/products/power-and-motion-technology/ac--dc-motor-control-systems/ac-drives/impulsegvg-series-4--/',
        sourceLabel: 'Official Magnetek technical manual',
        entries: [
          { id: 'wiring', label: 'Power, control, and encoder wiring', page: 28, details: 'Circuit protection, grounding, interface board, control terminals, safe torque off, and encoder wiring.', tags: ['wiring', 'encoder', 'grounding', 'safe torque off'] },
          { id: 'initial-setup', label: 'Keypad, parameters, and initial setup', page: 50, details: 'Checks before power-up, keypad functions, parameter menus, initial setup, and auto-tuning.', tags: ['keypad', 'parameter', 'setup', 'auto-tune'] },
          { id: 'hoist-functions', label: 'Hoist safety and motion functions', page: 78, details: 'End-of-travel, Load Check II, torque limits, anti-shock, limits, and brake timing.', tags: ['hoist', 'load check', 'brake', 'limit'] },
          { id: 'fault-codes', label: 'VFD maintenance and troubleshooting', page: 190, details: 'Drive faults, encoder and brake alarms, power-section checks, and replacement procedures.', tags: ['fault', 'alarm', 'troubleshooting', 'encoder', 'maintenance'] },
        ],
      },
    ],
  },
  {
    id: 'safety',
    title: 'Safe Operation',
    subtitle: 'Operator guidance and inspections',
    accent: '#ad5e43',
    manuals: [
      {
        id: 'operator',
        title: 'Single and Double Girder Bridge Operation, Service and Parts Manual',
        shortTitle: 'Crane Operation Manual',
        manufacturer: 'Yale / Columbus McKinnon',
        documentNumber: '11532619 Rev AC',
        revision: 'August 2016',
        pages: 24,
        sourceIndex: -107,
        officialPdfUrl: '/green-files/manuals/yale-bridge-operation-service-parts.pdf',
        officialProductUrl: 'https://www.cmco.com/en-us/resources/legacy-manuals/',
        sourceLabel: 'Official Yale operation and service manual',
        entries: [
          { id: 'operator-training', label: 'Operator training and control familiarization', page: 6, details: 'Start-up, control direction, speed, stopping distance, and operator familiarization.', tags: ['operator', 'training', 'controls', 'speed'] },
          { id: 'lifting', label: 'Normal lifting and bridge-travel rules', page: 8, details: 'Load attachment, rated capacity, travel, load swing, spotting, and unattended loads.', tags: ['lifting', 'travel', 'load', 'capacity'] },
          { id: 'signals', label: 'Standard operator hand signals', page: 8, details: 'Illustrated signals used by the designated load director and crane operator.', tags: ['signal', 'operator', 'communication'] },
          { id: 'pre-shift', label: 'Pre-shift inspection checklist', page: 9, details: 'Controls, brakes, hook, rope or chain, limit switches, leakage, warning labels, and housekeeping.', tags: ['daily', 'inspection', 'operator', 'pre-shift'] },
        ],
      },
    ],
  },
  {
    id: 'maintenance',
    title: 'Maintenance',
    subtitle: 'Replacement parts and recurring inspections',
    accent: '#6a648d',
    manuals: [
      {
        id: 'parts',
        title: 'WR5 Electric Wire Rope Hoist Operating and Maintenance Instructions',
        shortTitle: 'Hoist Maintenance Manual',
        manufacturer: 'Coffing Hoists / Columbus McKinnon',
        documentNumber: 'WR5 O&M',
        revision: '2013 edition',
        pages: 52,
        sourceIndex: -109,
        officialPdfUrl: '/green-files/manuals/coffing-wr5-operation-maintenance.pdf',
        officialProductUrl: 'https://www.cmco.com/en-us/resources/legacy-manuals/',
        sourceLabel: 'Official Coffing operating and maintenance manual',
        entries: [
          { id: 'inspection-checklist', label: 'Inspection and maintenance checklist', page: 8, details: 'Daily, monthly, and periodic checks with deficiency and corrective-action fields.', tags: ['inspection', 'daily', 'monthly', 'checklist'] },
          { id: 'brake-check', label: 'Load-brake function check', page: 9, details: 'Functional check of the mechanical load brake under a light load.', tags: ['brake', 'load', 'function'] },
          { id: 'wire-rope', label: 'Wire-rope inspection and replacement', page: 10, details: 'Inspection intervals, discard criteria, reeving, and replacement guidance.', tags: ['wire rope', 'reeving', 'replacement'] },
          { id: 'maintenance', label: 'Preventive maintenance procedures', page: 13, details: 'Lubrication, adjustments, brakes, gearing, electrical components, and troubleshooting.', tags: ['maintenance', 'lubrication', 'brake', 'gear'] },
          { id: 'illustrated-parts', label: 'Illustrated replacement-parts sections', page: 25, details: 'Exploded assemblies and replacement-parts identification for the WR5 hoist.', tags: ['parts', 'exploded view', 'replacement'] },
        ],
      },
    ],
  },
]

export const greenFileManuals = greenFileSections.flatMap((section) => section.manuals)

export const greenFileNotebookSources: NotebookSource[] = greenFileManuals.map((manual) => ({
  index: manual.sourceIndex,
  name: manual.title,
  equipment_id: demoCrane.id,
  document_type: 'manual',
  manufacturer: manual.manufacturer,
  source: `green-file/${demoCrane.id}/${manual.documentNumber}.pdf`,
  pdf_url: manual.officialPdfUrl ?? '',
}))

export const findGreenFileManual = (sourceIndex: number | null | undefined) =>
  greenFileManuals.find((manual) => manual.sourceIndex === sourceIndex)

export const isGreenFileSource = (sourceIndex: number) => sourceIndex < 0
