/*
 * A small XML reader for Office files: elements, attributes, text, entities,
 * CDATA. No schemas, no namespaces beyond keeping the prefix in the name
 * (`w:p`). Platform-free, so it runs wherever the core does.
 */

export interface XmlElement {
  name: string
  attrs: Record<string, string>
  children: (XmlElement | string)[]
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** Text with its character and entity references resolved. */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    }
    return ENTITIES[ref.toLowerCase()] ?? whole
  })
}

/** Text made safe to put inside an element or an attribute. */
export function escapeXml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const MAX_DEPTH = 200

/** Parses an XML document and returns its root element. Throws if there is none. */
export function parseXml(source: string): XmlElement {
  const root: XmlElement = { name: '#root', attrs: {}, children: [] }
  const stack: XmlElement[] = [root]
  const length = source.length
  let i = 0
  while (i < length) {
    const lt = source.indexOf('<', i)
    const top = stack[stack.length - 1]!
    if (lt === -1) {
      if (stack.length === 1 || source.slice(i).trim() !== '') top.children.push(decodeEntities(source.slice(i)))
      break
    }
    if (lt > i) top.children.push(decodeEntities(source.slice(i, lt)))
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4)
      i = end === -1 ? length : end + 3
    } else if (source.startsWith('<![CDATA[', lt)) {
      const end = source.indexOf(']]>', lt + 9)
      top.children.push(source.slice(lt + 9, end === -1 ? length : end))
      i = end === -1 ? length : end + 3
    } else if (source[lt + 1] === '?' || source[lt + 1] === '!') {
      const end = source.indexOf('>', lt + 2)
      i = end === -1 ? length : end + 1
    } else if (source[lt + 1] === '/') {
      const end = source.indexOf('>', lt + 2)
      if (stack.length > 1) stack.pop()
      i = end === -1 ? length : end + 1
    } else {
      let j = lt + 1
      let quote = ''
      while (j < length) {
        const c = source[j]!
        if (quote) {
          if (c === quote) quote = ''
        } else if (c === '"' || c === "'") quote = c
        else if (c === '>') break
        j++
      }
      let inside = source.slice(lt + 1, j)
      const selfClosing = inside.endsWith('/')
      if (selfClosing) inside = inside.slice(0, -1)
      const nameEnd = inside.search(/[\s]/)
      const name = nameEnd === -1 ? inside : inside.slice(0, nameEnd)
      const attrs: Record<string, string> = {}
      if (nameEnd !== -1) {
        for (const m of inside.slice(nameEnd).matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
          attrs[m[1]!] = decodeEntities(m[2] ?? m[3] ?? '')
        }
      }
      const element: XmlElement = { name, attrs, children: [] }
      top.children.push(element)
      if (!selfClosing) {
        if (stack.length > MAX_DEPTH) throw new Error('The document is nested too deeply')
        stack.push(element)
      }
      i = j + 1
    }
  }
  const first = root.children.find((c): c is XmlElement => typeof c !== 'string')
  if (!first) throw new Error('The document has no content')
  return first
}

/** The child elements of an element, optionally only those with this name. */
export function elements(node: XmlElement, name?: string): XmlElement[] {
  return node.children.filter((c): c is XmlElement => typeof c !== 'string' && (name === undefined || c.name === name))
}

/** The first child element with this name. */
export function child(node: XmlElement, name: string): XmlElement | undefined {
  return elements(node, name)[0]
}

/** All the text inside an element, in order. */
export function textOf(node: XmlElement): string {
  return node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('')
}

/** The first descendant with this name, searching depth first. */
export function find(node: XmlElement, name: string): XmlElement | undefined {
  for (const c of node.children) {
    if (typeof c === 'string') continue
    if (c.name === name) return c
    const deeper = find(c, name)
    if (deeper) return deeper
  }
  return undefined
}
