import { describe, expect, it } from 'vitest'
import { rankCommands } from './palette'

const cmds = [
  { label: 'New Sheet', section: 'File' },
  { label: 'Toggle Sidebar', section: 'View' },
  { label: 'Heading 1', section: 'Format' },
  { label: 'Dark theme', section: 'View' }
]

describe('rankCommands', () => {
  it('lists everything in order for an empty query', () => {
    expect(rankCommands(cmds, '').map((c) => c.label)).toEqual(cmds.map((c) => c.label))
  })
  it('matches loosely on the label', () => {
    expect(rankCommands(cmds, 'tgsb')[0]?.label).toBe('Toggle Sidebar')
    expect(rankCommands(cmds, 'zzz')).toEqual([])
  })
  it('matches the section too', () => {
    expect(rankCommands(cmds, 'format head')[0]?.label).toBe('Heading 1')
  })
})
