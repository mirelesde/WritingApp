import { describe, expect, it, vi } from 'vitest'
import { DiskConflicts, type DiskHost, type TextEditor } from './diskConflicts.svelte'

// The mocks' types are inferred, so the helper's return type is left to inference.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(files: Record<string, { editor: string; disk: string; baseline: string }> = {}) {
  const editors: Record<string, TextEditor> = {}
  for (const [path, f] of Object.entries(files)) {
    let text = f.editor
    editors[path] = { getText: () => text, replaceText: (t) => (text = t) }
  }
  const host = {
    trust: vi.fn(),
    baseline: (p: string) => files[p]?.baseline,
    change: vi.fn(),
    discard: vi.fn(),
    showText: vi.fn((p: string, t: string) => editors[p]?.replaceText(t)),
    editor: (p: string) => editors[p],
    readSheet: vi.fn(async (p: string) => {
      const f = files[p]
      if (!f) throw new Error('gone')
      return f.disk
    }),
    info: vi.fn()
  } satisfies DiskHost
  return { host, disk: new DiskConflicts(host) }
}

describe('resolving a clash', () => {
  it('keeps my text: trusts the disk version, queues mine', () => {
    const { host, disk } = setup()
    disk.raise('/a', 'mine', 'theirs')
    disk.keepMine()
    expect(host.trust).toHaveBeenCalledWith('/a', 'theirs')
    expect(host.change).toHaveBeenCalledWith('/a', 'mine')
    expect(disk.current).toBeNull()
  })

  it('takes the disk version and drops my unsaved text', () => {
    const { host, disk } = setup()
    disk.raise('/a', 'mine', 'theirs')
    disk.useDisk()
    expect(host.discard).toHaveBeenCalledWith('/a')
    expect(host.showText).toHaveBeenCalledWith('/a', 'theirs')
    expect(host.info).toHaveBeenCalledWith('Reloaded the version from disk')
  })

  it('takes a merge as the new text', () => {
    const { host, disk } = setup()
    disk.raise('/a', 'mine', 'theirs')
    disk.useMerged('both')
    expect(host.showText).toHaveBeenCalledWith('/a', 'both')
    expect(host.change).toHaveBeenCalledWith('/a', 'both')
    expect(host.info).toHaveBeenCalledWith('Combined the two versions')
  })

  it('does not replace a clash already waiting for the same sheet', () => {
    const { disk } = setup()
    disk.raise('/a', 'one', 'x')
    disk.raise('/a', 'two', 'y')
    expect(disk.current?.mine).toBe('one')
  })

  it('ignores a choice when there is no clash', () => {
    const { host, disk } = setup()
    disk.keepMine()
    disk.useDisk()
    disk.useMerged('x')
    expect(host.trust).not.toHaveBeenCalled()
  })
})

describe('checking open sheets against the disk', () => {
  it('leaves an unchanged sheet alone, and trusts it', async () => {
    const { host, disk } = setup({ '/a': { editor: 'same', disk: 'same', baseline: 'old' } })
    await disk.check(['/a'])
    expect(host.trust).toHaveBeenCalledWith('/a', 'same')
    expect(host.info).not.toHaveBeenCalled()
  })

  it('reloads a sheet I have not touched', async () => {
    const { host, disk } = setup({ '/a': { editor: 'old', disk: 'new', baseline: 'old' } })
    await disk.check(['/a'])
    expect(host.showText).toHaveBeenCalledWith('/a', 'new')
    expect(host.info).toHaveBeenCalledWith('A sheet changed outside the app and was reloaded')
    expect(disk.current).toBeNull()
  })

  it('asks when both sides changed', async () => {
    const { disk } = setup({ '/a': { editor: 'mine', disk: 'theirs', baseline: 'old' } })
    await disk.check(['/a'])
    expect(disk.current).toEqual({ path: '/a', mine: 'mine', disk: 'theirs' })
  })

  it('does nothing when only my side changed', async () => {
    const { disk } = setup({ '/a': { editor: 'mine', disk: 'old', baseline: 'old' } })
    await disk.check(['/a'])
    expect(disk.current).toBeNull()
  })

  it('skips a sheet with no editor or that vanished', async () => {
    const { disk } = setup({ '/a': { editor: 'x', disk: 'y', baseline: 'x' } })
    await expect(disk.check(['/none', '/a'])).resolves.toBeUndefined()
  })
})
