import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { highlightSyntax } from './highlightMark'

function marked(doc: string): string[] {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage, extensions: [highlightSyntax] })]
  })
  const found: string[] = []
  ensureSyntaxTree(state, doc.length, 1000)?.iterate({
    enter: (node) => {
      if (node.name === 'Highlight') found.push(doc.slice(node.from, node.to))
    }
  })
  return found
}

describe('==highlight== in the editor', () => {
  it('finds highlighted text, also next to other marks', () => {
    expect(marked('a ==hi== b')).toEqual(['==hi=='])
    expect(marked('a ==hi **there**== b')).toEqual(['==hi **there**=='])
    expect(marked('==one== and ==two==')).toEqual(['==one==', '==two=='])
  })
  it('ignores stray equals signs and code', () => {
    expect(marked('a == b == c')).toEqual([])
    expect(marked('x === y')).toEqual([])
    expect(marked('`==x==`')).toEqual([])
  })
})
