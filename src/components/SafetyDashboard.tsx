import { useMemo, useState } from 'react'

type SafetyIconName =
  | 'shield'
  | 'pulse'
  | 'clipboard'
  | 'alert'
  | 'users'
  | 'spark'
  | 'arrow'
  | 'check'
  | 'clock'

function SafetyIcon({ name, className = 'h-5 w-5' }: { name: SafetyIconName; className?: string }) {
  const paths: Record<SafetyIconName, React.ReactNode> = {
    shield: <path d="M12 3 4.8 6v5.4c0 4.6 2.9 8.2 7.2 9.6 4.3-1.4 7.2-5 7.2-9.6V6L12 3Zm-3.2 9 2 2 4.5-4.5" />,
    pulse: <path d="M3 12h4l2-5 4 10 2-5h6" />,
    clipboard: <path d="M9 5h6m-5-2h4a1 1 0 0 1 1 1v2H9V4a1 1 0 0 1 1-1ZM7 5H5.8A1.8 1.8 0 0 0 4 6.8v12.4A1.8 1.8 0 0 0 5.8 21h12.4a1.8 1.8 0 0 0 1.8-1.8V6.8A1.8 1.8 0 0 0 18.2 5H17m-8 6h6m-6 4h6" />,
    alert: <path d="M12 4 3.2 20h17.6L12 4Zm0 5.5v4.8m0 2.8v.1" />,
    users: <path d="M16 20v-1.4a4.4 4.4 0 0 0-4.4-4.4H6.4A4.4 4.4 0 0 0 2 18.6V20m7-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1.2a3.4 3.4 0 0 0 0-6.7m5 16.9v-1.4a4.4 4.4 0 0 0-3.2-4.2" />,
    spark: <path d="m12 2 1.2 4.1L17 8l-3.8 1.9L12 14l-1.2-4.1L7 8l3.8-1.9L12 2Zm6 11 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM6 14l1.2 3.1L10 18.5l-2.8 1.4L6 23l-1.2-3.1L2 18.5l2.8-1.4L6 14Z" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2" />,
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  )
}

const activeJsas = [
  { id: 'JSA-2847', job: 'WO-10482', customer: 'Riverbend Steel', task: 'Bridge drive replacement', crew: 'T. Morgan + 3', risk: 'High', controls: 'LOTO · Fall protection', status: 'In progress', time: '06:42 AM' },
  { id: 'JSA-2846', job: 'WO-10479', customer: 'Apex Components', task: 'Annual OSHA inspection', crew: 'R. Patel + 1', risk: 'Medium', controls: 'Barricade · Lift access', status: 'Approved', time: '06:18 AM' },
  { id: 'JSA-2844', job: 'WO-10473', customer: 'Harbor Paper Mill', task: 'Wire rope replacement', crew: 'D. Lewis + 2', risk: 'High', controls: 'LOTO · Rigging plan', status: 'In progress', time: '05:55 AM' },
  { id: 'JSA-2842', job: 'WO-10468', customer: 'Northline Foundry', task: 'Load test & commissioning', crew: 'S. Nguyen + 4', risk: 'Medium', controls: 'Exclusion zone · Radio', status: 'Approved', time: '05:31 AM' },
]

const credentials = [
  { label: 'Fall protection', current: 96, expiring: 2, color: '#061849' },
  { label: 'LOTO authorized', current: 94, expiring: 3, color: '#315aa8' },
  { label: 'Qualified rigger', current: 89, expiring: 5, color: '#5977b9' },
  { label: 'MEWP operator', current: 92, expiring: 4, color: '#3f8269' },
]

const observations = [
  { title: 'Damaged pendant strain relief', site: 'Riverbend Steel · Crane C-14', severity: 'High', age: '18 min' },
  { title: 'Walkway toe board loose', site: 'Northline Foundry · Bay 3', severity: 'Medium', age: '1 hr' },
  { title: 'Excellent exclusion-zone setup', site: 'Harbor Paper Mill · PM-22', severity: 'Positive', age: '2 hrs' },
]

