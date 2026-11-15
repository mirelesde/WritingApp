import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_VIEW } from '@writingapp/core'
import { buildPaletteCommands, type PaletteInput } from './paletteCommands'
import type { PaletteCommand } from './palette'

let input: PaletteInput
const calls = {
  command: vi.fn(),
  setView: vi.fn(),
  newFromTemplate: vi.fn(),
  toggleOutline: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  input = {
    keyMod: '⌘',
    keyShift: '⇧',
    styles: [
      [{ kind: 'heading-1' as never, label: 'Heading 1', hint: '1' }],
      [
        { kind: 'quote' as never, label: 'Quote', keys: 'Q' },
        { kind: 'code' as never, label: 'Code' }
      ]
    ],
    sorts: [
      ['manual', 'Manual order'],
      ['title', 'Title']
    ],
    templates: [{ name: 'Letter', path: '/T/letter.md' }],
    unusedCount: 0,
    conflictCount: 0,
    zen: false,
    view: { ...DEFAULT_VIEW, focusMode: false, typewriter: true, lineNumbers: false, fontSize: 20 },
    ...calls
  }
})

const find = (label: string): PaletteCommand | undefined =>
  buildPaletteCommands(input).find((c) => c.label === label)

describe('buildPaletteCommands', () => {
  it('gives every command a unique id', () => {
    const ids = buildPaletteCommands(input).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('shows shortcuts with the platform keys', () => {
    expect(find('New Sheet')?.shortcut).toBe('⌘N')
    input.keyMod = 'Ctrl+'
    input.keyShift = 'Shift+'
    expect(find('New Group')?.shortcut).toBe('Ctrl+Shift+N')
  })

  it('runs menu commands through the handler', () => {
    find('Split at Cursor')!.run()
    expect(calls.command).toHaveBeenCalledWith('split')
  })

  it('offers one entry per template and runs it', () => {
    const t = find('New Sheet from Template: Letter')!
    t.run()
    expect(calls.newFromTemplate).toHaveBeenCalledWith('/T/letter.md')
  })

  it('adds counts to clean-up and conflicts only when there are some', () => {
    expect(find('Clean Up Unused Images…')).toBeDefined()
    expect(find('Resolve Sync Conflicts…')).toBeDefined()
    input.unusedCount = 3
    input.conflictCount = 2
    expect(find('Clean Up Unused Images… (3)')).toBeDefined()
    expect(find('Resolve Sync Conflicts… (2)')).toBeDefined()
  })

  it('words the toggles from the current state', () => {
    expect(find('Turn on Focus Mode')).toBeDefined()
    expect(find('Turn off Typewriter Scrolling')).toBeDefined()
    expect(find('Show Line Numbers')).toBeDefined()
    expect(find('Distraction-Free Mode')).toBeDefined()
    input.zen = true
    expect(find('Leave Distraction-Free Mode')).toBeDefined()
  })

  it('changes the setting a command names', () => {
    find('Turn on Focus Mode')!.run()
    expect(calls.setView).toHaveBeenLastCalledWith({ focusMode: true })
    find('Larger Text')!.run()
    expect(calls.setView).toHaveBeenLastCalledWith({ fontSize: 21 })
    find('Dark Theme')!.run()
    expect(calls.setView).toHaveBeenLastCalledWith({ theme: 'dark' })
    find('Sheets by Title')!.run()
    expect(calls.setView).toHaveBeenLastCalledWith({ sheetSort: 'title' })
  })

  it('lists the styles with their shortcut hints', () => {
    expect(find('Heading 1')?.shortcut).toBe('⌘⌥1')
    expect(find('Quote')?.shortcut).toBe('⌘Q')
    expect(find('Code')?.shortcut).toBeUndefined()
  })

  it('toggles the outline through its own function', () => {
    find('Toggle Outline')!.run()
    expect(calls.toggleOutline).toHaveBeenCalled()
  })

  it('falls back to a default text size before the settings load', () => {
    input.view = null
    find('Larger Text')!.run()
    expect(calls.setView).toHaveBeenLastCalledWith({ fontSize: 19 })
  })
})
