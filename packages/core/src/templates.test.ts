import { describe, expect, it } from 'vitest'
import { MemoryFileSystem } from './testing/memoryFileSystem'
import {
  createFromTemplate,
  dailyNote,
  fillTemplate,
  isoDate,
  listTemplates,
  saveAsTemplate,
} from './templates'

const day = new Date(2026, 10, 13, 9, 5)

describe('templates', () => {
  it('formats dates and fills placeholders', () => {
    expect(isoDate(day)).toBe('2026-11-13')
    expect(fillTemplate('# {{date}}\n{{time}} {{ Date }}', day)).toBe('# 2026-11-13\n09:05 2026-11-13')
  })

  it('lists, saves and uses templates', async () => {
    const fs = new MemoryFileSystem({ '/lib/Notes/.keep': '' })
    expect(await listTemplates(fs, '/lib')).toEqual([])
    const saved = await saveAsTemplate(fs, '/lib', '# Chapter\n\nOn {{date}}.')
    expect(saved).toBe('/lib/.templates/chapter.md')
    expect((await listTemplates(fs, '/lib')).map((t) => t.name)).toEqual(['Chapter'])
    const path = await createFromTemplate(fs, '/lib/Notes', saved, day)
    expect(await fs.readText(path)).toBe('# Chapter\n\nOn 2026-11-13.')
  })
})

describe('daily note', () => {
  it('creates today once, then opens it again', async () => {
    const fs = new MemoryFileSystem({ '/lib/Journal/old.md': '# 2026-11-12\n' })
    const first = await dailyNote(fs, '/lib', '/lib/Journal', day)
    expect(first.created).toBe(true)
    expect(await fs.readText(first.path)).toBe('# 2026-11-13\n\n')
    const second = await dailyNote(fs, '/lib', '/lib/Journal', day)
    expect(second).toEqual({ path: first.path, created: false })
  })

  it('starts from a Daily Note template', async () => {
    const fs = new MemoryFileSystem({
      '/lib/.templates/daily.md': '# Daily Note\n\n## {{weekday}}\n\n- [ ] ',
      '/lib/Journal/x.md': 'x',
    })
    const { path } = await dailyNote(fs, '/lib', '/lib/Journal', day)
    expect(await fs.readText(path)).toBe('# 2026-11-13\n\n## Friday\n\n- [ ] ')
  })
})
