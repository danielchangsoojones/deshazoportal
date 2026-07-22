import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type ExecutiveAnalyticsProps = {
  serviceLocationId?: number | null
  serviceLocationName?: string
}

type Period = 'YTD' | 'Quarter' | '12 months'

const financialTrend = [
  { month: 'Aug', revenue: 3.1, target: 3.0, ebitda: 0.42 },
  { month: 'Sep', revenue: 3.3, target: 3.15, ebitda: 0.48 },
  { month: 'Oct', revenue: 3.0, target: 3.2, ebitda: 0.39 },
  { month: 'Nov', revenue: 3.5, target: 3.3, ebitda: 0.54 },
  { month: 'Dec', revenue: 3.7, target: 3.45, ebitda: 0.61 },
  { month: 'Jan', revenue: 3.4, target: 3.5, ebitda: 0.51 },
  { month: 'Feb', revenue: 3.8, target: 3.6, ebitda: 0.63 },
  { month: 'Mar', revenue: 4.0, target: 3.75, ebitda: 0.68 },
  { month: 'Apr', revenue: 4.2, target: 3.85, ebitda: 0.72 },
  { month: 'May', revenue: 4.1, target: 3.95, ebitda: 0.69 },
  { month: 'Jun', revenue: 4.5, target: 4.1, ebitda: 0.79 },
  { month: 'Jul', revenue: 4.7, target: 4.25, ebitda: 0.84 },
]

const regionalPerformance = [
  { location: 'Richmond', revenue: 16.8, plan: 15.6, margin: 19.4, utilization: 86 },
  { location: 'Cincinnati', revenue: 13.2, plan: 12.8, margin: 17.8, utilization: 82 },
  { location: 'Northeast', revenue: 10.6, plan: 11.1, margin: 15.9, utilization: 78 },
]

const backlogMix = [
  { name: 'Modernization', value: 38, amount: '$7.2M', color: '#061849' },
  { name: 'Field service', value: 29, amount: '$5.5M', color: '#315aa8' },
  { name: 'Inspection', value: 21, amount: '$4.0M', color: '#6f8fd0' },
  { name: 'Parts', value: 12, amount: '$2.3M', color: '#d3a33f' },
]

const pipeline = [
  { stage: 'Qualified', value: 15.8 },
  { stage: 'Proposal', value: 10.9 },
  { stage: 'Negotiation', value: 6.8 },
  { stage: 'Verbal', value: 3.9 },
]

const operationalSignals = [
  { label: 'Technician utilization', value: 83, target: 80, status: 'Ahead of plan' },
  { label: 'On-time completion', value: 91, target: 90, status: 'On target' },
  { label: 'First-time fix rate', value: 87, target: 90, status: 'Watch' },
  { label: 'Inspection compliance', value: 96, target: 95, status: 'On target' },
]

const executiveActions = [
  { priority: 'High', title: 'Northeast margin below plan', detail: 'Labor mix and travel costs reduced margin by 1.8 pts.', owner: 'Regional VP', due: 'Jul 24' },
  { priority: 'Medium', title: 'Modernization capacity constraint', detail: '$2.1M of Q3 backlog depends on two specialist crews.', owner: 'COO', due: 'Jul 28' },
  { priority: 'Positive', title: 'Richmond growth ahead of plan', detail: 'Revenue is 7.7% above plan with stable gross margin.', owner: 'President', due: 'Review' },
]

const chartTooltipStyle = {
  border: '1px solid #d3dbea',
  borderRadius: '8px',
  boxShadow: '0 16px 36px -24px rgba(6,24,73,.55)',
  fontSize: '11px',
}

function formatMillions(value: number) {
  return `$${value.toFixed(1)}M`
}

