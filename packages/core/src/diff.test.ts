import { describe, expect, it } from 'vitest'
import {
  changeCount,
  conflictCopyOf,
  diffHunks,
  diffWords,
  findConflictCopies,
  mergeHunks
} from './diff'

describe('diffHunks', () => {
  it('has no changes for equal text', () => {
    expect(changeCount(diffHunks('a\nb', 'a\nb'))).toBe(0)
  })

  it('groups neighbouring differences into one hunk', () => {
    const hunks = diffHunks('one\ntwo\nthree\nfour', 'one\n2\n3\nfour')
    expect(hunks).toEqual([
      { kind: 'same', lines: ['one'] },
      { kind: 'change', a: ['two', 'three'], b: ['2', '3'] },
      { kind: 'same', lines: ['four'] }
    ])
  })

  it('finds an insertion and a deletion', () => {
    const hunks = diffHunks('a\nb\nc', 'a\nx\nb')
    expect(changeCount(hunks)).toBe(2)
  })

  it('merges by picking a side per change', () => {
    const a = 'one\ntwo\nthree\nfour\nfive'
    const b = 'one\n2\nthree\nfour\n5'
    const hunks = diffHunks(a, b)
    expect(mergeHunks(hunks, ['a', 'a'])).toBe(a)
    expect(mergeHunks(hunks, ['b', 'b'])).toBe(b)
    expect(mergeHunks(hunks, ['b', 'a'])).toBe('one\n2\nthree\nfour\nfive')
  })

  it('handles empty text on either side', () => {
    expect(mergeHunks(diffHunks('', 'a\nb'), ['b'])).toBe('a\nb')
    expect(mergeHunks(diffHunks('a\nb', ''), ['a'])).toBe('a\nb')
  })

  it('treats a huge difference as one change instead of stalling', () => {
    const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join('\n')
    const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join('\n')
    expect(changeCount(diffHunks(a, b))).toBe(1)
  })
})

describe('diffWords', () => {
  it('marks only the words that differ', () => {
    const { a, b } = diffWords('the quick brown fox', 'the slow brown fox')
    expect(a.filter((s) => s.changed).map((s) => s.text)).toEqual(['quick'])
    expect(b.filter((s) => s.changed).map((s) => s.text)).toEqual(['slow'])
    expect(a.map((s) => s.text).join('')).toBe('the quick brown fox')
    expect(b.map((s) => s.text).join('')).toBe('the slow brown fox')
  })
})

describe('conflictCopyOf', () => {
  it('recognises the common sync services', () => {
    expect(conflictCopyOf('note (conflicted copy).md')).toBe('note.md')
    expect(conflictCopyOf("note (Ann's conflicted copy 2026-01-02).md")).toBe('note.md')
    expect(conflictCopyOf('note.sync-conflict-20260102-101500-ABCDEFG.md')).toBe('note.md')
    expect(conflictCopyOf('My Story (Conflicted Copy 2026-01-02 101500).md')).toBe('My Story.md')
  })

  it('leaves ordinary names alone', () => {
    expect(conflictCopyOf('note.md')).toBeNull()
    expect(conflictCopyOf('note (2).md')).toBeNull()
    expect(conflictCopyOf('(conflicted copy).md')).toBeNull()
  })
})

describe('findConflictCopies', () => {
  it('pairs a copy with its original in the same folder only', () => {
    const sheets = [
      { name: 'a.md', path: '/p/a.md' },
      { name: 'a (conflicted copy).md', path: '/p/a (conflicted copy).md' },
      { name: 'b (conflicted copy).md', path: '/p/b (conflicted copy).md' },
      { name: 'a (conflicted copy).md', path: '/q/a (conflicted copy).md' }
    ]
    const pairs = findConflictCopies(sheets)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]!.original.path).toBe('/p/a.md')
  })
})
