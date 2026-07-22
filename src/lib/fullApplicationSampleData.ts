const locations = [
  { id: 32, name: 'Richmond', regionId: 1 },
  { id: 28, name: 'Cincinnati', regionId: 1 },
  { id: 17, name: 'Northeast', regionId: 2 },
]

const statuses = [
  { id: 1, name: 'Pending' },
  { id: 2, name: 'Scheduled' },
  { id: 3, name: 'In Progress' },
  { id: 4, name: 'Waiting for parts' },
  { id: 5, name: 'Completed' },
  { id: 6, name: 'Ready to Invoice' },
  { id: 7, name: 'Invoiced' },
]

const iso = (date: Date) => date.toISOString().slice(0, 10)
const addDays = (value: string, amount: number) => {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return iso(date)
}

const today = () => iso(new Date())

const employee = (id: number, firstName: string, lastName: string, preferredName?: string) => ({
  id,
  firstName,
  lastName,
  preferredName,
  isActive: true,
})

const technicians = [
  employee(201, 'Taylor', 'Morgan', 'Taylor'),
  employee(202, 'Ravi', 'Patel', 'Ravi'),
  employee(203, 'Dana', 'Lewis', 'Dana'),
  employee(204, 'Sam', 'Nguyen', 'Sam'),
  employee(205, 'Jordan', 'Brooks', 'Jordan'),
]

function makeWorkOrder(index: number) {
  const status = statuses[index % 5]
  const location = locations[index % locations.length]
  const customers = ['Riverbend Steel', 'Apex Components', 'Harbor Paper Mill', 'Northline Foundry', 'Summit Packaging', 'Blue Ridge Foods']
  const cities = [
    ['Richmond', 'VA', '23224'],
    ['Cincinnati', 'OH', '45202'],
    ['Newark', 'NJ', '07102'],
  ]
  const tech = technicians[index % technicians.length]
  const startDate = addDays(today(), (index % 9) - 4)
  const id = 10482 - index
  return {
    id,
    jobNo: `WO-${id}`,
    jobType: ['Inspection', 'Service Call', 'Installation', 'Warranty'][index % 4],
    customerWorkOrder: { customerName: customers[index % customers.length] },
    customerLocation: {
      shipToAddress1: `${120 + index * 17} Industrial Parkway`,
      shipToCity: cities[index % 3][0],
      shipToState: cities[index % 3][1],
      shipToZipCode: cities[index % 3][2],
    },
    svcCommentText: ['Annual OSHA inspection and preventive maintenance', 'Replace bridge drive and verify alignment', 'Troubleshoot intermittent hoist fault', 'Perform load test and commissioning'][index % 4],
    comment: 'Coordinate arrival with the maintenance supervisor. PPE and site orientation are required.',
    serviceLocation: location,
    serviceLocationId: location.id,
    startDate,
    endDate: addDays(startDate, index % 3),
    customerPONo: `PO-SAMPLE-${4100 + index}`,
    quotedJob: index % 2 === 0,
    isNewTimeEntry: true,
    createdAt: `${addDays(startDate, -5)}T13:30:00.000Z`,
    status,
    statusLog: statuses.slice(0, Math.min(status.id, 5)).map((entry, logIndex) => ({
      status: entry,
      createdAt: `${addDays(startDate, logIndex - 4)}T14:15:00.000Z`,
      author: { firstName: 'Alex', lastName: 'Supervisor' },
    })),
    workOrderTrips: [{
      id: 7000 + index,
      tripNumber: 1,
      startDate,
      endDate: addDays(startDate, index % 3),
      workOrderEmployees: [{
        id: 8000 + index,
        isLead: true,
        disabledAt: null,
        employee: tech,
        employeeWorkDays: [{
          id: 9000 + index,
          date: startDate,
          isLeadDay: true,
          hours: 8,
          overtimeHours: index % 3 === 0 ? 1.5 : 0,
          workTimes: [{ id: 10000 + index, hours: 8, overtimeHours: index % 3 === 0 ? 1.5 : 0, startTime: '07:00', endTime: '15:30', note: 'Inspection, adjustment, and operational testing completed.' }],
          jsa: { status: 'Approved', updatedAt: `${startDate}T12:05:00.000Z`, author: { firstName: tech.firstName, lastName: tech.lastName } },
          jsaAnswers: [
            { id: 1, answer: 'Yes', jsaItem: { id: 1, content: 'Energy sources identified and locked out?' }, author: { firstName: tech.firstName, lastName: tech.lastName } },
            { id: 2, answer: 'Yes', jsaItem: { id: 2, content: 'Work area barricaded and access controlled?' }, author: { firstName: tech.firstName, lastName: tech.lastName } },
          ],
          materialsOrdered: [{ id: 1, received: true, material: { name: 'Pendant strain relief' }, quantity: 1 }],
          workOrderMaterials: [{ id: 1, material: { name: 'Electrical contact cleaner' }, quantity: 2, note: 'Used during service' }],
          workOrderServiceNotes: [{ id: 1, note: 'Crane returned to service. Customer reviewed completed work.' }],
          attachments: [{ id: 1, name: 'Completed inspection checklist.pdf', fileName: 'sample-inspection.pdf' }],
          signatureCustomerName: 'Morgan Ellis',
          signatureDate: `${startDate}T20:30:00.000Z`,
          updatedAt: `${startDate}T20:30:00.000Z`,
        }],
      }],
    }],
    workOrderCranes: [{ id: 6000 + index, crane: { id: 5000 + index, ContactCode: `CR-${String(index + 14).padStart(3, '0')}`, description: ['10 Ton Bridge Crane', '5 Ton Monorail Hoist', '20 Ton Double Girder Crane'][index % 3] } }],
    customerContacts: [{ id: 1, name: 'Morgan Ellis', email: 'morgan.ellis@example.com', phone: '(555) 014-2280' }],
    postContract: {
      id: 1,
      note: 'Work completed to customer satisfaction. Equipment returned to normal operation.',
      signatureName: 'Morgan Ellis',
      signatureDate: `${startDate}T20:30:00.000Z`,
      postContractQuestions: [
        { id: 1, name: 'Was the work completed?', postContractAnswer: { answer: 'Yes' } },
        { id: 2, name: 'Was the work area left clean?', postContractAnswer: { answer: 'Yes' } },
      ],
    },
  }
}

