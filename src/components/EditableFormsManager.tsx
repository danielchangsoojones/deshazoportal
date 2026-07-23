import { useMemo, useState } from 'react'

type FieldType = 'Text' | 'Date' | 'Number' | 'Long text' | 'Checklist' | 'Signature'

type TemplateField = {
  id: number
  label: string
  section: string
  type: FieldType
  required: boolean
  x: number
  y: number
  width: number
  height: number
}

type CustomerForm = {
  id: string
  customer: string
  name: string
  category: string
  version: string
  description: string
  updated: string
  status: 'Published' | 'Draft'
  referenceImage: string
  pdfUrl: string
  fields: TemplateField[]
}

const workOrderFields: TemplateField[] = [
  { id: 1, label: 'Customer company', section: 'Customer and work order', type: 'Text', required: true, x: 7.5, y: 18.4, width: 39, height: 4.2 },
  { id: 2, label: 'Work order number', section: 'Customer and work order', type: 'Text', required: true, x: 50.5, y: 18.4, width: 20, height: 4.2 },
  { id: 3, label: 'Service date', section: 'Customer and work order', type: 'Date', required: true, x: 73.5, y: 18.4, width: 19, height: 4.2 },
  { id: 4, label: 'Service address', section: 'Customer and work order', type: 'Text', required: true, x: 7.5, y: 23.5, width: 39, height: 4.2 },
  { id: 5, label: 'Service performed', section: 'Service details', type: 'Long text', required: true, x: 7.5, y: 34.3, width: 85, height: 8.8 },
  { id: 6, label: 'Labor and materials', section: 'Labor and materials', type: 'Long text', required: false, x: 7.5, y: 50.5, width: 85, height: 11.5 },
  { id: 7, label: 'Technician signature', section: 'Authorization and totals', type: 'Signature', required: true, x: 7.5, y: 72.2, width: 36, height: 4.2 },
  { id: 8, label: 'Customer signature', section: 'Authorization and totals', type: 'Signature', required: true, x: 7.5, y: 80.4, width: 36, height: 4.2 },
]

const inspectionFields: TemplateField[] = [
  { id: 1, label: 'Carrier / company', section: 'Vehicle and inspector', type: 'Text', required: true, x: 7.5, y: 18.4, width: 39, height: 4.2 },
  { id: 2, label: 'Inspector', section: 'Vehicle and inspector', type: 'Text', required: true, x: 50.5, y: 18.4, width: 42, height: 4.2 },
  { id: 3, label: 'Vehicle number', section: 'Vehicle and inspector', type: 'Text', required: true, x: 7.5, y: 23.4, width: 20, height: 4.2 },
  { id: 4, label: 'VIN', section: 'Vehicle and inspector', type: 'Text', required: true, x: 31, y: 23.4, width: 39, height: 4.2 },
  { id: 5, label: 'Vehicle systems', section: 'Vehicle systems', type: 'Checklist', required: true, x: 7.5, y: 33.4, width: 85, height: 21 },
  { id: 6, label: 'Deficiencies and corrective action', section: 'Corrective action', type: 'Long text', required: false, x: 7.5, y: 58.2, width: 85, height: 10.8 },
  { id: 7, label: 'Inspector signature', section: 'Inspector certification', type: 'Signature', required: true, x: 7.5, y: 79.8, width: 39, height: 4.2 },
  { id: 8, label: 'Certification / qualification', section: 'Inspector certification', type: 'Text', required: true, x: 50.5, y: 79.8, width: 42, height: 4.2 },
]

