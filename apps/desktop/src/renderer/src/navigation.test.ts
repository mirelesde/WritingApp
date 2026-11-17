import { describe, expect, it, vi } from 'vitest'
import type { LibraryInfo } from '../../preload/api'
import { GroupNav } from './groupNav.svelte'
import { Navigation, type NavigationHost } from './navigation'
import { SelectionState } from './selectionState.svelte'

const info = { path: '/L', tree: { kind: 'group', path: '/L', name: 'L', children: [] } } as unknown as LibraryInfo

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(over: Partial<NavigationHost> = {}) {
  const nav = new GroupNav()
  const sel = new SelectionState()
  const order: string[] = []
  const host = {
    settle: vi.fn(async () => void order.push('settle')),
    setLibrary: vi.fn(),
    library: () => info as LibraryInfo | null,
    clearSheets: vi.fn(() => void order.push('clear')),
    setSelection: vi.fn(async () => void order.push('select')),
    clearFilter: vi.fn(),
    firstListed: () => '/L/A/a' as string | undefined,
    closeQuick: vi.fn(),
    onOpened: vi.fn(),
    ...over
  }
  return { nav, sel, host, order, go: new Navigation(nav, sel, host) }
}

describe('Navigation', () => {
  it('opens a library at its root, with nothing showing', () => {
    const t = setup()
    t.go.showLibrary(info)
    expect(t.host.setLibrary).toHaveBeenCalledWith(info)
    expect([t.nav.selectedGroup, t.nav.expanded]).toEqual(['/L', { '/L': true }])
    expect(t.host.clearSheets).toHaveBeenCalled()
    expect(t.host.onOpened).toHaveBeenCalled()
  })

  it('closes a library: nothing showing and nothing open', () => {
    const t = setup()
    t.go.closeLibrary()
    expect(t.host.clearSheets).toHaveBeenCalled()
    expect(t.host.setLibrary).toHaveBeenCalledWith(null)
  })

  it('chooses a group, clears the filter, and opens its first sheet', async () => {
    const t = setup()
    await t.go.selectGroup('/L/A')
    expect(t.nav.selectedGroup).toBe('/L/A')
    expect(t.host.clearFilter).toHaveBeenCalled()
    expect(t.order).toEqual(['settle', 'clear', 'select'])
    expect(t.sel.anchor).toBe('/L/A/a')
    expect(t.host.setSelection).toHaveBeenCalledWith(['/L/A/a'], '/L/A/a', false)
  })

  it('leaves the editor empty when the group has no sheets', async () => {
    const t = setup({ firstListed: () => undefined })
    await t.go.selectGroup('/L/B')
    expect(t.host.setSelection).not.toHaveBeenCalled()
  })

  it('shows a sheet found by search, opening the way to it', async () => {
    const t = setup()
    await t.go.revealSheet('/L/A/B/c', true)
    expect(t.host.closeQuick).toHaveBeenCalled()
    expect(t.nav.selectedGroup).toBe('/L/A/B')
    expect(t.nav.expanded).toMatchObject({ '/L': true, '/L/A': true, '/L/A/B': true })
    expect(t.host.setSelection).toHaveBeenCalledWith(['/L/A/B/c'], '/L/A/B/c', true)
  })

  it('does not take the cursor when told not to, and does nothing without a library', async () => {
    const t = setup()
    await t.go.revealSheet('/L/a', false)
    expect(t.host.setSelection).toHaveBeenCalledWith(['/L/a'], '/L/a', false)
    const none = setup({ library: () => null })
    await none.go.revealSheet('/L/a')
    expect(none.host.setSelection).not.toHaveBeenCalled()
  })
})
