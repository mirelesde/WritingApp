import { beforeEach, describe, expect, it } from 'vitest'
import type { GroupNode } from '@writingapp/core'
import { GroupNav } from './groupNav.svelte'

const group = (path: string, ...children: GroupNode[]): GroupNode => ({
  kind: 'group',
  name: path.split('/').pop()!,
  path,
  children
})
const tree = group('/L', group('/L/A', group('/L/A/B')), group('/L/C'))

let nav: GroupNav
beforeEach(() => {
  nav = new GroupNav()
})

describe('GroupNav', () => {
  it('opens a library at its root, with only the root open', () => {
    nav.expanded = { '/old': true }
    nav.reset('/L')
    expect([nav.selectedGroup, nav.expanded]).toEqual(['/L', { '/L': true }])
  })

  it('opens and closes a group', () => {
    nav.expand('/L/A')
    expect(nav.expanded['/L/A']).toBe(true)
    nav.toggle('/L/A')
    expect(nav.expanded['/L/A']).toBe(false)
    nav.toggle('/L/A')
    expect(nav.expanded['/L/A']).toBe(true)
  })

  it('reveals a group by opening every group above it', () => {
    nav.reveal('/L/A/B', '/L')
    expect(nav.selectedGroup).toBe('/L/A/B')
    expect(nav.expanded).toEqual({ '/L/A/B': true, '/L/A': true, '/L': true })
  })

  it('follows a moved group, and the open groups with it', () => {
    nav.selectedGroup = '/L/A'
    nav.expanded = { '/L': true, '/L/A': true }
    const moved = group('/L', group('/L/C', group('/L/C/A')))
    nav.follow(moved, (p) => p.replace('/L/A', '/L/C/A'))
    expect(nav.selectedGroup).toBe('/L/C/A')
    expect(nav.expanded).toEqual({ '/L': true, '/L/C/A': true })
  })

  it('falls back to the root when the selected group is gone', () => {
    nav.selectedGroup = '/L/A'
    nav.follow(group('/L'), (p) => p)
    expect(nav.selectedGroup).toBe('/L')
  })

  it('keeps a group that is still there, and moves from one that is not', () => {
    nav.selectedGroup = '/L/C'
    expect(nav.keep(tree, '/L')).toBe(false)
    expect(nav.selectedGroup).toBe('/L/C')
    nav.selectedGroup = '/L/gone'
    expect(nav.keep(tree, '/L/A')).toBe(true)
    expect(nav.selectedGroup).toBe('/L/A')
  })
})
