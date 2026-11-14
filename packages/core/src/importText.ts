/*
 * Turns plain text and RTF files into Markdown for import. Platform-free:
 * the RTF reader is a small hand-written parser covering what word
 * processors write (paragraphs, bold, italic, lists, links, accents).
 */

/** Plain text as a sheet: line endings made uniform, a byte-order mark dropped, trailing space trimmed. */
export function textToMarkdown(text: string): string {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Destinations whose content is not text of the document. */
const SKIPPED = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'headerl', 'headerr',
  'footerl', 'footerr', 'listtable', 'listoverridetable', 'generator', 'filetbl', 'revtbl',
  'rsidtbl', 'themedata', 'colorschememapping', 'datastore', 'latentstyles', 'xmlnstbl',
  'private', 'object', 'footnote', 'fldinst', 'bkmkstart', 'bkmkend', 'pgdsctbl', 'template'
])

const SYMBOLS: Record<string, string> = {
  emdash: '—', endash: '–', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”',
  bullet: '•', emspace: ' ', enspace: ' ', tab: ' ', line: '\n', '~': ' ', _: '‑'
}

interface Run {
  text: string
  bold: boolean
  italic: boolean
  /** Already Markdown: not escaped. */
  raw?: boolean
}

interface Format {
  bold: boolean
  italic: boolean
  /** Characters still to ignore after a \uN escape. */
  skip: number
  /** Unicode fallback length from \ucN. */
  uc: number
  /** Inside a destination that is dropped. */
  dropped: boolean
  /** Inside a list marker group: text goes to `marker`, not the paragraph. */
  marker: boolean
  /** Inside a field instruction: text goes to `instruction`. */
  instruction: boolean
  /** Inside a field result, where the field's own text is. */
  result: boolean
}

const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ'

/** One byte of Windows-1252, the code page RTF files use for \'hh escapes. */
function decodeByte(code: number): string {
  return code >= 0x80 && code <= 0x9f ? (CP1252[code - 0x80] ?? '') : String.fromCharCode(code)
}