const initialForms: CustomerForm[] = [
  {
    id: 'apex-vehicle-inspection', customer: 'Apex Components', name: 'Annual Periodic Vehicle Inspection', category: 'Fleet & DOT', version: 'v2.1',
    description: 'Apex vehicle condition checklist and inspector certification.', updated: 'Jul 22, 2026', status: 'Published', referenceImage: '/editable-forms/apex-components-annual-vehicle-inspection.png', pdfUrl: '/editable-forms/apex-components-annual-vehicle-inspection.pdf', fields: inspectionFields,
  },
  {
    id: 'deshazo-vehicle-inspection', customer: 'DeShazo Field Service Fleet', name: 'Annual Periodic Vehicle Inspection', category: 'Fleet & DOT', version: 'v2.4',
    description: 'DeShazo fleet-specific annual inspection intake.', updated: 'Jul 22, 2026', status: 'Published', referenceImage: '/editable-forms/deshazo-field-service-fleet-annual-vehicle-inspection.png', pdfUrl: '/editable-forms/deshazo-field-service-fleet-annual-vehicle-inspection.pdf', fields: inspectionFields.map((field) => ({ ...field, id: field.id + 20 })),
  },
  {
    id: 'northline-pm-work-order', customer: 'Northline Foundry', name: 'Preventative Maintenance Work Order', category: 'Service & Maintenance', version: 'v3.0',
    description: 'Northline service, materials, totals, and authorization form.', updated: 'Jul 20, 2026', status: 'Published', referenceImage: '/editable-forms/northline-foundry-preventative-maintenance-work-order.png', pdfUrl: '/editable-forms/northline-foundry-preventative-maintenance-work-order.pdf', fields: workOrderFields.map((field) => ({ ...field, id: field.id + 40 })),
  },
  {
    id: 'riverbend-pm-work-order', customer: 'Riverbend Steel', name: 'Preventative Maintenance Work Order', category: 'Service & Maintenance', version: 'v3.2',
    description: 'Riverbend technician intake, service lines, materials, totals, and customer authorization.', updated: 'Jul 22, 2026', status: 'Published', referenceImage: '/editable-forms/riverbend-steel-preventative-maintenance-work-order.png', pdfUrl: '/editable-forms/riverbend-steel-preventative-maintenance-work-order.pdf', fields: workOrderFields.map((field) => ({ ...field, id: field.id + 60 })),
  },
  {
    id: 'riverbend-vehicle-inspection', customer: 'Riverbend Steel', name: 'Annual Periodic Vehicle Inspection', category: 'Fleet & DOT', version: 'Draft 0.8',
    description: 'Riverbend fleet vehicle inspection format.', updated: 'Jul 21, 2026', status: 'Draft', referenceImage: '/editable-forms/riverbend-steel-annual-vehicle-inspection.png', pdfUrl: '/editable-forms/riverbend-steel-annual-vehicle-inspection.pdf', fields: inspectionFields.map((field) => ({ ...field, id: field.id + 80 })),
  },
  {
    id: 'summit-pm-work-order', customer: 'Summit Packaging', name: 'Preventative Maintenance Work Order', category: 'Service & Maintenance', version: 'v2.7',
    description: 'Summit maintenance work authorization and service intake.', updated: 'Jul 18, 2026', status: 'Published', referenceImage: '/editable-forms/summit-packaging-preventative-maintenance-work-order.png', pdfUrl: '/editable-forms/summit-packaging-preventative-maintenance-work-order.pdf', fields: workOrderFields.map((field) => ({ ...field, id: field.id + 100 })),
  },
]