const workOrders = Array.from({ length: 28 }, (_, index) => makeWorkOrder(index))

const customers = ['Riverbend Steel', 'Apex Components', 'Harbor Paper Mill', 'Northline Foundry', 'Summit Packaging', 'Blue Ridge Foods', 'Metro Fabrication', 'Keystone Logistics', 'Pioneer Automotive', 'Crescent Manufacturing'].map((customerName, index) => ({
  id: 3000 + index,
  customerName,
  customerNo: `C-${String(18020 + index).padStart(6, '0')}`,
  locations: Array.from({ length: 1 + (index % 3) }, (_, locationIndex) => ({ id: 4000 + index * 10 + locationIndex })),
  craneCustomer: Array.from({ length: 2 + (index % 5) }, (_, craneIndex) => ({ id: 5000 + index * 10 + craneIndex })),
  workOrders: workOrders.filter((_, workOrderIndex) => workOrderIndex % 10 === index).map((workOrder) => ({ id: workOrder.id, serviceLocationId: workOrder.serviceLocationId })),
}))

const cranes = Array.from({ length: 18 }, (_, index) => ({
  id: 5000 + index,
  ContactCode: `CR-${String(index + 14).padStart(3, '0')}`,
  customer: { customerName: customers[index % customers.length].customerName },
  customerLocation: workOrders[index % workOrders.length].customerLocation,
  UDF_EQ_DESCR: ['10 Ton Bridge Crane', '5 Ton Monorail Hoist', '20 Ton Double Girder Crane', '2 Ton Jib Crane'][index % 4],
  UDF_EQ_LOC: ['Bay 1', 'Shipping', 'Melt Shop', 'Assembly Line'][index % 4],
  craneAttachments: [{ id: index + 1, contentUrl: '/sample-inspection.pdf' }],
  serviceStatus: index % 7 === 0 ? 'OUT_OF_SERVICE' : 'IN_SERVICE',
  workOrderCranes: Array.from({ length: 1 + (index % 4) }, (_, item) => ({ id: index * 10 + item })),
}))

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function paginate<T>(values: T[], url: URL) {
  const pageSize = Math.max(1, Number(url.searchParams.get('pageSize')) || 25)
  const page = Math.max(0, Number(url.searchParams.get('page')) || 0)
  return { data: values.slice(page * pageSize, (page + 1) * pageSize), count: values.length, totalPages: Math.max(1, Math.ceil(values.length / pageSize)) }
}

