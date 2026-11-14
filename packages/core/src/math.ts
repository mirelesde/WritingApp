import katex from 'katex'

/** A formula in the text: `$inline$` or `$$display$$`, with the TeX between the dollar signs. */
export interface MathSpan {
  from: number
  to: number
  tex: string
  /** `$$...$$`; `block` is true when it starts a line, so it is shown as a block. */
  display: boolean
  block: boolean
}

/** Inline formula: no space just inside the dollars, and no digit straight after (so "$5 and $10" is prose). */
const INLINE = /(?<![\\$])(?:\$\$(?=\S)(.+?)(?<=\S)\$\$|\$(?=[^\s$])((?:\\.|[^$\\])+?)(?<=\S)\$(?![\d$]))/g

/** Finds formulas, skipping fenced code and `code spans`. */
export function findMath(text: string): MathSpan[] {
  const found: MathSpan[] = []
  const lines = text.split('\n')
  const starts: number[] = []
  let pos = 0
  for (const l of lines) {
    starts.push(pos)
    pos += l.length + 1
  }
  let fence = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const at = starts[i] ?? 0
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (f && f[1]!.startsWith(fence[0]!) && f[1]!.length >= fence.length) fence = ''
      continue
    }
    if (f) {
      fence = f[1]!
      continue
    }
    const lead = /^\s*\$\$/.exec(line)
    if (lead) {
      const afterOpen = lead[0].length
      const same = line.indexOf('$$', afterOpen)
      if (same >= 0 && line.slice(same + 2).trim() === '') {
        const tex = line.slice(afterOpen, same).trim()
        if (tex) found.push({ from: at + lead[0].length - 2, to: at + same + 2, tex, display: true, block: true })
        continue
      }
      if (same < 0) {
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j] ?? ''
          const close = next.indexOf('$$')
          if (close < 0) continue
          if (next.slice(close + 2).trim() !== '') break
          const tex = [line.slice(afterOpen), ...lines.slice(i + 1, j), next.slice(0, close)].join('\n').trim()
          if (tex) found.push({ from: at + lead[0].length - 2, to: (starts[j] ?? 0) + close + 2, tex, display: true, block: true })
          i = j
          break
        }
        if (found.length && found[found.length - 1]!.from >= at && found[found.length - 1]!.block) continue
      }
    }
    // Inline: blank out code spans so a `$` inside one is not read.
    const masked = line.replace(/(`+)[^`]*?\1/g, (m) => ' '.repeat(m.length))
    for (const m of masked.matchAll(INLINE)) {
      const tex = (m[1] ?? m[2] ?? '').trim()
      if (!tex) continue
      found.push({ from: at + m.index, to: at + m.index + m[0].length, tex, display: m[1] !== undefined, block: false })
    }
  }
  return found
}

/** A formula as MathML (no fonts or style sheets needed); text KaTeX cannot read is shown as the source. */
export function mathToHtml(tex: string, display: boolean): string {
  return katex.renderToString(tex, { displayMode: display, output: 'mathml', throwOnError: false, trust: false, strict: 'ignore' })
}
