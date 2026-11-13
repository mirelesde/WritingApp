/*
 * Turns the HTML on the clipboard (from a web page or a word processor) into
 * Markdown. Platform-free: a small tag reader, not the browser's DOM.
 */

interface El {
  tag: string
  attrs: Record<string, string>
  children: Node[]
}
type Node = El | string

const VOID = new Set(['br', 'hr', 'img', 'meta', 'link', 'input', 'col', 'wbr'])
const SKIP = new Set(['script', 'style', 'head', 'title', 'template', 'svg', 'noscript'])
const BLOCK = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'figure',
  'figcaption', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'tr', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'hr', 'dl', 'dt', 'dd',
])

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', times: '×',
}

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[name.toLowerCase()] ?? whole
  })
}

function parse(html: string): El {
  const root: El = { tag: '#root', attrs: {}, children: [] }
  const stack: El[] = [root]
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+|<)/g
  for (const m of html.matchAll(re)) {
    const top = stack[stack.length - 1]!
    if (m[4] !== undefined) {
      top.children.push(decode(m[4]))
    } else if (m[2] !== undefined) {
      const tag = m[2].toLowerCase()
      if (m[1]) {
        const at = stack.map((e) => e.tag).lastIndexOf(tag)
        if (at > 0) stack.length = at
      } else {
        const attrs: Record<string, string> = {}
        for (const a of (m[3] ?? '').matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
          attrs[a[1]!.toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '')
        }
        // An unclosed <li> or <p> ends when the next one starts.
        if ((tag === 'li' || tag === 'p') && top.tag === tag) stack.pop()
        const el: El = { tag, attrs, children: [] }
        stack[stack.length - 1]!.children.push(el)
        if (!VOID.has(tag) && !/\/\s*$/.test(m[3] ?? '')) stack.push(el)
      }
    }
  }
  return root
}

function style(el: El, prop: string): string {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(el.attrs['style'] ?? '')
  return m ? m[1]!.trim().toLowerCase() : ''
}

function isBold(el: El): boolean {
  const weight = style(el, 'font-weight')
  if (el.tag === 'b' || el.tag === 'strong') return !/^(normal|[1-5]00)$/.test(weight)
  return weight === 'bold' || weight === 'bolder' || /^[6-9]00$/.test(weight)
}
function isItalic(el: El): boolean {
  if (el.tag === 'i' || el.tag === 'em') return style(el, 'font-style') !== 'normal'
  return style(el, 'font-style') === 'italic'
}
function isStrike(el: El): boolean {
  return el.tag === 's' || el.tag === 'del' || el.tag === 'strike' || style(el, 'text-decoration').includes('line-through')
}

/** Wraps text in a marker, keeping any spaces at its edges outside the marker. */
function wrap(text: string, mark: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!
  return m[2] === '' ? text : `${m[1]}${mark}${m[2]}${mark}${m[3]}`
}

function escapeText(text: string): string {
  return text
    .replace(/([\\`*_[\]])/g, '\\$1')
    .replace(/^(\s*)([#>+-]|\d+[.)])(\s)/gm, '$1\\$2$3')
}

function inline(nodes: Node[], raw = false): string {
  let out = ''
  for (const node of nodes) {
    if (typeof node === 'string') {
      out += raw ? node : escapeText(node.replace(/\s+/g, ' '))
      continue
    }
    if (SKIP.has(node.tag)) continue
    if (node.tag === 'br') {
      out += '  \n'
      continue
    }
    if (node.tag === 'img') {
      const alt = node.attrs['alt'] ?? ''
      out += node.attrs['src'] && !node.attrs['src'].startsWith('data:') ? `![${alt}](${node.attrs['src']})` : alt
      continue
    }
    if (node.tag === 'code') {
      const code = inline(node.children, true).replace(/\s+/g, ' ')
      out += code.includes('`') ? `\`\` ${code} \`\`` : `\`${code}\``
      continue
    }
    let text = inline(node.children, raw)
    if (node.tag === 'a' && node.attrs['href'] && text.trim() !== '') {
      const href = node.attrs['href'].replace(/\)/g, '%29').replace(/ /g, '%20')
      text = /^(javascript|data):/i.test(href) || href.startsWith('#') ? text : `[${text.trim()}](${href})`
    } else {
      if (isStrike(node)) text = wrap(text, '~~')
      if (isItalic(node)) text = wrap(text, '*')
      if (isBold(node)) text = wrap(text, '**')
    }
    out += text
  }
  return out
}