function escapeText(text: string): string {
  return text.replace(/([*_`])/g, '\\$1')
}

/** Joins runs into Markdown, keeping spaces outside the emphasis marks. */
function render(runs: Run[]): string {
  const merged: Run[] = []
  for (const run of runs) {
    const last = merged[merged.length - 1]
    if (last && !last.raw && !run.raw && last.bold === run.bold && last.italic === run.italic) last.text += run.text
    else merged.push({ ...run })
  }
  return merged
    .map((run) => {
      if (run.raw) return run.text
      const text = escapeText(run.text)
      if (!run.bold && !run.italic) return text
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!
      if (!m[2]) return text
      const mark = (run.bold ? '**' : '') + (run.italic ? '*' : '')
      return `${m[1]}${mark}${m[2]}${[...mark].reverse().join('')}${m[3]}`
    })
    .join('')
}

/** Converts the text of an RTF file to Markdown. */
export function rtfToMarkdown(rtf: string): string {
  const paragraphs: string[] = []
  let runs: Run[] = []
  let marker = ''
  let instruction = ''
  let url = ''
  let linkStart = -1
  const stack: Format[] = []
  let fmt: Format = { bold: false, italic: false, skip: 0, uc: 1, dropped: false, marker: false, instruction: false, result: false }

  const add = (text: string): void => {
    if (!text) return
    if (fmt.dropped) return
    if (fmt.instruction) instruction += text
    else if (fmt.marker) marker += text
    else runs.push({ text, bold: fmt.bold, italic: fmt.italic })
  }

  const endParagraph = (): void => {
    let line = render(runs).replace(/[ \t]+$/g, '')
    runs = []
    const bullet = /^[•·●○▪o\-–*]\s*$/.test(marker.trim()) && marker.trim() !== ''
    const numbered = /^(\d+|[a-z])[.)]\s*$/i.exec(marker.trim())
    if (line.trim()) {
      // A line that would read as Markdown syntax when it is not a list item.
      if (!bullet && !numbered) line = line.replace(/^(\s*)([#>])/, '$1\\$2')
      if (bullet) line = `- ${line}`
      else if (numbered) line = `${/^\d+$/.test(numbered[1] ?? '') ? numbered[1] : '1'}. ${line}`
      paragraphs.push(line)
    } else {
      paragraphs.push('')
    }
    marker = ''
  }

  let i = 0
  const n = rtf.length
  while (i < n) {
    const ch = rtf[i] as string
    if (ch === '{') {
      stack.push({ ...fmt })
      i++
      // A destination: {\*\word ...} or {\word ...} naming something to drop.
      let j = i
      let star = false
      if (rtf.startsWith('\\*', j)) {
        star = true
        j += 2
      }
      const m = /^\\([a-z]+)/i.exec(rtf.slice(j, j + 40))
      if (m) {
        const word = (m[1] ?? '').toLowerCase()
        if (word === 'listtext' || word === 'pntext') fmt.marker = true
        else if (word === 'fldinst') {
          fmt.instruction = true
          instruction = ''
        } else if (word === 'fldrslt') {
          fmt.result = true
          linkStart = runs.length
          const link = /HYPERLINK\s+"([^"]+)"/i.exec(instruction)
          url = link?.[1] ?? ''
        } else if (SKIPPED.has(word) || (star && !['fldinst', 'fldrslt'].includes(word))) fmt.dropped = true
      }
      continue
    }
    if (ch === '}') {
      const closing = fmt
      fmt = stack.pop() ?? fmt
      if (closing.result && !closing.dropped) {
        // Leaving a field result: its text becomes the link text.
        if (url) {
          const label = runs.splice(linkStart).map((r) => r.text).join('').trim()
          if (label) runs.push({ text: `[${label}](${url})`, bold: false, italic: false, raw: true })
        }
        linkStart = -1
        url = ''
      }
      i++
      continue
    }
    if (ch === '\\') {
      const next = rtf[i + 1]
      if (next === undefined) break
      if (next === "'") {
        const code = parseInt(rtf.slice(i + 2, i + 4), 16)
        i += 4
        if (fmt.skip > 0) {
          fmt.skip--
          continue
        }
        if (Number.isFinite(code)) add(decodeByte(code))
        continue
      }
      if (!/[a-z]/i.test(next)) {
        i += 2
        if (next === '\\' || next === '{' || next === '}') add(next)
        else if (next === '~' || next === '_') add(SYMBOLS[next] ?? '')
        else if (next === '\n' || next === '\r') endParagraph()
        continue
      }
      const m = /^\\([a-z]+)(-?\d+)?[ ]?/i.exec(rtf.slice(i, i + 40))!
      i += m[0].length
      const word = (m[1] ?? '').toLowerCase()
      const value = m[2] === undefined ? undefined : parseInt(m[2], 10)
      switch (word) {
        case 'par':
          if (!fmt.dropped) endParagraph()
          break
        case 'b':
          fmt.bold = value !== 0
          break
        case 'i':
          fmt.italic = value !== 0
          break
        case 'plain':
          fmt.bold = false
          fmt.italic = false
          break
        case 'uc':
          fmt.uc = value ?? 1
          break
        case 'u': {
          if (value === undefined) break
          add(String.fromCodePoint(value < 0 ? value + 65536 : value))
          fmt.skip = fmt.uc
          break
        }
        default:
          add(SYMBOLS[word] ?? '')
      }
      continue
    }
    if (ch === '\r' || ch === '\n') {
      i++
      continue
    }
    if (fmt.skip > 0) {
      fmt.skip--
      i++
      continue
    }
    add(ch)
    i++
  }
  if (runs.length) endParagraph()

  return paragraphs
    .join('\n')
    .split('\n')
    .reduce<string[]>((out, line) => {
      // List items sit on consecutive lines; other paragraphs are separated by a blank line.
      if (line === '') {
        if (out.length && out[out.length - 1] !== '') out.push('')
      } else {
        const prev = out[out.length - 1]
        const listy = (s: string): boolean => /^(- |\d+\. )/.test(s)
        if (prev !== undefined && prev !== '' && !(listy(prev) && listy(line))) out.push('')
        out.push(line)
      }
      return out
    }, [])
    .join('\n')
    .trim()
}

/** Markdown for the contents of a file, chosen by its extension; null for a type that is not handled. */
export function importedMarkdown(fileName: string, text: string): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase()
  if (ext === 'txt' || ext === 'text') return textToMarkdown(text)
  if (ext === 'md' || ext === 'markdown') return textToMarkdown(text)
  if (ext === 'rtf') return rtfToMarkdown(text)
  return null
}
