import { describe, expect, it } from 'vitest'
import { errorMessage, remapPath } from './organise'

describe('remapPath', () => {
  const moved: [string, string][] = [['/Lib/Old', '/Lib/New']]

  it('maps the moved path itself and everything inside it', () => {
    expect(remapPath('/Lib/Old', moved)).toBe('/Lib/New')
    expect(remapPath('/Lib/Old/a.md', moved)).toBe('/Lib/New/a.md')
    expect(remapPath('/Lib/Old/Sub/a.md', moved)).toBe('/Lib/New/Sub/a.md')
  })

  it('leaves other paths alone, including ones sharing a prefix', () => {
    expect(remapPath('/Lib/Older/a.md', moved)).toBe('/Lib/Older/a.md')
    expect(remapPath('/Lib/other.md', moved)).toBe('/Lib/other.md')
  })

  it('handles several pairs', () => {
    const pairs: [string, string][] = [
      ['/Lib/a.md', '/Lib/G/a.md'],
      ['/Lib/b.md', '/Lib/G/b-2.md']
    ]
    expect(remapPath('/Lib/b.md', pairs)).toBe('/Lib/G/b-2.md')
  })
})

describe('errorMessage', () => {
  it('strips the IPC prefix', () => {
    const e = new Error(
      'Error invoking remote method \'op:renameGroup\': Error: "X" already exists'
    )
    expect(errorMessage(e)).toBe('"X" already exists')
  })

  it('passes other errors through', () => {
    expect(errorMessage(new Error('plain'))).toBe('plain')
    expect(errorMessage('text')).toBe('text')
  })
})