function MetricCard({ label, value, change, note, tone = 'blue' }: { label: string; value: string; change: string; note: string; tone?: 'blue' | 'green' | 'gold' }) {
  const toneClasses = tone === 'green'
    ? 'border-[#b8dece] bg-[#edf8f3] text-[#367861]'
    : tone === 'gold'
      ? 'border-[#f1d69a] bg-[#fff8e9] text-[#9a680b]'
      : 'border-[#b8c9f5] bg-[#eef3ff] text-[var(--deshazo-blue)]'

  return (
    <article className="group relative overflow-hidden rounded-lg border border-[#d3dbea] bg-white p-4 shadow-[0_18px_42px_-34px_rgba(6,24,73,.48)] transition hover:-translate-y-0.5 hover:border-[#aebdda]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.17em] text-[#7d8796]">{label}</p>
          <p className="mt-2 font-mono text-[27px] font-bold tracking-[-0.06em] text-[var(--deshazo-blue)]">{value}</p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${toneClasses}`}>{change}</span>
      </div>
      <p className="mt-3 text-[10px] font-semibold text-[#8b94a3]">{note}</p>
      <span className="absolute bottom-0 left-0 h-[3px] w-full origin-left scale-x-0 bg-gradient-to-r from-[var(--deshazo-blue)] to-[#6f8fd0] transition-transform duration-500 group-hover:scale-x-100" />
    </article>
  )
}

function PanelHeading({ eyebrow, title, detail, aside }: { eyebrow: string; title: string; detail: string; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-[#e1e6ee] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.17em] text-[#7b89a4]">{eyebrow}</p>
        <h2 className="mt-1 !font-sans !text-[15px] !font-black !tracking-[-0.01em] !text-[var(--deshazo-text)]">{title}</h2>
        <p className="mt-1 text-[10px] font-semibold text-[#8b94a3]">{detail}</p>
      </div>
      {aside}
    </div>
  )
}

export default function ExecutiveAnalytics({ serviceLocationId = null, serviceLocationName }: ExecutiveAnalyticsProps) {
  const [period, setPeriod] = useState<Period>('YTD')
  const [showTarget, setShowTarget] = useState(true)
  const locationLabel = serviceLocationId ? serviceLocationName || `Location ${serviceLocationId}` : 'All service locations'
  const visibleFinancialTrend = useMemo(() => {
    if (period === 'Quarter') return financialTrend.slice(-3)
    if (period === 'YTD') return financialTrend.slice(-7)
    return financialTrend
  }, [period])

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-[var(--deshazo-text)]">
      <header className="relative overflow-hidden border-b border-[#d3dbea] bg-[radial-gradient(circle_at_82%_-10%,rgba(49,90,168,.16),transparent_31%),linear-gradient(135deg,#fff_0%,#f3f7fd_100%)] px-5 pb-6 pt-6 sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-0 opacity-[0.24] [background-image:linear-gradient(rgba(6,24,73,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(6,24,73,.05)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="relative mx-auto max-w-[1560px]">
          <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#b8dece] bg-[#edf8f3] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.13em] text-[#367861]"><span className="h-1.5 w-1.5 rounded-full bg-[#3f8269]" /> Executive pulse updated</span>
                <span className="rounded-full border border-[#b8c9f5] bg-[#eef3ff] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.13em] text-[var(--deshazo-blue)]">Sample data</span>
              </div>
              <h1 className="mt-4 !font-sans !text-[clamp(2rem,4vw,3.25rem)] !font-black !tracking-[-0.05em] !text-[var(--deshazo-blue)]">Executive Analytics</h1>
              <p className="mt-2 max-w-2xl text-[13px] font-semibold leading-6 text-[#747f90]">A company-wide view of financial performance, sales momentum, operating health, people, and risk.</p>
            </div>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <div className="text-left sm:text-right">
                <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[#8b94a3]">Reporting scope</p>
                <p className="mt-1 text-[11px] font-black text-[var(--deshazo-blue)]">{locationLabel} · Through July 21, 2026</p>
              </div>
              <div className="flex rounded-lg border border-[#cbd4e2] bg-white p-1 shadow-sm">
                {(['YTD', 'Quarter', '12 months'] as Period[]).map((option) => (
                  <button key={option} type="button" onClick={() => setPeriod(option)} className={`rounded-md px-3 py-2 text-[10px] font-black transition ${period === option ? 'bg-[var(--deshazo-blue)] text-white shadow-sm' : 'text-[#768091] hover:bg-[#f0f4fb] hover:text-[var(--deshazo-blue)]'}`}>{option}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Revenue" value="$40.6M" change="↑ 8.4%" note="$2.7M ahead of YTD plan" tone="green" />
            <MetricCard label="EBITDA margin" value="17.6%" change="↑ 1.3 pts" note="$7.1M adjusted EBITDA" tone="green" />
            <MetricCard label="Booked backlog" value="$19.0M" change="↑ 12.1%" note="5.4 months of coverage" />
            <MetricCard label="Qualified pipeline" value="$37.4M" change="2.0×" note="Pipeline-to-target coverage" />
            <MetricCard label="Cash conversion" value="91%" change="↑ 4 pts" note="54 days sales outstanding" tone="gold" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1560px] px-5 py-6 sm:px-8 lg:px-10">
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(330px,.8fr)]">
          <div className="overflow-hidden rounded-lg border border-[#d3dbea] bg-white shadow-[0_18px_46px_-36px_rgba(6,24,73,.5)]">
            <PanelHeading
              eyebrow="Financial performance"
              title="Revenue and earnings trajectory"
              detail={`${period} actual performance · USD millions`}
              aside={<label className="inline-flex cursor-pointer items-center gap-2 text-[10px] font-black text-[#6e7889]"><input type="checkbox" checked={showTarget} onChange={(event) => setShowTarget(event.target.checked)} className="accent-[var(--deshazo-blue)]" /> Show plan</label>}
            />
            <div className="h-[330px] px-2 pb-4 pt-5 sm:px-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleFinancialTrend} margin={{ top: 8, right: 18, left: 2, bottom: 2 }}>
                  <defs>
                    <linearGradient id="executiveRevenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#315aa8" stopOpacity={0.28} /><stop offset="100%" stopColor="#315aa8" stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e5eaf2" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#7c8696', fontSize: 10, fontWeight: 700 }} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} width={38} tick={{ fill: '#7c8696', fontSize: 10 }} tickFormatter={(value: number) => `$${value}M`} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} width={38} tick={{ fill: '#a17b2b', fontSize: 10 }} tickFormatter={(value: number) => `$${value}M`} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => formatMillions(Number(value))} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: '10px', fontWeight: 700, paddingTop: '8px' }} />
                  <Area yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stroke="#315aa8" strokeWidth={3} fill="url(#executiveRevenueFill)" activeDot={{ r: 5 }} />
                  {showTarget ? <Line yAxisId="left" type="monotone" dataKey="target" name="Revenue plan" stroke="#9aa5b4" strokeWidth={2} strokeDasharray="5 5" dot={false} /> : null}
                  <Bar yAxisId="right" dataKey="ebitda" name="EBITDA" fill="#d3a33f" radius={[4, 4, 0, 0]} barSize={14} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#d3dbea] bg-white shadow-[0_18px_46px_-36px_rgba(6,24,73,.5)]">
            <PanelHeading eyebrow="Revenue visibility" title="Backlog mix" detail="$19.0M total booked backlog" aside={<span className="rounded-full bg-[#edf8f3] px-2 py-1 text-[9px] font-black text-[#367861]">+12.1% YoY</span>} />
            <div className="grid items-center gap-1 px-4 py-4 sm:grid-cols-[1fr_1fr] xl:grid-cols-1 2xl:grid-cols-[1fr_1fr]">
              <div className="relative h-[190px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={backlogMix} dataKey="value" nameKey="name" innerRadius={57} outerRadius={82} paddingAngle={3} stroke="none">
                      {backlogMix.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => `${value}%`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="font-mono text-2xl font-bold tracking-[-0.06em] text-[var(--deshazo-blue)]">$19.0M</span><span className="mt-1 text-[8px] font-black uppercase tracking-[0.14em] text-[#8b94a3]">Backlog</span></div>
              </div>
              <div className="space-y-3 px-2 pb-2">
                {backlogMix.map((item) => <div key={item.name} className="flex items-center gap-3"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} /><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-bold text-[#586375]">{item.name}</p></div><span className="font-mono text-[10px] font-bold text-[var(--deshazo-blue)]">{item.amount}</span><span className="w-7 text-right text-[9px] font-black text-[#8b94a3]">{item.value}%</span></div>)}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-lg border border-[#d3dbea] bg-white shadow-[0_18px_46px_-36px_rgba(6,24,73,.5)]">
            <PanelHeading eyebrow="Regional scorecard" title="Performance by service location" detail="Revenue, plan attainment, margin, and technician utilization" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead><tr className="border-b border-[#dfe5ef] bg-[#f8fafd] text-[8px] font-black uppercase tracking-[0.15em] text-[#7c8696]"><th className="px-5 py-3">Location</th><th className="px-3 py-3">Revenue</th><th className="px-3 py-3">vs plan</th><th className="px-3 py-3">EBITDA margin</th><th className="px-5 py-3">Utilization</th></tr></thead>
                <tbody>{regionalPerformance.map((row) => {
                  const variance = ((row.revenue / row.plan - 1) * 100).toFixed(1)
                  const ahead = row.revenue >= row.plan
                  return <tr key={row.location} className="border-b border-[#e6eaf1] last:border-0 hover:bg-[#f8fafd]"><td className="px-5 py-4 text-[11px] font-black text-[var(--deshazo-blue)]">{row.location}</td><td className="px-3 py-4 font-mono text-[11px] font-bold text-[#4d596b]">${row.revenue.toFixed(1)}M</td><td className="px-3 py-4"><span className={`rounded-full px-2 py-1 text-[9px] font-black ${ahead ? 'bg-[#edf8f3] text-[#367861]' : 'bg-[#fff7e8] text-[#a96d09]'}`}>{ahead ? '+' : ''}{variance}%</span></td><td className="px-3 py-4 font-mono text-[11px] font-bold text-[#4d596b]">{row.margin}%</td><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#e8edf4]"><div className="h-full rounded-full bg-gradient-to-r from-[#315aa8] to-[#6f8fd0]" style={{ width: `${row.utilization}%` }} /></div><span className="font-mono text-[10px] font-bold text-[#596477]">{row.utilization}%</span></div></td></tr>
                })}</tbody>
              </table>
            </div>
            <div className="h-[185px] border-t border-[#e1e6ee] px-3 pb-3 pt-5">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regionalPerformance} layout="vertical" margin={{ top: 0, right: 28, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#e5eaf2" strokeDasharray="4 4" horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#7c8696', fontSize: 9 }} tickFormatter={(value: number) => `$${value}M`} />
                  <YAxis type="category" dataKey="location" axisLine={false} tickLine={false} width={70} tick={{ fill: '#596477', fontSize: 9, fontWeight: 700 }} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => formatMillions(Number(value))} />
                  <Bar dataKey="revenue" name="Revenue" fill="#315aa8" radius={[0, 4, 4, 0]} barSize={12} />
                  <Bar dataKey="plan" name="Plan" fill="#c8d1df" radius={[0, 4, 4, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#d3dbea] bg-white shadow-[0_18px_46px_-36px_rgba(6,24,73,.5)]">
            <PanelHeading eyebrow="Commercial engine" title="Qualified sales pipeline" detail="$37.4M weighted opportunity flow" aside={<span className="text-[9px] font-black text-[#367861]">WIN RATE 42%</span>} />
            <div className="h-[250px] px-3 pb-3 pt-5">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pipeline} margin={{ top: 5, right: 18, left: 0, bottom: 4 }}>
                  <defs><linearGradient id="pipelineFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#315aa8" stopOpacity={0.3} /><stop offset="100%" stopColor="#315aa8" stopOpacity={0.02} /></linearGradient></defs>
                  <CartesianGrid stroke="#e5eaf2" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="stage" axisLine={false} tickLine={false} tick={{ fill: '#6e7889', fontSize: 9, fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} width={38} tick={{ fill: '#7c8696', fontSize: 9 }} tickFormatter={(value: number) => `$${value}M`} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => formatMillions(Number(value))} />
                  <Area type="monotone" dataKey="value" name="Pipeline" stroke="#315aa8" strokeWidth={3} fill="url(#pipelineFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 border-t border-[#e1e6ee] bg-[#fafbfd] text-center"><div className="px-2 py-3"><p className="font-mono text-[13px] font-bold text-[var(--deshazo-blue)]">$8.6M</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-[#8b94a3]">90-day forecast</p></div><div className="border-x border-[#e1e6ee] px-2 py-3"><p className="font-mono text-[13px] font-bold text-[var(--deshazo-blue)]">18 days</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-[#8b94a3]">Avg. sales cycle</p></div><div className="px-2 py-3"><p className="font-mono text-[13px] font-bold text-[var(--deshazo-blue)]">$186K</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-[#8b94a3]">Avg. deal</p></div></div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-[1fr_1.15fr_1fr]">
          <div className="rounded-lg border border-[#d3dbea] bg-white p-5 shadow-[0_18px_46px_-36px_rgba(6,24,73,.5)]">
            <div className="flex items-start justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.17em] text-[#7b89a4]">Operations</p><h2 className="mt-1 !font-sans !text-[15px] !font-black !text-[var(--deshazo-text)]">Operating health</h2></div><span className="rounded-full bg-[#edf8f3] px-2 py-1 text-[9px] font-black text-[#367861]">HEALTHY</span></div>
            <div className="mt-5 space-y-4">{operationalSignals.map((signal) => <div key={signal.label}><div className="flex items-center justify-between gap-4"><span className="text-[10px] font-bold text-[#596477]">{signal.label}</span><span className={`text-[9px] font-black ${signal.status === 'Watch' ? 'text-[#a96d09]' : 'text-[#367861]'}`}>{signal.value}%</span></div><div className="relative mt-2 h-1.5 rounded-full bg-[#e7ecf3]"><div className={`h-full rounded-full ${signal.status === 'Watch' ? 'bg-[#d3a33f]' : 'bg-[#315aa8]'}`} style={{ width: `${signal.value}%` }} /><span className="absolute top-[-3px] h-3 w-px bg-[#596477]" style={{ left: `${signal.target}%` }} /></div><p className="mt-1 text-[8px] font-semibold text-[#99a1ad]">Target {signal.target}% · {signal.status}</p></div>)}</div>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#d3dbea] bg-white shadow-[0_18px_46px_-36px_rgba(6,24,73,.5)]">
            <PanelHeading eyebrow="President's attention" title="Priority signals" detail="Items with the greatest enterprise impact" />
            <div className="divide-y divide-[#e5e9f0]">{executiveActions.map((action) => {
              const badge = action.priority === 'High' ? 'bg-[#fdf1f1] text-[#b23b3b] border-[#efc2c2]' : action.priority === 'Positive' ? 'bg-[#edf8f3] text-[#367861] border-[#b8dece]' : 'bg-[#fff7e8] text-[#a96d09] border-[#f1d69a]'
              return <article key={action.title} className="px-5 py-4 transition hover:bg-[#f9fbfe]"><div className="flex items-start gap-3"><span className={`mt-0.5 rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wider ${badge}`}>{action.priority}</span><div className="min-w-0 flex-1"><h3 className="text-[11px] font-black text-[var(--deshazo-text)]">{action.title}</h3><p className="mt-1 text-[9px] font-semibold leading-4 text-[#7c8696]">{action.detail}</p><div className="mt-2 flex items-center gap-3 text-[8px] font-black uppercase tracking-wider text-[#9aa2ae]"><span>{action.owner}</span><span>•</span><span>{action.due}</span></div></div></div></article>
            })}</div>
          </div>

          <div className="rounded-lg border border-[#d3dbea] bg-[linear-gradient(145deg,#061849,#14306f)] p-5 text-white shadow-[0_20px_50px_-32px_rgba(6,24,73,.75)]">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#aabce7]">People & safety</p>
            <h2 className="mt-1 !font-sans !text-[15px] !font-black !text-white">Enterprise readiness</h2>
            <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-lg border border-white/10 bg-white/[0.06] p-3"><p className="font-mono text-2xl font-bold tracking-[-0.05em]">147</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-[#aabce7]">Days incident-free</p></div><div className="rounded-lg border border-white/10 bg-white/[0.06] p-3"><p className="font-mono text-2xl font-bold tracking-[-0.05em]">96%</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-[#aabce7]">Training current</p></div><div className="rounded-lg border border-white/10 bg-white/[0.06] p-3"><p className="font-mono text-2xl font-bold tracking-[-0.05em]">126</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-[#aabce7]">Field employees</p></div><div className="rounded-lg border border-white/10 bg-white/[0.06] p-3"><p className="font-mono text-2xl font-bold tracking-[-0.05em]">4.8%</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-[#aabce7]">12-mo turnover</p></div></div>
            <div className="mt-4 border-t border-white/10 pt-4"><div className="flex justify-between text-[9px] font-bold"><span className="text-[#aabce7]">Open positions</span><span>8</span></div><div className="mt-3 flex justify-between text-[9px] font-bold"><span className="text-[#aabce7]">Recordable incident rate</span><span>0.62</span></div><div className="mt-3 flex justify-between text-[9px] font-bold"><span className="text-[#aabce7]">Employee engagement</span><span>84%</span></div></div>
          </div>
        </section>

        <p className="mt-6 text-center text-[8px] font-black uppercase tracking-[0.2em] text-[#9aa2ae]">Executive demonstration dashboard · Illustrative company data only</p>
      </main>
    </div>
  )
}
