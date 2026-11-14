/*
 * Footnotes, as Markdown writes them: a reference `[^1]` in the text and a
 * definition `[^1]: the note` on a line of its own (more lines may follow,
 * indented). The editor shows each reference as a small chip and the
 * definitions as a note you edit next to the text; exports number them.
 */

export interface FootnoteRef {
  id: string
  from: number
  to: number
}

export interface FootnoteDef {
  id: string
  /** Start of the definition's first line. */
  from: number
  /** End of its last line, before the line break. */
  to: number
  /** The note's text, with continuation lines joined by line breaks. */
  text: string
}

const DEF_LINE = /^\[\^([^\]\s]+)\]:[ \t]?(.*)$/
const REF = /\[\^([^\]\s]+)\]/g
const FENCE = /^ {0,3}(```|~~~)/

interface Line {
  text: string
  from: number
  to: number
}

function lines(text: string): Line[] {
  const out: Line[] = []
  let from = 0
  for (const raw of text.split('\n')) {
    out.push({ text: raw.replace(/\r$/, ''), from, to: from + raw.replace(/\r$/, '').length })
    from += raw.length + 1
  }
  return out
}

/** Every definition in the text. Lines in code fences are not definitions. */
export function findFootnoteDefs(text: string): FootnoteDef[] {
  if (!text.includes('[^')) return []
  const all = lines(text)
  const defs: FootnoteDef[] = []
  let fence = false
  for (let i = 0; i < all.length; i++) {
    const line = all[i]!
    if (FENCE.test(line.text)) fence = !fence
    if (fence) continue
    const m = DEF_LINE.exec(line.text)
    if (!m) continue
    const body = [m[2]!]
    let end = i
    // Indented lines, even after a blank one, continue the note.
    for (let j = i + 1; j < all.length; j++) {
      const next = all[j]!
      if (/^( {4}|\t)/.test(next.text)) {
        body.push(next.text.replace(/^( {4}|\t)/, ''))
        end = j
      } else if (next.text.trim() === '' && /^( {4}|\t)/.test(all[j + 1]?.text ?? '')) {
        body.push('')
      } else break
    }
    defs.push({ id: m[1]!, from: line.from, to: all[end]!.to, text: body.join('\n') })
    i = end
  }
  return defs
}

/** Every reference in the text, apart from the labels of definitions and code fences. */
export function findFootnoteRefs(text: string): FootnoteRef[] {
  if (!text.includes('[^')) return []
  const refs: FootnoteRef[] = []
  let fence = false
  for (const line of lines(text)) {
    if (FENCE.test(line.text)) fence = !fence
    if (fence) continue
    const label = DEF_LINE.exec(line.text)
    const skip = label ? label[0].length - label[2]!.length : 0
    for (const m of line.text.matchAll(REF)) {
      const at = m.index ?? 0
      if (label && at < skip) continue
      refs.push({ id: m[1]!, from: line.from + at, to: line.from + at + m[0].length })
    }
  }
  return refs
}

/** The smallest whole number not yet used as a footnote id. */
export function nextFootnoteId(text: string): string {
  const used = new Set([...findFootnoteRefs(text), ...findFootnoteDefs(text)].map((f) => f.id))
  let n = 1
  while (used.has(String(n))) n++
  return String(n)
}

export interface TextChange {
  from: number
  to: number
  insert: string
}

function definitionText(id: string, note: string): string {
  const [first = '', ...rest] = note.replace(/\r/g, '').split('\n')
  return [`[^${id}]: ${first}`, ...rest.map((l) => (l === '' ? '' : `    ${l}`))].join('\n')
}

/** The change that sets a note's text, adding the definition at the end if there is none. */
export function setFootnoteChange(text: string, id: string, note: string): TextChange {
  const def = findFootnoteDefs(text).find((d) => d.id === id)
  const body = definitionText(id, note)
  if (def) return { from: def.from, to: def.to, insert: body }
  return { from: text.length, to: text.length, insert: appendSeparator(text) + body }
}

function appendSeparator(text: string): string {
  if (text === '') return ''
  const lastLine = text.replace(/\n+$/, '').split('\n').pop() ?? ''
  // After another note, stay directly below it.
  if (DEF_LINE.test(lastLine) || /^( {4}|\t)/.test(lastLine)) {
    return text.endsWith('\n') ? '' : '\n'
  }
  if (!text.endsWith('\n')) return '\n\n'
  return text.endsWith('\n\n') ? '' : '\n'
}

/**
 * The changes that add a footnote: a reference at `offset` and an empty
 * definition at the end. `noteAt` is where the note's text starts once both apply.
 */
export function addFootnoteChanges(
  text: string,
  offset: number,
): { id: string; changes: TextChange[]; refEnd: number; noteAt: number } {
  const id = nextFootnoteId(text)
  const ref = `[^${id}]`
  const insert = appendSeparator(text) + `[^${id}]: `
  return {
    id,
    changes: [
      { from: offset, to: offset, insert: ref },
      { from: text.length, to: text.length, insert },
    ],
    refEnd: offset + ref.length,
    noteAt: text.length + ref.length + insert.length,
  }
}

/** The changes that remove a footnote's references and its definition. */
export function removeFootnoteChanges(text: string, id: string): TextChange[] {
  const changes: TextChange[] = findFootnoteRefs(text)
    .filter((r) => r.id === id)
    .map((r) => ({ from: r.from, to: r.to, insert: '' }))
  const def = findFootnoteDefs(text).find((d) => d.id === id)
  if (def) {
    // Take the line break with it, or a blank line would stay behind.
    const to = text[def.to] === '\n' ? def.to + 1 : def.to
    changes.push({ from: def.from, to, insert: '' })
  }
  return changes.sort((a, b) => a.from - b.from)
}

/** What "go to footnote" should do for a cursor at `head`. */
export type FootnoteJump = { action: 'open'; id: string } | { action: 'move'; pos: number }

/**
 * Next step from the cursor: at a reference, open its note; inside a note's
 * definition, go to its reference; anywhere else, go to just after the next
 * reference (wrapping round). Null when the text has no references.
 */
export function footnoteJump(text: string, head: number): FootnoteJump | null {
  const refs = findFootnoteRefs(text)
  const here = refs.find((r) => head >= r.from && head <= r.to)
  if (here) return { action: 'open', id: here.id }
  const def = findFootnoteDefs(text).find((d) => head >= d.from && head <= d.to)
  if (def) {
    const ref = refs.find((r) => r.id === def.id)
    if (ref) return { action: 'move', pos: ref.to }
  }
  const next = refs.find((r) => r.from > head) ?? refs[0]
  return next ? { action: 'move', pos: next.to } : null
}

/** The text with definitions removed and references taken out, for previews and counts. */
export function stripFootnotes(text: string): string {
  if (!text.includes('[^')) return text
  let out = text
  for (const def of findFootnoteDefs(text).reverse()) {
    const to = out[def.to] === '\n' ? def.to + 1 : def.to
    out = out.slice(0, def.from) + out.slice(to)
  }
  return out.replace(REF, '')
}
