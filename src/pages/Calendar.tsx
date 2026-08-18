import { useEffect, useMemo, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { Link, useNavigate } from 'react-router-dom'
import { usePortalMenu } from '../lib/usePortalMenu'
import { useDeveloperMenuItems } from '../lib/useDeveloperMenuItems'
import { DeveloperBadge } from '../components/DeveloperBadge'
import { getCustomerDisplayName, useCustomerPath, useSelectedCustomer } from '../lib/customerRouting'
import { getCurrentSupabaseUser, isConfigured, supabase } from '../lib/supabase'
import { getCurrentUserTag } from '../lib/userTags'

const menuItems = [
  { label: 'Home', href: '/dashboard' },
  { label: 'Open Risk Items', href: '/asset-fleet-assets?view=open-risk' },
  { label: 'Asset Fleet', href: '/asset-fleet' },
  { label: 'Spend', href: '/spend' },
  { label: 'Location Comparison', href: '/location-comparison' },
  { label: 'Document Reports', href: '/documents-reports' },
  { label: 'Custom Reports', href: '/custom-reports' },
  { label: 'Documents', href: '/deshazo-work-orders' },
  { label: 'Add User', href: '/add-user' },
  { label: 'Contact Us', href: '/contact-us' },
]

const resources = [
  { id: 'unassigned', name: 'Ohio Unassigned', region: 'North Installations', group: 'North Installations' },
  { id: 'ky-unassigned', name: 'Kentucky Unassigned', region: 'Kentucky', group: 'Kentucky Unassigned' },
  { id: 'mccurley', name: 'Chris McCurley', region: 'Kentucky', group: 'Kentucky Unassigned' },
  { id: 'casella', name: 'Anthony Casella', region: 'Kentucky', group: 'Kentucky Unassigned' },
  { id: 'ettington', name: 'Don Ettington', region: 'Kentucky', group: 'Kentucky Unassigned' },
  { id: 'ballachino', name: 'Doug Ballachino', region: 'Kentucky', group: 'Kentucky Unassigned' },
  { id: 'on-call', name: 'On Call', region: 'Coverage', group: 'Coverage' },
]

const calendarDays = [
  { label: 'Tue', date: 'Aug 11' },
  { label: 'Wed', date: 'Aug 12' },
  { label: 'Thu', date: 'Aug 13' },
  { label: 'Fri', date: 'Aug 14' },
  { label: 'Sat', date: 'Aug 15' },
  { label: 'Sun', date: 'Aug 16' },
  { label: 'Mon', date: 'Aug 17' },
  { label: 'Tue', date: 'Aug 18' },
  { label: 'Wed', date: 'Aug 19' },
  { label: 'Thu', date: 'Aug 20' },
  { label: 'Fri', date: 'Aug 21' },
  { label: 'Sat', date: 'Aug 22' },
  { label: 'Sun', date: 'Aug 23' },
]

type JobColor = 'red' | 'green' | 'blue' | 'gray'
type CalendarView = 'month' | 'week' | 'day'

type CalendarJob = {
  id: string
  title: string
  customer: string
  customerLocation: string
  serviceLocation: string
  branchId: string
  project: string
  resourceId: string
  dayIndex: number
  color: JobColor
  startDate: string
  start: string
  endDate: string
  end: string
  duration: string
  busyDays: number
  busyHours: string
  status: string
  jobNumber: string
  description: string
  officeNote: string
  fieldNote: string
  utilization: number
  allDay?: boolean
  repeat?: boolean
}

type EditorMode = 'add' | 'edit'

type EditingJobState = {
  mode: EditorMode
  job: CalendarJob
}

const initialJobs: CalendarJob[] = [
  {
    id: 'wabash-cadiz',
    title: 'Wabash Cadiz KY - Frequent Monthly Insp',
    customer: 'Wabash',
    customerLocation: 'Wabash Cadiz KY',
    serviceLocation: '028 Cincinnati',
    branchId: '028-cincinnati',
    project: '',
    resourceId: 'unassigned',
    dayIndex: 1,
    color: 'red',
    startDate: '08/12/2026',
    start: '12:00am',
    endDate: '08/12/2026',
    end: '11:45pm',
    duration: '23:45 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'To Be Assigned',
    jobNumber: '284986',
    description: 'Crane 33 Bridge Brake Repair',
    officeNote: 'Attention: Matt Lancaster E.',
    fieldNote: 'Wabash Cadiz 489 Internat',
    utilization: 100,
  },
  {
    id: 'leeco-service',
    title: 'Groveport - Frequent Monthly Insp',
    customer: 'Wabash',
    customerLocation: 'Groveport',
    serviceLocation: '028 Cincinnati',
    branchId: '028-cincinnati',
    project: 'Inspection',
    resourceId: 'unassigned',
    dayIndex: 2,
    color: 'green',
    startDate: '08/13/2026',
    start: '7:00am',
    endDate: '08/13/2026',
    end: '3:30pm',
    duration: '8:30 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Assigned',
    jobNumber: '0283175',
    description: 'Frequent Monthly Inspection- Aug',
    officeNote: 'Call before arrival.',
    fieldNote: 'Groveport, OH',
    utilization: 80,
  },
  {
    id: 'nas-hold',
    title: 'Wabash Cadiz KY - Service Call',
    customer: 'Wabash',
    customerLocation: 'Wabash Cadiz KY',
    serviceLocation: '028 Cincinnati',
    branchId: '028-cincinnati',
    project: 'Service',
    resourceId: 'unassigned',
    dayIndex: 3,
    color: 'red',
    startDate: '08/14/2026',
    start: '6:00am',
    endDate: '08/14/2026',
    end: '2:30pm',
    duration: '8:30 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Hold',
    jobNumber: '0284874',
    description: 'Service call - Crane was struck by something',
    officeNote: 'Confirm customer access before dispatch.',
    fieldNote: 'Crane was struck by something.',
    utilization: 65,
  },
  {
    id: 'oneal-service',
    title: 'Wabash - Fond du Lac - Dropped load',
    customer: 'Wabash',
    customerLocation: 'Wabash - Fond du Lac',
    serviceLocation: '027 Chicago',
    branchId: '027-chicago',
    project: 'Service',
    resourceId: 'unassigned',
    dayIndex: 4,
    color: 'blue',
    startDate: '08/15/2026',
    start: '8:00am',
    endDate: '08/15/2026',
    end: '4:00pm',
    duration: '8:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Assigned',
    jobNumber: '0285237',
    description: 'Plate 3 South Crane - Dropped load',
    officeNote: 'Completed service call from Chicago branch.',
    fieldNote: 'Plate 3 South Crane.',
    utilization: 75,
  },
  {
    id: 'inspection-schedule',
    title: 'Wabash Elroy - Frequent Inspections',
    customer: 'Wabash',
    customerLocation: 'Wabash Elroy',
    serviceLocation: '027 Chicago',
    branchId: '027-chicago',
    project: 'Inspection',
    resourceId: 'mccurley',
    dayIndex: 0,
    color: 'green',
    startDate: '08/11/2026',
    start: '7:30am',
    endDate: '08/11/2026',
    end: '11:30am',
    duration: '4:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Scheduled',
    jobNumber: '0269087',
    description: 'May 2026 Frequent Inspections',
    officeNote: 'Monthly inspection route.',
    fieldNote: 'Elroy site.',
    utilization: 45,
  },
  {
    id: 'kenworth-install',
    title: 'Wabash - New Lisbon - Bridge issues',
    customer: 'Wabash',
    customerLocation: 'Wabash - New Lisbon',
    serviceLocation: '027 Chicago',
    branchId: '027-chicago',
    project: 'Service',
    resourceId: 'ballachino',
    dayIndex: 2,
    color: 'blue',
    startDate: '08/13/2026',
    start: '8:00am',
    endDate: '08/13/2026',
    end: '5:00pm',
    duration: '9:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'In Progress',
    jobNumber: '0281510',
    description: 'Per customer: Bridge is acting up and goes all the way up when switching from hoist A to B',
    officeNote: 'Chicago branch follow-up.',
    fieldNote: 'Bridge issue.',
    utilization: 100,
  },
  {
    id: 'schmalz-install',
    title: 'Jonestown - Periodic Annual Insp',
    customer: 'Wabash',
    customerLocation: 'Jonestown',
    serviceLocation: '017 Northeast',
    branchId: '017-northeast',
    project: 'Inspection',
    resourceId: 'unassigned',
    dayIndex: 6,
    color: 'red',
    startDate: '08/17/2026',
    start: '6:30am',
    endDate: '08/17/2026',
    end: '2:30pm',
    duration: '8:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Needs Review',
    jobNumber: '0282646',
    description: 'Periodic Annual Inspection- Aug 2026',
    officeNote: 'Northeast branch inspection.',
    fieldNote: 'Jonestown site.',
    utilization: 90,
  },
  {
    id: 'novolex-notes',
    title: 'Jonestown - Service call crane tripping',
    customer: 'Wabash',
    customerLocation: 'Jonestown',
    serviceLocation: '017 Northeast',
    branchId: '017-northeast',
    project: 'Service',
    resourceId: 'casella',
    dayIndex: 7,
    color: 'gray',
    startDate: '08/18/2026',
    start: '9:00am',
    endDate: '08/18/2026',
    end: '1:00pm',
    duration: '4:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Tentative',
    jobNumber: '0281645',
    description: 'Service call - crane tripping the breaker.',
    officeNote: 'Northeast service call.',
    fieldNote: 'Crane tripping breaker.',
    utilization: 35,
  },
  {
    id: 'rinker-greenfield',
    title: 'Wabash Cadiz KY - Minnesota coverage',
    customer: 'Wabash',
    customerLocation: 'Wabash Cadiz KY',
    serviceLocation: '039 Minnesota',
    branchId: '039-minnesota',
    project: 'Service',
    resourceId: 'unassigned',
    dayIndex: 10,
    color: 'gray',
    startDate: '08/21/2026',
    start: '7:00am',
    endDate: '08/21/2026',
    end: '3:00pm',
    duration: '8:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Assigned',
    jobNumber: '0285904',
    description: 'Minnesota branch scheduled coverage',
    officeNote: 'Branch coverage example from Wabash records.',
    fieldNote: 'Confirm site contact.',
    utilization: 85,
  },
  {
    id: 'fabest-vincennes',
    title: 'Richmond branch example',
    customer: 'Wabash',
    customerLocation: 'Wabash Demo Site',
    serviceLocation: '032 Richmond',
    branchId: '032-richmond',
    project: 'Inspection',
    resourceId: 'unassigned',
    dayIndex: 11,
    color: 'gray',
    startDate: '08/22/2026',
    start: '8:00am',
    endDate: '08/22/2026',
    end: '12:00pm',
    duration: '4:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Tentative',
    jobNumber: '0321001',
    description: 'Richmond branch exists in DeShazo work-order data; demo Wabash job for tab behavior.',
    officeNote: 'No Wabash rows found in sampled Richmond branch results.',
    fieldNote: 'Demo-only branch example.',
    utilization: 40,
  },
  {
    id: 'arku-notes',
    title: 'St Louis branch example',
    customer: 'Wabash',
    customerLocation: 'Wabash Demo Site',
    serviceLocation: '029 St Louis',
    branchId: '029-st-louis',
    project: 'Service',
    resourceId: 'on-call',
    dayIndex: 10,
    color: 'gray',
    startDate: '08/21/2026',
    start: '10:00am',
    endDate: '08/21/2026',
    end: '1:00pm',
    duration: '3:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Needs Review',
    jobNumber: '0291001',
    description: 'St Louis branch tab from Ganttic screenshot; seeded so filtering works.',
    officeNote: 'Demo-only branch example.',
    fieldNote: 'Demo-only branch example.',
    utilization: 30,
  },
  {
    id: 'central-states',
    title: 'Wabash - Little Rock / Harrison',
    customer: 'Wabash',
    customerLocation: 'Harrison',
    serviceLocation: '036 Little Rock',
    branchId: '036-little-rock',
    project: 'Repair',
    resourceId: 'casella',
    dayIndex: 6,
    color: 'red',
    startDate: '08/17/2026',
    start: '11:00am',
    endDate: '08/17/2026',
    end: '4:00pm',
    duration: '5:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Assigned',
    jobNumber: '0255520',
    description: '4 Ton Crane Hoist Replacement',
    officeNote: 'Little Rock branch repair.',
    fieldNote: 'Customer will provide lift.',
    utilization: 60,
  },
  {
    id: 'miami-fort-service',
    title: 'Miami Fort - Service Labor',
    customer: 'Wabash',
    customerLocation: 'Wabash Cadiz KY',
    serviceLocation: '028 Cincinnati',
    branchId: '028-cincinnati',
    project: 'Service Labor',
    resourceId: 'ky-unassigned',
    dayIndex: 1,
    color: 'red',
    startDate: '08/12/2026',
    start: '8:00am',
    endDate: '08/12/2026',
    end: '4:00pm',
    duration: '8:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Assigned',
    jobNumber: '0285201',
    description: 'Screenshot-inspired Miami Fort service labor task.',
    officeNote: 'Coordinate with Cincinnati dispatcher.',
    fieldNote: 'Bring standard service kit.',
    utilization: 85,
  },
  {
    id: 'kentucky-utilities-crane',
    title: 'Kentucky Utilities - Crane 8 aux hoist',
    customer: 'Wabash',
    customerLocation: 'Wabash Cadiz KY',
    serviceLocation: '028 Cincinnati',
    branchId: '028-cincinnati',
    project: 'Repair',
    resourceId: 'unassigned',
    dayIndex: 3,
    color: 'red',
    startDate: '08/14/2026',
    start: '7:00am',
    endDate: '08/14/2026',
    end: '3:00pm',
    duration: '8:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Needs Review',
    jobNumber: '0285217',
    description: 'Crane 8 auxiliary hoist upgrade project.',
    officeNote: 'Confirm parts staged before assigning crew.',
    fieldNote: 'Inspect auxiliary hoist controls.',
    utilization: 90,
  },
  {
    id: 'sms-group-labor',
    title: 'SMS Group Inc. - Service Labor',
    customer: 'Wabash',
    customerLocation: 'Groveport',
    serviceLocation: '028 Cincinnati',
    branchId: '028-cincinnati',
    project: 'Service Labor',
    resourceId: 'ettington',
    dayIndex: 2,
    color: 'red',
    startDate: '08/13/2026',
    start: '10:00am',
    endDate: '08/13/2026',
    end: '2:00pm',
    duration: '4:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Scheduled',
    jobNumber: '0285226',
    description: 'Service labor block based on screenshot task stack.',
    officeNote: 'Short service window.',
    fieldNote: 'Check with maintenance supervisor.',
    utilization: 50,
  },
  {
    id: 'general-dynamics',
    title: 'General Dynamics - Inspection support',
    customer: 'Wabash',
    customerLocation: 'Jonestown',
    serviceLocation: '017 Northeast',
    branchId: '017-northeast',
    project: 'Inspection',
    resourceId: 'mccurley',
    dayIndex: 6,
    color: 'green',
    startDate: '08/17/2026',
    start: '8:00am',
    endDate: '08/17/2026',
    end: '12:00pm',
    duration: '4:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Assigned',
    jobNumber: '0285248',
    description: 'General Dynamics inspection support task from screenshot.',
    officeNote: 'Northeast branch route.',
    fieldNote: 'Use inspection checklist.',
    utilization: 45,
  },
  {
    id: 'phoenix-services',
    title: 'Phoenix Services - See Notes',
    customer: 'Wabash',
    customerLocation: 'Wabash Demo Site',
    serviceLocation: '029 St Louis',
    branchId: '029-st-louis',
    project: 'Service',
    resourceId: 'unassigned',
    dayIndex: 10,
    color: 'red',
    startDate: '08/21/2026',
    start: '9:00am',
    endDate: '08/21/2026',
    end: '1:00pm',
    duration: '4:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Tentative',
    jobNumber: '0291014',
    description: 'Screenshot-inspired notes task for St Louis branch.',
    officeNote: 'Demo note: confirm scope before scheduling.',
    fieldNote: 'See office notes.',
    utilization: 40,
  },
  {
    id: 'duralay-labor',
    title: 'DuraLay Technology - Labor',
    customer: 'Wabash',
    customerLocation: 'Wabash Demo Site',
    serviceLocation: '029 St Louis',
    branchId: '029-st-louis',
    project: 'Service Labor',
    resourceId: 'casella',
    dayIndex: 10,
    color: 'red',
    startDate: '08/21/2026',
    start: '1:00pm',
    endDate: '08/21/2026',
    end: '5:00pm',
    duration: '4:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Assigned',
    jobNumber: '0291020',
    description: 'Labor task inspired by the right-side screenshot stack.',
    officeNote: 'Schedule after Phoenix Services task.',
    fieldNote: 'Check lift access.',
    utilization: 45,
  },
  {
    id: 'dkp-see-notes',
    title: 'DKP - See Notes',
    customer: 'Wabash',
    customerLocation: 'Wabash Demo Site',
    serviceLocation: '032 Richmond',
    branchId: '032-richmond',
    project: 'Service',
    resourceId: 'unassigned',
    dayIndex: 10,
    color: 'gray',
    startDate: '08/21/2026',
    start: '2:00pm',
    endDate: '08/21/2026',
    end: '4:00pm',
    duration: '2:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Needs Review',
    jobNumber: '0321015',
    description: 'Compact notes task like the screenshot.',
    officeNote: 'Needs review before dispatch.',
    fieldNote: 'See notes.',
    utilization: 25,
  },
  {
    id: 'lifting-systems',
    title: 'Lifting Systems - See Notes',
    customer: 'Wabash',
    customerLocation: 'Wabash Demo Site',
    serviceLocation: '032 Richmond',
    branchId: '032-richmond',
    project: 'Inspection',
    resourceId: 'on-call',
    dayIndex: 10,
    color: 'gray',
    startDate: '08/21/2026',
    start: '4:00pm',
    endDate: '08/21/2026',
    end: '6:00pm',
    duration: '2:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Tentative',
    jobNumber: '0321022',
    description: 'Follow-up notes task from screenshot stack.',
    officeNote: 'Demo-only task for Richmond branch.',
    fieldNote: 'Confirm technician availability.',
    utilization: 20,
  },
  {
    id: 'fabest-foods-periodic',
    title: 'Fabest Foods - Periodic Inspection',
    customer: 'Wabash',
    customerLocation: 'Wabash Demo Site',
    serviceLocation: '039 Minnesota',
    branchId: '039-minnesota',
    project: 'Inspection',
    resourceId: 'mccurley',
    dayIndex: 11,
    color: 'green',
    startDate: '08/22/2026',
    start: '7:00am',
    endDate: '08/22/2026',
    end: '11:00am',
    duration: '4:00 h:m',
    busyDays: 1,
    busyHours: '0:0 h:m',
    status: 'Scheduled',
    jobNumber: '0392041',
    description: 'Periodic inspection task inspired by screenshot.',
    officeNote: 'Weekend inspection route.',
    fieldNote: 'Use periodic checklist.',
    utilization: 50,
  },
]

const colorClasses: Record<JobColor, string> = {
  red: 'border-[#c42020] bg-[#ed1c24] text-white',
  green: 'border-[#16833d] bg-[#27a64d] text-white',
  blue: 'border-[#1e47d7] bg-[#2458ff] text-white',
  gray: 'border-[#8f98aa] bg-[#aeb4c0] text-white',
}

const todayDayIndex = 6
const hourLabels = Array.from({ length: 24 }, (_, hour) => {
  if (hour === 0) return '12 AM'
  if (hour < 12) return `${hour} AM`
  if (hour === 12) return '12 PM'
  return `${hour - 12} PM`
})

const monthDays = Array.from({ length: 35 }, (_, index) => {
  const dayNumber = index + 1
  return {
    dayNumber,
    isCurrentWeek: dayNumber >= 11 && dayNumber <= 18,
    dayIndex: dayNumber >= 11 && dayNumber <= 18 ? dayNumber - 11 : null,
  }
})

const branchTabs = [
  { id: '028-cincinnati', label: '028 CIN', name: '028 Cincinnati', dbCount: 145 },
  { id: '027-chicago', label: '027 CHI', name: '027 Chicago', dbCount: 234 },
  { id: '032-richmond', label: '032 RICH', name: '032 Richmond', dbCount: 0 },
  { id: '017-northeast', label: '017 NE', name: '017 Northeast', dbCount: 35 },
  { id: '029-st-louis', label: '029 St Louis', name: '029 St Louis', dbCount: 0 },
  { id: '039-minnesota', label: '039 MN', name: '039 Minnesota', dbCount: 29 },
  { id: '036-little-rock', label: '036 Little Rock', name: '036 Little Rock', dbCount: 37 },
]

function formatHour(hour: number) {
  if (hour === 0) return '12:00am'
  if (hour < 12) return `${hour}:00am`
  if (hour === 12) return '12:00pm'
  return `${hour - 12}:00pm`
}

function parseStartHour(value: string) {
  const match = value.trim().toLowerCase().match(/^(\d{1,2})(?::\d{2})?\s*(am|pm)$/)
  if (!match) return 8

  const rawHour = Number(match[1])
  const period = match[2]
  if (period === 'am') return rawHour === 12 ? 0 : rawHour
  return rawHour === 12 ? 12 : rawHour + 12
}

function getJobButtonClass(job: CalendarJob, size: 'compact' | 'comfortable' = 'compact') {
  const sizeClass =
    size === 'comfortable'
      ? 'min-h-12 px-2 py-1.5 text-left text-xs leading-4'
      : 'h-7 px-2 text-left text-xs leading-6'

  return `block w-full cursor-move overflow-hidden rounded-sm border font-black shadow-sm transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-[rgba(47,86,166,0.35)] ${sizeClass} ${colorClasses[job.color]}`
}

function getResourceGroupLabel(resourceIndex: number) {
  const resource = resources[resourceIndex]
  const previousResource = resources[resourceIndex - 1]
  return resource.group !== previousResource?.group ? resource.group : ''
}

function buildBlankJob(resourceId = resources[0].id, dayIndex = todayDayIndex, branchId = branchTabs[0].id): CalendarJob {
  const branch = branchTabs.find((item) => item.id === branchId) ?? branchTabs[0]
  const dayNumber = String(dayIndex + 11).padStart(2, '0')

  return {
    id: `new-job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    customer: 'Wabash',
    customerLocation: '',
    serviceLocation: branch.name,
    branchId: branch.id,
    project: '',
    resourceId,
    dayIndex,
    color: 'green',
    startDate: `08/${dayNumber}/2026`,
    start: '',
    endDate: `08/${dayNumber}/2026`,
    end: '',
    duration: '',
    busyDays: 0,
    busyHours: '',
    status: 'To Be Assigned',
    jobNumber: '',
    description: '',
    officeNote: '',
    fieldNote: '',
    utilization: 0,
    allDay: false,
    repeat: false,
  }
}

export default function Calendar() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [jobs, setJobs] = useState(initialJobs)
  const [editingJob, setEditingJob] = useState<EditingJobState | null>(null)
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null)
  const [calendarView, setCalendarView] = useState<CalendarView>('week')
  const [activeBranchId, setActiveBranchId] = useState(branchTabs[0].id)
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const navigate = useNavigate()
  const selectedCustomer = useSelectedCustomer()
  const customerPath = useCustomerPath()
  const customerName = getCustomerDisplayName(selectedCustomer)
  const activeMenuItems = useDeveloperMenuItems(menuItems, 'Calendar')

  useEffect(() => {
    let isMounted = true

    if (!isConfigured || !supabase) {
      navigate(customerPath('/login'))
      return () => {
        isMounted = false
      }
    }

    getCurrentSupabaseUser().then(async (nextUser) => {
      if (!isMounted) return
      if (!nextUser) {
        navigate(customerPath('/login'))
      } else {
        const nextUserTag = await getCurrentUserTag(nextUser.id).catch(() => null)
        if (!isMounted) return
        if (nextUserTag !== 'developer') {
          navigate(customerPath('/dashboard'), { replace: true })
          return
        }
        setUser(nextUser)
      }
      setAuthLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [customerPath, navigate])

  const visibleJobs = useMemo(
    () => jobs.filter((job) => job.branchId === activeBranchId),
    [activeBranchId, jobs],
  )
  const activeBranch = branchTabs.find((branch) => branch.id === activeBranchId) ?? branchTabs[0]

  const jobsByCell = useMemo(() => {
    const next = new Map<string, CalendarJob[]>()
    for (const job of visibleJobs) {
      const key = `${job.resourceId}:${job.dayIndex}`
      next.set(key, [...(next.get(key) ?? []), job])
    }
    return next
  }, [visibleJobs])

  const todayJobsByResourceAndHour = useMemo(() => {
    const next = new Map<string, CalendarJob[]>()
    for (const job of visibleJobs) {
      if (job.dayIndex !== todayDayIndex) continue
      const key = `${job.resourceId}:${parseStartHour(job.start)}`
      next.set(key, [...(next.get(key) ?? []), job])
    }
    return next
  }, [visibleJobs])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate(customerPath('/login'))
  }

  const moveJob = (jobId: string, resourceId: string, dayIndex: number) => {
    setJobs((currentJobs) =>
      currentJobs.map((job) => (job.id === jobId ? { ...job, resourceId, dayIndex } : job)),
    )
  }

  const moveJobToHour = (jobId: string, resourceId: string, hour: number) => {
    setJobs((currentJobs) =>
      currentJobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              resourceId,
              dayIndex: todayDayIndex,
              startDate: '08/17/2026',
              start: formatHour(hour),
              endDate: '08/17/2026',
              end: formatHour(Math.min(hour + 1, 23)),
              duration: '1:00 h:m',
            }
          : job,
      ),
    )
  }

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, jobId: string) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', jobId)
    setDraggedJobId(jobId)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>, resourceId: string, dayIndex: number) => {
    event.preventDefault()
    const jobId = event.dataTransfer.getData('text/plain') || draggedJobId
    if (!jobId) return
    moveJob(jobId, resourceId, dayIndex)
    setDraggedJobId(null)
  }

  const handleHourDrop = (event: DragEvent<HTMLDivElement>, resourceId: string, hour: number) => {
    event.preventDefault()
    const jobId = event.dataTransfer.getData('text/plain') || draggedJobId
    if (!jobId) return
    moveJobToHour(jobId, resourceId, hour)
    setDraggedJobId(null)
  }

  const addJob = (resourceId = resources[0].id, dayIndex = todayDayIndex) => {
    setEditingJob({
      mode: 'add',
      job: buildBlankJob(resourceId, dayIndex, activeBranchId),
    })
  }

  const editJob = (job: CalendarJob) => {
    setEditingJob({
      mode: 'edit',
      job,
    })
  }

  const copyJob = (job: CalendarJob) => {
    const nextJob = {
      ...job,
      id: `copy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: `${job.title} copy`,
      jobNumber: String(Number(job.jobNumber.replace(/\D/g, '') || '286000') + 1),
    }
    setJobs((currentJobs) => [...currentJobs, nextJob])
    setEditingJob({ mode: 'edit', job: nextJob })
  }

  const deleteJob = (jobId: string) => {
    setJobs((currentJobs) => currentJobs.filter((job) => job.id !== jobId))
    setEditingJob(null)
  }

  const handleJobSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingJob) return

    const formData = new FormData(event.currentTarget)
    const submittedBranchId = String(formData.get('branchId') ?? editingJob.job.branchId)
    const submittedBranch = branchTabs.find((branch) => branch.id === submittedBranchId)
    const savedJob: CalendarJob = {
      ...editingJob.job,
      title: String(formData.get('title') ?? '').trim() || 'Untitled task',
      customerLocation: String(formData.get('customerLocation') ?? '').trim(),
      serviceLocation: submittedBranch?.name ?? String(formData.get('serviceLocation') ?? editingJob.job.serviceLocation),
      branchId: submittedBranchId,
      project: String(formData.get('project') ?? editingJob.job.project),
      startDate: String(formData.get('startDate') ?? editingJob.job.startDate),
      start: String(formData.get('start') ?? '').trim(),
      endDate: String(formData.get('endDate') ?? editingJob.job.endDate),
      end: String(formData.get('end') ?? '').trim(),
      duration: String(formData.get('duration') ?? '').trim(),
      busyDays: Number(formData.get('busyDays') ?? 0),
      busyHours: String(formData.get('busyHours') ?? '').trim(),
      status: String(formData.get('status') ?? editingJob.job.status),
      jobNumber: String(formData.get('jobNumber') ?? '').trim(),
      description: String(formData.get('description') ?? '').trim(),
      officeNote: String(formData.get('officeNote') ?? '').trim(),
      fieldNote: String(formData.get('fieldNote') ?? '').trim(),
      utilization: Number(formData.get('utilization') ?? 0),
      allDay: formData.get('allDay') === 'on',
      repeat: formData.get('repeat') === 'on',
    }

    setJobs((currentJobs) =>
      editingJob.mode === 'add'
        ? [...currentJobs, savedJob]
        : currentJobs.map((job) => (job.id === savedJob.id ? savedJob : job)),
    )
    setActiveBranchId(savedJob.branchId)
    setEditingJob(null)
  }

  if (authLoading || !user) return null

  const fullName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Portal User'
  const userEmail = user.email ?? ''
  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join('') || 'DP'

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--deshazo-text)]">
      <header className="sticky top-0 z-40 bg-[var(--deshazo-blue)] px-5 py-3 shadow-sm">
        <div className="flex w-full items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex min-w-[120px] items-center justify-center gap-2 rounded-md border-2 border-white/80 px-6 py-2.5 text-base font-semibold text-white transition hover:bg-white/10"
          >
            <span>Menu</span>
            <span aria-hidden="true" className="text-xs">
              {menuOpen ? '⌃' : '⌄'}
            </span>
          </button>

          <div className="hidden text-right text-sm text-white/85 sm:block">
            Signed in as <span className="font-semibold text-white">{userEmail}</span>
          </div>
        </div>
      </header>

      <main className="flex w-full items-stretch">
        {menuOpen && (
          <aside className="sticky top-[60px] hidden h-[calc(100vh-60px)] w-[268px] shrink-0 border-r border-[var(--deshazo-border)] bg-white lg:flex lg:flex-col">
            <div className="flex-1 px-4 py-5">
              <div className="rounded-[24px] border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)]/50 p-4">
                <nav className="space-y-2">
                  {activeMenuItems.map((item) =>
                    item.href ? (
                      <Link
                        key={item.label}
                        to={item.href}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-[15px] font-medium transition ${
                          item.active
                            ? 'bg-[#dbe5ff] text-[var(--deshazo-text)] shadow-[inset_0_0_0_1px_rgba(47,86,166,0.06)]'
                            : 'text-[rgba(21,24,33,0.7)] hover:bg-white'
                        }`}
                      >
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <span className="truncate">{item.label}</span>
                          {item.developerOnly ? <DeveloperBadge /> : null}
                        </span>
                        <span className="text-[12px] font-semibold text-[rgba(21,24,33,0.4)]" />
                      </Link>
                    ) : (
                      <button
                        key={item.label}
                        type="button"
                        className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-[15px] font-medium text-[rgba(21,24,33,0.7)] transition hover:bg-white"
                      >
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <span className="truncate">{item.label}</span>
                          {item.developerOnly ? <DeveloperBadge /> : null}
                        </span>
                        <span className="text-[12px] font-semibold text-[rgba(21,24,33,0.4)]" />
                      </button>
                    ),
                  )}
                </nav>
              </div>
            </div>

            <div className="border-t border-[var(--deshazo-border)] px-4 py-4">
              <div className="rounded-2xl bg-[var(--deshazo-surface)] px-3 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-extrabold text-[var(--deshazo-blue)] shadow-[0_10px_24px_-18px_rgba(47,86,166,0.45)]">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold text-[var(--deshazo-text)]">{fullName}</p>
                    <p className="truncate text-[14px] text-[rgba(21,24,33,0.55)]">{userEmail}</p>
                  </div>
                </div>
                <button
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-[var(--deshazo-border)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--deshazo-blue)] shadow-[0_10px_24px_-20px_rgba(47,86,166,0.45)] transition hover:bg-[var(--deshazo-surface)]"
                  onClick={handleSignOut}
                  type="button"
                >
                  Sign out
                </button>
              </div>
            </div>
          </aside>
        )}

        <section className="min-w-0 flex-1 px-5 py-5 sm:px-8 lg:px-10">
          <div className="mb-6 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <div className="text-[36px] font-black uppercase tracking-[-0.04em] text-[#b8bcc8]">
                DESHA<span className="text-[#f2b43f]">Z</span>O
              </div>
              <p className="text-[13px] font-bold uppercase tracking-[0.02em] text-[#b6b8c2]">
                Cranes / Service / Automation
              </p>
              <div className="mt-[18px] h-1.5 w-full max-w-[530px] rounded-full bg-[var(--deshazo-blue)]" />
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--deshazo-surface)] px-4 py-2 text-[13px] font-semibold text-[var(--deshazo-blue)]">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--deshazo-blue)]" />
              <span>{customerName} calendar demo</span>
            </div>
          </div>

          <section className="overflow-hidden rounded-[14px] border border-[var(--deshazo-border)] bg-white shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
            <div className="flex min-h-10 items-center gap-1 overflow-x-auto border-b border-[#3f3f3f] bg-[#303030] px-2 text-white">
              <div className="flex h-10 shrink-0 items-center gap-2 bg-[#454545] px-3 text-xs font-black">
                <span>New View (8)</span>
              </div>
              {branchTabs.map((tab) => {
                const visibleCount = jobs.filter((job) => job.branchId === tab.id).length
                return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveBranchId(tab.id)}
                  className={`h-10 min-w-[150px] border-l border-white/10 px-3 text-left text-xs font-black ${
                    activeBranchId === tab.id ? 'bg-white text-[#202020]' : 'bg-[#3a3a3a] text-white/88 hover:bg-[#4a4a4a]'
                  }`}
                  title={`${tab.name}: ${tab.dbCount ? `${tab.dbCount} Wabash DB rows checked` : 'screenshot/demo branch'}`}
                >
                  <span className="block leading-4">{tab.label}</span>
                  <span className="block truncate text-[10px] font-bold opacity-70">
                    {visibleCount} shown / {tab.dbCount || 'demo'}
                  </span>
                </button>
                )
              })}
              <div className="ml-auto shrink-0 px-3 text-xs font-black">DeSHAZO</div>
            </div>

            <div className="border-b border-[var(--deshazo-border)] bg-[#f8fafc]">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <div>
                      <h1 className="text-[26px] font-black tracking-[-0.03em] text-[var(--deshazo-text)]">
                        View
                      </h1>
                      <p className="text-sm font-semibold text-[rgba(21,24,33,0.62)]">
                        {activeBranch.label} / {calendarView === 'month'
                          ? 'August 2026'
                          : calendarView === 'day'
                            ? 'Today, Monday Aug 17'
                            : 'Week 33, August 2026'}
                      </p>
                    </div>

                    <div className="hidden items-stretch overflow-hidden rounded-md border border-[var(--deshazo-border)] bg-white md:flex">
                      <div className="px-5 py-2 text-center">
                        <p className="text-xs font-black uppercase text-[var(--deshazo-muted)]">Aug</p>
                        <p className="text-2xl font-black leading-none text-[var(--deshazo-text)]">11</p>
                        <p className="text-[10px] font-black uppercase text-[var(--deshazo-muted)]">Tue</p>
                      </div>
                      <div className="w-px bg-[var(--deshazo-border)]" />
                      <div className="px-5 py-2 text-center">
                        <p className="text-xs font-black uppercase text-[var(--deshazo-muted)]">Aug</p>
                        <p className="text-2xl font-black leading-none text-[var(--deshazo-text)]">23</p>
                        <p className="text-[10px] font-black uppercase text-[var(--deshazo-muted)]">Sun</p>
                      </div>
                      <div className="border-l border-[var(--deshazo-border)] px-4 py-2">
                        <p className="text-xs font-black text-[var(--deshazo-muted)]">2026</p>
                        <p className="text-sm font-black uppercase text-[var(--deshazo-text)]">August</p>
                        <p className="text-xs font-black uppercase text-[var(--deshazo-muted)]">Week33</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => addJob()}
                      className="rounded-md bg-[#1f7a4d] px-4 py-2 text-sm font-black text-white shadow-[0_12px_24px_-18px_rgba(31,122,77,0.75)] transition hover:bg-[#17633e]"
                    >
                      New job
                    </button>
                    <div className="rounded-md border border-[var(--deshazo-border)] bg-white px-3 py-2">
                      <p className="text-xs font-black uppercase text-[var(--deshazo-muted)]">Active branch</p>
                      <p className="text-sm font-black text-[var(--deshazo-text)]">
                        {activeBranch.name} · {activeBranch.dbCount ? `${activeBranch.dbCount} Wabash work orders` : 'demo branch'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className={`rounded-md px-3 py-2 text-sm font-black transition ${
                        calendarView === 'month'
                          ? 'bg-[var(--deshazo-blue)] text-white'
                          : 'border border-[var(--deshazo-border)] bg-white text-[var(--deshazo-blue)] hover:bg-[var(--deshazo-surface)]'
                      }`}
                      type="button"
                      onClick={() => setCalendarView('month')}
                    >
                      Month
                    </button>
                    <button
                      className={`rounded-md px-3 py-2 text-sm font-black transition ${
                        calendarView === 'week'
                          ? 'bg-[var(--deshazo-blue)] text-white'
                          : 'border border-[var(--deshazo-border)] bg-white text-[var(--deshazo-blue)] hover:bg-[var(--deshazo-surface)]'
                      }`}
                      type="button"
                      onClick={() => setCalendarView('week')}
                    >
                      Week
                    </button>
                    <button
                      className={`rounded-md px-3 py-2 text-sm font-black transition ${
                        calendarView === 'day'
                          ? 'bg-[var(--deshazo-blue)] text-white'
                          : 'border border-[var(--deshazo-border)] bg-white text-[var(--deshazo-blue)] hover:bg-[var(--deshazo-surface)]'
                      }`}
                      type="button"
                      onClick={() => setCalendarView('day')}
                    >
                      Today
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {calendarView === 'month' ? (
              <div className="bg-white">
                <div className="grid grid-cols-7 border-b border-[var(--deshazo-border)] bg-[#f8fafc]">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <div key={day} className="border-r border-[var(--deshazo-border)] px-3 py-2 text-xs font-black uppercase text-[var(--deshazo-muted)]">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {monthDays.map((monthDay) => {
                    const monthDayJobs =
                      monthDay.dayIndex == null ? [] : visibleJobs.filter((job) => job.dayIndex === monthDay.dayIndex)
                    return (
                      <div
                        key={monthDay.dayNumber}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          if (monthDay.dayIndex == null) return
                          handleDrop(event, resources[0].id, monthDay.dayIndex)
                        }}
                        className={`min-h-[128px] border-r border-b border-[var(--deshazo-border)] p-2 transition ${
                          monthDay.dayNumber === 17
                            ? 'bg-[#eaf0ff]'
                            : monthDay.isCurrentWeek
                              ? 'bg-white'
                              : 'bg-[#fbfcff]'
                        } ${draggedJobId && monthDay.dayIndex != null ? 'hover:bg-[#dfe8ff]' : ''}`}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-black ${
                            monthDay.dayNumber === 17 ? 'bg-[var(--deshazo-blue)] text-white' : 'text-[var(--deshazo-text)]'
                          }`}>
                            {monthDay.dayNumber}
                          </span>
                          {monthDay.dayIndex != null ? (
                            <span className="text-[11px] font-bold uppercase text-[var(--deshazo-muted)]">Week 33</span>
                          ) : null}
                        </div>
                        <div className="space-y-1">
                          {monthDayJobs.slice(0, 4).map((job) => (
                            <button
                              key={job.id}
                              type="button"
                              draggable
                              onDragStart={(event) => handleDragStart(event, job.id)}
                              onDragEnd={() => setDraggedJobId(null)}
                              onClick={() => editJob(job)}
                              className={getJobButtonClass(job)}
                              title={`${job.title} - ${job.start} to ${job.end}`}
                            >
                              <span className="truncate">{job.title}</span>
                            </button>
                          ))}
                          {monthDayJobs.length > 4 ? (
                            <button
                              type="button"
                              onClick={() => setCalendarView('week')}
                              className="w-full rounded-sm bg-[var(--deshazo-surface)] px-2 py-1 text-left text-xs font-black text-[var(--deshazo-blue)]"
                            >
                              +{monthDayJobs.length - 4} more
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : calendarView === 'day' ? (
              <div className="overflow-x-auto bg-white">
                <div className="min-w-[1080px]">
                  <div className="grid grid-cols-[78px_repeat(7,minmax(150px,1fr))] border-b border-[var(--deshazo-border)] bg-[#f8fafc]">
                    <div className="sticky left-0 z-20 border-r border-[var(--deshazo-border)] bg-[#f8fafc] px-3 py-3 text-xs font-black uppercase text-[var(--deshazo-muted)]">
                      Time
                    </div>
                    {resources.map((resource) => (
                      <div key={resource.id} className="border-r border-[var(--deshazo-border)] px-3 py-3">
                        <p className="truncate text-sm font-black text-[var(--deshazo-text)]">{resource.name}</p>
                        <p className="truncate text-xs font-semibold text-[var(--deshazo-muted)]">{resource.region}</p>
                      </div>
                    ))}
                  </div>
                  {hourLabels.map((hourLabel, hour) => (
                    <div key={hourLabel} className="grid min-h-[72px] grid-cols-[78px_repeat(7,minmax(150px,1fr))] border-b border-[var(--deshazo-border)]">
                      <div className="sticky left-0 z-10 border-r border-[var(--deshazo-border)] bg-white px-3 py-2 text-xs font-black text-[var(--deshazo-muted)]">
                        {hourLabel}
                      </div>
                      {resources.map((resource) => {
                        const hourJobs = todayJobsByResourceAndHour.get(`${resource.id}:${hour}`) ?? []
                        return (
                          <div
                            key={`${resource.id}-${hour}`}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => handleHourDrop(event, resource.id, hour)}
                            className={`border-r border-[var(--deshazo-border)] p-1.5 transition ${draggedJobId ? 'hover:bg-[#eaf0ff]' : ''}`}
                          >
                            <div className="space-y-1.5">
                              {hourJobs.map((job) => (
                                <button
                                  key={job.id}
                                  type="button"
                                  draggable
                                  onDragStart={(event) => handleDragStart(event, job.id)}
                                  onDragEnd={() => setDraggedJobId(null)}
                                  onClick={() => editJob(job)}
                                  className={getJobButtonClass(job, 'comfortable')}
                                  title={`${job.title} - ${job.start} to ${job.end}`}
                                >
                                  <span className="block truncate">{job.title}</span>
                                  <span className="block truncate text-[10px] font-bold opacity-90">{job.start} - {job.end}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[1580px]">
                  <div className="grid grid-cols-[190px_repeat(13,minmax(104px,1fr))] border-b border-[var(--deshazo-border)] bg-white">
                    <div className="sticky left-0 z-20 border-r border-[var(--deshazo-border)] bg-white px-3 py-3">
                      <p className="text-xs font-black uppercase text-[var(--deshazo-muted)]">Technician / queue</p>
                    </div>
                    {calendarDays.map((day, index) => (
                      <div
                        key={`${day.date}-${day.label}`}
                        className={`border-r border-[var(--deshazo-border)] px-3 py-2 text-sm ${index >= 4 && index <= 5 ? 'bg-[#fff7dd]' : 'bg-white'}`}
                      >
                        <p className="font-black text-[var(--deshazo-text)]">{day.date}</p>
                        <p className="text-xs font-bold uppercase text-[var(--deshazo-muted)]">{day.label}</p>
                      </div>
                    ))}
                  </div>

                  {resources.map((resource, resourceIndex) => (
                    <div key={resource.id} className="grid min-h-[88px] grid-cols-[190px_repeat(13,minmax(104px,1fr))] border-b border-[var(--deshazo-border)]">
                      <div className="sticky left-0 z-10 border-r border-[var(--deshazo-border)] bg-white">
                        {getResourceGroupLabel(resourceIndex) ? (
                          <div className="flex items-center justify-between border-b border-[var(--deshazo-border)] bg-[#f4f4f4] px-2 py-1">
                            <p className="truncate text-[11px] font-black uppercase text-[var(--deshazo-muted)]">
                              {getResourceGroupLabel(resourceIndex)}
                            </p>
                            <button
                              type="button"
                              onClick={() => addJob(resource.id, todayDayIndex)}
                              className="rounded-sm px-2 text-sm font-black leading-6 text-[var(--deshazo-blue)] hover:bg-white"
                              title={`Add job to ${resource.name}`}
                            >
                              Add
                            </button>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between gap-2 px-3 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-[var(--deshazo-text)]">{resource.name}</p>
                            <p className="mt-1 truncate text-xs font-semibold text-[var(--deshazo-muted)]">{resource.region}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => addJob(resource.id, todayDayIndex)}
                            className="shrink-0 rounded-sm border border-[var(--deshazo-border)] bg-white px-2 py-1 text-xs font-black text-[var(--deshazo-blue)] hover:bg-[var(--deshazo-surface)]"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                      {calendarDays.map((day, dayIndex) => {
                        const cellJobs = jobsByCell.get(`${resource.id}:${dayIndex}`) ?? []
                        return (
                          <div
                            key={`${resource.id}-${day.date}`}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => handleDrop(event, resource.id, dayIndex)}
                            className={`min-h-[88px] border-r border-[var(--deshazo-border)] p-1.5 transition ${dayIndex >= 4 && dayIndex <= 5 ? 'bg-[#fff8e3]' : 'bg-white'} ${draggedJobId ? 'hover:bg-[#eaf0ff]' : ''}`}
                          >
                            <div className="space-y-1.5">
                              {cellJobs.map((job) => (
                              <button
                                key={job.id}
                                type="button"
                                draggable
                                onDragStart={(event) => handleDragStart(event, job.id)}
                                onDragEnd={() => setDraggedJobId(null)}
                                onClick={() => editJob(job)}
                                className={getJobButtonClass(job)}
                                title={`${job.title} - ${job.start} to ${job.end}`}
                              >
                                <span className="truncate">{job.title}</span>
                              </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </section>
      </main>

      {editingJob ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/35 px-4 py-5 sm:items-center">
          <form
            onSubmit={handleJobSubmit}
            className="max-h-[calc(100vh-2.5rem)] w-full max-w-5xl overflow-y-auto rounded-[14px] border-4 border-[#ed1c24] bg-white shadow-[0_28px_70px_-28px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--deshazo-border)] px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setEditingJob(null)} className="rounded-full border border-[var(--deshazo-border)] bg-white px-4 py-2 text-sm font-black text-[var(--deshazo-blue)] hover:bg-[var(--deshazo-surface)]">
                  Back
                </button>
                <h2 className="text-xl font-black tracking-[-0.02em]">
                  {editingJob.mode === 'add' ? 'Add Task' : 'Edit Task'}
                </h2>
                <button type="submit" className="rounded-full bg-[#2f73d9] px-4 py-2 text-sm font-black text-white">
                  Save
                </button>
                {editingJob.mode === 'edit' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => copyJob(editingJob.job)}
                      className="rounded-full border border-[var(--deshazo-border)] bg-white px-4 py-2 text-sm font-black text-[var(--deshazo-blue)] hover:bg-[var(--deshazo-surface)]"
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteJob(editingJob.job.id)}
                      className="rounded-full border border-[#f4b5b5] bg-white px-4 py-2 text-sm font-black text-[#b42318] hover:bg-[#fff1f1]"
                    >
                      Delete
                    </button>
                  </>
                ) : null}
              </div>
              <button type="button" onClick={() => setEditingJob(null)} className="rounded-full border border-[var(--deshazo-border)] bg-white px-4 py-2 text-sm font-black text-[var(--deshazo-blue)] hover:bg-[var(--deshazo-surface)]">
                Close
              </button>
            </div>

            <div className="grid gap-4 px-4 py-4 md:grid-cols-4">
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)]">
                Name
                <input name="title" defaultValue={editingJob.job.title} className="mt-1 w-full rounded-md border border-[var(--deshazo-border)] px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]" />
              </label>
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)]">
                DeShazo Branch
                <select name="branchId" defaultValue={editingJob.job.branchId} className="mt-1 w-full rounded-md border border-[var(--deshazo-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]">
                  {branchTabs.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)]">
                Customer Location
                <select name="customerLocation" defaultValue={editingJob.job.customerLocation} className="mt-1 w-full rounded-md border border-[var(--deshazo-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]">
                  {[
                    '',
                    'Wabash Cadiz KY',
                    'Groveport',
                    'Wabash - Fond du Lac',
                    'Wabash Elroy',
                    'Wabash - New Lisbon',
                    'Jonestown',
                    'Harrison',
                    'Wabash Demo Site',
                  ].map((location) => (
                    <option key={location}>{location}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)]">
                Service Location
                <input name="serviceLocation" defaultValue={editingJob.job.serviceLocation} className="mt-1 w-full rounded-md border border-[var(--deshazo-border)] px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]" />
              </label>
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)]">
                Start Date
                <input name="startDate" defaultValue={editingJob.job.startDate} className="mt-1 w-full rounded-md border border-[var(--deshazo-border)] px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]" />
              </label>
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)]">
                Start Time
                <input name="start" defaultValue={editingJob.job.start} className="mt-1 w-full rounded-md border border-[var(--deshazo-border)] px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]" />
              </label>
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)]">
                End Date
                <input name="endDate" defaultValue={editingJob.job.endDate} className="mt-1 w-full rounded-md border border-[var(--deshazo-border)] px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]" />
              </label>
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)]">
                End Time
                <input name="end" defaultValue={editingJob.job.end} className="mt-1 w-full rounded-md border border-[var(--deshazo-border)] px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]" />
              </label>
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)]">
                Status
                <select name="status" defaultValue={editingJob.job.status} className="mt-1 w-full rounded-md border border-[var(--deshazo-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]">
                  <option>To Be Assigned</option>
                  <option>Assigned</option>
                  <option>Scheduled</option>
                  <option>In Progress</option>
                  <option>Needs Review</option>
                  <option>Hold</option>
                  <option>Tentative</option>
                </select>
              </label>
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)]">
                Job Number
                <input name="jobNumber" defaultValue={editingJob.job.jobNumber} className="mt-1 w-full rounded-md border border-[var(--deshazo-border)] px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]" />
              </label>
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)]">
                Project
                <select name="project" defaultValue={editingJob.job.project} className="mt-1 w-full rounded-md border border-[var(--deshazo-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]">
                  <option value="">None</option>
                  <option>Service</option>
                  <option>Service Labor</option>
                  <option>Inspection</option>
                  <option>Installations</option>
                  <option>Projects</option>
                  <option>Quarterly</option>
                </select>
              </label>
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)]">
                Duration
                <input name="duration" defaultValue={editingJob.job.duration} className="mt-1 w-full rounded-md border border-[var(--deshazo-border)] px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]" />
              </label>
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)]">
                Busy Time
                <div className="mt-1 grid grid-cols-[1fr_1.4fr] gap-2">
                  <input name="busyDays" type="number" min="0" defaultValue={editingJob.job.busyDays} className="w-full rounded-md border border-[var(--deshazo-border)] px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]" />
                  <input name="busyHours" defaultValue={editingJob.job.busyHours} className="w-full rounded-md border border-[var(--deshazo-border)] px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]" />
                </div>
              </label>
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)]">
                Utilization
                <div className="mt-1 flex overflow-hidden rounded-md border border-[var(--deshazo-border)]">
                  <input name="utilization" type="number" min="0" max="100" defaultValue={editingJob.job.utilization} className="w-full px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)] outline-none" />
                  <span className="flex items-center bg-[#24a35a] px-3 text-sm font-black text-white">%</span>
                </div>
              </label>
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)]">
                Customer
                <input value={editingJob.job.customer} readOnly className="mt-1 w-full rounded-md border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]" />
              </label>
              <div className="flex items-center gap-4 rounded-md border border-[var(--deshazo-border)] bg-[#f8fafc] px-3 py-2">
                <label className="inline-flex items-center gap-2 text-xs font-black uppercase text-[var(--deshazo-muted)]">
                  <input name="allDay" type="checkbox" defaultChecked={editingJob.job.allDay} className="h-5 w-5" />
                  All day
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-black uppercase text-[var(--deshazo-muted)]">
                  <input name="repeat" type="checkbox" defaultChecked={editingJob.job.repeat} className="h-5 w-5" />
                  Repeat
                </label>
              </div>
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)] md:col-span-2">
                Description
                <textarea name="description" defaultValue={editingJob.job.description} rows={3} className="mt-1 w-full rounded-md border border-[var(--deshazo-border)] px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]" />
              </label>
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)]">
                Office Note
                <textarea name="officeNote" defaultValue={editingJob.job.officeNote} rows={3} className="mt-1 w-full rounded-md border border-[var(--deshazo-border)] px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]" />
              </label>
              <label className="text-xs font-black uppercase text-[var(--deshazo-muted)]">
                Field Note
                <textarea name="fieldNote" defaultValue={editingJob.job.fieldNote} rows={3} className="mt-1 w-full rounded-md border border-[var(--deshazo-border)] px-3 py-2 text-sm font-semibold text-[var(--deshazo-text)]" />
              </label>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
