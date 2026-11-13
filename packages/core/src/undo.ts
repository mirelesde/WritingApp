import type { FileSystem } from './filesystem'
import { joinPath } from './path'
import { SIDECAR_NAME } from './sidecar'

/**
 * One step of undoing a structural change. An operation returns the steps
 * that reverse it, in the order they must run.
 */
export type UndoAction =
  | { kind: 'write'; path: string; text: string }
  | { kind: 'trash'; path: string }
  | { kind: 'sidecar'; dir: string; text: string }
  | { kind: 'makeDir'; path: string }
  | { kind: 'rename'; from: string; to: string }

/** What a missing sidecar means, written out: no order, no glue. */
const EMPTY_SIDECAR = '{"version":1,"order":[],"glued":[]}\n'

/** The sidecar's raw text, so it can be put back exactly as it was. */
export async function snapshotSidecar(fs: FileSystem, dir: string): Promise<UndoAction> {
  const path = joinPath(dir, SIDECAR_NAME)
  const text = (await fs.exists(path)) ? await fs.readText(path) : EMPTY_SIDECAR
  return { kind: 'sidecar', dir, text }
}

/** Runs the steps. Steps whose target has since vanished are skipped. */
export async function applyUndo(fs: FileSystem, actions: UndoAction[]): Promise<void> {
  for (const action of actions) {
    if (action.kind === 'write') await fs.writeText(action.path, action.text)
    else if (action.kind === 'makeDir') await fs.makeDir(action.path)
    else if (action.kind === 'rename') await fs.rename(action.from, action.to)
    else if (action.kind === 'trash') {
      if (await fs.exists(action.path)) await fs.trash(action.path)
    } else await fs.writeText(joinPath(action.dir, SIDECAR_NAME), action.text)
  }
}
