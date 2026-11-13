import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { toggleTaskAt } from './taskBoxes'

const toggle = (doc: string, pos: number): string | null => {
  const state = EditorState.create({ doc })
  const spec = toggleTaskAt(state, pos)
  return spec ? state.update(spec).state.doc.toString() : null
}

describe('task boxes', () => {
  it('ticks and unticks', () => {
    expect(toggle('- [ ] a', 3)).toBe('- [x] a')
    expect(toggle('- [x] a', 4)).toBe('- [ ] a')
    expect(toggle('  1. [X] a', 6)).toBe('  1. [ ] a')
  })
  it('ignores clicks outside the box and ordinary lines', () => {
    expect(toggle('- [ ] a', 7)).toBeNull()
    expect(toggle('- [ ] a', 0)).toBeNull()
    expect(toggle('plain [ ]', 7)).toBeNull()
  })
})