function hasBlock(nodes: Node[]): boolean {
  return nodes.some((n) => typeof n !== 'string' && (BLOCK.has(n.tag) || hasBlock(n.children)))
}

function plain(nodes: Node[]): string {
  return nodes.map((n) => (typeof n === 'string' ? n : n.tag === 'br' ? '\n' : plain(n.children))).join('')
}

function block(nodes: Node[], indent: string): string[] {
  const out: string[] = []
  let run: Node[] = []
  const flush = (): void => {
    const text = inline(run).replace(/^\s+|\s+$/g, '').replace(/ *\n */g, '\n')
    if (text !== '') out.push(text.split('\n').map((l, i) => (i === 0 ? l : indent + l)).join('\n'))
    run = []
  }
  for (const node of nodes) {
    if (typeof node === 'string' || !(BLOCK.has(node.tag))) {
      if (typeof node !== 'string' && hasBlock([node])) {
        flush()
        out.push(...block(node.children, indent))
      } else run.push(node)
      continue
    }
    flush()
    out.push(...element(node, indent))
  }
  flush()
  return out
}

function list(el: El, indent: string): string[] {
  const ordered = el.tag === 'ol'
  let n = parseInt(el.attrs['start'] ?? '1', 10) || 1
  const lines: string[] = []
  for (const item of el.children) {
    if (typeof item === 'string' || item.tag !== 'li') continue
    const marker = ordered ? `${n++}. ` : '- '
    const pad = ' '.repeat(marker.length)
    const task = item.children.find((c): c is El => typeof c !== 'string' && c.tag === 'input')
    const box = task ? (task.attrs['checked'] !== undefined ? '[x] ' : '[ ] ') : ''
    const parts = block(item.children.filter((c) => c !== task), indent + pad)
    // Nested lists follow directly; other blocks are separated by a blank line.
    const head = parts[0] ?? ''
    const rest = parts.slice(1)
    lines.push(`${indent}${marker}${box}${head}`)
    for (const r of rest) lines.push(/^\s*([-*]|\d+\.) /.test(r) ? r : `\n${indent}${pad}${r}`)
  }
  return [lines.join('\n')]
}

function table(el: El): string[] {
  const rows: string[][] = []
  const walk = (nodes: Node[]): void => {
    for (const n of nodes) {
      if (typeof n === 'string') continue
      if (n.tag === 'tr') {
        rows.push(
          n.children
            .filter((c): c is El => typeof c !== 'string' && (c.tag === 'td' || c.tag === 'th'))
            .map((c) => inline(c.children).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()),
        )
      } else walk(n.children)
    }
  }
  walk(el.children)
  if (rows.length === 0) return []
  const width = Math.max(...rows.map((r) => r.length))
  const fill = (r: string[]): string => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`
  const [head = [], ...body] = rows
  return [[fill(head), `| ${Array(width).fill('---').join(' | ')} |`, ...body.map(fill)].join('\n')]
}

function element(el: El, indent: string): string[] {
  if (SKIP.has(el.tag)) return []
  if (/^h[1-6]$/.test(el.tag)) {
    const text = inline(el.children).replace(/\s*\n\s*/g, ' ').trim()
    return text === '' ? [] : [`${'#'.repeat(Number(el.tag[1]))} ${text}`]
  }
  switch (el.tag) {
    case 'hr':
      return ['---']
    case 'ul':
    case 'ol':
      return list(el, indent)
    case 'blockquote':
      return [block(el.children, '').join('\n\n').split('\n').map((l) => (l === '' ? '>' : `> ${l}`)).join('\n')]
    case 'pre': {
      const code = plain(el.children).replace(/\n+$/, '')
      return [`\`\`\`\n${code}\n\`\`\``]
    }
    case 'table':
      return table(el)
    case 'li':
      return list({ tag: 'ul', attrs: {}, children: [el] }, indent)
    default:
      return block(el.children, indent)
  }
}

/** Converts clipboard HTML to Markdown. Returns an empty string when there is nothing to convert. */
export function htmlToMarkdown(html: string): string {
  // Clipboard HTML is often wrapped in a fragment marker comment.
  const body = html.replace(/^[\s\S]*?<!--StartFragment-->/i, '').replace(/<!--EndFragment-->[\s\S]*$/i, '')
  const root = parse(body)
  return block(root.children, '').join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** True when converting would add Markdown to what a plain paste gives. */
export function isRichPaste(markdown: string, plainText: string): boolean {
  const flat = (s: string): string => s.replace(/\s+/g, ' ').trim()
  return markdown.trim() !== '' && flat(markdown) !== flat(plainText)
}
