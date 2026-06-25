import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const A4_W_MM  = 210
const A4_H_MM  = 297
const A4_W_PX  = 794   // A4 width at 96 dpi
const A4_H_PX  = 1122  // A4 height at 96 dpi
const SCALE    = 2     // html2canvas render scale

const PRINT_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; }
  h1 { font-size: 2em; font-weight: 700; margin: 0 0 0.6em; line-height: 1.3; }
  h2 { font-size: 1.5em; font-weight: 600; margin: 0.8em 0 0.4em; }
  h3 { font-size: 1.2em; font-weight: 600; margin: 0.8em 0 0.4em; }
  p  { margin: 0.4em 0; }
  ul, ol { padding-left: 1.5em; margin: 0.4em 0; }
  li > p { margin: 0; }
  blockquote { border-left: 3px solid #ddd; padding-left: 1em; color: #555; margin: 0.5em 0; }
  code { background: #f0f0f0; border-radius: 3px; padding: 1px 4px; font-family: monospace; font-size: 0.9em; }
  pre  { background: #1e1e1e; color: #d4d4d4; border-radius: 6px; padding: 16px; margin: 0.6em 0; overflow: hidden; }
  pre code { background: none; padding: 0; color: inherit; }
  hr  { border: none; border-top: 2px solid #eee; margin: 1.5em 0; }
  a   { color: #4f6ef7; text-decoration: underline; }
  img { max-width: 100%; border-radius: 4px; }
  mark { background: #ffe066; border-radius: 2px; padding: 0 2px; }
  table { border-collapse: collapse; width: 100%; margin: 0.6em 0; }
  td, th { border: 1px solid #ddd; padding: 6px 12px; }
  th { background: #f5f5f5; font-weight: 600; }
  ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
  ul[data-type="taskList"] li label { flex-shrink: 0; margin-top: 3px; }
  ul[data-type="taskList"] li div { flex: 1; }
  s { text-decoration: line-through; }
`

function buildPrintContainer(title: string, html: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.style.cssText = [
    'position:absolute',
    'top:0',
    'left:-9999px',
    'width:794px',
    'background:#ffffff',
    'padding:56px 60px',
    'font-size:15px',
    'line-height:1.7',
    'color:#1a1a1a',
  ].join(';')

  const style = document.createElement('style')
  style.textContent = PRINT_STYLES
  wrapper.appendChild(style)

  if (title) {
    const h = document.createElement('h1')
    h.textContent = title
    h.style.cssText = 'font-size:2em;font-weight:700;margin-bottom:0.6em;line-height:1.3;'
    wrapper.appendChild(h)

    const hr = document.createElement('hr')
    hr.style.cssText = 'border:none;border-top:2px solid #eee;margin-bottom:1.2em;'
    wrapper.appendChild(hr)
  }

  const content = document.createElement('div')
  content.innerHTML = html
  wrapper.appendChild(content)

  return wrapper
}

/**
 * Measure the top/bottom of every block-level element inside the container,
 * in pixels relative to the container's top edge.
 * Must be called while the container is attached to the DOM.
 */
function measureBlockBoundaries(container: HTMLElement): Array<{ top: number; bottom: number }> {
  const containerTop = container.getBoundingClientRect().top

  // Query all meaningful block elements (including table rows so tables can split between rows)
  const nodes = container.querySelectorAll(
    'p, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, pre, table, tr, img, hr'
  )

  const bounds: Array<{ top: number; bottom: number }> = []
  for (const el of nodes) {
    const r = (el as HTMLElement).getBoundingClientRect()
    const top    = Math.round(r.top    - containerTop)
    const bottom = Math.round(r.bottom - containerTop)
    if (bottom > top && top >= 0) {
      bounds.push({ top, bottom })
    }
  }

  return bounds.sort((a, b) => a.top - b.top)
}

/**
 * Given block boundaries (in DOM px) and the canvas dimensions, return the list
 * of canvas-y positions at which we should break pages.
 *
 * Strategy per page:
 *   - ideal break = current_start + page_height
 *   - find the latest block BOTTOM that is ≤ ideal (break AFTER that block, no cut)
 *   - if nothing fits, try to break BEFORE the block that straddles the boundary
 *   - last resort: break at the ideal position (element taller than one page)
 */
function findPageBreaks(
  blocksPx: Array<{ top: number; bottom: number }>,
  canvasTotalH: number,
  canvasPageH: number,
): number[] {
  // Convert DOM-px boundaries → canvas-px boundaries (multiply by SCALE)
  const blocks = blocksPx.map(b => ({
    top:    b.top    * SCALE,
    bottom: b.bottom * SCALE,
  }))

  const breaks: number[] = []
  let start = 0

  while (start + canvasPageH < canvasTotalH) {
    const ideal = start + canvasPageH

    // Option A: break AFTER the last complete block that fits
    let afterBlock = -1
    for (const b of blocks) {
      if (b.top >= start && b.bottom <= ideal) {
        if (b.bottom > afterBlock) afterBlock = b.bottom
      }
    }
    if (afterBlock > start) {
      breaks.push(afterBlock)
      start = afterBlock
      continue
    }

    // Option B: break BEFORE the block that straddles the page boundary
    // (only worthwhile if the block doesn't start right at `start`)
    for (const b of blocks) {
      if (b.top > start && b.top < ideal && b.bottom > ideal) {
        if (b.top - start > canvasPageH * 0.25) {
          breaks.push(b.top)
          start = b.top
        } else {
          // Element starts too close to `start`; force-break at ideal
          breaks.push(ideal)
          start = ideal
        }
        break
      }
    }

    // Option C: no suitable boundary found (element is taller than a full page)
    // just cut at the ideal position
    if (breaks.length === 0 || breaks[breaks.length - 1] !== start) {
      breaks.push(ideal)
      start = ideal
    }
  }

  return breaks
}

/**
 * Slice the canvas at the given break points and produce a jsPDF document.
 * Each slice becomes one A4 page; slices shorter than A4 leave white space at
 * the bottom of the page (correct print behaviour).
 */
function sliceToPdf(canvas: HTMLCanvasElement, breaks: number[]): jsPDF {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pxPerMm = canvas.width / A4_W_MM

  let prevY = 0
  const allBreaks = [...breaks, canvas.height]

  for (let i = 0; i < allBreaks.length; i++) {
    const y0 = prevY
    const y1 = allBreaks[i]
    const h  = y1 - y0
    if (h <= 0) continue

    const slice = document.createElement('canvas')
    slice.width  = canvas.width
    slice.height = h
    const ctx = slice.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, slice.width, slice.height)
    ctx.drawImage(canvas, 0, y0, canvas.width, h, 0, 0, canvas.width, h)

    if (i > 0) pdf.addPage()
    pdf.addImage(
      slice.toDataURL('image/jpeg', 0.92),
      'JPEG',
      0, 0,
      A4_W_MM,
      Math.min(h / pxPerMm, A4_H_MM),
    )

    prevY = y1
  }

  return pdf
}

/**
 * If the HTML consists only of PDF-imported page images (img + hr elements
 * with alt="第 N 页"), extract their data URLs so we can bypass html2canvas.
 */
function extractPdfPageImages(html: string): string[] | null {
  const body = new DOMParser()
    .parseFromString(`<body>${html}</body>`, 'text/html').body

  const children = Array.from(body.children) as HTMLElement[]
  if (children.length === 0) return null

  // Only <img> and <hr> elements are allowed
  if (children.some(c => c.tagName !== 'IMG' && c.tagName !== 'HR')) return null

  const imgs = children.filter(c => c.tagName === 'IMG') as HTMLImageElement[]
  if (imgs.length === 0) return null

  // Confirm these are images we generated (alt = "第 N 页")
  if (!imgs.every(img => /^第 \d+ 页$/.test(img.alt))) return null

  return imgs.map(img => img.getAttribute('src') ?? '')
}

/** Load an image and return its natural dimensions. */
function loadImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = reject
    img.src = src
  })
}

/**
 * Build a PDF directly from data-URL images, one image per A4 page,
 * fitting the image to fill the full page while preserving aspect ratio.
 * This path is used for imported-PDF documents to avoid double-rendering.
 */
async function imagePagesToPdf(dataUrls: string[]): Promise<jsPDF> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  for (let i = 0; i < dataUrls.length; i++) {
    if (i > 0) pdf.addPage()

    const { w, h } = await loadImageSize(dataUrls[i])
    const imgRatio = w / h
    const a4Ratio  = A4_W_MM / A4_H_MM

    let x = 0, y = 0, imgW = A4_W_MM, imgH = A4_H_MM
    if (Math.abs(imgRatio - a4Ratio) > 0.01) {
      // Non-A4 source: fit inside page, centred
      if (imgRatio > a4Ratio) {
        imgW = A4_W_MM
        imgH = A4_W_MM / imgRatio
        y    = (A4_H_MM - imgH) / 2
      } else {
        imgH = A4_H_MM
        imgW = A4_H_MM * imgRatio
        x    = (A4_W_MM - imgW) / 2
      }
    }

    pdf.addImage(dataUrls[i], 'JPEG', x, y, imgW, imgH)
  }

  return pdf
}

async function buildPdf(title: string, html: string): Promise<jsPDF> {
  // Fast path: document contains only imported-PDF page images
  const pdfImages = extractPdfPageImages(html)
  if (pdfImages) return imagePagesToPdf(pdfImages)

  // General path: render via html2canvas with smart page breaking
  const container = buildPrintContainer(title, html)
  document.body.appendChild(container)

  try {
    const blocks = measureBlockBoundaries(container)

    const canvas = await html2canvas(container, {
      scale: SCALE,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width:  container.scrollWidth,
      height: container.scrollHeight,
      windowWidth: A4_W_PX,
    })

    const canvasPageH = A4_H_PX * SCALE
    const breaks = findPageBreaks(blocks, canvas.height, canvasPageH)
    return sliceToPdf(canvas, breaks)
  } finally {
    document.body.removeChild(container)
  }
}

export async function exportToPdf(title: string, html: string, filename = '文档.pdf'): Promise<void> {
  const pdf = await buildPdf(title, html)
  pdf.save(filename)
}

export async function htmlToPdfBlob(title: string, html: string): Promise<Blob> {
  const pdf = await buildPdf(title, html)
  return pdf.output('blob')
}
