import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportFlow, type ExportHost } from './exportFlow.svelte'

const preview = { title: 'T', html: '<p>x</p>', sheets: 2, images: [], imageBytes: 0 }

let api: Record<string, ReturnType<typeof vi.fn>>
let host: {
  fail: ReturnType<typeof vi.fn>
  info: ReturnType<typeof vi.fn>
  clearNotice: ReturnType<typeof vi.fn>
}
let flow: ExportFlow

beforeEach(() => {
  api = {
    previewExport: vi.fn().mockResolvedValue(preview),
    saveExport: vi.fn().mockResolvedValue('/out/Book.html'),
    saveExportMarkdown: vi.fn().mockResolvedValue('/out/Book.md'),
    saveExportDocx: vi.fn().mockResolvedValue(null),
    saveExportPdf: vi.fn().mockResolvedValue('C:\\out\\Book.pdf'),
    saveExportEpub: vi.fn().mockRejectedValue(new Error('disk full'))
  }
  host = { fail: vi.fn(), info: vi.fn(), clearNotice: vi.fn() }
  flow = new ExportFlow(api as never, host as unknown as ExportHost)
})

describe('ExportFlow', () => {
  it('previews the paths it is given and clears an old notice', async () => {
    await flow.open(['/L/a.md'])
    expect(api.previewExport).toHaveBeenCalledWith(['/L/a.md'])
    expect(flow.preview).toEqual(preview)
    expect(host.clearNotice).toHaveBeenCalled()
  })

  it('reports a failed preview and shows no dialog', async () => {
    api.previewExport.mockRejectedValue(new Error('nope'))
    await flow.open(['/L/a.md'])
    expect(host.fail).toHaveBeenCalledOnce()
    expect(flow.preview).toBeNull()
  })

  it('saves the paths it previewed, closes, and names the file', async () => {
    await flow.open(['/L/a.md', '/L/b.md'])
    await flow.save('embed', 'body{}', { title: 'T', author: 'A' } as never)
    expect(api.saveExport).toHaveBeenCalledWith(['/L/a.md', '/L/b.md'], 'embed', 'body{}', {
      title: 'T',
      author: 'A'
    })
    expect(flow.preview).toBeNull()
    expect(host.info).toHaveBeenCalledWith('Exported to Book.html')
    expect(flow.saving).toBe(false)
  })

  it('takes the file name from a Windows path too', async () => {
    await flow.open(['/L/a.md'])
    await flow.savePdf({} as never, '', null)
    expect(api.saveExportPdf).toHaveBeenCalledWith(['/L/a.md'], {}, '', null)
    expect(host.info).toHaveBeenCalledWith('Exported to Book.pdf')
  })

  it('keeps the dialog open when the save was cancelled', async () => {
    await flow.open(['/L/a.md'])
    await flow.saveDocx({} as never)
    expect(flow.preview).toEqual(preview)
    expect(host.info).not.toHaveBeenCalled()
    expect(flow.saving).toBe(false)
  })

  it('reports a failed save and closes the dialog', async () => {
    await flow.open(['/L/a.md'])
    await flow.saveEpub({} as never, '')
    expect(host.fail).toHaveBeenCalledOnce()
    expect(flow.preview).toBeNull()
    expect(flow.saving).toBe(false)
  })

  it('shows that a save is under way', async () => {
    await flow.open(['/L/a.md'])
    let during: boolean | undefined
    api.saveExportMarkdown.mockImplementation(async () => {
      during = flow.saving
      return '/out/x.md'
    })
    await flow.saveMarkdown()
    expect(during).toBe(true)
  })

  it('closes on request', async () => {
    await flow.open(['/L/a.md'])
    flow.close()
    expect(flow.preview).toBeNull()
  })
})
