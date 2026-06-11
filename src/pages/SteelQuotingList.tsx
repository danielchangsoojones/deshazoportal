import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { supabase, isConfigured } from '../lib/supabase'

type SteelDimensionRow = {
  id: string
  measurement: string
  label: string
  page: string
  dimension: string
  notes: string
}

const mockDimensionRows: SteelDimensionRow[] = [
  {
    id: 'length',
    measurement: 'in.',
    label: 'Length',
    page: '',
    dimension: '94.00"',
    notes: 'Overall part length.',
  },
  {
    id: 'flat-blank-width',
    measurement: 'in.',
    label: 'Width (flat blank)',
    page: '',
    dimension: '14.85"',
    notes: 'Flat blank width before forming.',
  },
  {
    id: 'material-thickness',
    measurement: 'in.',
    label: 'Material thickness',
    page: '',
    dimension: '.079"',
    notes: 'Material thickness from the steel specification.',
  },
  {
    id: 'material',
    measurement: 'text',
    label: 'Material',
    page: '',
    dimension: 'MATERIAL .079 DOMEX 700MCE PER MS28356 SSAB PROCEDURE',
    notes: 'Material callout and governing procedure.',
  },
  {
    id: 'estimated-weight',
    measurement: 'lb.',
    label: 'Est. weight',
    page: '',
    dimension: '31.74',
    notes: 'Estimated part weight.',
  },
  {
    id: 'finished-cross-section',
    measurement: 'in.',
    label: 'Finished cross-section',
    page: '',
    dimension: '4.00" x 4.73"',
    notes: 'Finished formed cross-section size.',
  },
]

const defaultDimensionRows: SteelDimensionRow[] = mockDimensionRows.map((row) => ({
  ...row,
  dimension: '',
}))