function sampleSchedules(url: URL) {
  const start = url.searchParams.get('startDate') || today()
  const resources = technicians.map((tech, index) => ({ id: tech.id, title: `${tech.preferredName} ${tech.lastName}`, group: locations[index % 3].name, serviceLocationName: locations[index % 3].name }))
  const events = workOrders.slice(0, 12).map((workOrder, index) => ({
    id: `sample-event-${index}`,
    resourceId: technicians[index % technicians.length].id,
    title: `${workOrder.jobNo} · ${workOrder.customerWorkOrder.customerName}`,
    start: `${addDays(start, index % 7)}T${index % 2 ? '08:00' : '07:00'}:00`,
    end: `${addDays(start, index % 7)}T${index % 2 ? '15:00' : '13:30'}:00`,
    backgroundColor: ['#fd7e14', '#fdb914', '#3b8c6b', '#c3b1e1'][index % 4],
    tooltipData: { employeeName: `${technicians[index % technicians.length].preferredName} ${technicians[index % technicians.length].lastName}`, customerName: workOrder.customerWorkOrder.customerName, location: workOrder.customerLocation.shipToCity, workOrderTrip: { id: workOrder.workOrderTrips[0].id, tripNumber: 1, startDate: workOrder.startDate, endDate: workOrder.endDate, workOrderId: workOrder.id, workOrder } },
  }))
  return { resources, events }
}

export function isFullApplicationSampleRoute() {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/full-application-sample')
}

