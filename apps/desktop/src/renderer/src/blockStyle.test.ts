import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { formatSpec, styleOfLine, type FormatKind } from './blockStyle'

function run(doc: string, kind: FormatKind, from = 0, to = from): string {
  const state = EditorState.create({ doc, selection: EditorSelection.range(from, to) })
  const spec = formatSpec(state, kind)
  return spec ? state.update(spec).state.doc.toString() : doc
}

describe('block styles', () => {
  it('reads a line style', () => {
    expect(styleOfLine('## Hi')).toBe('h2')
    expect(styleOfLine('- [x] done')).toBe('task')
    expect(styleOfLine('3. three')).toBe('numbered')
    expect(styleOfLine('#hashtag')).toBe('body')
  })
  it('sets and toggles headings', () => {
    expect(run('Title', 'h1')).toBe('# Title')
    expect(run('# Title', 'h2')).toBe('## Title')
    expect(run('# Title', 'h1')).toBe('Title')
    expect(run('## Title', 'body')).toBe('Title')
  })
  it('turns several lines into a numbered list, skipping blanks', () => {
    expect(run('a\n\nb\nc', 'numbered', 0, 6)).toBe('1. a\n\n2. b\n3. c')
    expect(run('a\nb', 'bullet', 0, 3)).toBe('- a\n- b')
    expect(run('- a\n- b', 'bullet', 0, 7)).toBe('a\nb')
  })
  it('switches list kinds', () => {
    expect(run('- a', 'task')).toBe('- [ ] a')
    expect(run('- [ ] a', 'quote')).toBe('> a')
  })
  it('wraps inline code and strikethrough', () => {
    expect(run('one two', 'code', 0, 3)).toBe('`one` two')
    expect(run('`one` two', 'code', 1, 4)).toBe('one two')
    expect(run('one two', 'strike', 4)).toBe('one ~~two~~')
  })
  it('fences and unfences code blocks', () => {
    expect(run('a\nb', 'codeblock', 0, 3)).toBe('```\na\nb\n```')
    expect(run('```\na\n```', 'codeblock', 4)).toBe('a')
  })
  it('inserts a rule after the line', () => {
    expect(run('hi', 'rule', 2)).toBe('hi\n\n---\n')
  })
})
