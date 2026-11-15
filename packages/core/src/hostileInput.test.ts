import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { docxToMarkdown } from './docxImport'
import { markdownToDocx } from './docxExport'
import { markdownToHtml } from './export'
import { htmlToMarkdown } from './htmlToMarkdown'
import { rtfToMarkdown, textToMarkdown } from './importText'
import { findWikiLinks } from './wikiLinks'
import { findMatches } from './search'

function random(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Pieces that tend to upset Markdown, HTML and RTF readers, and some awkward text.
const PIECES = [
  '# ', '## ', '> ', '- ', '1. ', '* ', '**', '*', '_', '~~', '==', '`', '```\n', '~~~\n', '[', ']', '(', ')', '![', '](', '[[', ']]', '[[a|b]]',
  '[^1]', '[^1]: note\n', '$', '$$', '\\', '|', '| a | b |\n|---|---|\n', '<', '>', '<script>alert(1)</script>', '<img src=x onerror=1>', '&amp;', '&#x41;', '&',
  '\n', '\n\n', '\r\n', '\t', '    ', ' ', '\u0000', '‮', '​', 'é', 'ñ', '日本語', 'العربية', '🙂', '👨‍👩‍👧', '\ud800', 'a'.repeat(300),
  '{\\rtf1 ', '\\par ', '{', '}', '\\u233?', "\\'e9", '\\b ', '\\*\\foo ', 'http://x.y/z', 'CON', 'AUX.txt', '../../etc/passwd',
]

function text(rnd: () => number, length: number): string {
  let s = ''
  for (let i = 0; i < length; i++) s += PIECES[Math.floor(rnd() * PIECES.length)]!
  return s
}

describe('hostile input', () => {
  it('never crashes the readers and writers, and never lets markup through to HTML', async () => {
    for (let seed = 1; seed <= 400; seed++) {
      const rnd = random(seed)
      const input = text(rnd, 1 + Math.floor(rnd() * 60))
      const where = `seed ${seed}`
      const html = markdownToHtml(input)
      expect(typeof html, where).toBe('string')
      expect(html.toLowerCase(), where).not.toMatch(/<script|<[a-z][^>]*\son\w+=/)
      const docx = markdownToDocx(input)
      const parts = unzipSync(docx)
      expect(strFromU8(parts['word/document.xml']!), where).toContain('<w:document')
      expect(typeof htmlToMarkdown(input), where).toBe('string')
      expect(typeof rtfToMarkdown(input), where).toBe('string')
      expect(typeof textToMarkdown(input), where).toBe('string')
      expect(Array.isArray(findWikiLinks(input)), where).toBe(true)
      expect(Array.isArray(findMatches(input, 'a', {})), where).toBe(true)
      // Garbage that is not a Word file is refused with an error, not a crash or a hang.
      const junk = Uint8Array.from({ length: 1 + Math.floor(rnd() * 200) }, () => Math.floor(rnd() * 256))
      await expect(docxToMarkdown(junk)).rejects.toBeInstanceOf(Error)
    }
  }, 120000)

  it('takes a long run of one troublesome mark without a stall', () => {
    for (const piece of ['*', '[', '`', '_', '<', '\\', '[[', '|', '> ']) {
      // Block quotes nested thousands deep overflow the Markdown library's stack; no sheet has them.
      const input = piece.repeat(piece === '> ' ? 1000 : 20000)
      const started = Date.now()
      markdownToHtml(input)
      markdownToDocx(input)
      htmlToMarkdown(input)
      findWikiLinks(input)
      expect(Date.now() - started, JSON.stringify(piece)).toBeLessThan(5000)
    }
  }, 60000)
})
