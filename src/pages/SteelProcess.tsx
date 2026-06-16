import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { steelProcessMenuItemsStorageKey, type SteelProcessMenuItemsPayload } from '../lib/steelProcessMenuItems'

type OperationType = 'Primary' | 'Secondary'

type OperationPreset = {
  operation: string
  type: OperationType
  machine: string
  setupMinutes: number
  cycleSeconds: number
  machineRate: number
  laborRate: number
  basis: string
}

type RoutingStep = OperationPreset & {
  id: string
  quantity: number
}

const operationPresets: OperationPreset[] = [
  {
    operation: 'Laser',
    type: 'Primary',
    machine: 'Fiber laser table',
    setupMinutes: 18,
    cycleSeconds: 72,
    machineRate: 175,
    laborRate: 68,
    basis: 'cut profile',
  },
  {
    operation: 'Plasma',
    type: 'Primary',
    machine: 'CNC plasma table',
    setupMinutes: 20,
    cycleSeconds: 95,
    machineRate: 145,
    laborRate: 64,
    basis: 'cut profile',
  },
  {
    operation: 'Saw',
    type: 'Primary',
    machine: 'Structural band saw',
    setupMinutes: 12,
    cycleSeconds: 58,
    machineRate: 92,
    laborRate: 62,
    basis: 'linear cut',
  },
  {
    operation: 'Press Brake',
    type: 'Primary',
    machine: '350 ton press brake',
    setupMinutes: 22,
    cycleSeconds: 110,
    machineRate: 128,
    laborRate: 70,
    basis: 'bend sequence',
  },
  {
    operation: 'Drill',
    type: 'Secondary',
    machine: 'Mag drill station',
    setupMinutes: 10,
    cycleSeconds: 42,
    machineRate: 82,
    laborRate: 66,
    basis: 'holes',
  },
  {
    operation: 'Deburr',
    type: 'Secondary',
    machine: 'Deburr bench',
    setupMinutes: 6,
    cycleSeconds: 45,
    machineRate: 52,
    laborRate: 58,
    basis: 'edges',
  },
  {
    operation: 'Welding',
    type: 'Secondary',
    machine: 'MIG weld bay',
    setupMinutes: 15,
    cycleSeconds: 180,
    machineRate: 88,
    laborRate: 76,
    basis: 'weld inches',
  },
  {
    operation: 'Inspect',
    type: 'Secondary',
    machine: 'Final inspection',
    setupMinutes: 4,
    cycleSeconds: 28,
    machineRate: 35,
    laborRate: 62,
    basis: 'pieces',
  },
  {
    operation: 'Pack',
    type: 'Secondary',
    machine: 'Pack and stage',
    setupMinutes: 5,
    cycleSeconds: 40,
    machineRate: 28,
    laborRate: 54,
    basis: 'shipment',
  },
]

const initialRouting: RoutingStep[] = [
  { ...operationPresets[0], id: 'route-laser', quantity: 24 },
  { ...operationPresets[4], id: 'route-drill', quantity: 96 },
  { ...operationPresets[5], id: 'route-deburr', quantity: 24 },
  { ...operationPresets[7], id: 'route-inspect', quantity: 24 },
  { ...operationPresets[8], id: 'route-pack', quantity: 1 },
]

