import { Link } from 'react-router-dom'

export default function SteelAiPortalIntegration() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--deshazo-text)]">
      <header className="sticky top-0 z-30 border-b border-[var(--deshazo-border)] bg-white/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
          <div>
            <div className="text-[28px] font-black uppercase leading-none text-[#b8bcc8]">
              DESHA<span className="text-[#f2b43f]">Z</span>O
            </div>
            <p className="mt-1 text-[12px] font-bold uppercase tracking-[0.04em] text-[#8b90a2]">
              AI Portal Integration
            </p>
          </div>

          <Link
            to="/steel-demo-dashboard"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--deshazo-blue)] px-4 py-2 text-[14px] font-bold text-white no-underline shadow-[0_12px_28px_-20px_rgba(47,86,166,0.5)] transition hover:bg-[var(--deshazo-blue-deep)]"
          >
            <span aria-hidden="true">←</span>
            <span>Dashboard</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <section className="flex flex-col gap-3">
          <h1 className="text-[clamp(32px,4vw,54px)] font-black leading-[0.98] text-[var(--deshazo-text)]">
            AI Portal Integration
          </h1>
          <div className="h-1.5 w-full max-w-[560px] rounded-full bg-[var(--deshazo-blue)]" />
        </section>

        <section className="overflow-hidden rounded-[8px] border border-[var(--deshazo-border)] bg-black shadow-[0_24px_58px_-34px_rgba(21,24,33,0.48)]">
          <video
            className="block aspect-video w-full bg-black object-contain"
            src="/videos/bestClaudeIntegration.mov"
            playsInline
            preload="metadata"
            controls
          />
        </section>
      </main>
    </div>
  )
}
