import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export async function parsePdfToHtml(file: File): Promise<{ title: string; html: string }> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const pageParts: string[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)

    // Render page to JPEG at 1.5× scale (good quality / size balance)
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise
    const imgDataUrl = canvas.toDataURL('image/jpeg', 0.88)

    pageParts.push(`<img src="${imgDataUrl}" alt="第 ${pageNum} 页" />`)
  }

  await pdf.destroy()

  return {
    title: file.name.replace(/\.pdf$/i, ''),
    html: pageParts.join('\n<hr />\n') || '<p></p>',
  }
}
