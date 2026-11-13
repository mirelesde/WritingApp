import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ Menu: {}, BrowserWindow: {}, clipboard: {}, ipcMain: {}, shell: {} }))
vi.mock('./library', () => ({ inside: (p: string) => p }))

import { nodeMenuTemplate } from './nodeMenu'

const labels = (kind: 'sheet' | 'group' | 'root'): string[] =>
  nodeMenuTemplate(kind, vi.fn(), vi.fn(), vi.fn()).map((i) => i.label ?? '—')

describe('node context menu', () => {
  it('offers the right items per kind', () => {
    expect(labels('sheet')).toEqual(['Move to…', 'Move to Trash', '—', expect.stringMatching(/Finder|File Manager/), 'Copy Path'])
    expect(labels('group')).toContain('Rename')
    expect(labels('group')).toContain('New Sheet')
    expect(labels('root')).not.toContain('Move to Trash')
    expect(labels('root')).not.toContain('Rename')
  })
  it('reports the chosen action', () => {
    const choose = vi.fn()
    nodeMenuTemplate('group', choose, vi.fn(), vi.fn())[3].click?.({} as never, undefined, {} as never)
    expect(choose).toHaveBeenCalledWith('rename')
  })
})