function toNumber(value: string) {
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : 0
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatHours(value: number) {
  return `${value.toFixed(2)} hr`
}

function calculateStepHours(step: RoutingStep) {
  return step.setupMinutes / 60 + (step.cycleSeconds * step.quantity) / 3600
}

function calculateStepCost(step: RoutingStep) {
  return calculateStepHours(step) * (step.machineRate + step.laborRate)
}

export default function SteelProcess() {
  const navigate = useNavigate()
  const [quantity, setQuantity] = useState(24)
  const [weightPerPiece, setWeightPerPiece] = useState(31.74)
  const [materialCostPerLb, setMaterialCostPerLb] = useState(2.18)
  const [scrapPercent, setScrapPercent] = useState(8)
  const [overheadPercent, setOverheadPercent] = useState(14)
  const [marginPercent, setMarginPercent] = useState(22)
  const [routing, setRouting] = useState<RoutingStep[]>(initialRouting)

  const estimate = useMemo(() => {
    const materialWeight = quantity * weightPerPiece
    const scrapCost = materialWeight * materialCostPerLb * (scrapPercent / 100)
    const materialCost = materialWeight * materialCostPerLb + scrapCost
    const operationCost = routing.reduce((total, step) => total + calculateStepCost(step), 0)
    const primaryHours = routing
      .filter((step) => step.type === 'Primary')
      .reduce((total, step) => total + calculateStepHours(step), 0)
    const secondaryHours = routing
      .filter((step) => step.type === 'Secondary')
      .reduce((total, step) => total + calculateStepHours(step), 0)
    const directCost = materialCost + operationCost
    const overheadCost = directCost * (overheadPercent / 100)
    const costBeforeMargin = directCost + overheadCost
    const marginAmount = costBeforeMargin * (marginPercent / 100)
    const quotedTotal = costBeforeMargin + marginAmount

    return {
      materialWeight,
      materialCost,
      operationCost,
      primaryHours,
      secondaryHours,
      overheadCost,
      marginAmount,
      quotedTotal,
    }
  }, [materialCostPerLb, marginPercent, overheadPercent, quantity, routing, scrapPercent, weightPerPiece])

  const calculatedMenuItems = useMemo(() => {
    const costMultiplier = (1 + overheadPercent / 100) * (1 + marginPercent / 100)
    const materialCustomerPrice = estimate.materialCost * costMultiplier
    const createdAt = new Date().toISOString()

    return [
      {
        id: 'steel-process-material',
        label: 'Material package',
        description: `${estimate.materialWeight.toFixed(2)} lb steel package with ${scrapPercent}% scrap allowance.`,
        rate: materialCustomerPrice.toFixed(2),
        internalCost: estimate.materialCost.toFixed(2),
        customerPrice: materialCustomerPrice.toFixed(2),
        createdAt,
        updatedAt: createdAt,
      },
      ...routing.map((step, index) => {
        const stepHours = calculateStepHours(step)
        const stepCost = calculateStepCost(step)
        const customerPrice = stepCost * costMultiplier

        return {
          id: `steel-process-${step.id}`,
          label: `${step.operation} ${index + 1}`,
          description: `${step.type} ${step.operation} on ${step.machine}: ${stepHours.toFixed(2)} hr, ${step.quantity} ${step.basis}.`,
          rate: customerPrice.toFixed(2),
          internalCost: stepCost.toFixed(2),
          customerPrice: customerPrice.toFixed(2),
          createdAt,
          updatedAt: createdAt,
        }
      }),
    ]
  }, [estimate.materialCost, estimate.materialWeight, marginPercent, overheadPercent, routing, scrapPercent])

  useEffect(() => {
    const payload: SteelProcessMenuItemsPayload = {
      updatedAt: new Date().toISOString(),
      menuSections: [
        {
          title: 'Menu Items',
          items: calculatedMenuItems,
        },
      ],
    }

    window.localStorage.setItem(steelProcessMenuItemsStorageKey, JSON.stringify(payload))
  }, [calculatedMenuItems])

  const updateRoutingStep = (stepId: string, updates: Partial<RoutingStep>) => {
    setRouting((currentRouting) => currentRouting.map((step) => (step.id === stepId ? { ...step, ...updates } : step)))
  }

  const applyPreset = (stepId: string, operation: string) => {
    const preset = operationPresets.find((option) => option.operation === operation)
    if (!preset) return
    updateRoutingStep(stepId, preset)
  }

  const addRoutingStep = (type: OperationType) => {
    const preset = operationPresets.find((operation) => operation.type === type) ?? operationPresets[0]
    setRouting((currentRouting) => [
      ...currentRouting,
      {
        ...preset,
        id: `route-${Date.now()}`,
        quantity,
      },
    ])
  }

  const deleteRoutingStep = (stepId: string) => {
    setRouting((currentRouting) => currentRouting.filter((step) => step.id !== stepId))
  }

  return (
    <div className="min-h-screen bg-[#e8eaef] text-[#111]">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-[linear-gradient(90deg,#3cb9c5_0%,#7a35e8_100%)] px-4 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/steel-photo-upload')}
            className="text-[22px] font-black leading-none transition hover:text-white/80"
            aria-label="Back to steel photo upload"
          >
            ‹
          </button>
          <div className="hidden rounded-md border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold md:block">
            Process
          </div>
        </div>

        <div className="text-sm font-black tracking-wide">Steel Estimating Engine</div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/steel-demo-dashboard')}
            className="rounded-md bg-white/10 px-4 py-2 text-sm font-black text-white ring-1 ring-white/25 transition hover:bg-white/20"
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => navigate('/steel-editable-inspection-report')}
            className="rounded-md bg-white px-4 py-2 text-sm font-black text-[#35245f] transition hover:bg-[#f3efff]"
          >
            Next
          </button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1280px] gap-5 px-5 py-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <section className="overflow-hidden rounded-md border border-[#dfe4ef] bg-white shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
            <div className="border-b border-[#dfe4ef] bg-[#fbfcff] px-5 py-4">
              <h1 className="text-[24px] font-black text-[#1f2430]">Estimate Inputs</h1>
              <p className="mt-1 text-[13px] font-semibold text-[#747b8a]">
                Material, scrap, overhead, and margin feed the routing cost below.
              </p>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-3">
              <label className="grid gap-2 text-sm font-black text-[#1f2430]">
                Part quantity
                <input
                  type="number"
                  min="0"
                  value={quantity}
                  onChange={(event) => setQuantity(toNumber(event.currentTarget.value))}
                  className="h-10 rounded-md border border-[#cfd6e5] bg-white px-3 text-sm font-bold outline-none focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                />
              </label>

              <label className="grid gap-2 text-sm font-black text-[#1f2430]">
                Weight / piece
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={weightPerPiece}
                  onChange={(event) => setWeightPerPiece(toNumber(event.currentTarget.value))}
                  className="h-10 rounded-md border border-[#cfd6e5] bg-white px-3 text-sm font-bold outline-none focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                />
              </label>

              <label className="grid gap-2 text-sm font-black text-[#1f2430]">
                Material $ / lb
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={materialCostPerLb}
                  onChange={(event) => setMaterialCostPerLb(toNumber(event.currentTarget.value))}
                  className="h-10 rounded-md border border-[#cfd6e5] bg-white px-3 text-sm font-bold outline-none focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                />
              </label>

              <label className="grid gap-2 text-sm font-black text-[#1f2430]">
                Scrap %
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={scrapPercent}
                  onChange={(event) => setScrapPercent(toNumber(event.currentTarget.value))}
                  className="h-10 rounded-md border border-[#cfd6e5] bg-white px-3 text-sm font-bold outline-none focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                />
              </label>

              <label className="grid gap-2 text-sm font-black text-[#1f2430]">
                Overhead %
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={overheadPercent}
                  onChange={(event) => setOverheadPercent(toNumber(event.currentTarget.value))}
                  className="h-10 rounded-md border border-[#cfd6e5] bg-white px-3 text-sm font-bold outline-none focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                />
              </label>

              <label className="grid gap-2 text-sm font-black text-[#1f2430]">
                Margin %
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={marginPercent}
                  onChange={(event) => setMarginPercent(toNumber(event.currentTarget.value))}
                  className="h-10 rounded-md border border-[#cfd6e5] bg-white px-3 text-sm font-bold outline-none focus:border-[#273f7a] focus:ring-2 focus:ring-[#dbe5ff]"
                />
              </label>
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-[#dfe4ef] bg-white shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfe4ef] bg-[#fbfcff] px-5 py-4">
              <div>
                <h2 className="text-[20px] font-black text-[#1f2430]">Routing</h2>
                <p className="mt-1 text-[13px] font-semibold text-[#747b8a]">
                  Ordered primary and secondary operations with configurable rates.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => addRoutingStep('Primary')}
                  className="rounded-md border border-[#8fb3c2] bg-[#eefafd] px-3 py-2 text-[12px] font-black text-[#17606e] transition hover:bg-[#dff5fa]"
                >
                  Add Primary
                </button>
                <button
                  type="button"
                  onClick={() => addRoutingStep('Secondary')}
                  className="rounded-md border border-[#c7b7e6] bg-[#f6f1ff] px-3 py-2 text-[12px] font-black text-[#5a3695] transition hover:bg-[#eee4ff]"
                >
                  Add Secondary
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[1060px]">
                <div className="grid grid-cols-[96px_140px_150px_86px_92px_92px_92px_86px_104px_44px] gap-2 border-b border-[#dfe4ef] bg-[#fbfcff] px-4 py-3 text-[11px] font-black uppercase text-[#747b8a]">
                  <span>Class</span>
                  <span>Operation</span>
                  <span>Machine</span>
                  <span>Qty</span>
                  <span>Setup</span>
                  <span>Sec/unit</span>
                  <span>$/hr</span>
                  <span>Hours</span>
                  <span>Cost</span>
                  <span />
                </div>

                <div className="divide-y divide-[#edf0f6]">
                  {routing.map((step) => {
                    const stepHours = calculateStepHours(step)
                    const stepCost = calculateStepCost(step)

                    return (
                      <div
                        key={step.id}
                        className="grid grid-cols-[96px_140px_150px_86px_92px_92px_92px_86px_104px_44px] gap-2 px-4 py-3"
                      >
                        <select
                          value={step.type}
                          onChange={(event) =>
                            updateRoutingStep(step.id, { type: event.currentTarget.value as OperationType })
                          }
                          className="h-10 rounded-md border border-[#cfd6e5] bg-white px-2 text-sm font-bold text-[#1f2430] outline-none focus:border-[#273f7a]"
                        >
                          <option>Primary</option>
                          <option>Secondary</option>
                        </select>
                        <select
                          value={step.operation}
                          onChange={(event) => applyPreset(step.id, event.currentTarget.value)}
                          className="h-10 rounded-md border border-[#cfd6e5] bg-white px-2 text-sm font-bold text-[#1f2430] outline-none focus:border-[#273f7a]"
                        >
                          {operationPresets.map((operation) => (
                            <option key={operation.operation}>{operation.operation}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={step.machine}
                          onChange={(event) => updateRoutingStep(step.id, { machine: event.currentTarget.value })}
                          className="h-10 min-w-0 rounded-md border border-[#cfd6e5] bg-white px-2 text-sm font-bold text-[#1f2430] outline-none focus:border-[#273f7a]"
                        />
                        <input
                          type="number"
                          min="0"
                          value={step.quantity}
                          onChange={(event) => updateRoutingStep(step.id, { quantity: toNumber(event.currentTarget.value) })}
                          className="h-10 rounded-md border border-[#cfd6e5] bg-white px-2 text-sm font-bold text-[#1f2430] outline-none focus:border-[#273f7a]"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={step.setupMinutes}
                          onChange={(event) => updateRoutingStep(step.id, { setupMinutes: toNumber(event.currentTarget.value) })}
                          className="h-10 rounded-md border border-[#cfd6e5] bg-white px-2 text-sm font-bold text-[#1f2430] outline-none focus:border-[#273f7a]"
                        />
                        <input
                          type="number"
                          min="0"
                          value={step.cycleSeconds}
                          onChange={(event) => updateRoutingStep(step.id, { cycleSeconds: toNumber(event.currentTarget.value) })}
                          className="h-10 rounded-md border border-[#cfd6e5] bg-white px-2 text-sm font-bold text-[#1f2430] outline-none focus:border-[#273f7a]"
                        />
                        <div className="flex h-10 items-center rounded-md bg-[#f7f9fc] px-2 text-sm font-black text-[#1f2430]">
                          {formatCurrency(step.machineRate + step.laborRate)}
                        </div>
                        <div className="flex h-10 items-center rounded-md bg-[#f7f9fc] px-2 text-sm font-black text-[#273f7a]">
                          {stepHours.toFixed(2)}
                        </div>
                        <div className="flex h-10 items-center rounded-md bg-[#f7f9fc] px-2 text-sm font-black text-[#273f7a]">
                          {formatCurrency(stepCost)}
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteRoutingStep(step.id)}
                          className="h-10 rounded-md border border-[#e2c8c0] bg-[#fff6f3] text-[16px] font-black text-[#a2472f] transition hover:bg-[#ffece6]"
                          aria-label={`Delete ${step.operation}`}
                          title="Delete operation"
                        >
                          x
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {operationPresets.slice(0, 6).map((operation) => (
              <div key={operation.operation} className="rounded-md border border-[#dfe4ef] bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black text-[#1f2430]">{operation.operation}</h3>
                  <span className="rounded bg-[#f0f4fb] px-2 py-1 text-[11px] font-black text-[#5b606b]">
                    {operation.type}
                  </span>
                </div>
                <p className="mt-2 text-[13px] font-semibold text-[#747b8a]">{operation.machine}</p>
                <p className="mt-3 text-[12px] font-bold text-[#273f7a]">
                  {operation.setupMinutes} min setup / {operation.cycleSeconds} sec {operation.basis}
                </p>
              </div>
            ))}
          </section>
        </section>

        <aside className="h-fit space-y-4 rounded-md border border-[#dfe4ef] bg-white p-5 shadow-[0_24px_70px_-40px_rgba(17,24,39,0.35)]">
          <div>
            <h2 className="text-[20px] font-black text-[#1f2430]">Quote Summary</h2>
            <p className="mt-1 text-[13px] font-semibold text-[#747b8a]">Live estimate from material and routing.</p>
          </div>

          <div className="grid gap-3">
            <div className="rounded-md bg-[#fbfcff] px-4 py-3">
              <p className="text-[11px] font-black uppercase text-[#747b8a]">Material weight</p>
              <p className="mt-1 text-2xl font-black text-[#273f7a]">{estimate.materialWeight.toFixed(2)} lb</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md bg-[#eefafd] px-4 py-3">
                <p className="text-[11px] font-black uppercase text-[#17606e]">Primary</p>
                <p className="mt-1 text-xl font-black text-[#1f2430]">{formatHours(estimate.primaryHours)}</p>
              </div>
              <div className="rounded-md bg-[#f6f1ff] px-4 py-3">
                <p className="text-[11px] font-black uppercase text-[#5a3695]">Secondary</p>
                <p className="mt-1 text-xl font-black text-[#1f2430]">{formatHours(estimate.secondaryHours)}</p>
              </div>
            </div>
            <div className="space-y-2 rounded-md border border-[#dfe4ef] px-4 py-3 text-sm font-bold text-[#1f2430]">
              <div className="flex justify-between gap-3">
                <span>Material cost</span>
                <span>{formatCurrency(estimate.materialCost)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Operation cost</span>
                <span>{formatCurrency(estimate.operationCost)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Overhead</span>
                <span>{formatCurrency(estimate.overheadCost)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Margin</span>
                <span>{formatCurrency(estimate.marginAmount)}</span>
              </div>
            </div>
            <div className="rounded-md border-2 border-[#273f7a] bg-[#f4f7ff] px-4 py-3">
              <p className="text-[11px] font-black uppercase text-[#273f7a]">Estimated quote</p>
              <p className="mt-1 text-3xl font-black text-[#1f2430]">{formatCurrency(estimate.quotedTotal)}</p>
              <p className="mt-1 text-[12px] font-semibold text-[#747b8a]">
                {formatCurrency(quantity > 0 ? estimate.quotedTotal / quantity : 0)} per piece
              </p>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}
