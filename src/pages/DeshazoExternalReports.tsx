import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import JSZip from 'jszip'
import { isConfigured, supabase } from '../lib/supabase'
import { usePortalMenu } from '../lib/usePortalMenu'
import {
  DESHAZO_PDF_PAGE_HEIGHT_PX,
  DESHAZO_PDF_PAGE_WIDTH_PX,
  createDeshazoInspectionPdfBlob,
  downloadDeshazoInspectionPdf,
  getDeshazoInspectionPdfFileName,
  getDeshazoInspectionReportHtml,
  getDeshazoInspectionReportStyles,
} from '../lib/deshazoExternalPdf'
import {
  type DeshazoCraneReport,
  type DeshazoSavedInspectionReport,
  getSavedDeshazoInspectionReports,
} from '../lib/deshazoExternalReports'
import { getCurrentUserTag } from '../lib/userTags'

const menuItems = [
  { label: 'Home', href: '/dashboard' },
  { label: 'Open Risk Items', href: '/asset-fleet-assets?view=open-risk' },
  { label: 'Asset Fleet', href: '/asset-fleet' },
  { label: 'Spend', href: '/spend' },
  { label: 'Location Comparison', href: '/location-comparison' },
  { label: 'Documents', href: '/documents-reports' },
  { label: 'Custom Reports', href: '/custom-reports' },
  { label: 'Work Orders', href: '/deshazo-work-orders' },
  { label: 'Add User', href: '/add-user' },
  { label: 'Contact Us', href: '/contact-us' },
]

type CraneTicketEntry = {
  craneReport: DeshazoCraneReport
  sourceIndex: number
}

function toTitleCase(value?: string) {
  if (!value) return 'N/A'
  return value
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function getInspectionType(craneReport: DeshazoCraneReport) {
  return toTitleCase(craneReport.inspections?.[0]?.type)
}

function getReportIdentifier(craneReport: DeshazoCraneReport, fallbackWorkOrderId: number) {
  return craneReport.crane?.contactCode || craneReport.crane?.description || `WO ${fallbackWorkOrderId}`
}

function normalizeDNumber(value?: string | number | null) {
  return String(value ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase()
}

function getRequestedDNumber(searchParams: URLSearchParams) {
  return (
    searchParams.get('dNumber') ||
    searchParams.get('d_number') ||
    searchParams.get('d') ||
    ''
  ).trim()
}

function getCraneDNumberCandidates(craneReport: DeshazoCraneReport, fallbackWorkOrderId: number) {
  const crane = craneReport.crane
  return [
    crane?.contactCode,
    crane?.description,
    crane?.id,
    getReportIdentifier(craneReport, fallbackWorkOrderId),
  ]
}

function findCraneTicketIndexByDNumber(
  craneTickets: CraneTicketEntry[],
  dNumber: string,
  fallbackWorkOrderId: number,
) {
  const normalizedDNumber = normalizeDNumber(dNumber)
  if (!normalizedDNumber) return -1

  return craneTickets.findIndex(({ craneReport }) =>
    getCraneDNumberCandidates(craneReport, fallbackWorkOrderId)
      .map(normalizeDNumber)
      .some((candidate) => candidate === normalizedDNumber),
  )
}

function hasMeaningfulCraneIdentifier(craneReport: DeshazoCraneReport) {
  const value = craneReport.crane?.contactCode || craneReport.crane?.description || ''
  const normalized = value.trim().toUpperCase()
  return normalized.length > 0 && normalized !== 'N/A' && normalized !== 'NA'
}

function hasVisibleInspectionTicket(craneReport: DeshazoCraneReport) {
  if (!hasMeaningfulCraneIdentifier(craneReport)) return false
  const inspectionType = getInspectionType(craneReport).trim().toUpperCase()
  return inspectionType.length > 0 && inspectionType !== 'N/A' && inspectionType !== 'NA'
}

function safeZipFolderName(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '')
}

function PdfReportPreview({
  report,
  selectedCraneIndex,
}: {
  report: DeshazoSavedInspectionReport
  selectedCraneIndex: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [currentPage, setCurrentPage] = useState(0)
  const reportMarkup = useMemo(
    () =>
      `<style>${getDeshazoInspectionReportStyles('preview')}</style>${getDeshazoInspectionReportHtml(
        report,
        selectedCraneIndex,
      )}`,
    [report, selectedCraneIndex],
  )
  const pageCount = useMemo(() => Math.max(1, reportMarkup.match(/class="pdf-page"/g)?.length ?? 1), [reportMarkup])

  useEffect(() => {
    setCurrentPage(0)
  }, [report, selectedCraneIndex])

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount - 1))
  }, [pageCount])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return undefined

    const updateScale = () => {
      const availableWidth = Math.max(0, node.clientWidth - 32)
      const nextScale = availableWidth / DESHAZO_PDF_PAGE_WIDTH_PX
      setScale(Math.max(0.35, Math.min(1, nextScale)))
    }

    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(node)
    window.addEventListener('resize', updateScale)
    window.visualViewport?.addEventListener('resize', updateScale)
    window.visualViewport?.addEventListener('scroll', updateScale)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateScale)
      window.visualViewport?.removeEventListener('resize', updateScale)
      window.visualViewport?.removeEventListener('scroll', updateScale)
    }
  }, [])

  const pageGap = 24
  const scaledWidth = DESHAZO_PDF_PAGE_WIDTH_PX * scale
  const scaledHeight = DESHAZO_PDF_PAGE_HEIGHT_PX * scale
  const pageOffset = currentPage * (DESHAZO_PDF_PAGE_HEIGHT_PX + pageGap) * scale

  return (
    <section
      ref={containerRef}
      className="overflow-hidden rounded-[18px] border border-[var(--deshazo-border)] bg-[#e9eef8] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.22)]"
    >
      <div className="flex max-h-[calc(100vh-250px)] min-h-[360px] items-start justify-center overflow-auto px-4 py-5">
        <div className="overflow-hidden bg-white shadow-[0_16px_40px_-34px_rgba(0,0,0,0.4)]" style={{ width: scaledWidth, height: scaledHeight }}>
          <div
            className="deshazo-pdf-root"
            style={{
              marginTop: -pageOffset,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            dangerouslySetInnerHTML={{ __html: reportMarkup }}
          />
        </div>
      </div>

      <div className="border-t border-[var(--deshazo-border)] bg-white px-4 py-3">
        <div className="grid grid-cols-[44px_1fr_44px] items-center gap-3 rounded-sm border border-[var(--deshazo-border)] bg-white px-2 py-2">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(0, page - 1))}
            disabled={currentPage === 0}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-[#edae2f] text-2xl font-bold leading-none text-white transition hover:bg-[#d89b22] disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Previous PDF page"
          >
            ‹
          </button>
          <div className="text-center text-[15px] font-bold text-[var(--deshazo-text)]">
            Page {currentPage + 1} of {pageCount}
          </div>
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(pageCount - 1, page + 1))}
            disabled={currentPage >= pageCount - 1}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-[#edae2f] text-2xl font-bold leading-none text-white transition hover:bg-[#d89b22] disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Next PDF page"
          >
            ›
          </button>
        </div>
      </div>
    </section>
  )
}

