import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const margin = 0.45 * 72
const contentWidth = 612 - margin * 2
const contentHeight = 792 - margin * 2

function getPageRanges(report: HTMLElement, pageHeight: number) {
  const bounds = report.getBoundingClientRect()
  const range = report.ownerDocument.createRange()
  const walker = report.ownerDocument.createTreeWalker(report, NodeFilter.SHOW_TEXT)
  const protectedRects: Array<{ top: number; bottom: number }> = Array.from(
    report.querySelectorAll('header, h2, tr, .info-cell, .identity-grid, .equipment-row, .contact-row, .section-title, .grand-total, .notes, .notes-footer'),
    (element) => element.getBoundingClientRect(),
  )

  for (const heading of report.querySelectorAll('h2.band')) {
    const nextSection = heading.nextElementSibling
    const firstContent = nextSection?.querySelector('tbody tr') ?? nextSection
    if (firstContent) {
      protectedRects.push({
        top: heading.getBoundingClientRect().top,
        bottom: firstContent.getBoundingClientRect().bottom,
      })
    }
  }

  while (walker.nextNode()) {
    if (!walker.currentNode.textContent?.trim()) continue
    range.selectNodeContents(walker.currentNode)
    protectedRects.push(...Array.from(range.getClientRects()))
  }

  const height = Math.ceil(bounds.height)
  const protectedSpans = protectedRects.map((rect) => ({
    top: Math.floor(rect.top - bounds.top),
    bottom: Math.ceil(rect.bottom - bounds.top),
  })).filter((span) => span.bottom - span.top <= pageHeight)
  const pages: Array<{ top: number; height: number }> = []

  for (let top = 0; top < height;) {
    const limit = Math.min(top + pageHeight, height)
    let bottom = limit
    if (limit < height) {
      for (;;) {
        const boundary = protectedSpans.reduce((cut, span) =>
          span.top < bottom && span.bottom > bottom ? Math.min(cut, span.top) : cut, bottom)
        if (boundary === bottom) break
        bottom = boundary
      }
    }
    if (bottom <= top) bottom = limit
    pages.push({ top, height: bottom - top })
    top = bottom
  }

  return pages
}

export async function createQuotePdf(html: string, title: string) {
  const frame = document.createElement('iframe')
  frame.title = 'Quote PDF renderer'
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  Object.assign(frame.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '8.5in',
    height: '11in',
    border: '0',
    pointerEvents: 'none',
  })
  // html2canvas measures its baseline in the host document. Tailwind renders
  // images as blocks, which moves its inline measurement image to a new line.
  const fontMetricsStyle = document.createElement('style')
  fontMetricsStyle.textContent = `
    body > div[style*="visibility: hidden"][style*="white-space: nowrap"]:has(> img[src^="data:image/gif"][width="1"][height="1"]) {
      line-height: normal;
    }
    body > div[style*="visibility: hidden"] > img[src^="data:image/gif"][width="1"][height="1"] {
      display: inline;
    }
  `
  document.head.appendChild(fontMetricsStyle)
  document.body.appendChild(frame)

  try {
    const renderDocument = frame.contentDocument
    if (!renderDocument) throw new Error('Could not prepare the quote PDF.')

    renderDocument.open()
    renderDocument.write(html)
    renderDocument.close()
    await Promise.all(Array.from(renderDocument.images, (image) => image.decode()))
    await renderDocument.fonts.ready

    const reports = Array.from(renderDocument.querySelectorAll<HTMLElement>('.report-page'))
    if (!reports.length) throw new Error('No quotes were available to export.')

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true })
    pdf.setProperties({ title })
    const pages: string[] = []

    for (const report of reports) {
      const width = Math.ceil(report.getBoundingClientRect().width)
      const pointsPerPixel = contentWidth / width
      const pageHeight = Math.floor(contentHeight / pointsPerPixel)

      for (const page of getPageRanges(report, pageHeight)) {
        const canvas = await html2canvas(report, {
          backgroundColor: '#fff',
          scale: 2,
          useCORS: true,
          logging: false,
          width,
          height: page.height,
          y: page.top,
        })

        const image = canvas.toDataURL('image/png')
        if (pages.length > 0) pdf.addPage()
        pdf.addImage(image, 'PNG', margin, margin, contentWidth, page.height * pointsPerPixel, undefined, 'FAST')
        pages.push(image)
        canvas.width = 0
        canvas.height = 0
      }
    }

    return {
      pdf: pdf.output('blob'),
      pages,
      placement: {
        left: `${margin / 612 * 100}%`,
        top: `${margin / 792 * 100}%`,
        width: `${contentWidth / 612 * 100}%`,
      },
    }
  } finally {
    frame.remove()
    fontMetricsStyle.remove()
  }
}
