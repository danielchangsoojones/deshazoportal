import { useEffect, useRef, useState } from 'react'

export type QuotePdfPreviewData = {
  url: string
  filename: string
  title: string
  pages: string[]
  placement: { left: string; top: string; width: string }
}

type QuotePdfPreviewProps = {
  preview: QuotePdfPreviewData
  onClose: () => void
}

const controlClass = 'inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-800 hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#31569b] disabled:opacity-40'

export default function QuotePdfPreview({ preview, onClose }: QuotePdfPreviewProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [page, setPage] = useState(0)
  const [zoom, setZoom] = useState('page')
  const pageCount = preview.pages.length

  useEffect(() => {
    dialog.current?.showModal()
    const stage = viewport.current
    if (!stage) return

    const observer = new ResizeObserver(([entry]) => {
      setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    viewport.current?.scrollTo({ top: 0, left: 0 })
  }, [page])

  const pageWidth = zoom === 'width'
    ? '100%'
    : zoom === 'page'
      ? Math.min(viewportSize.width, viewportSize.height * 8.5 / 11)
      : Math.round(612 * Number(zoom))

  const renderPage = (index: number) => (
    <div className="relative aspect-[8.5/11] overflow-hidden bg-white">
      <img
        src={preview.pages[index]}
        alt={`Quote PDF page ${index + 1}`}
        draggable={false}
        className="absolute block max-w-none"
        style={preview.placement}
      />
    </div>
  )

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="quote-pdf-title"
      className="m-auto h-[min(92dvh,1000px)] max-h-none w-[min(96vw,1160px)] max-w-none overflow-hidden rounded-2xl border border-[#203656] bg-[#f4f6fa] p-0 shadow-2xl backdrop:bg-[#07162d]/70 print:hidden"
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-center gap-2 sm:gap-4 border-t-4 border-[#f5b400] bg-[#122443] px-4 py-4 text-white sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 id="quote-pdf-title" className="text-base font-bold leading-tight sm:text-lg" style={{ color: 'inherit' }}>Quote PDF preview</h2>
            <p className="mt-1 truncate text-xs text-[#d2dced]" title={preview.title}>{preview.title}</p>
          </div>
          <a
            href={preview.url}
            download={preview.filename}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-[#f5b400] px-3.5 text-sm font-bold text-[#172234] hover:bg-[#ffca34] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" />
            </svg>
            Download PDF
          </a>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/30 text-xl leading-none text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-5">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Previous page" className={controlClass} disabled={page === 0} onClick={() => setPage(page - 1)}>
              <span aria-hidden="true">‹</span>
            </button>
            <select aria-label="PDF page" className={controlClass} value={page} onChange={(event) => setPage(Number(event.currentTarget.value))}>
              {preview.pages.map((_, index) => <option key={index} value={index}>Page {index + 1} of {pageCount}</option>)}
            </select>
            <button type="button" aria-label="Next page" className={controlClass} disabled={page === pageCount - 1} onClick={() => setPage(page + 1)}>
              <span aria-hidden="true">›</span>
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            Zoom
            <select className={controlClass} value={zoom} onChange={(event) => setZoom(event.currentTarget.value)}>
              <option value="page">Fit page</option>
              <option value="width">Fit width</option>
              <option value="0.75">75%</option>
              <option value="1">100%</option>
              <option value="1.25">125%</option>
              <option value="1.5">150%</option>
              <option value="2">200%</option>
            </select>
          </label>
        </div>
        <div className="flex min-h-0 flex-1">
          {pageCount > 1 ? (
            <nav aria-label="PDF pages" className="hidden w-32 shrink-0 overflow-y-auto border-r border-slate-200 bg-[#f7f8fb] p-3 md:block">
              {preview.pages.map((src, index) => (
                <button
                  type="button"
                  key={index}
                  aria-label={`Go to page ${index + 1}`}
                  aria-current={index === page ? 'page' : undefined}
                  className="mb-2 block w-full rounded-lg border border-transparent px-2 py-1.5 text-center text-xs font-semibold text-slate-700 hover:bg-[#e9eef7] aria-[current=page]:border-[#8caddd] aria-[current=page]:bg-[#e8f0fd] focus-visible:outline-2 focus-visible:outline-[#31569b]"
                  onClick={() => setPage(index)}
                >
                  <div className="relative mx-auto mb-1 aspect-[8.5/11] w-16 overflow-hidden border border-slate-200 bg-white shadow-sm">
                    <img src={src} loading="lazy" alt="" className="absolute block max-w-none" style={preview.placement} />
                  </div>
                  {index + 1}
                </button>
              ))}
            </nav>
          ) : null}
          <div ref={viewport} className="min-w-0 flex-1 overflow-auto bg-[#e4eaf3] px-4 py-5 sm:px-7 sm:py-7">
            <div
              className="mx-auto border border-slate-300 bg-white shadow-[0_12px_36px_-12px_rgba(15,35,60,0.35)]"
              style={{ width: pageWidth || '100%' }}
            >
              {renderPage(page)}
            </div>
          </div>
        </div>
      </div>
    </dialog>
  )
}
