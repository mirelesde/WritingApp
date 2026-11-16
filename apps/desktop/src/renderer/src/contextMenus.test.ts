import { describe, expect, it, vi } from 'vitest'
import { ContextMenus, type NodeKind } from './contextMenus.svelte'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(over: { library?: boolean; selected?: boolean; group?: string } = {}) {
  const order: string[] = []
  const api = {
    revealPath: vi.fn(async () => undefined),
    copyPath: vi.fn(async () => undefined),
    newWindow: vi.fn(async () => undefined),
    replaceMisspelling: vi.fn(async () => undefined),
    addToDictionary: vi.fn(async () => undefined),
    editCommand: vi.fn(async () => undefined)
  }
  const host = {
    hasLibrary: () => over.library ?? true,
    isMac: true,
    isSelected: () => over.selected ?? false,
    selectSheet: vi.fn(async () => void order.push('select')),
    selectedGroup: () => over.group ?? '/L',
    selectGroup: vi.fn(),
    canPaste: () => false,
    tick: vi.fn(async () => void order.push('tick')),
    focusTree: vi.fn(() => void order.push('focus')),
    newSheet: vi.fn(async () => undefined),
    newGroup: vi.fn(async () => undefined),
    frontTab: vi.fn(() => '/L/Front'),
    openTab: vi.fn(async () => undefined),
    openKeywords: vi.fn(),
    startRename: vi.fn(),
    duplicate: vi.fn(async () => void order.push('duplicate')),
    paste: vi.fn(async () => void order.push('paste')),
    copy: vi.fn(() => void order.push('copy')),
    remove: vi.fn(async () => void order.push('remove')),
    moveTo: vi.fn(() => void order.push('move'))
  }
  return { api, host, order, menus: new ContextMenus(api, host) }
}
const at = { x: 1, y: 2 }
const run = (t: ReturnType<typeof setup>, kind: NodeKind, action: string): Promise<void> =>
  t.menus.act(kind, '/L/A', action)

describe('ContextMenus', () => {
  it('selects the sheet that was right-clicked, unless it already is', async () => {
    const t = setup()
    await t.menus.showNode('sheet', '/L/a', at)
    expect(t.host.selectSheet).toHaveBeenCalledWith('/L/a')
    expect(t.menus.current).toMatchObject(at)
    const sel = setup({ selected: true })
    await sel.menus.showNode('sheet', '/L/a', at)
    expect(sel.host.selectSheet).not.toHaveBeenCalled()
  })

  it('selects the group that was right-clicked, unless it already is', async () => {
    const t = setup()
    await t.menus.showNode('group', '/L/A', at)
    expect(t.host.selectGroup).toHaveBeenCalledWith('/L/A')
    const same = setup({ group: '/L/A' })
    await same.menus.showNode('group', '/L/A', at)
    expect(same.host.selectGroup).not.toHaveBeenCalled()
  })

  it('shows no menu without a library, and closes', async () => {
    const t = setup({ library: false })
    await t.menus.showNode('sheet', '/x', at)
    expect(t.menus.current).toBeNull()
    await setup().menus.showNode('sheet', '/x', at)
    const u = setup()
    await u.menus.showNode('sheet', '/x', at)
    u.menus.close()
    expect(u.menus.current).toBeNull()
  })

  it('hands Open in New Tab the sheet the front tab had before the click selected the new one', async () => {
    const t = setup()
    await t.menus.showNode('sheet', '/L/a', at)
    t.menus.current?.onpick({ label: 'Open in New Tab', action: 'open-tab' })
    await Promise.resolve()
    expect(t.host.openTab).toHaveBeenCalledWith('/L/a', '/L/Front')
  })

  it('passes simple actions straight through', async () => {
    const t = setup()
    await run(t, 'sheet', 'reveal')
    await run(t, 'sheet', 'copy-path')
    await run(t, 'sheet', 'open-window')
    await run(t, 'sheet', 'open-tab')
    await run(t, 'root', 'new-group')
    expect(t.api.revealPath).toHaveBeenCalledWith('/L/A')
    expect(t.api.copyPath).toHaveBeenCalledWith('/L/A')
    expect(t.api.newWindow).toHaveBeenCalledWith('/L/A')
    expect(t.host.openTab).toHaveBeenCalledWith('/L/A', undefined)
    expect(t.host.newGroup).toHaveBeenCalledWith(true)
  })

  it('gives the tree focus before acting on a group', async () => {
    const t = setup()
    await run(t, 'group', 'delete')
    expect(t.order).toEqual(['focus', 'tick', 'remove'])
    const s = setup()
    await run(s, 'sheet', 'duplicate')
    expect(s.order).toEqual(['tick', 'duplicate'])
  })

  it('cuts, copies and pastes', async () => {
    const t = setup()
    await run(t, 'sheet', 'cut')
    await run(t, 'sheet', 'copy')
    await run(t, 'sheet', 'paste')
    expect(t.host.copy.mock.calls).toEqual([[true], [false]])
    expect(t.host.paste).toHaveBeenCalled()
  })

  it('opens Move to… after the right pane has focus', async () => {
    const t = setup()
    await run(t, 'group', 'move')
    await run(t, 'sheet', 'move')
    expect(t.order).toEqual(['focus', 'move', 'tick', 'move'])
  })

  it('sends text menu choices to the main process', () => {
    const t = setup()
    t.menus.showText({
      x: 0,
      y: 0,
      editFlags: {},
      misspelledWord: 'teh',
      dictionarySuggestions: ['the']
    } as never)
    const pick = t.menus.current!.onpick
    pick({ action: 'replace-misspelling', value: 'the' } as never)
    pick({ action: 'select-all' } as never)
    pick({ action: 'copy' } as never)
    expect(t.api.replaceMisspelling).toHaveBeenCalledWith('the')
    expect(t.api.editCommand.mock.calls).toEqual([['selectAll'], ['copy']])
  })
})
