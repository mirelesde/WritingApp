/** A run of text in a table cell: plain, or wrapped in Markdown marks. */
export interface Span {
  text: string
  /** The marks around the text, outermost first, e.g. `**` for bold. */
  marks: string[]
  bold: boolean
  italic: boolean
  strike: boolean
  code: boolean
}

const PATTERN = /(\*\*\*|___)(?=\S)(.+?)(?<=\S)\1|(\*\*|__)(?=\S)(.+?)(?<=\S)\3|(\*|_)(?=\S)(.+?)(?<=\S)\5|(~~)(?=\S)(.+?)(?<=\S)\7|(`+)(.+?)\9/g

function plain(text: string): Span {
  return { text, marks: [], bold: false, italic: false, strike: false, code: false }
}

/**
 * Splits a cell's Markdown into spans for display. Handles bold, italic, bold
 * italic, strikethrough and code; the marks are kept so they can be shown dimmed.
 */
export function inlineSpans(text: string): Span[] {
  const out: Span[] = []
  let at = 0
  for (const m of text.matchAll(PATTERN)) {
    const index = m.index ?? 0
    if (index > at) out.push(plain(text.slice(at, index)))
    const mark = (m[1] ?? m[3] ?? m[5] ?? m[7] ?? m[9]) as string
    const inner = (m[2] ?? m[4] ?? m[6] ?? m[8] ?? m[10]) as string
    const base = {
      marks: [mark],
      bold: mark === '***' || mark === '___' || mark === '**' || mark === '__',
      italic: mark === '***' || mark === '___' || mark === '*' || mark === '_',
      strike: mark === '~~',
      code: mark.startsWith('`')
    }
    // `_` inside a word (snake_case) is not emphasis.
    const before = text[index - 1]
    const after = text[index + m[0].length]
    if ((mark === '_' || mark === '__') && ((before && /\w/.test(before)) || (after && /\w/.test(after)))) {
      out.push(plain(m[0]))
    } else if (base.code) out.push({ ...plain(inner), ...base })
    else out.push({ text: inner, ...base })
    at = index + m[0].length
  }
  if (at < text.length) out.push(plain(text.slice(at)))
  // Neighbouring plain runs (from skipped matches) become one.
  return out.reduce<Span[]>((merged, span) => {
    const last = merged[merged.length - 1]
    const isPlain = (s: Span): boolean => s.marks.length === 0
    if (last && isPlain(last) && isPlain(span)) last.text += span.text
    else merged.push(span)
    return merged
  }, [])
}