export default function SteelQuotingList() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [pdfUrl, setPdfUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [dimensionRows, setDimensionRows] = useState<SteelDimensionRow[]>(defaultDimensionRows)
  const [extracting, setExtracting] = useState(false)
  const [message, setMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isConfigured || !supabase) {
      navigate('/quotelogin')
      return
    }

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate('/quotelogin')
      } else {
        setUser(data.user)
        setAuthLoading(false)
      }
    })
  }, [navigate])

  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    },
    [pdfUrl],
  )

  const updateDimensionRow = (rowId: string, updates: Partial<SteelDimensionRow>) => {
    setDimensionRows((currentRows) =>
      currentRows.map((row) => (row.id === rowId ? { ...row, ...updates } : row)),
    )
  }

  const addDimensionRow = () => {
    setDimensionRows((currentRows) => [
      ...currentRows,
      {
        id: `manual-dimension-${Date.now()}`,
        measurement: 'in.',
        label: 'Manual item',
        page: '1',
        dimension: '',
        notes: '',
      },
    ])
  }

  const deleteDimensionRow = (rowId: string) => {
    setDimensionRows((currentRows) => currentRows.filter((row) => row.id !== rowId))
  }

  const uploadPdf = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setMessage('Choose a PDF file.')
      return
    }

    setExtracting(true)
    setMessage('Loading mock steel dimensions.')
    setDimensionRows(defaultDimensionRows)
    setFileName(file.name)

    setPdfUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl)
      return URL.createObjectURL(file)
    })

    setDimensionRows(mockDimensionRows.map((row) => ({ ...row })))
    setMessage(`Loaded mock steel dimensions for ${file.name}.`)
    setExtracting(false)
  }

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#e8eaef] px-4">
        <div className="rounded-md border border-[#dfe4ef] bg-white px-6 py-4 text-sm font-black text-[#273f7a] shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
          Loading steel quoting...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#e8eaef] text-[#111]">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-[linear-gradient(90deg,#3cb9c5_0%,#7a35e8_100%)] px-4 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/steel-demo-dashboard')}
            className="text-[22px] font-black leading-none transition hover:text-white/80"
            aria-label="Home"
          >
            ⌂
          </button>
          <div className="hidden rounded-md border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold md:block">
            Steel Quoting
          </div>
        </div>

        <div className="text-sm font-black tracking-wide">Steel Quoting List</div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => {
              uploadPdf(event.currentTarget.files)
              event.currentTarget.value = ''
            }}
          />
          <button
            type="button"
            disabled={extracting}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md bg-white px-4 py-2 text-sm font-black text-[#35245f] transition hover:bg-[#f3efff] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {extracting ? 'Loading...' : 'Upload PDF'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/process')}
            className="rounded-md border border-white/30 bg-[#111827] px-4 py-2 text-sm font-black text-white transition hover:bg-[#243044]"
          >
            Done
          </button>
        </div>
      </header>

      <main className="grid h-[calc(100vh-56px)] min-h-0 grid-cols-1 overflow-hidden bg-[#f3f4f8] lg:grid-cols-[minmax(420px,1fr)_620px]">
        <section className="min-h-0 border-r border-[#d9dce5] bg-[#20242c]">
          {pdfUrl ? (
            <iframe
              key={pdfUrl}
              src={pdfUrl}
              title={fileName || 'Uploaded steel PDF'}
              className="h-full w-full border-0 bg-white"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div className="max-w-sm rounded-md border border-dashed border-white/25 bg-white/10 px-6 py-8 text-white">
                <p className="text-lg font-black">Upload a steel PDF</p>
                <p className="mt-2 text-sm font-semibold text-white/70">
                  The drawing preview will appear here.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-5 rounded-md bg-white px-4 py-2 text-sm font-black text-[#273f7a] transition hover:bg-[#edf2fb]"
                >
                  Choose PDF
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="min-h-0 overflow-y-auto bg-white">
          <div className="sticky top-0 z-10 border-b border-[#dfe4ef] bg-white px-5 py-4">
            <h1 className="text-[24px] font-black leading-tight text-[#1f2430]">Dimension List</h1>
            <p className="mt-1 text-[13px] font-semibold text-[#747b8a]">
              Fill in the steel takeoff fields, then use the PDF to verify each value.
            </p>
          </div>

          <div className="space-y-4 px-5 py-5">
            {message ? (
              <div className="rounded-md border border-[#cfd9ef] bg-[#f4f7ff] px-4 py-3 text-[13px] font-bold text-[#273f7a]">
                {message}
              </div>
            ) : null}

            {fileName ? (
              <section className="rounded-md border border-[#dfe4ef] bg-[#fbfcff] p-4">
                <h2 className="text-[13px] font-black uppercase text-[#273f7a]">Drawing Info</h2>
                <div className="mt-3 grid gap-2">
                  <div className="grid grid-cols-[92px_1fr] gap-3 text-sm">
                    <span className="font-black text-[#747b8a]">File</span>
                    <span className="min-w-0 break-words font-bold text-[#1f2430]">{fileName}</span>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="overflow-hidden rounded-md border border-[#dfe4ef]">
              <div className="flex items-center justify-between gap-3 border-b border-[#dfe4ef] bg-[#fbfcff] px-4 py-3">
                <div>
                  <h2 className="text-[15px] font-black text-[#1f2430]">Dimensions</h2>
                  <p className="mt-1 text-[12px] font-semibold text-[#747b8a]">
                    {extracting ? 'Reading...' : `${dimensionRows.length} takeoff item${dimensionRows.length === 1 ? '' : 's'}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addDimensionRow}
                  className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[#273f7a] transition hover:bg-[#edf2fb]"
                >
                  Add Row
                </button>
              </div>

              {dimensionRows.length > 0 ? (
                <div className="divide-y divide-[#edf0f6]">
                  <div className="grid grid-cols-[minmax(140px,1fr)_minmax(120px,0.65fr)_minmax(140px,0.9fr)_44px] gap-2 bg-white px-3 py-2 text-[11px] font-black uppercase text-[#747b8a]">
                    <span>Item</span>
                    <span>Measurement</span>
                    <span>Value</span>
                    <span />
                  </div>
                  {dimensionRows.map((row, index) => (
                    <div key={row.id} className="space-y-2 px-3 py-3">
                      <div className="grid grid-cols-[minmax(140px,1fr)_minmax(120px,0.65fr)_minmax(140px,0.9fr)_44px] gap-2">
                        <div className="flex min-h-10 min-w-0 items-center rounded-md border border-transparent bg-[#f7f9fc] px-3 text-sm font-black text-[#1f2430]">
                          <span className="min-w-0 break-words leading-snug">{row.label}</span>
                        </div>

                        <label className="sr-only" htmlFor={`dimension-measurement-${row.id}`}>
                          Measurement unit for dimension {index + 1}
                        </label>
                        <input
                          id={`dimension-measurement-${row.id}`}
                          type="text"
                          value={row.measurement}
                          onChange={(event) => updateDimensionRow(row.id, { measurement: event.currentTarget.value })}
                          placeholder="in."
                          className="h-10 min-w-0 rounded-md border border-[#cfd6e5] bg-white px-3 text-sm font-bold text-[#4d5360] outline-none focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                        />

                      <label className="sr-only" htmlFor={`dimension-value-${row.id}`}>
                        Value for dimension {index + 1}
                      </label>
                      <input
                        id={`dimension-value-${row.id}`}
                        type="text"
                        value={row.dimension}
                        onChange={(event) => updateDimensionRow(row.id, { dimension: event.currentTarget.value })}
                        className="h-10 min-w-0 rounded-md border border-[#cfd6e5] bg-white px-3 text-sm font-black text-[#1f2430] outline-none focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                      />

                      <button
                        type="button"
                        onClick={() => deleteDimensionRow(row.id)}
                        className="h-10 rounded-md border border-[#e2c8c0] bg-[#fff6f3] text-[16px] font-black text-[#a2472f] transition hover:bg-[#ffece6]"
                        aria-label={`Delete dimension ${index + 1}`}
                        title="Delete row"
                      >
                        x
                      </button>
                      </div>

                      <p className="rounded-md bg-[#fbfcff] px-3 py-2 text-[13px] font-semibold leading-5 text-[#5b606b]">
                        {row.notes}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-12 text-center text-sm font-semibold text-[#747b8a]">
                  {extracting ? 'Reading the PDF...' : 'Add a takeoff item to start.'}
                </div>
              )}
            </section>
          </div>
        </aside>
      </main>
    </div>
  )
}
