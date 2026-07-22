import { useMemo, useState } from 'react'

const sampleContent: Record<string, { title: string; subtitle: string; columns: string[]; rows: string[][] }> = {
  'quoting:Quote List': {
    title: 'Quote List',
    subtitle: 'Local sample quotes across all service locations',
    columns: ['Quote', 'Customer', 'Description', 'Location', 'Amount', 'Status'],
    rows: [
      ['Q-260184', 'Riverbend Steel', 'Bridge drive replacement', 'Richmond', '$38,450', 'Awaiting approval'],
      ['Q-260179', 'Apex Components', 'Annual inspection program', 'Cincinnati', '$14,820', 'Sent'],
      ['Q-260173', 'Harbor Paper Mill', 'Wire rope and drum service', 'Northeast', '$22,675', 'Approved'],
      ['Q-260168', 'Northline Foundry', 'Load test and commissioning', 'Richmond', '$51,200', 'Draft'],
      ['Q-260161', 'Summit Packaging', 'Pendant control modernization', 'Cincinnati', '$9,840', 'Approved'],
    ],
  },
  'green-files:Equipment Notebook': {
    title: 'Equipment Notebook',
    subtitle: 'Sample manuals and service knowledge — stored locally',
    columns: ['Document', 'Equipment', 'Manufacturer', 'Updated', 'Pages', 'Status'],
    rows: [
      ['SHB Owners Manual', 'Electric Chain Hoist', 'Harrington', '07/08/2026', '84', 'Indexed'],
      ['Bridge Crane Service Manual', 'Top-running bridge crane', 'Yale', '06/24/2026', '126', 'Indexed'],
      ['Bridge Crane Installation Guide', 'Workstation bridge crane', 'Gorbel', '05/19/2026', '72', 'Indexed'],
      ['WR-5 Parts & Maintenance', 'Wire rope hoist', 'Coffing', '04/30/2026', '98', 'Indexed'],
      ['IMPULSE Series 4', 'Variable frequency drive', 'Magnetek', '03/12/2026', '156', 'Indexed'],
    ],
  },
  'admin:Users': {
    title: 'Users', subtitle: 'Sample application users and permissions', columns: ['Name', 'Email', 'Role', 'Locations', 'Last active', 'Status'], rows: [
      ['Alex Morgan', 'alex.morgan@example.com', 'Regional Manager', 'All locations', 'Today, 8:42 AM', 'Active'],
      ['Taylor Morgan', 'taylor.morgan@example.com', 'Lead Technician', 'Richmond', 'Today, 7:03 AM', 'Active'],
      ['Ravi Patel', 'ravi.patel@example.com', 'Technician', 'Cincinnati', 'Yesterday, 4:18 PM', 'Active'],
      ['Dana Lewis', 'dana.lewis@example.com', 'Technician', 'Northeast', 'Yesterday, 3:51 PM', 'Active'],
    ],
  },
  'admin:Calendar Grouping': {
    title: 'Calendar Grouping', subtitle: 'Sample scheduling teams', columns: ['Group', 'Service location', 'Supervisor', 'Technicians', 'Color', 'Status'], rows: [
      ['Richmond Field Service', 'Richmond', 'Alex Morgan', '12', 'Navy', 'Active'], ['Cincinnati Inspection', 'Cincinnati', 'Jamie Chen', '8', 'Gold', 'Active'], ['Northeast Modernization', 'Northeast', 'Morgan Lee', '6', 'Green', 'Active'],
    ],
  },
  'admin:Insp. Points Manager': {
    title: 'Inspection Points Manager', subtitle: 'Sample crane inspection checklist library', columns: ['Inspection point', 'Category', 'Frequency', 'Required', 'Revision', 'Status'], rows: [
      ['Wire rope condition', 'Hoisting machinery', 'Every inspection', 'Yes', 'Rev. 8', 'Published'], ['Upper limit operation', 'Electrical', 'Every inspection', 'Yes', 'Rev. 5', 'Published'], ['Bridge wheel wear', 'Runway & bridge', 'Annual', 'Yes', 'Rev. 3', 'Published'], ['Pendant enclosure', 'Controls', 'Quarterly', 'No', 'Rev. 4', 'Published'],
    ],
  },
  'admin:Email Notifications': {
    title: 'Email Notifications', subtitle: 'Sample automated notification rules', columns: ['Rule', 'Trigger', 'Recipients', 'Delivery', 'Last sent', 'Status'], rows: [
      ['Inspection completed', 'Report finalized', 'Customer + service manager', 'Immediately', 'Today, 9:14 AM', 'Active'], ['Quote follow-up', 'Quote open for 7 days', 'Account owner', 'Weekdays, 8 AM', 'Yesterday', 'Active'], ['Parts received', 'All ordered parts received', 'Assigned crew', 'Immediately', 'Mon, 2:40 PM', 'Active'],
    ],
  },
  'admin:Trip dates without lead': {
    title: 'Trip Dates Without Lead', subtitle: 'Sample scheduling exceptions requiring attention', columns: ['Work order', 'Customer', 'Trip date', 'Location', 'Assigned crew', 'Action'], rows: [
      ['WO-10476', 'Summit Packaging', '07/23/2026', 'Cincinnati', '2 technicians', 'Assign lead'], ['WO-10469', 'Metro Fabrication', '07/25/2026', 'Richmond', '3 technicians', 'Assign lead'], ['WO-10461', 'Keystone Logistics', '07/28/2026', 'Northeast', '1 technician', 'Assign lead'],
    ],
  },
  'admin:Audit of Merged Locations': {
    title: 'Audit of Merged Locations', subtitle: 'Sample customer-location merge history', columns: ['Customer', 'Primary location', 'Merged location', 'Merged by', 'Date', 'Result'], rows: [
      ['Riverbend Steel', 'Plant 1 · Richmond', 'Richmond Main', 'Alex Morgan', '07/18/2026', 'Verified'], ['Apex Components', 'Cincinnati Campus', 'Plant 02', 'Jamie Chen', '07/11/2026', 'Verified'], ['Harbor Paper Mill', 'Newark Mill', 'Harbor East', 'Morgan Lee', '07/02/2026', 'Review'],
    ],
  },
}

