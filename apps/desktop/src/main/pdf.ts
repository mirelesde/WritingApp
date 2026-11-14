import { promises as nodeFs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { hasContentsLinks, pagesBySlug, setsPageSize, withPageNumbers } from '@writingapp/core'
import type { PdfOptions } from '../preload/api'
import { readOutline } from './pdfOutline'
import { withTimeout } from './timeout'

/** A print that takes longer than this has hung (a 1,000-page book takes well under a minute). */
const PRINT_TIMEOUT_MS = 120_000

const MARGIN_INCHES = { narrow: 0.6, normal: 1, wide: 1.4 } as const

/** Checks a value from the renderer and returns clean options. */
export function parsePdfOptions(value: unknown): PdfOptions {
  const v = (value ?? {}) as Partial<PdfOptions>
  if (v.pageSize !== 'A4' && v.pageSize !== 'Letter') throw new Error('Unknown page size')
  if (v.margin === undefined || !(v.margin in MARGIN_INCHES)) throw new Error('Unknown margin')
  return { pageSize: v.pageSize, margin: v.margin, pageNumbers: v.pageNumbers === true, runningTitle: v.runningTitle === true }
}

/**
 * Renders a standalone HTML page to PDF in a hidden window that cannot run
 * scripts, using the page's own print stylesheet. With a table of contents it
 * prints twice: once to see which page each heading falls on, then again with
 * those numbers filled in (they take the room the placeholders held).
 */
export async function renderPdf(html: string, options: PdfOptions): Promise<Buffer> {
  if (!hasContentsLinks(html)) return print(html, options, false)
  const draft = withPageNumbers(html, null)
  let pages: Record<string, number> = {}
  try {
    const first = await print(draft, options, true)
    pages = pagesBySlug(html, await readOutline(first))
  } catch {
    // Without the page numbers the contents still lists every heading.
  }
  return print(withPageNumbers(html, pages), options, false)
}

async function print(html: string, options: PdfOptions, outline: boolean): Promise<Buffer> {
  const dir = await nodeFs.mkdtemp(join(tmpdir(), 'writingapp-pdf-'))
  const file = join(dir, 'export.html')
  await nodeFs.writeFile(file, html, 'utf8')
  const window = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true }
  })
  try {
    return await withTimeout(render(window, file, html, options, outline), PRINT_TIMEOUT_MS, 'Making the PDF took too long, so it was stopped. Try fewer sheets.')
  } finally {
    window.destroy()
    await nodeFs.rm(dir, { recursive: true, force: true })
  }
}

async function render(window: BrowserWindow, file: string, html: string, options: PdfOptions, outline: boolean): Promise<Buffer> {
  await window.loadFile(file)
  const margin = MARGIN_INCHES[options.margin]
  return await window.webContents.printToPDF({
    pageSize: options.pageSize,
    margins: { top: margin, bottom: margin, left: margin, right: margin },
    displayHeaderFooter: options.pageNumbers || options.runningTitle === true,
    headerTemplate: options.runningTitle
      ? '<div style="width:100%;text-align:center;font-size:9px;font-family:sans-serif;color:#555"><span class="title"></span></div>'
      : '<span></span>',
    footerTemplate: options.pageNumbers
      ? '<div style="width:100%;text-align:center;font-size:9px;font-family:sans-serif;color:#555"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
      : '<span></span>',
    preferCSSPageSize: setsPageSize(html),
    printBackground: false,
    ...(outline ? { generateDocumentOutline: true, generateTaggedPDF: true } : {})
    })
}
