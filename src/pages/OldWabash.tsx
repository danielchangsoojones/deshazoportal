const wabashLoginUrl = 'https://portal.blockstampsf.com/wabash/login'

export default function OldWabash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-5 py-10 text-[var(--deshazo-text)]">
      <section className="w-full max-w-xl rounded-[24px] border border-[var(--deshazo-border)] bg-white px-8 py-8 text-center shadow-[0_24px_60px_-42px_rgba(47,86,166,0.38)]">
        <div className="text-[34px] font-black uppercase leading-none tracking-[-0.035em] text-[#b8bcc8]">
          DESHA<span className="text-[#f2b43f]">Z</span>O
        </div>
        <p className="mt-2 text-[13px] font-bold uppercase tracking-[0.02em] text-[#8a91a3]">
          Wabash Portal
        </p>
        <div className="mx-auto mt-5 h-1.5 w-full max-w-[320px] rounded-full bg-[var(--deshazo-blue)]" />

        <h1 className="mt-7 text-[26px] font-black tracking-[-0.035em] text-[var(--deshazo-text)]">
          The Wabash portal has moved
        </h1>
        <p className="mt-4 text-[16px] font-semibold leading-7 text-[rgba(21,24,33,0.7)]">
          The new portal is now at this URL. Please save it to your favorites.
        </p>

        <a
          href={wabashLoginUrl}
          className="mt-4 block break-words rounded-[12px] border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)] px-4 py-3 text-[15px] font-black text-[var(--deshazo-blue)] hover:underline"
        >
          portal.blockstampsf.com/wabash/login
        </a>

        <a
          href={wabashLoginUrl}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--deshazo-blue)] px-6 py-3 text-sm font-black text-white shadow-[0_16px_32px_-24px_rgba(47,86,166,0.75)] transition hover:opacity-90"
        >
          Open Wabash Portal
        </a>
      </section>
    </div>
  )
}