export default function FullApplicationSamplePage({ itemKey }: { itemKey: string }) {
  const content = sampleContent[itemKey] || { title: itemKey.split(':')[1] || 'Sample Page', subtitle: 'Local sample application data', columns: ['Item', 'Owner', 'Updated', 'Status'], rows: [['Sample record', 'Alex Morgan', 'Today', 'Active']] }
  const [search, setSearch] = useState('')
  const filteredRows = useMemo(() => content.rows.filter((row) => row.join(' ').toLowerCase().includes(search.toLowerCase())), [content.rows, search])

  return (
    <div className="px-5 py-5 lg:px-7">
      <section className="overflow-hidden rounded-sm border border-[#d3dbea] bg-white shadow-[0_10px_28px_rgba(55,78,108,0.05)]">
        <header className="flex flex-col gap-4 border-b border-[#d3dbea] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><h1 className="text-[22px] font-semibold text-[var(--deshazo-text)]">{content.title}</h1><span className="rounded-full bg-[#e7efff] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[var(--deshazo-blue)]">Sample</span></div>
            <p className="mt-1 text-[12px] font-semibold text-[#747b8a]">{content.subtitle}</p>
          </div>
          <label className="relative block w-full sm:w-[330px]"><span className="sr-only">Search sample records</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sample records..." className="h-9 w-full rounded-md border border-[#c7d1e2] bg-white pl-3 pr-10 text-[12px] outline-none focus:border-[var(--deshazo-blue)]" /><span aria-hidden="true" className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-r-md bg-[#647688] text-white">⌕</span></label>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-[11px]">
            <thead className="bg-[#f5f7fa] text-[10px] font-black uppercase tracking-[0.04em] text-[#657184]"><tr>{content.columns.map((column) => <th key={column} className="border-b border-[#d3dbea] px-4 py-3">{column}</th>)}</tr></thead>
            <tbody>{filteredRows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-b border-[#e3e8f0] last:border-0 hover:bg-[#f8fbff]">{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className={`px-4 py-3 ${cellIndex === 0 ? 'font-black text-[var(--deshazo-blue)]' : 'font-semibold text-[#5f6978]'}`}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <footer className="flex items-center justify-between border-t border-[#d3dbea] bg-[#fbfcfe] px-5 py-3 text-[11px] font-semibold text-[#747b8a]"><span>{filteredRows.length} sample records</span><span>Local data only · No API connection</span></footer>
      </section>
    </div>
  )
}
