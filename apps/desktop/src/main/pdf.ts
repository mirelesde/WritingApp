import { promises as nodeFs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import type { PdfOptions } from '../preload/api'

const MARGIN_INCHES = { narrow: 0.6, normal: 1, wide: 1.4 } as const

/** Checks a value from the renderer and returns clean options. */
export function parsePdfOptions(value: unknown): PdfOptions {
  const v = (value ?? {}) as Partial<PdfOptions>
  if (v.pageSize !== 'A4' && v.pageSize !== 'Letter') throw new Error('Unknown page size')
  if (v.margin === undefined || !(v.margin in MARGIN_INCHES)) throw new Error('Unknown margin')
  return { pageSize: v.pageSize, margin: v.margin, pageNumbers: v.pageNumbers === true }
}

/**
 * Renders a standalone HTML page to PDF in a hidden window that cannot run
 * scripts, using the page's own print stylesheet.
 */
export async function renderPdf(html: string, options: PdfOptions): Promise<Buffer> {
  const dir = await nodeFs.mkdtemp(join(tmpdir(), 'writingapp-pdf-'))
  const file = join(dir, 'export.html')
  await nodeFs.writeFile(file, html, 'utf8')
  const window = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true }
  })
  try {
    await window.loadFile(file)
    const margin = MARGIN_INCHES[options.margin]
    return await window.webContents.printToPDF({
      pageSize: options.pageSize,
      margins: { top: margin, bottom: margin, left: margin, right: margin },
      displayHeaderFooter: options.pageNumbers,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="width:100%;text-align:center;font-size:9px;font-family:sans-serif;color:#555"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      printBackground: false
    })
  } finally {
    window.destroy()
    await nodeFs.rm(dir, { recursive: true, force: true })
  }
}
