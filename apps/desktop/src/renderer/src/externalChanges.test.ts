import { describe, expect, it, vi } from 'vitest'
import type { LibraryInfo } from '../../preload/api'
import { takeExternalChange, type ExternalHost } from './externalChanges'

const lib = (path: string, tree: unknown): LibraryInfo => ({ path, tree }) as unknown as LibraryInfo

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(over: Partial<ExternalHost> = {}, current: LibraryInfo | null = lib('/L', { v: 1 })) {
  let open = ['/L/a']
  const host = {
    library: () => current,
    setLibrary: vi.fn(),
    openPaths: () => open,
    checkImages: vi.fn(),
    keepGroup: vi.fn(() => false),
    clearSheets: vi.fn(),
    refreshOpen: vi.fn(async () => {
      open = []
    }),
    checkConflicts: vi.fn(async () => undefined),
    ...over
  }
  return { host, close: () => (open = []) }
}

describe('takeExternalChange', () => {
  it('ignores another library, and no library', async () => {
    const t = setup()
    await takeExternalChange(lib('/other', { v: 2 }), t.host)
    const none = setup({}, null)
    await takeExternalChange(lib('/L', { v: 2 }), none.host)
    expect(t.host.setLibrary).not.toHaveBeenCalled()
    expect(none.host.setLibrary).not.toHaveBeenCalled()
  })

  it('does nothing when the tree is the same and nothing is open', async () => {
    const t = setup({ openPaths: () => [] })
    await takeExternalChange(lib('/L', { v: 1 }), t.host)
    expect(t.host.checkConflicts).not.toHaveBeenCalled()
  })

  it('still checks the open sheets for conflicts when only their text changed', async () => {
    const t = setup()
    await takeExternalChange(lib('/L', { v: 1 }), t.host)
    expect(t.host.setLibrary).not.toHaveBeenCalled()
    expect(t.host.checkConflicts).toHaveBeenCalledWith(['/L/a'])
  })

  it('takes in a new tree and refreshes what is open', async () => {
    const t = setup({ refreshOpen: vi.fn(async () => undefined) })
    const next = lib('/L', { v: 2 })
    await takeExternalChange(next, t.host)
    expect(t.host.setLibrary).toHaveBeenCalledWith(next)
    expect(t.host.checkImages).toHaveBeenCalled()
    expect(t.host.refreshOpen).toHaveBeenCalled()
    expect(t.host.checkConflicts).toHaveBeenCalledWith(['/L/a'])
  })

  it('skips the conflict check when the change closed the sheet', async () => {
    const t = setup()
    await takeExternalChange(lib('/L', { v: 2 }), t.host)
    expect(t.host.checkConflicts).not.toHaveBeenCalled()
  })

  it('clears the list when the selected group is gone', async () => {
    const t = setup({ keepGroup: vi.fn(() => true) })
    await takeExternalChange(lib('/L', { v: 2 }), t.host)
    expect(t.host.clearSheets).toHaveBeenCalled()
    expect(t.host.refreshOpen).not.toHaveBeenCalled()
  })
})
