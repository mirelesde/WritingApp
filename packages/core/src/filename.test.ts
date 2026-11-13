import { describe, expect, it } from 'vitest'
import { sheetFileName, slugify } from './filename'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('The Station')).toBe('the-station')
  })

  it('collapses punctuation and trims hyphens', () => {
    expect(slugify('  --Hello,   World!?  ')).toBe('hello-world')
  })

  it('strips accents but keeps other scripts', () => {
    expect(slugify('Café Müller')).toBe('cafe-muller')
    expect(slugify('夜の駅')).toBe('夜の駅')
  })

  it('removes path separators and other unsafe characters', () => {
    expect(slugify('a/b\\c:d*e?"<>|')).toBe('a-b-c-d-e')
    expect(slugify('../../etc')).toBe('etc')
  })

  it('falls back to untitled when nothing usable remains', () => {
    expect(slugify('')).toBe('untitled')
    expect(slugify('???')).toBe('untitled')
  })

  it('truncates long text at a word boundary', () => {
    const slug = slugify('the quick brown fox jumps over the lazy dog and keeps running far away')
    expect(slug.length).toBeLessThanOrEqual(50)
    expect(slug).toBe('the-quick-brown-fox-jumps-over-the-lazy-dog-and')
  })

  it('truncates a single very long word hard, without a trailing hyphen', () => {
    expect(slugify('x'.repeat(200))).toBe('x'.repeat(50))
  })

  it('avoids names Windows reserves', () => {
    expect(slugify('CON')).toBe('con-1')
    expect(slugify('com3')).toBe('com3-1')
    expect(slugify('console')).toBe('console')
  })
})

describe('sheetFileName', () => {
  it('uses the sheet title, ignoring a heading marker', () => {
    expect(sheetFileName('# The Station\n\nText', [])).toBe('the-station.md')
  })

  it('uses untitled for empty content', () => {
    expect(sheetFileName('', [])).toBe('untitled.md')
    expect(sheetFileName('\n  \n', [])).toBe('untitled.md')
  })

  it('adds a numeric suffix on collision', () => {
    expect(sheetFileName('Notes', ['notes.md'])).toBe('notes-2.md')
    expect(sheetFileName('Notes', ['notes.md', 'notes-2.md'])).toBe('notes-3.md')
  })

  it('fills the first free number', () => {
    expect(sheetFileName('Notes', ['notes.md', 'notes-3.md'])).toBe('notes-2.md')
  })

  it('treats collisions case-insensitively', () => {
    expect(sheetFileName('Notes', ['NOTES.md'])).toBe('notes-2.md')
  })

  it('is not confused by unrelated names or a same-named group', () => {
    expect(sheetFileName('Notes', ['notes', 'other.md'])).toBe('notes.md')
  })

  it('accepts any iterable', () => {
    expect(sheetFileName('A', new Set(['a.md']))).toBe('a-2.md')
  })
})