export async function getFullApplicationSampleResponse(path: string): Promise<Response> {
  const url = new URL(path, 'https://sample.deshazo.local')
  const pathname = url.pathname
  if (pathname === '/auth/w/validate') return json({ id: 'sample-user', firstName: 'Alex', lastName: 'Morgan', email: 'sample@deshazo.com', roleId: 1, role: { id: 1, name: 'Regional Manager · Sample' } })
  if (pathname === '/auth/logout') return json({ ok: true })
  if (pathname === '/service-locations') return json({ data: locations })
  if (pathname === '/work-order-status') return json(statuses)
  if (pathname === '/work-orders/count') return json({ pending: 6, scheduled: 7, waitingOnParts: 4, inProgress: 5 })
  if (/^\/work-orders\/\d+$/.test(pathname)) {
    const id = Number(pathname.split('/').pop())
    return json(workOrders.find((workOrder) => workOrder.id === id) || workOrders[0])
  }
  if (pathname === '/work-orders') {
    const craneId = Number(url.searchParams.get('craneId'))
    if (craneId) return json(workOrders.slice(craneId % 4, (craneId % 4) + 3))
    const statusId = Number(url.searchParams.get('statusId'))
    const search = (url.searchParams.get('search') || '').toLowerCase()
    let values = statusId ? workOrders.filter((workOrder) => workOrder.status.id === statusId) : workOrders
    if (search) values = values.filter((workOrder) => JSON.stringify(workOrder).toLowerCase().includes(search))
    return json(paginate(values, url))
  }
  if (pathname === '/crane-inspections') return json([{ id: 1, workOrderCraneId: 6000, status: 'Complete', type: 'OSHA Periodic', employeeWorkDay: { workOrderEmployee: { employee: technicians[0] } } }])
  if (pathname === '/schedules') return json(sampleSchedules(url))
  if (pathname === '/customers') return json(paginate(customers.filter((customer) => customer.customerName.toLowerCase().includes((url.searchParams.get('search') || '').toLowerCase())), url))
  if (pathname === '/cranes') return json(paginate(cranes.filter((crane) => JSON.stringify(crane).toLowerCase().includes((url.searchParams.get('search') || '').toLowerCase())), url))
  if (pathname === '/recurring-work-orders') return json(paginate(customers.slice(0, 8).map((customer, index) => ({ id: 1100 + index, type: index % 2 ? 'QUARTERLY' : 'MONTHLY', customer: { customerName: customer.customerName }, customerLocation: { shipToAddress1: `${200 + index * 12} Commerce Drive` }, serviceLocation: locations[index % 3], recurringWorkOrders: Array.from({ length: index % 2 ? 4 : 12 }, (_, period) => ({ id: 12000 + index * 20 + period, month: index % 2 ? undefined : period + 1, quarter: index % 2 ? period + 1 : undefined, workOrderId: workOrders[(index + period) % workOrders.length].id, workOrder: workOrders[(index + period) % workOrders.length] })) })), url))
  if (pathname === '/reports/payroll') return json(technicians.map((tech, index) => ({ id: tech.id, firstName: tech.firstName, lastName: tech.lastName, approvedBy: 'Alex Morgan', payRoll: Array.from({ length: 5 }, (_, day) => ({ date: addDays(url.searchParams.get('weekStart') || today(), day), REG: 8, OT: day === 4 ? 1.5 : 0, PTO: { reg: index === 4 && day === 2 ? 8 : 0 }, SHOP: { reg: day === 0 ? 1 : 0 }, TRAINING: { reg: day === 3 && index === 2 ? 2 : 0 } })), weeklyPayroll: { REG: 40, OT: 1.5, PTO: { reg: index === 4 ? 8 : 0 }, SHOP: { reg: 1 }, TRAINING: { reg: index === 2 ? 2 : 0 }, REG_APPROVAL: 40, OT_APPROVAL: 1.5 } })))
  if (pathname === '/reports/daily-worktime') return json({ employeeNames: Object.fromEntries(technicians.map((tech) => [tech.id, `${tech.preferredName} ${tech.lastName}`])), employeesData: Object.fromEntries(technicians.map((tech, index) => [tech.id, [{ employeeId: tech.id, workOrderId: workOrders[index].id, type: 'Job', regHours: 7.5, otHours: index % 2 ? 1 : 0, startTime: '07:00', endTime: '15:30' }, { employeeId: tech.id, type: 'Shop', regHours: 0.5, otHours: 0, startTime: '15:30', endTime: '16:00' }]])), workOrderLabels: Object.fromEntries(workOrders.slice(0, 5).map((workOrder) => [workOrder.id, `${workOrder.jobNo} · ${workOrder.customerWorkOrder.customerName}`])), rawOtherTimes: [] })
  if (pathname === '/reports/recovery') {
    const people = technicians.map((tech, index) => ({ employeeName: `${tech.preferredName} ${tech.lastName}`, job: 132 + index * 8, shop: 8 + index, warranty: index % 3, total: 144 + index * 8, weekOrder: index + 1 }))
    return json([{ regionName: 'Eastern Region', locations: locations.map((location, index) => ({ locationName: location.name, employees: people.slice(index, index + 3), totals: { headCount: 3, jobTime: 420 - index * 18, idleTime: 22 + index * 3, warrantyTime: 6, total: 448, hrsWeek: 40 } })) }])
  }
  if (pathname === '/reports/daily-usage') {
    const start = url.searchParams.get('startDate') || today()
    return json({ 'Total Techs': 38, 'Total Work Orders': 64, 'Active App Users': 34, 'Inactive App Users': 4, 'Techs with a Closed Work Day': 31, 'Techs with Work Time': 35, 'Techs with Non-Job time': 12, 'Opened Work Orders': 29, 'Closed Work Orders': 24, 'Active Work Orders': 47, 'Active App Users Per Date': Object.fromEntries(Array.from({ length: 7 }, (_, index) => [addDays(start, index), { active: 27 + (index % 4) * 2, total: 38 }])) })
  }
  if (pathname === '/reports/pay-cor') return json(technicians.flatMap((tech, index) => Array.from({ length: 5 }, (_, day) => ({ employeeId: tech.id, employeeName: `${tech.preferredName} ${tech.lastName}`, date: addDays(url.searchParams.get('weekStart') || today(), day), department: locations[index % 3].name, departments: { [workOrders[index].jobNo]: locations[index % 3].name }, jobNumber: [workOrders[index].jobNo], PTO: { reg: index === 4 && day === 2 ? 8 : 0 }, BER: { reg: 0 }, JURY: { reg: 0 }, TRAINING: { reg: index === 2 && day === 3 ? 2 : 0 }, LUNCH: { reg: 0.5 }, IS_CALIFORNIA_PAYROLL: index === 1 }))))
  if (pathname === '/reports/job-cost') return json(technicians.flatMap((tech, techIndex) => Array.from({ length: 5 }, (_, day) => { const job = workOrders[techIndex].jobNo; return { date: addDays(url.searchParams.get('weekStart') || today(), day), employeeId: String(tech.id), employeeName: `${tech.preferredName} ${tech.lastName}`, jobNumber: [job], departments: { [job]: locations[techIndex % 3].name }, serviceLocationEmployee: [{ serviceLocationId: locations[techIndex % 3].id, serviceLocation: { name: locations[techIndex % 3].name } }], regHours: { [job]: 8 }, otHours: { [job]: day === 4 ? 1.5 : 0 }, dtHours: { [job]: 0 }, isCaliforniaPayroll: false } })))
  return json({ message: `No sample fixture for ${pathname}` }, 404)
}
