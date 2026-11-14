import { describe, expect, it } from 'vitest'
import { importedMarkdown, rtfToMarkdown, textToMarkdown } from './importText'

describe('textToMarkdown', () => {
  it('normalises line endings, a BOM and spacing', () => {
    expect(textToMarkdown('﻿One  \r\n\r\n\r\n\r\nTwo\r\n')).toBe('One\n\nTwo')
  })
})

describe('rtfToMarkdown', () => {
  const doc = (body: string): string => `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times;}}{\\colortbl;\\red0\\green0\\blue0;}\\pard ${body}}`

  it('reads paragraphs', () => {
    expect(rtfToMarkdown(doc('One\\par Two\\par'))).toBe('One\n\nTwo')
  })

  it('reads bold and italic, keeping spaces outside the marks', () => {
    expect(rtfToMarkdown(doc('a {\\b bold }and {\\i italic}\\par'))).toBe('a **bold** and *italic*')
    expect(rtfToMarkdown(doc('{\\b\\i both}\\b0 x\\par'))).toBe('***both***x')
  })

  it('reads accents, unicode and symbols', () => {
    expect(rtfToMarkdown(doc("caf\\'e9 \\u8364? \\emdash  x\\par"))).toBe('café € — x')
  })

  it('drops tables and hidden groups', () => {
    expect(rtfToMarkdown(doc('{\\*\\generator Word;}Hi\\par'))).toBe('Hi')
  })

  it('escapes literal braces and Markdown characters', () => {
    expect(rtfToMarkdown(doc('\\{a\\} 2*3 _x_\\par'))).toBe('{a} 2\\*3 \\_x\\_')
  })

  it('reads bullet and numbered lists', () => {
    const rtf = doc('{\\listtext\\f1 \\u8226\\tab}One\\par {\\listtext 1.\\tab}Two\\par')
    expect(rtfToMarkdown(rtf)).toContain('- One')
    expect(rtfToMarkdown(rtf)).toContain('1. Two')
  })

  it('reads hyperlinks', () => {
    const rtf = doc('See {\\field{\\*\\fldinst HYPERLINK "https://a.test"}{\\fldrslt here}} now\\par')
    expect(rtfToMarkdown(rtf)).toBe('See [here](https://a.test) now')
  })
})

describe('a whole file', () => {
  it('converts a word-processor style document', () => {
    const rtf =
      "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times;}}\\pard\\b Rich Title\\b0\\par Some {\\i italic} and {\\b bold} text, caf\\'e9.\\par {\\listtext\\f1 \\u8226\\tab}First\\par {\\listtext\\f1 \\u8226\\tab}Second\\par}"
    expect(rtfToMarkdown(rtf)).toBe(
      '**Rich Title**\n\nSome *italic* and **bold** text, café.\n\n- First\n- Second'
    )
  })
})

describe('importedMarkdown', () => {
  it('chooses by extension', () => {
    expect(importedMarkdown('a.TXT', 'x\r\n')).toBe('x')
    expect(importedMarkdown('a.docx', 'x')).toBeNull()
  })
})
