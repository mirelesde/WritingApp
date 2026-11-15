import { describe, expect, it } from 'vitest'
import { Trail } from './trail.svelte'

function setup(existing: string[] = ['a', 'b', 'c']): { trail: Trail; shown: string[] } {
  const shown: string[] = []
  const trail: Trail = new Trail({
    exists: (p) => existing.includes(p),
    show: async (p) => {
      shown.push(p)
      trail.visit(p) // opening a sheet reports a visit; stepping must not record it
    }
  })
  return { trail, shown }
}

describe('Trail', () => {
  it('records visits and ignores a repeat of the current sheet', () => {
    const { trail } = setup()
    trail.visit('a')
    trail.visit('a')
    trail.visit('b')
    expect(trail.list).toEqual(['a', 'b'])
    expect([trail.canBack, trail.canForward]).toEqual([true, false])
  })

  it('goes back and forward without recording the steps', async () => {
    const { trail, shown } = setup()
    for (const p of ['a', 'b', 'c']) trail.visit(p)
    await trail.step(-1)
    await trail.step(-1)
    expect([trail.list, trail.at, shown]).toEqual([['a', 'b', 'c'], 0, ['b', 'a']])
    expect([trail.canBack, trail.canForward]).toEqual([false, true])
    await trail.step(1)
    expect(trail.at).toBe(1)
  })

  it('drops what lay ahead when a new sheet is opened', async () => {
    const { trail } = setup()
    for (const p of ['a', 'b', 'c']) trail.visit(p)
    await trail.step(-1)
    trail.visit('a')
    expect(trail.list).toEqual(['a', 'b', 'a'])
    expect(trail.canForward).toBe(false)
  })

  it('skips sheets that are gone, and stays put with nowhere to go', async () => {
    const { trail, shown } = setup(['a', 'c'])
    for (const p of ['a', 'b', 'c']) trail.visit(p)
    await trail.step(-1)
    expect([trail.at, shown]).toEqual([0, ['a']])
    await trail.step(-1)
    expect(trail.at).toBe(0)
  })

  it('keeps only the last hundred', () => {
    const { trail } = setup()
    for (let i = 0; i < 120; i++) trail.visit(`s${i}`)
    expect(trail.list).toHaveLength(100)
    expect(trail.list[0]).toBe('s20')
  })
})
