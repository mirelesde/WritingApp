import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString, type PDFObject } from 'pdf-lib'

/**
 * The headings Chromium listed in a PDF's outline (bookmarks), in reading order,
 * each with the 1-based page it is on. Entries whose page can't be worked out are left out.
 */
export async function readOutline(pdf: Uint8Array): Promise<{ title: string; page: number }[]> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false })
  const pageOf = new Map(doc.getPages().map((p, i) => [p.ref.toString(), i + 1]))
  const outlines = doc.catalog.lookup(PDFName.of('Outlines'))
  if (!(outlines instanceof PDFDict)) return []

  const out: { title: string; page: number }[] = []
  const visit = (first: PDFObject | undefined, depth: number): void => {
    let node = first
    for (let guard = 0; node && guard < 100000; guard++) {
      const item = doc.context.lookup(node)
      if (!(item instanceof PDFDict) || depth > 20) return
      const title = item.lookup(PDFName.of('Title'))
      const dest = item.lookup(PDFName.of('Dest'))
      const target = dest instanceof PDFArray ? dest.get(0) : undefined
      const page = target instanceof PDFRef ? pageOf.get(target.toString()) : undefined
      if ((title instanceof PDFString || title instanceof PDFHexString) && page !== undefined) {
        out.push({ title: title.decodeText(), page })
      }
      visit(item.get(PDFName.of('First')), depth + 1)
      node = item.get(PDFName.of('Next'))
    }
  }
  visit(outlines.get(PDFName.of('First')), 0)
  return out
}