export default function DeshazoExternalReports() {
  const [user, setUser] = useState<User | null>(null)
  const [reports, setReports] = useState<DeshazoSavedInspectionReport[]>([])
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<number | null>(null)
  const [selectedCraneIndex, setSelectedCraneIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [message, setMessage] = useState('')
  const { menuOpen, setMenuOpen } = usePortalMenu(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedDNumber = useMemo(() => getRequestedDNumber(searchParams), [searchParams])

  const activeMenuItems = useMemo(
    () =>
      menuItems.map((item) => ({
        ...item,
        active: item.href === '/deshazo-work-orders',
      })),
    [],
  )

  useEffect(() => {
    if (!isConfigured || !supabase) {
      navigate('/login')
      return
    }

    const client = supabase
    let cancelled = false

    async function loadPage() {
      try {
        const { data } = await client.auth.getUser()
        const nextUser = data.user
        if (!nextUser) {
          navigate('/login')
          return
        }

        const userTag = await getCurrentUserTag(nextUser.id)
        if (userTag !== 'developer') {
          navigate('/dashboard')
          return
        }

        const nextReports = await getSavedDeshazoInspectionReports(100)
        if (cancelled) return

        const requestedWorkOrderId = Number(searchParams.get('workOrderId'))
        const nextSelectedWorkOrderId =
          Number.isFinite(requestedWorkOrderId) && nextReports.some((report) => report.workOrderId === requestedWorkOrderId)
            ? requestedWorkOrderId
            : nextReports[0]?.workOrderId ?? null

        setUser(nextUser)
        setReports(nextReports)
        setSelectedWorkOrderId(nextSelectedWorkOrderId)
        setMessage(nextReports.length > 0 ? `Showing ${nextReports.length} recent synced work orders from Supabase.` : 'No saved reports found yet.')
      } catch (error) {
        if (cancelled) return
        setMessage(error instanceof Error ? error.message : 'Saved reports could not be loaded.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadPage()
    return () => {
      cancelled = true
    }
  }, [navigate, searchParams])

  const selectedReport = reports.find((report) => report.workOrderId === selectedWorkOrderId) ?? reports[0] ?? null
  const craneTickets: CraneTicketEntry[] = useMemo(
    () =>
      (selectedReport?.rawPayload.cranes ?? [])
        .map((craneReport, sourceIndex) => ({ craneReport, sourceIndex }))
        .filter((entry) => hasVisibleInspectionTicket(entry.craneReport)),
    [selectedReport],
  )
  const selectedCraneEntry = craneTickets[selectedCraneIndex] ?? craneTickets[0] ?? null
  const selectedCrane = selectedCraneEntry?.craneReport ?? null

  useEffect(() => {
    if (!selectedReport) {
      setSelectedCraneIndex(0)
      return
    }

    const requestedCraneIndex = findCraneTicketIndexByDNumber(craneTickets, requestedDNumber, selectedReport.workOrderId)
    setSelectedCraneIndex(requestedCraneIndex >= 0 ? requestedCraneIndex : 0)
  }, [craneTickets, selectedReport, requestedDNumber, selectedWorkOrderId])

  const fullName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'Portal User'
  const initials =
    fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase())
      .join('') || 'DP'

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/login')
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handleDownloadPdf = async () => {
    if (!selectedReport || !selectedCrane) return
    setPdfBusy(true)
    try {
      await downloadDeshazoInspectionPdf(selectedReport, selectedCraneEntry?.sourceIndex ?? 0)
      setMessage(`Downloaded PDF for ${getReportIdentifier(selectedCrane, selectedReport.workOrderId)}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'PDF could not be downloaded.')
    } finally {
      setPdfBusy(false)
    }
  }

  const handleDownloadAllPdfs = async () => {
    if (!selectedReport || craneTickets.length === 0) return
    setPdfBusy(true)
    setMessage(`Building ${craneTickets.length} PDFs. This may take a moment.`)

    try {
      const zip = new JSZip()
      const folderName = safeZipFolderName(
        `job-${selectedReport.summary?.jobNo || selectedReport.summary?.salesOrderNo || selectedReport.workOrderId}-inspection-pdfs`,
      )
      const folder = zip.folder(folderName) ?? zip

      for (const entry of craneTickets) {
        const blob = await createDeshazoInspectionPdfBlob(selectedReport, entry.sourceIndex)
        folder.file(getDeshazoInspectionPdfFileName(selectedReport, entry.sourceIndex), blob)
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(zipBlob, `${folderName}.zip`)
      setMessage(`Downloaded ${craneTickets.length} PDFs in ${folderName}.zip.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'PDF ZIP could not be downloaded.')
    } finally {
      setPdfBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="rounded-2xl border border-[var(--deshazo-border)] bg-white px-6 py-4 text-sm font-semibold text-[var(--deshazo-blue)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)]">
          Loading Deshazo reports...
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--deshazo-text)]">
      <header className="sticky top-0 z-40 bg-[var(--deshazo-blue)] px-5 py-3 shadow-sm">
        <div className="flex w-full items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex min-w-[120px] items-center justify-center gap-2 rounded-md border-2 border-white/80 px-6 py-2.5 text-base font-semibold text-white transition hover:bg-white/10"
          >
            <span>Menu</span>
            <span aria-hidden="true" className="text-xs">
              {menuOpen ? '⌃' : '⌄'}
            </span>
          </button>
          <div className="hidden text-right text-sm text-white/85 sm:block">
            Signed in as <span className="font-semibold text-white">{user.email}</span>
          </div>
        </div>
      </header>

      <main className="flex w-full items-stretch">
        {menuOpen && (
          <aside className="sticky top-[60px] hidden h-[calc(100vh-60px)] w-[268px] shrink-0 border-r border-[var(--deshazo-border)] bg-white lg:flex lg:flex-col">
            <div className="flex-1 px-4 py-5">
              <div className="rounded-[24px] border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)]/50 p-4">
                <nav className="space-y-2">
                  {activeMenuItems.map((item) => (
                    <Link
                      key={item.label}
                      to={item.href}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-[15px] font-medium transition ${
                        item.active
                          ? 'bg-[#dbe5ff] text-[var(--deshazo-text)] shadow-[inset_0_0_0_1px_rgba(47,86,166,0.06)]'
                          : 'text-[rgba(21,24,33,0.7)] hover:bg-white'
                      }`}
                    >
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </nav>
              </div>
            </div>

            <div className="border-t border-[var(--deshazo-border)] px-4 py-4">
              <div className="rounded-2xl bg-[var(--deshazo-surface)] px-3 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-extrabold text-[var(--deshazo-blue)] shadow-[0_10px_24px_-18px_rgba(47,86,166,0.45)]">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold text-[var(--deshazo-text)]">{fullName}</p>
                    <p className="truncate text-[14px] text-[rgba(21,24,33,0.55)]">{user.email}</p>
                  </div>
                </div>
                <button
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-[var(--deshazo-border)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--deshazo-blue)] shadow-[0_10px_24px_-20px_rgba(47,86,166,0.45)] transition hover:bg-[var(--deshazo-surface)]"
                  onClick={handleSignOut}
                  type="button"
                >
                  Sign out
                </button>
              </div>
            </div>
          </aside>
        )}

        <section className="min-w-0 flex-1 bg-[#e9eef8] px-5 py-5 sm:px-8 lg:px-10">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[36px] font-black uppercase tracking-[-0.04em] text-[#b8bcc8]">
                DESHA<span className="text-[#f2b43f]">Z</span>O
              </div>
              <p className="text-[13px] font-bold uppercase tracking-[0.02em] text-[#8b92a1]">
                Recent synced work orders from Supabase
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:items-end">
              <select
                value={selectedReport?.workOrderId ?? ''}
                onChange={(event) => setSelectedWorkOrderId(Number(event.target.value))}
                className="min-w-[280px] rounded-xl border border-[var(--deshazo-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--deshazo-text)] shadow-[0_16px_30px_-26px_rgba(47,86,166,0.2)]"
              >
                {reports.map((report) => (
                  <option key={report.workOrderId} value={report.workOrderId}>
                    {report.summary?.jobNo || report.summary?.salesOrderNo || report.workOrderId} · {report.summary?.customerLocationName || report.summary?.customerName || 'Saved report'}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={!selectedReport || !selectedCrane || pdfBusy}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--deshazo-blue)] px-5 py-3 text-sm font-bold text-white shadow-[0_16px_30px_-24px_rgba(47,86,166,0.55)] transition hover:bg-[var(--deshazo-blue-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={handleDownloadAllPdfs}
                  disabled={!selectedReport || craneTickets.length === 0 || pdfBusy}
                  className="inline-flex items-center justify-center rounded-full bg-[#f47f2f] px-5 py-3 text-sm font-bold text-white shadow-[0_16px_30px_-24px_rgba(244,127,47,0.55)] transition hover:bg-[#d9681f] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Download All PDFs
                </button>
              </div>
            </div>
          </div>

          {message ? (
            <div className="mb-5 rounded-2xl border border-[var(--deshazo-border)] bg-white px-4 py-3 text-sm font-semibold text-[rgba(21,24,33,0.72)] shadow-[0_18px_40px_-34px_rgba(47,86,166,0.18)]">
              {message}
            </div>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
            <section className="overflow-hidden rounded-[18px] border border-[var(--deshazo-border)] bg-white shadow-[0_18px_40px_-34px_rgba(47,86,166,0.22)]">
              <div className="border-b border-[var(--deshazo-border)] px-5 py-4 text-[14px] font-bold text-[var(--deshazo-text)]">
                Reports
              </div>
              <div className="border-b border-[var(--deshazo-border)] px-5 py-4 text-[18px] font-medium text-[var(--deshazo-text)]">
                Inspection Ticket
              </div>
              <div>
                {craneTickets.map(({ craneReport, sourceIndex }, index) => {
                  const isActive = index === selectedCraneIndex
                  const identifier = getReportIdentifier(craneReport, selectedReport?.workOrderId ?? index)
                  const isJib = (craneReport.crane?.structure?.type || '').toLowerCase().includes('jib')

                  return (
                    <button
                      key={`${identifier}-${sourceIndex}`}
                      type="button"
                      onClick={() => setSelectedCraneIndex(index)}
                      className={`flex w-full items-center gap-3 border-b border-[var(--deshazo-border)] px-5 py-4 text-left transition ${
                        isActive ? 'bg-[#eef3ff] font-bold' : 'bg-white hover:bg-[#f8fafc]'
                      }`}
                    >
                      <span className="text-[20px] text-[var(--deshazo-text)]">{isJib ? '┏┳' : '⚙'}</span>
                      <div>
                        <div className="text-[15px] font-bold text-[var(--deshazo-text)]">{identifier}</div>
                        <div className="text-[11px] text-[rgba(21,24,33,0.5)]">{getInspectionType(craneReport)}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>

            {selectedReport && selectedCraneEntry ? (
              <PdfReportPreview report={selectedReport} selectedCraneIndex={selectedCraneEntry.sourceIndex} />
            ) : (
              <section className="rounded-[18px] border border-[var(--deshazo-border)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.22)]">
                <div className="rounded-2xl bg-[var(--deshazo-surface)] px-5 py-6 text-sm font-semibold text-[rgba(21,24,33,0.62)]">
                  No saved inspection report is available yet.
                </div>
              </section>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
