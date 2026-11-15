import { describe, expect, it } from 'vitest'
import type { GroupNode } from '@writingapp/core'
import { findScopeOptions, projectOf, replacedMessage, seedQuery, startScope } from './findScopes'

const group = (path: string, ...children: GroupNode[]): GroupNode => ({
  kind: 'group',
  name: path.split('/').pop()!,
  path,
  children
})
const tree = group(
  '/L',
  group('/L/Novel', group('/L/Novel/Part', group('/L/Novel/Part/Sub'))),
  group('/L/Notes')
)
const sheet = { path: '/L/Novel/Part/a.md', title: 'Alpha' }
const values = (o: { value: string }[]): string[] => o.map((x) => x.value)

describe('projectOf', () => {
  it('is the first folder under the root', () => {
    expect(projectOf('/L', '/L/Novel/Part/Sub')).toBe('/L/Novel')
    expect(projectOf('/L', '/L/Novel')).toBe('/L/Novel')
  })
})

describe('findScopeOptions', () => {
  it('offers the library alone at the root with no sheet open', () => {
    expect(values(findScopeOptions(tree, '/L', undefined))).toEqual(['library'])
  })

  it('offers sheet, group, project and library from a nested group', () => {
    const o = findScopeOptions(tree, '/L/Novel/Part', sheet)
    expect(values(o)).toEqual(['sheet', 'group', 'project', 'library'])
    expect(o.map((x) => x.name)).toEqual(['Alpha', 'Part', 'Novel', 'library'])
    expect(o[3]!.path).toBeUndefined()
  })

  it('skips the group when the selected group is the project itself', () => {
    expect(values(findScopeOptions(tree, '/L/Novel', undefined))).toEqual(['project', 'library'])
  })
})

describe('startScope', () => {
  const all = findScopeOptions(tree, '/L/Novel/Part', sheet)
  it('takes the one asked for when offered', () => {
    expect(startScope('project', all)).toBe('project')
  })
  it('starts as narrow as makes sense otherwise', () => {
    expect(startScope(undefined, all)).toBe('sheet')
    expect(startScope('sheet', findScopeOptions(tree, '/L/Novel/Part', undefined))).toBe('group')
    expect(startScope(undefined, findScopeOptions(tree, '/L/Novel', undefined))).toBe('project')
    expect(startScope('group', findScopeOptions(tree, '/L', undefined))).toBe('library')
  })
})

describe('seedQuery', () => {
  it('uses a one-line selection, cut to 200 characters', () => {
    expect(seedQuery('word')).toBe('word')
    expect(seedQuery('x'.repeat(300))).toHaveLength(200)
  })
  it('gives nothing for no selection or several lines', () => {
    expect(seedQuery('')).toBeUndefined()
    expect(seedQuery('a\nb')).toBeUndefined()
  })
})

describe('replacedMessage', () => {
  it('counts the matches', () => {
    expect(replacedMessage(1)).toBe('Replaced 1 match. Undo Library Change brings them back.')
    expect(replacedMessage(4)).toBe('Replaced 4 matches. Undo Library Change brings them back.')
  })
})
