import { describe, expect, it } from 'vitest'

import { editMenuItems, nodeMenuItems, type EditMenuInput, type MenuItem } from './contextMenu'

const labels = (items: MenuItem[]): string[] => items.map((i) => (i.separator ? '—' : (i.label ?? '')))

describe('node context menu', () => {
  it('offers the right items per kind', () => {
    expect(labels(nodeMenuItems('sheet', false, true))).toEqual([
      'Open in New Tab', 'Open in New Window', '—', 'Keywords…', '—', 'Duplicate', '—',
      'Cut', 'Copy', 'Paste', '—', 'Move to…', 'Move to Trash', '—', 'Reveal in Finder', 'Copy Path'
    ])
    expect(labels(nodeMenuItems('group', false, false))).toContain('Rename')
    expect(labels(nodeMenuItems('group', false, false))).toContain('Show in File Manager')
    expect(labels(nodeMenuItems('root', false, true))).not.toContain('Move to Trash')
    expect(labels(nodeMenuItems('root', false, true))).not.toContain('Rename')
  })
  it('only enables Paste when something was cut or copied', () => {
    const paste = (can: boolean): boolean | undefined =>
      nodeMenuItems('sheet', can, true).find((i) => i.label === 'Paste')?.disabled
    expect(paste(false)).toBe(true)
    expect(paste(true)).toBe(false)
  })
})

describe('edit context menu', () => {
  const base: EditMenuInput = { misspelledWord: '', suggestions: [], isEditable: true, hasSelection: false }

  it('offers suggestions and Add to Dictionary for a misspelled word', () => {
    const items = editMenuItems({ ...base, misspelledWord: 'teh', suggestions: ['the', 'tea', 'ten', 'tech', 'tel', 'tex'] }, true)
    expect(labels(items).slice(0, 7)).toEqual(['the', 'tea', 'ten', 'tech', 'tel', 'Add to Dictionary', '—'])
    expect(items[0]).toMatchObject({ action: 'replace-misspelling', value: 'the' })
    expect(items[5]).toMatchObject({ action: 'add-to-dictionary', value: 'teh' })
  })
  it('says when there are no suggestions', () => {
    expect(editMenuItems({ ...base, misspelledWord: 'zzq' }, true)[0]).toMatchObject({ label: 'No Spelling Suggestions', disabled: true })
  })
  it('has no spelling rows for a correct word', () => {
    expect(labels(editMenuItems(base, true))).toEqual(['Undo', 'Redo', '—', 'Cut', 'Copy', 'Paste', 'Select All'])
  })
  it('only copies from read-only text, and only with a selection', () => {
    expect(labels(editMenuItems({ ...base, isEditable: false, hasSelection: true }, false))).toEqual(['Copy', 'Select All'])
  })
  it('disables Cut and Copy without a selection and uses the platform shortcut', () => {
    const items = editMenuItems(base, false)
    expect(items.find((i) => i.label === 'Cut')?.disabled).toBe(true)
    expect(items.find((i) => i.label === 'Paste')?.hint).toBe('Ctrl+V')
  })
})
