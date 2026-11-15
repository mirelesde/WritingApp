import { describe, expect, it, vi } from 'vitest'
import type { MenuCommand } from '../../preload/api'
import { runMenuCommand, type CommandActions } from './menuCommands'

function actions(): { a: CommandActions; calls: [string, unknown[]][] } {
  const calls: [string, unknown[]][] = []
  const a = new Proxy({} as CommandActions, {
    get: (_t, name: string) => (...args: unknown[]) => void calls.push([name, args])
  })
  return { a, calls }
}
const run = (command: string): [string, unknown[]][] => {
  const { a, calls } = actions()
  runMenuCommand(command as MenuCommand, a)
  return calls
}

describe('runMenuCommand', () => {
  it('runs the action for a command', () => {
    expect(run('new-sheet')).toEqual([['newSheet', []]])
    expect(run('daily-note')).toEqual([['dailyNote', []]])
  })

  it('gives arguments for the commands that share an action', () => {
    expect(run('next-tab')).toEqual([['cycleTab', [1]]])
    expect(run('previous-tab')).toEqual([['cycleTab', [-1]]])
    expect(run('cut-sheets')).toEqual([['copySheets', [true]]])
    expect(run('unfold-all')).toEqual([['fold', [false, true]]])
    expect(run('fold-section')).toEqual([['fold', [true, false]]])
    expect(run('unglue')).toEqual([['glue', [false]]])
    expect(run('previous-heading')).toEqual([['jumpHeading', ['previous']]])
  })

  it('passes the format a format command names', () => {
    expect(run('format-bold')).toEqual([['format', ['bold']]])
    expect(run('format-h2')).toEqual([['format', ['h2']]])
  })

  it('makes a group or a project for the commands left over', () => {
    expect(run('new-group')).toEqual([['newGroup', [false]]])
    expect(run('new-project')).toEqual([['newGroup', [true]]])
  })

  it('does not call an action it was not meant to', () => {
    const spy = vi.fn()
    const { a } = actions()
    runMenuCommand('save', { ...a, save: spy, saveAll: vi.fn() })
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
