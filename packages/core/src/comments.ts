/**
 * Commented-out text is an HTML comment: `<!-- like this -->`. It is valid in
 * every Markdown reader, shows dimmed in the editor, and is left out of
 * exports and word counts.
 */
const WHOLE_LINE = /^[ \t]*<!--[\s\S]*?-->[ \t]*(?:\r?\n|$)/gm
const INLINE = /<!--[\s\S]*?-->/g

/** True for a line that opens or closes a fenced code block. */
const FENCE = /^ {0,3}(```|~~~)/

/**
 * The text without its comments. Comments inside fenced code blocks are code,
 * so they stay. A comment on a line of its own takes the whole line with it.
 */
export function stripComments(text: string): string {
  if (!text.includes('<!--')) return text
  const out: string[] = []
  let outside: string[] = []
  let fence: string | null = null

  const flush = (): void => {
    if (outside.length === 0) return
    out.push(outside.join('').replace(WHOLE_LINE, '').replace(INLINE, ''))
    outside = []
  }

  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const marker = FENCE.exec(line)?.[1]
    if (fence === null && marker) {
      flush()
      fence = marker
      out.push(line)
    } else if (fence !== null) {
      out.push(line)
      if (marker === fence) fence = null
    } else {
      outside.push(line)
    }
  }
  flush()
  return out.join('')
}
