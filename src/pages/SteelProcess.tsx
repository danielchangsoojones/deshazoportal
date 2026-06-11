import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

type SecondaryProcess = {
  id: string
  name: string
  setupMinutes: number
  secondsPerPart: number
  quantity: number
}

const defaultSecondaryProcesses: SecondaryProcess[] = [
  { id: 'deburr', name: 'Deburr', setupMinutes: 6, secondsPerPart: 45, quantity: 1 },
  { id: 'inspect', name: 'Inspection', setupMinutes: 3, secondsPerPart: 30, quantity: 1 },
  { id: 'pack', name: 'Pack and stage', setupMinutes: 5, secondsPerPart: 40, quantity: 1 },
]

function toNumber(value: string) {
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : 0
}

function formatMinutes(value: number) {
  return `${value.toFixed(2)} min`
}

export default function SteelProcess() {
  const navigate = useNavigate()
  const [machine, setMachine] = useState('Press brake')
  const [quantity, setQuantity] = useState(1)
  const [setupMinutes, setSetupMinutes] = useState(12)
  const [cycleSeconds, setCycleSeconds] = useState(95)
  const [secondaryProcesses, setSecondaryProcesses] = useState<SecondaryProcess[]>(defaultSecondaryProcesses)

  const firstProcessMinutes = useMemo(
    () => setupMinutes + (cycleSeconds * quantity) / 60,
    [cycleSeconds, quantity, setupMinutes],
  )

  const secondaryTotalMinutes = useMemo(
    () =>
      secondaryProcesses.reduce(
        (total, process) => total + process.setupMinutes + (process.secondsPerPart * process.quantity) / 60,
        0,
      ),
    [secondaryProcesses],
  )

  const totalMinutes = firstProcessMinutes + secondaryTotalMinutes

  const updateSecondaryProcess = (processId: string, updates: Partial<SecondaryProcess>) => {
    setSecondaryProcesses((currentProcesses) =>
      currentProcesses.map((process) => (process.id === processId ? { ...process, ...updates } : process)),
    )
  }

  const addSecondaryProcess = () => {
    setSecondaryProcesses((currentProcesses) => [
      ...currentProcesses,
      {
        id: `secondary-${Date.now()}`,
        name: 'Secondary process',
        setupMinutes: 0,
        secondsPerPart: 0,
        quantity,
      },
    ])
  }

  const deleteSecondaryProcess = (processId: string) => {
    setSecondaryProcesses((currentProcesses) => currentProcesses.filter((process) => process.id !== processId))
  }

  return (
    <div className="min-h-screen bg-[#e8eaef] text-[#111]">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-[linear-gradient(90deg,#3cb9c5_0%,#7a35e8_100%)] px-4 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/steel-quoting-list')}
            className="text-[22px] font-black leading-none transition hover:text-white/80"
            aria-label="Back to steel quoting list"
          >
            ‹
          </button>
          <div className="hidden rounded-md border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold md:block">
            Process
          </div>
        </div>

        <div className="text-sm font-black tracking-wide">Steel Machine Time</div>

        <button
          type="button"
          onClick={() => navigate('/steel-demo-dashboard')}
          className="rounded-md bg-white px-4 py-2 text-sm font-black text-[#35245f] transition hover:bg-[#f3efff]"
        >
          Dashboard
        </button>
      </header>

      <main className="mx-auto grid w-full max-w-[1180px] gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-5">
          <section className="overflow-hidden rounded-md border border-[#dfe4ef] bg-white shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
            <div className="border-b border-[#dfe4ef] bg-[#fbfcff] px-5 py-4">
              <h1 className="text-[24px] font-black text-[#1f2430]">First Process</h1>
              <p className="mt-1 text-[13px] font-semibold text-[#747b8a]">
                Main steel machine operation time.
              </p>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-black text-[#1f2430]">
                Machine
                <select
                  value={machine}
                  onChange={(event) => setMachine(event.currentTarget.value)}
                  className="h-10 rounded-md border border-[#cfd6e5] bg-white px-3 text-sm font-bold outline-none focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                >
                  <option>Press brake</option>
                  <option>Laser cutter</option>
                  <option>Plasma table</option>
                  <option>Roll former</option>
                  <option>Saw</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-black text-[#1f2430]">
                Quantity
                <input
                  type="number"
                  min="0"
                  value={quantity}
                  onChange={(event) => setQuantity(toNumber(event.currentTarget.value))}
                  className="h-10 rounded-md border border-[#cfd6e5] bg-white px-3 text-sm font-bold outline-none focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                />
              </label>

              <label className="grid gap-2 text-sm font-black text-[#1f2430]">
                Setup minutes
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={setupMinutes}
                  onChange={(event) => setSetupMinutes(toNumber(event.currentTarget.value))}
                  className="h-10 rounded-md border border-[#cfd6e5] bg-white px-3 text-sm font-bold outline-none focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                />
              </label>

              <label className="grid gap-2 text-sm font-black text-[#1f2430]">
                Seconds per part
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={cycleSeconds}
                  onChange={(event) => setCycleSeconds(toNumber(event.currentTarget.value))}
                  className="h-10 rounded-md border border-[#cfd6e5] bg-white px-3 text-sm font-bold outline-none focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                />
              </label>
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-[#dfe4ef] bg-white shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
            <div className="flex items-center justify-between gap-3 border-b border-[#dfe4ef] bg-[#fbfcff] px-5 py-4">
              <div>
                <h2 className="text-[20px] font-black text-[#1f2430]">Secondary Processes</h2>
                <p className="mt-1 text-[13px] font-semibold text-[#747b8a]">
                  Extra handling, finishing, and quality steps.
                </p>
              </div>
              <button
                type="button"
                onClick={addSecondaryProcess}
                className="rounded-md border border-[#bdc4d3] bg-white px-3 py-2 text-[12px] font-black text-[#273f7a] transition hover:bg-[#edf2fb]"
              >
                Add Process
              </button>
            </div>

            <div className="divide-y divide-[#edf0f6]">
              <div className="grid grid-cols-[minmax(140px,1fr)_90px_110px_90px_44px] gap-2 px-4 py-2 text-[11px] font-black uppercase text-[#747b8a]">
                <span>Process</span>
                <span>Setup</span>
                <span>Sec/part</span>
                <span>Total</span>
                <span />
              </div>

              {secondaryProcesses.map((process) => {
                const processMinutes = process.setupMinutes + (process.secondsPerPart * process.quantity) / 60

                return (
                  <div
                    key={process.id}
                    className="grid grid-cols-[minmax(140px,1fr)_90px_110px_90px_44px] gap-2 px-4 py-3"
                  >
                    <input
                      type="text"
                      value={process.name}
                      onChange={(event) => updateSecondaryProcess(process.id, { name: event.currentTarget.value })}
                      className="h-10 min-w-0 rounded-md border border-[#cfd6e5] bg-white px-3 text-sm font-black text-[#1f2430] outline-none focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={process.setupMinutes}
                      onChange={(event) => updateSecondaryProcess(process.id, { setupMinutes: toNumber(event.currentTarget.value) })}
                      className="h-10 min-w-0 rounded-md border border-[#cfd6e5] bg-white px-2 text-sm font-bold text-[#1f2430] outline-none focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                    />
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={process.secondsPerPart}
                      onChange={(event) => updateSecondaryProcess(process.id, { secondsPerPart: toNumber(event.currentTarget.value) })}
                      className="h-10 min-w-0 rounded-md border border-[#cfd6e5] bg-white px-2 text-sm font-bold text-[#1f2430] outline-none focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                    />
                    <div className="flex h-10 items-center rounded-md bg-[#f7f9fc] px-2 text-sm font-black text-[#273f7a]">
                      {formatMinutes(processMinutes)}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteSecondaryProcess(process.id)}
                      className="h-10 rounded-md border border-[#e2c8c0] bg-[#fff6f3] text-[16px] font-black text-[#a2472f] transition hover:bg-[#ffece6]"
                      aria-label={`Delete ${process.name}`}
                      title="Delete process"
                    >
                      x
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        </section>

        <aside className="h-fit rounded-md border border-[#dfe4ef] bg-white p-5 shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
          <h2 className="text-[20px] font-black text-[#1f2430]">Time Summary</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-md bg-[#fbfcff] px-4 py-3">
              <p className="text-[11px] font-black uppercase text-[#747b8a]">First process</p>
              <p className="mt-1 text-2xl font-black text-[#273f7a]">{formatMinutes(firstProcessMinutes)}</p>
              <p className="mt-1 text-[12px] font-semibold text-[#747b8a]">{machine}</p>
            </div>
            <div className="rounded-md bg-[#fbfcff] px-4 py-3">
              <p className="text-[11px] font-black uppercase text-[#747b8a]">Secondary processes</p>
              <p className="mt-1 text-2xl font-black text-[#273f7a]">{formatMinutes(secondaryTotalMinutes)}</p>
            </div>
            <div className="rounded-md border-2 border-[#273f7a] bg-[#f4f7ff] px-4 py-3">
              <p className="text-[11px] font-black uppercase text-[#273f7a]">Total machine time</p>
              <p className="mt-1 text-3xl font-black text-[#1f2430]">{formatMinutes(totalMinutes)}</p>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}
