import { describe, expect, it } from 'vitest'
import { sheetToFocusAtEnd, type PageClick } from './pageClick'

const parts = [{ path: 'a' }, { path: 'b' }]
const empty: PageClick = { button: 0, onContent: false, clientX: 100, contentRight: 500 }

describe('sheetToFocusAtEnd', () => {
  it('picks the last sheet for a click on the empty page', () => {
    expect(sheetToFocusAtEnd(empty, parts)).toBe('b')
  })

  it('leaves clicks on the text or controls alone', () => {
    expect(sheetToFocusAtEnd({ ...empty, onContent: true }, parts)).toBeUndefined()
  })

  it('leaves other buttons and the scrollbar alone', () => {
    expect(sheetToFocusAtEnd({ ...empty, button: 2 }, parts)).toBeUndefined()
    expect(sheetToFocusAtEnd({ ...empty, clientX: 501 }, parts)).toBeUndefined()
  })

  it('does nothing when no sheet is open', () => {
    expect(sheetToFocusAtEnd(empty, [])).toBeUndefined()
  })
})
