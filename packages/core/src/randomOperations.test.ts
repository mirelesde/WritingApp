import { describe, expect, it } from 'vitest'
import type { FileSystem } from './filesystem'
import { loadLibrary, type GroupNode } from './library'
import {
  copyNodes,
  createGroupUndoable,
  createSheetUndoable,
  deleteNodeUndoable,
  moveNodesUndoable,
  renameGroupUndoable,
} from './operations'
import { SIDECAR_NAME } from './sidecar'
import { MemoryFileSystem } from './testing/memoryFileSystem'
import { applyUndo } from './undo'

/** A small seeded random generator, so a failing run can be repeated exactly. */
function random(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Every sheet and folder under /Lib: sheets with their text, ignoring sidecar files. */
async function dump(fs: FileSystem, dir = '/Lib', out: string[] = []): Promise<string[]> {
  for (const e of await fs.list(dir)) {
    if (e.name === SIDECAR_NAME) continue
    const path = `${dir}/${e.name}`
    if (e.kind === 'directory') {
      out.push(`${path}/`)
      await dump(fs, path, out)
    } else out.push(`${path} = ${await fs.readText(path)}`)
  }
  return out.sort()
}

const texts = (lines: string[]): string[] => lines.filter((l) => l.includes(' = ')).map((l) => l.split(' = ')[1]!).sort()

/** The library as the app shows it, with what is on screen: names in order, glue, keywords. */
async function shape(fs: FileSystem): Promise<string[]> {
  const out: string[] = []
  const walk = (g: GroupNode, pre: string): void => {
    for (const c of g.children) {
      if (c.kind === 'group') {
        out.push(`${pre}${c.name}/`)
        walk(c, `${pre}${c.name}/`)
      } else out.push(`${pre}${c.name}${c.glued ? '+' : ''}`)
    }
  }
  walk((await loadLibrary(fs, '/Lib')) as GroupNode, '')
  return out
}

function groups(g: GroupNode, out: GroupNode[] = []): GroupNode[] {
  out.push(g)
  for (const c of g.children) if (c.kind === 'group') groups(c, out)
  return out
}

function checkTree(g: GroupNode): void {
  const seen = new Set<string>()
  for (const c of g.children) {
    const key = c.name.toLowerCase()
    expect(seen.has(key), `duplicate name ${c.name} in ${g.path}`).toBe(false)
    seen.add(key)
    if (c.kind === 'group') checkTree(c)
  }
}

describe('random sequences of structural changes', () => {
  it('keep every sheet, never repeat a name, and undo back to where they started', async () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rnd = random(seed)
      const pick = <T,>(items: T[]): T => items[Math.floor(rnd() * items.length)]!
      const fs = new MemoryFileSystem({
        '/Lib/.writingapp.json': JSON.stringify({ version: 1, order: ['A', 'B'], glued: [] }),
        '/Lib/A/.writingapp.json': JSON.stringify({ version: 1, order: ['one.md', 'two.md'], glued: ['one.md'] }),
        '/Lib/A/one.md': '# One\n',
        '/Lib/A/two.md': '# Two\n',
        '/Lib/B/.writingapp.json': JSON.stringify({ version: 1, order: ['one.md'], glued: [] }),
        '/Lib/B/one.md': '# Other one\n',
      })
      const trace: string[] = []
      let counter = 0
      try {
        for (let step = 0; step < 14; step++) {
          const tree = (await loadLibrary(fs, '/Lib')) as GroupNode
          const all = groups(tree)
          const nodes = all.flatMap((g) => g.children).filter((c) => c.path !== '/Lib')
          const before = await dump(fs)
          const beforeShape = await shape(fs)
          const kind = pick(['move', 'copy', 'sheet', 'group', 'delete', 'rename'])
          trace.push(kind)
          let undo = null as Awaited<ReturnType<typeof moveNodesUndoable>>['undo'] | null
          if (kind === 'sheet') {
            const g = pick(all)
            undo = (await createSheetUndoable(fs, g.path, `# New ${counter++}\n`, rnd() < 0.5 ? undefined : 0)).undo
            expect(texts(await dump(fs)).length).toBe(texts(before).length + 1)
          } else if (kind === 'group') {
            undo = (await createGroupUndoable(fs, pick(all).path, rnd() < 0.5 ? 'Part' : undefined)).undo
          } else if (nodes.length > 0) {
            const node = pick(nodes)
            if (kind === 'move' || kind === 'copy') {
              const targets = all.filter((g) => g.path !== node.path && !g.path.startsWith(`${node.path}/`))
              const target = pick(targets)
              const siblings = nodes.filter((n) => n.path.slice(0, n.path.lastIndexOf('/')) === node.path.slice(0, node.path.lastIndexOf('/')))
              const chosen = rnd() < 0.5 ? [node] : siblings.filter(() => rnd() < 0.5).concat(node).filter((v, i, a) => a.indexOf(v) === i)
              const parentOf = (p: string): string => p.slice(0, p.lastIndexOf('/'))
              const paths = chosen.map((c) => c.path)
              const illegal = paths.some((p) => target.path === p || target.path.startsWith(`${p}/`))
              if (!illegal) {
                if (kind === 'move') {
                  undo = (await moveNodesUndoable(fs, paths, target.path, rnd() < 0.5 ? undefined : 0)).undo
                  expect(texts(await dump(fs))).toEqual(texts(before))
                } else {
                  undo = (await copyNodes(fs, paths, target.path)).undo
                  expect(parentOf(paths[0]!)).toBeTruthy()
                  expect(texts(await dump(fs)).length).toBeGreaterThanOrEqual(texts(before).length)
                }
              }
            } else if (kind === 'delete') {
              undo = await deleteNodeUndoable(fs, node.path)
              // The sheets inside go away, and nothing else does.
              const gone = before.filter((l) => l.startsWith(node.path + '/') || l.startsWith(node.path + ' = '))
              expect((await dump(fs)).length).toBe(before.length - gone.length)
            } else if (node.kind === 'group') {
              try {
                undo = (await renameGroupUndoable(fs, node.path, pick(['Renamed', 'Part', 'a: b?']))).undo
              } catch (error) {
                // Asking for a name that is taken is refused, and must change nothing.
                expect((error as Error).message).toContain('already exists')
                expect(await dump(fs)).toEqual(before)
              }
              expect(texts(await dump(fs))).toEqual(texts(before))
            }
          }
          checkTree((await loadLibrary(fs, '/Lib')) as GroupNode)
          if (undo && undo.length > 0 && rnd() < 0.6) {
            await applyUndo(fs, undo)
            trace.push('undo')
            expect(await dump(fs)).toEqual(before)
            expect(await shape(fs)).toEqual(beforeShape)
          }
        }
      } catch (error) {
        throw new Error(`seed ${seed} after ${trace.join(', ')}: ${(error as Error).message}`)
      }
    }
  })
})