const trend = [52, 61, 58, 72, 68, 78, 84, 82, 90, 88, 94, 96]

export default function SafetyDashboard() {
  const [view, setView] = useState<'Today' | '7 days' | '30 days'>('Today')
  const [filter, setFilter] = useState<'All' | 'High risk' | 'Approved'>('All')

  const filteredJsas = useMemo(() => activeJsas.filter((jsa) => {
    if (filter === 'High risk') return jsa.risk === 'High'
    if (filter === 'Approved') return jsa.status === 'Approved'
    return true
  }), [filter])

  const chartPoints = trend.map((value, index) => `${(index / (trend.length - 1)) * 100},${100 - value}`).join(' ')

  return (
    <div className="min-h-screen overflow-hidden bg-[#f4f7fb] text-[var(--deshazo-text)]">
      <div className="relative border-b border-[#d3dbea] bg-[radial-gradient(circle_at_82%_-30%,rgba(63,99,181,0.14),transparent_34%),linear-gradient(135deg,#ffffff_0%,#f4f7fc_100%)] px-5 pb-6 pt-6 sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-0 opacity-[0.28] [background-image:linear-gradient(rgba(6,24,73,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(6,24,73,.055)_1px,transparent_1px)] [background-size:40px_40px]" />
        <div className="relative mx-auto max-w-[1520px]">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--deshazo-blue-soft)]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                Safety intelligence online
              </div>
              <h1 className="mt-3 !font-sans !text-[clamp(2rem,4vw,3.3rem)] !font-black !tracking-[-0.045em] !text-[var(--deshazo-blue)]">Field Safety Command</h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[#747b8a]">Live readiness for crane service crews, job sites, and critical controls.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#8a93a3]">Sample local data</span>
              {(['Today', '7 days', '30 days'] as const).map((option) => (
                <button key={option} type="button" onClick={() => setView(option)} className={`rounded-md border px-3 py-2 text-[11px] font-black transition ${view === option ? 'border-[var(--deshazo-blue)] bg-[var(--deshazo-blue)] text-white shadow-sm' : 'border-[#c7d1e2] bg-white text-[#747b8a] hover:border-[#9fb0cc] hover:text-[var(--deshazo-blue)]'}`}>{option}</button>
              ))}
              <button type="button" className="ml-1 inline-flex items-center gap-2 rounded-md bg-[var(--deshazo-blue)] px-4 py-2 text-[11px] font-black text-white shadow-sm transition hover:bg-[var(--deshazo-blue-deep)]">
                <SafetyIcon name="clipboard" className="h-4 w-4" /> New JSA
              </button>
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Crews cleared', value: '18 / 20', detail: '2 awaiting sign-off', icon: 'users' as const, tone: 'cyan' },
              { label: 'JSA completion', value: '96%', detail: '+4.2% vs last period', icon: 'clipboard' as const, tone: 'blue' },
              { label: 'Open high risks', value: '03', detail: '1 requires supervisor', icon: 'alert' as const, tone: 'amber' },
              { label: 'Days incident-free', value: '147', detail: 'Record: 231 days', icon: 'shield' as const, tone: 'emerald' },
            ].map((metric) => {
              const colors = metric.tone === 'amber' ? 'text-[#a96d09] bg-[#fff7e8] border-[#f6d58e]' : metric.tone === 'emerald' ? 'text-[#367861] bg-[#edf8f3] border-[#b8dece]' : 'text-[var(--deshazo-blue)] bg-[#eef3ff] border-[#b8c9f5]'
              return (
                <div key={metric.label} className="group relative overflow-hidden rounded-md border border-[#d3dbea] bg-white p-4 shadow-[0_14px_36px_-30px_rgba(6,24,73,.45)] transition hover:-translate-y-0.5 hover:border-[#aebdda]">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#747b8a]">{metric.label}</p>
                      <p className="mt-2 font-mono text-[29px] font-bold tracking-[-0.06em] text-[var(--deshazo-blue)]">{metric.value}</p>
                    </div>
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg border ${colors}`}><SafetyIcon name={metric.icon} className="h-[18px] w-[18px]" /></span>
                  </div>
                  <p className="mt-3 text-[11px] font-semibold text-[#8992a1]">{metric.detail}</p>
                  <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-gradient-to-r from-[var(--deshazo-blue)] to-[#6f8fd0] transition-all duration-500 group-hover:w-full" />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1520px] px-5 py-6 sm:px-8 lg:px-10">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,.75fr)]">
          <section className="overflow-hidden rounded-md border border-[#d3dbea] bg-white shadow-[0_18px_45px_-35px_rgba(6,24,73,.42)]">
            <div className="flex flex-col gap-3 border-b border-[#dfe5ef] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <SafetyIcon name="pulse" className="h-4 w-4 text-[var(--deshazo-blue)]" />
                  <h2 className="!font-sans !text-[15px] !font-black !tracking-[-0.01em] !text-[var(--deshazo-text)]">Active job safety analyses</h2>
                  <span className="rounded-full border border-[#b8dece] bg-[#edf8f3] px-2 py-0.5 font-mono text-[10px] font-bold text-[#367861]">{activeJsas.length} LIVE</span>
                </div>
                <p className="mt-1 text-[11px] font-medium text-[#8992a1]">Digital pre-task plans for crews currently in the field</p>
              </div>
              <div className="flex gap-1 rounded-md border border-[#d3dbea] bg-[#f4f7fb] p-1">
                {(['All', 'High risk', 'Approved'] as const).map((option) => <button key={option} type="button" onClick={() => setFilter(option)} className={`rounded-sm px-2.5 py-1.5 text-[10px] font-black transition ${filter === option ? 'bg-white text-[var(--deshazo-blue)] shadow-sm' : 'text-[#7c8594] hover:text-[var(--deshazo-blue)]'}`}>{option}</button>)}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead><tr className="border-b border-[#dfe5ef] bg-[#f8fafd] text-[9px] font-black uppercase tracking-[0.16em] text-[#7c8594]"><th className="px-5 py-3">JSA / Work order</th><th className="px-3 py-3">Work scope</th><th className="px-3 py-3">Crew</th><th className="px-3 py-3">Risk</th><th className="px-3 py-3">Critical controls</th><th className="px-5 py-3 text-right">State</th></tr></thead>
                <tbody>
                  {filteredJsas.map((jsa) => <tr key={jsa.id} className="group border-b border-[#e6eaf1] last:border-0 hover:bg-[#f7f9fd]">
                    <td className="px-5 py-4"><p className="font-mono text-[11px] font-bold text-[var(--deshazo-blue)]">{jsa.id}</p><p className="mt-1 text-[10px] font-semibold text-[#8b94a3]">{jsa.job} · {jsa.time}</p></td>
                    <td className="px-3 py-4"><p className="text-[12px] font-bold text-[var(--deshazo-text)]">{jsa.task}</p><p className="mt-1 text-[10px] font-medium text-[#7c8594]">{jsa.customer}</p></td>
                    <td className="px-3 py-4 text-[11px] font-semibold text-[#646d7d]">{jsa.crew}</td>
                    <td className="px-3 py-4"><span className={`inline-flex rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${jsa.risk === 'High' ? 'border-[#f6d58e] bg-[#fff7e8] text-[#a96d09]' : 'border-[#b8c9f5] bg-[#eef3ff] text-[var(--deshazo-blue)]'}`}>{jsa.risk}</span></td>
                    <td className="px-3 py-4 text-[10px] font-semibold text-[#646d7d]">{jsa.controls}</td>
                    <td className="px-5 py-4 text-right"><span className={`inline-flex items-center gap-1.5 text-[10px] font-black ${jsa.status === 'Approved' ? 'text-[#367861]' : 'text-[var(--deshazo-blue-soft)]'}`}><span className={`h-1.5 w-1.5 rounded-full ${jsa.status === 'Approved' ? 'bg-[#3f8269]' : 'animate-pulse bg-[var(--deshazo-blue-soft)]'}`} />{jsa.status}</span></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <button type="button" className="flex w-full items-center justify-center gap-2 border-t border-[#dfe5ef] py-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#747b8a] transition hover:bg-[#f7f9fd] hover:text-[var(--deshazo-blue)]">Open JSA register <SafetyIcon name="arrow" className="h-3.5 w-3.5" /></button>
          </section>

          <section className="rounded-md border border-[#d3dbea] bg-white p-5 shadow-[0_18px_45px_-35px_rgba(6,24,73,.42)]">
            <div className="flex items-center justify-between">
              <div><h2 className="!font-sans !text-[15px] !font-black !tracking-[-0.01em] !text-[var(--deshazo-text)]">Readiness signal</h2><p className="mt-1 text-[11px] font-medium text-[#8992a1]">Pre-job compliance · {view}</p></div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#b8dece] bg-[#edf8f3] text-[#367861]"><SafetyIcon name="shield" className="h-5 w-5" /></div>
            </div>
            <div className="mt-5 flex items-end justify-between"><div><span className="font-mono text-4xl font-bold tracking-[-0.07em] text-[var(--deshazo-blue)]">96.4</span><span className="ml-1 text-xs font-black text-[#8a93a3]">%</span></div><span className="rounded-md bg-[#edf8f3] px-2 py-1 text-[10px] font-black text-[#367861]">↑ 3.8%</span></div>
            <div className="relative mt-4 h-[105px] overflow-hidden">
              <div className="absolute inset-0 flex flex-col justify-between">{[1, 2, 3, 4].map((line) => <span key={line} className="block border-t border-dashed border-[#dfe5ef]" />)}</div>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
                <defs><linearGradient id="safety-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3f63b5" stopOpacity=".26" /><stop offset="1" stopColor="#3f63b5" stopOpacity="0" /></linearGradient></defs>
                <polygon points={`0,100 ${chartPoints} 100,100`} fill="url(#safety-area)" />
                <polyline points={chartPoints} fill="none" stroke="#3f63b5" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#dfe5ef] pt-4 text-center"><div><p className="font-mono text-sm font-bold text-[var(--deshazo-text)]">20</p><p className="mt-1 text-[9px] font-black uppercase tracking-wider text-[#8a93a3]">Dispatches</p></div><div><p className="font-mono text-sm font-bold text-[var(--deshazo-text)]">48</p><p className="mt-1 text-[9px] font-black uppercase tracking-wider text-[#8a93a3]">Signatures</p></div><div><p className="font-mono text-sm font-bold text-[var(--deshazo-text)]">06:31</p><p className="mt-1 text-[9px] font-black uppercase tracking-wider text-[#8a93a3]">Avg clear</p></div></div>
          </section>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr]">
          <section className="rounded-md border border-[#d3dbea] bg-white p-5 shadow-[0_18px_45px_-35px_rgba(6,24,73,.42)]">
            <div className="flex items-start justify-between"><div><h2 className="!font-sans !text-[15px] !font-black !tracking-[-0.01em] !text-[var(--deshazo-text)]">Critical control health</h2><p className="mt-1 text-[11px] text-[#8992a1]">Verification across today’s jobs</p></div><SafetyIcon name="spark" className="h-5 w-5 text-[var(--deshazo-blue-soft)]" /></div>
            <div className="mt-5 space-y-4">
              {[{ name: 'Lockout / tagout', value: 100, note: '12 of 12 verified' }, { name: 'Fall protection', value: 96, note: '23 of 24 verified' }, { name: 'Rigging & lift plan', value: 91, note: '10 of 11 verified' }, { name: 'Barricade / exclusion zone', value: 88, note: '14 of 16 verified' }].map((control) => <div key={control.name}><div className="flex justify-between"><span className="text-[11px] font-bold text-[var(--deshazo-text)]">{control.name}</span><span className="font-mono text-[10px] font-bold text-[#747b8a]">{control.value}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e9edf4]"><div className="h-full rounded-full bg-gradient-to-r from-[var(--deshazo-blue)] to-[#6f8fd0]" style={{ width: `${control.value}%` }} /></div><p className="mt-1 text-[9px] font-semibold text-[#8a93a3]">{control.note}</p></div>)}
            </div>
          </section>

          <section className="rounded-md border border-[#d3dbea] bg-white p-5 shadow-[0_18px_45px_-35px_rgba(6,24,73,.42)]">
            <div className="flex items-start justify-between"><div><h2 className="!font-sans !text-[15px] !font-black !tracking-[-0.01em] !text-[var(--deshazo-text)]">Crew credentials</h2><p className="mt-1 text-[11px] text-[#8992a1]">Current across 126 field employees</p></div><SafetyIcon name="users" className="h-5 w-5 text-[var(--deshazo-blue)]" /></div>
            <div className="mt-5 space-y-4">{credentials.map((credential) => <div key={credential.label} className="grid grid-cols-[1fr_auto] items-center gap-4"><div><div className="flex items-center justify-between"><span className="text-[11px] font-bold text-[var(--deshazo-text)]">{credential.label}</span><span className="font-mono text-[10px] font-bold text-[#747b8a]">{credential.current}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e9edf4]"><div className="h-full rounded-full" style={{ width: `${credential.current}%`, backgroundColor: credential.color }} /></div></div><span className="rounded-md border border-[#f6d58e] bg-[#fff7e8] px-2 py-1 text-[9px] font-black text-[#a96d09]">{credential.expiring} due</span></div>)}</div>
            <button type="button" className="mt-5 flex w-full items-center justify-between rounded-md border border-[#d3dbea] bg-[#f8fafd] px-3 py-2.5 text-[10px] font-black text-[#646d7d] transition hover:border-[#aebdda] hover:text-[var(--deshazo-blue)]"><span>View training matrix</span><SafetyIcon name="arrow" className="h-3.5 w-3.5" /></button>
          </section>

          <section className="rounded-md border border-[#d3dbea] bg-white p-5 shadow-[0_18px_45px_-35px_rgba(6,24,73,.42)] lg:col-span-2 xl:col-span-1">
            <div className="flex items-start justify-between"><div><h2 className="!font-sans !text-[15px] !font-black !tracking-[-0.01em] !text-[var(--deshazo-text)]">Field observations</h2><p className="mt-1 text-[11px] text-[#8992a1]">Latest reports from technicians</p></div><span className="rounded-full border border-[#f6d58e] bg-[#fff7e8] px-2 py-1 font-mono text-[9px] font-bold text-[#a96d09]">2 OPEN</span></div>
            <div className="mt-4 divide-y divide-[#e6eaf1]">{observations.map((observation) => <button key={observation.title} type="button" className="group flex w-full items-start gap-3 py-3 text-left first:pt-1"><span className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${observation.severity === 'High' ? 'border-[#efc2c2] bg-[#fdf1f1] text-[#b23b3b]' : observation.severity === 'Positive' ? 'border-[#b8dece] bg-[#edf8f3] text-[#367861]' : 'border-[#f6d58e] bg-[#fff7e8] text-[#a96d09]'}`}><SafetyIcon name={observation.severity === 'Positive' ? 'check' : 'alert'} className="h-3.5 w-3.5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-bold text-[var(--deshazo-text)] group-hover:text-[var(--deshazo-blue)]">{observation.title}</span><span className="mt-1 block truncate text-[9px] font-semibold text-[#8a93a3]">{observation.site}</span></span><span className="flex shrink-0 items-center gap-1 text-[9px] font-semibold text-[#8a93a3]"><SafetyIcon name="clock" className="h-3 w-3" />{observation.age}</span></button>)}</div>
            <button type="button" className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-[#b8c9f5] bg-[#eef3ff] py-2.5 text-[10px] font-black text-[var(--deshazo-blue)] transition hover:bg-[#e4ecfd]">Report an observation <SafetyIcon name="arrow" className="h-3.5 w-3.5" /></button>
          </section>
        </div>

        <p className="mt-5 text-center text-[9px] font-bold uppercase tracking-[0.18em] text-[#9aa2ae]">Demonstration workspace · No production safety records</p>
      </div>
    </div>
  )
}
