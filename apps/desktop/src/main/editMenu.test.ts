import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ Menu: {} }))

import { editMenuTemplate } from './editMenu'

const actions = { replaceMisspelling: vi.fn(), addToDictionary: vi.fn() }
const base = { misspelledWord: '', suggestions: [], isEditable: true, hasSelection: false }
const labels = (items: ReturnType<typeof editMenuTemplate>): string[] =>
  items.map((i) => i.label ?? i.role ?? i.type ?? '')

describe('editor context menu', () => {
  it('offers suggestions and Add to Dictionary for a misspelled word', () => {
    const items = editMenuTemplate(
      { ...base, misspelledWord: 'teh', suggestions: ['the', 'tea', 'ten', 'tech', 'tel', 'tex'] },
      actions
    )
    expect(labels(items).slice(0, 7)).toEqual([
      'the',
      'tea',
      'ten',
      'tech',
      'tel',
      'Add to Dictionary',
      'separator'
    ])
    items[0].click?.({} as never, undefined, {} as never)
    expect(actions.replaceMisspelling).toHaveBeenCalledWith('the')
    items[5].click?.({} as never, undefined, {} as never)
    expect(actions.addToDictionary).toHaveBeenCalledWith('teh')
  })

  it('says so when there are no suggestions', () => {
    const items = editMenuTemplate({ ...base, misspelledWord: 'qzxv' }, actions)
    expect(items[0]).toMatchObject({ label: 'No Spelling Suggestions', enabled: false })
  })

  it('has only the edit commands when nothing is misspelled', () => {
    expect(labels(editMenuTemplate(base, actions))).toEqual([
      'undo',
      'redo',
      'separator',
      'cut',
      'copy',
      'paste',
      'selectAll'
    ])
  })

  it('offers just Copy and Select All for selected text that cannot be edited', () => {
    const items = editMenuTemplate({ ...base, isEditable: false, hasSelection: true }, actions)
    expect(labels(items)).toEqual(['copy', 'selectAll'])
  })
})