export default function EditableFormsManager() {
  const [forms, setForms] = useState(initialForms)
  const [selectedId, setSelectedId] = useState(initialForms[0].id)
  const [selectedFieldId, setSelectedFieldId] = useState(initialForms[0].fields[0].id)
  const [search, setSearch] = useState('')
  const [directoryOpen, setDirectoryOpen] = useState(true)
  const [openCustomers, setOpenCustomers] = useState<Record<string, boolean>>(() => Object.fromEntries(initialForms.map((form) => [form.customer, true])))
  const [saved, setSaved] = useState(false)

  const selected = forms.find((form) => form.id === selectedId) ?? forms[0]
  const groupedForms = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = query ? forms.filter((form) => `${form.customer} ${form.name} ${form.category}`.toLowerCase().includes(query)) : forms
    const groups = filtered.reduce<Record<string, CustomerForm[]>>((result, form) => {
      result[form.customer] = [...(result[form.customer] ?? []), form]
      return result
    }, {})
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [forms, search])

  const updateSelected = (patch: Partial<CustomerForm>) => {
    setSaved(false)
    setForms((current) => current.map((form) => form.id === selected.id ? { ...form, ...patch } : form))
  }

  const updateField = (id: number, patch: Partial<TemplateField>) => {
    updateSelected({ fields: selected.fields.map((field) => field.id === id ? { ...field, ...patch } : field) })
  }

  const selectForm = (form: CustomerForm) => {
    setSelectedId(form.id)
    setSelectedFieldId(form.fields[0]?.id ?? 0)
    setSaved(false)
  }

  return (
    <div className="flex min-h-full flex-col bg-[#eaf0fb]">
      <header className="flex min-h-14 flex-wrap items-center gap-3 px-4 py-2 text-white shadow-md" style={{ backgroundColor: '#061849' }}>
        <div className="flex min-w-[240px] items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md border border-white/65 text-lg">▤</span>
          <div><h1 className="!text-[14px] !font-black !text-white">Editable Forms</h1><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">Customer template editor</p></div>
        </div>
        <div className="mx-auto rounded-md border border-white/15 bg-white/10 px-5 py-2 text-center text-[11px] font-black">{selected.customer} · {selected.name}</div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setSaved(true)} className="rounded-md border border-white/25 bg-white/10 px-5 py-2 text-[11px] font-black hover:bg-white/15">{saved ? 'Saved' : 'Save'}</button>
          <a href={selected.pdfUrl} download className="rounded-md bg-white px-4 py-2 text-[11px] font-black" style={{ color: '#061849' }}>Download PDF</a>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className={`shrink-0 border-r border-[#cbd5e4] bg-[#f8faff] transition-[width] duration-200 ${directoryOpen ? 'w-[286px]' : 'w-10'}`}>
          {directoryOpen ? <div className="h-full overflow-hidden">
            <div className="border-b border-[#d7dfeb] p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[14px] font-black text-[#202a38]">Customer Forms</h2>
                <button type="button" aria-label="Collapse form directory" onClick={() => setDirectoryOpen(false)} className="flex h-7 w-7 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-xl font-black leading-none text-[#4d6381] transition-colors hover:text-[#061849]">‹</button>
              </div>
              <p className="mt-1 text-[10px] font-semibold text-[#788395]">Each template belongs to one customer.</p>
              <label className="relative mt-3 block"><span className="sr-only">Search customers and forms</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customers or forms…" className="h-9 w-full rounded-md border border-[#c6d1e1] bg-white px-3 pr-9 text-[11px] font-semibold outline-none focus:border-[#5278bd]" /><span className="absolute right-3 top-2 text-[#738095]">⌕</span></label>
            </div>
            <div className="max-h-[calc(100vh-180px)] overflow-y-auto p-3">
              {groupedForms.map(([customer, customerForms]) => {
                const isOpen = search ? true : openCustomers[customer] !== false
                return (
                  <section key={customer} className="mb-2 overflow-hidden rounded-md border border-[#d8e0eb] bg-white">
                    <button type="button" onClick={() => setOpenCustomers((current) => ({ ...current, [customer]: !isOpen }))} className="flex w-full items-center gap-2 bg-[#f1f5fb] px-3 py-2.5 text-left">
                      <span className={`text-[10px] transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#e2eafa] text-[10px] font-black text-[#244c91]">{customer.slice(0, 2).toUpperCase()}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-black text-[#273344]">{customer}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black text-[#69788d]">{customerForms?.length ?? 0}</span>
                    </button>
                    <div className={`grid transition-[grid-template-rows] ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}><div className="overflow-hidden"><div className="border-l border-[#becbe0] py-1 pl-3 ml-6">
                      {(customerForms ?? []).map((form) => <button key={form.id} type="button" onClick={() => selectForm(form)} className={`my-1 flex w-[calc(100%-8px)] items-start gap-2 rounded-sm px-2 py-2 text-left ${selected.id === form.id ? 'bg-[#e1ebff] text-[#183f85]' : 'text-[#536173] hover:bg-[#f3f6fa]'}`}><span className="mt-0.5">▧</span><span className="min-w-0"><span className="block text-[10px] font-black leading-4">{form.name}</span><span className="block text-[9px] font-semibold opacity-70">{form.version} · {form.status}</span></span></button>)}
                    </div></div></div>
                  </section>
                )
              })}
            </div>
          </div> : <button type="button" aria-label="Open form directory" onClick={() => setDirectoryOpen(true)} className="flex h-12 w-full items-center justify-center border-0 bg-transparent p-0 text-xl font-black leading-none text-[#4d6381] transition-colors hover:text-[#061849]">›</button>}
        </aside>

        <main className="grid min-w-[890px] flex-1" style={{ gridTemplateColumns: 'minmax(560px, 1fr) 330px' }}>
          <PdfTemplateCanvas form={selected} selectedFieldId={selectedFieldId} onSelectField={setSelectedFieldId} />
          <FieldChecklist form={selected} selectedFieldId={selectedFieldId} onSelectField={setSelectedFieldId} onUpdateField={updateField} />
        </main>
      </div>
    </div>
  )
}

function FieldChecklist({ form, selectedFieldId, onSelectField, onUpdateField }: { form: CustomerForm; selectedFieldId: number; onSelectField: (id: number) => void; onUpdateField: (id: number, patch: Partial<TemplateField>) => void }) {
  const sections = useMemo(() => Array.from(new Set(form.fields.map((field) => field.section))), [form.fields])
  return (
    <section className="border-l border-[#cad5e4] bg-white">
      <header className="border-b border-[#dce3ed] p-4">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-[15px] font-black text-[#202a38]">Fields on this form</h2><p className="mt-1 text-[10px] font-semibold text-[#7d8898]">Select a field to locate it on the PDF. Check whether completion is required.</p></div><span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase ${form.status === 'Published' ? 'bg-[#dff3eb] text-[#216e56]' : 'bg-[#fff1cf] text-[#916814]'}`}>{form.status}</span></div>
        <div className="mt-3 rounded-md bg-[#f1f5fb] p-3"><p className="text-[9px] font-black uppercase tracking-wide text-[#718097]">Customer</p><p className="mt-1 text-[11px] font-black text-[#273344]">{form.customer}</p><p className="mt-1 text-[9px] font-semibold text-[#718097]">{form.version} · Updated {form.updated}</p></div>
      </header>
      <div className="max-h-[calc(100vh-190px)] overflow-y-auto p-4">
        {sections.map((section) => <section key={section} className="mb-5"><h3 className="mb-2 text-[9px] font-black uppercase tracking-[0.1em] text-[#244c91]">{section}</h3><div className="space-y-2">{form.fields.filter((field) => field.section === section).map((field) => <div key={field.id} onClick={() => onSelectField(field.id)} className={`cursor-pointer rounded-md border p-3 transition ${selectedFieldId === field.id ? 'border-[#6d94db] bg-[#edf3ff] shadow-sm' : 'border-[#dce3ed] bg-[#fbfcfe] hover:border-[#b7c6db]'}`}><div className="flex items-start gap-2"><span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black ${selectedFieldId === field.id ? 'bg-[#244c91] text-white' : 'bg-[#e5ecf8] text-[#244c91]'}`}>{form.fields.indexOf(field) + 1}</span><div className="min-w-0 flex-1"><p className="text-[11px] font-black text-[#2d3949]">{field.label}</p><p className="mt-0.5 text-[9px] font-semibold text-[#7a8798]">{field.type}</p></div><label onClick={(event) => event.stopPropagation()} className="flex items-center gap-1.5 text-[9px] font-black text-[#536173]"><input type="checkbox" checked={field.required} onChange={(event) => onUpdateField(field.id, { required: event.target.checked })} />Required</label></div></div>)}</div></section>)}
      </div>
    </section>
  )
}

function PdfTemplateCanvas({ form, selectedFieldId, onSelectField }: { form: CustomerForm; selectedFieldId: number; onSelectField: (id: number) => void }) {
  const [zoom, setZoom] = useState(100)
  const selectedField = form.fields.find((field) => field.id === selectedFieldId)
  return (
    <section className="relative min-w-0 overflow-auto bg-[#eaf0fb] px-6 pb-20 pt-5">
      <div className="sticky top-0 z-20 mx-auto mb-3 flex w-fit items-center gap-2 rounded-md border border-[#b9c7dc] bg-white/95 px-3 py-2 shadow-sm backdrop-blur"><button type="button" onClick={() => setZoom((value) => Math.max(70, value - 10))} className="h-7 w-7 rounded border border-[#cbd5e2] font-black">−</button><span className="min-w-14 text-center text-[10px] font-black text-[#536173]">{zoom}%</span><button type="button" onClick={() => setZoom((value) => Math.min(150, value + 10))} className="h-7 w-7 rounded border border-[#cbd5e2] font-black">+</button><span className="mx-1 h-5 w-px bg-[#d4dce8]" /><span className="text-[10px] font-bold text-[#536173]">{selectedField ? `${selectedField.section} · ${selectedField.label}` : 'Select a field'}</span></div>
      <div className="mx-auto origin-top bg-white shadow-[0_18px_50px_rgba(35,54,86,0.2)]" style={{ width: `${Math.round(720 * zoom / 100)}px` }}>
        <div className="relative w-full overflow-hidden border border-[#606b7a]" style={{ aspectRatio: '612 / 792' }}>
          <img src={form.referenceImage} alt={`${form.customer} ${form.name} PDF template`} className="absolute inset-0 h-full w-full object-fill" />
          {form.fields.map((field, index) => <button key={field.id} type="button" aria-label={`Select ${field.label}`} onClick={() => onSelectField(field.id)} className={`absolute flex items-start overflow-hidden rounded-[2px] border text-left transition ${selectedFieldId === field.id ? 'z-10 border-[#194fbb] bg-[#dbe8ff]/55 ring-2 ring-[#194fbb]/30' : 'border-dashed border-[#7898cc]/55 bg-transparent hover:bg-[#dbe8ff]/25'}`} style={{ left: `${field.x}%`, top: `${field.y}%`, width: `${field.width}%`, height: `${field.height}%` }}><span className={`m-0.5 flex h-4 min-w-4 items-center justify-center rounded-full text-[8px] font-black text-white ${selectedFieldId === field.id ? 'bg-[#194fbb]' : 'bg-[#7898cc]'}`}>{index + 1}</span>{selectedFieldId === field.id ? <span className="truncate px-1 py-0.5 text-[8px] font-black text-[#17233a]">{field.label}</span> : null}</button>)}
        </div>
      </div>
    </section>
  )
}
