import {
  commonParent,
  listKeyTarget,
  moveSlot,
  pathRange,
  type VisibleGroup
} from './organise'

/** The parts of a keyboard event the handlers read. */
export interface KeyInfo {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/** What a key press in a pane asks the app to do. `handled` means the browser's own action is cancelled. */
export interface KeyResult<A> {
  handled: boolean
  action?: A
}

const NONE = { handled: false }

export type TreeKeyAction =
  | { kind: 'select'; path: string }
  | { kind: 'expand'; path: string; open: boolean }
  | { kind: 'rename'; path: string }
  | { kind: 'move'; paths: string[]; parent: string; slot: number }

/**
 * A key pressed in the group tree. `clipboard` gets the first look after the move
 * shortcut and says whether it took the key (copy, cut, paste, duplicate).
 */
export function treeKey(
  e: KeyInfo,
  flat: VisibleGroup[],
  selected: string,
  expanded: Record<string, boolean>,
  clipboard: () => boolean
): KeyResult<TreeKeyAction> {
  const mod = e.metaKey || e.ctrlKey
  const i = flat.findIndex((v) => v.group.path === selected)
  const current = flat[i]
  if (!current) return NONE
  const select = (v: VisibleGroup | undefined): KeyResult<TreeKeyAction> => ({
    handled: true,
    action: v ? { kind: 'select', path: v.group.path } : undefined
  })

  if (mod && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    const parent = current.parent
    if (!parent) return { handled: true }
    const slot = moveSlot(
      parent.children.map((c) => c.path),
      parent.children.filter((c) => c.kind === 'group').map((c) => c.path),
      [current.group.path],
      e.key === 'ArrowUp' ? -1 : 1
    )
    return {
      handled: true,
      action: slot === undefined ? undefined : { kind: 'move', paths: [current.group.path], parent: parent.path, slot }
    }
  }
  if (clipboard()) return { handled: true }
  if (mod || e.altKey) return NONE

  const path = current.group.path
  const subgroups = current.group.children.some((c) => c.kind === 'group')
  switch (e.key) {
    case 'ArrowDown':
      return select(flat[i + 1])
    case 'ArrowUp':
      return select(flat[i - 1])
    case 'ArrowRight':
      if (subgroups && !expanded[path]) return { handled: true, action: { kind: 'expand', path, open: true } }
      return select(flat[i + 1]?.parent === current.group ? flat[i + 1] : undefined)
    case 'ArrowLeft':
      if (subgroups && expanded[path]) return { handled: true, action: { kind: 'expand', path, open: false } }
      return select(current.parent ? { group: current.parent, parent: null } : undefined)
    case 'Enter':
    case 'F2':
      return { handled: true, action: { kind: 'rename', path } }
    default:
      return NONE
  }
}

export type SheetsKeyAction =
  | { kind: 'move'; paths: string[]; parent: string; slot: number }
  | { kind: 'select'; paths: string[]; cursor: string | null; anchor?: string }
  | { kind: 'edit' }

/** What the sheet list's key handler needs to know about the list. */
export interface SheetsKeyContext {
  /** The sheets in the order shown. */
  listPaths: string[]
  selected: string[]
  cursor: string | null
  anchor: string | null
  /** True when the list is in the saved (manual) order, the only one that can be rearranged. */
  manual: boolean
  /** The children, in saved order, of the group the selection lives in; undefined across groups. */
  siblings(where: string): string[] | undefined
}

/** A key pressed in the sheet list. */
export function sheetsKey(
  e: KeyInfo,
  ctx: SheetsKeyContext,
  clipboard: () => boolean
): KeyResult<SheetsKeyAction> {
  const mod = e.metaKey || e.ctrlKey
  const { listPaths } = ctx
  if (mod && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    // As with dragging: a sorted list has no saved order to change, and sheets from
    // different groups can only be moved to another group, not reordered.
    const where = commonParent(ctx.selected)
    const children = where === undefined ? undefined : ctx.siblings(where)
    if (where === undefined || !children || !ctx.manual) return { handled: true }
    const slot = moveSlot(
      children,
      listPaths.filter((p) => commonParent([p]) === where),
      ctx.selected,
      e.key === 'ArrowUp' ? -1 : 1
    )
    return {
      handled: true,
      action: slot === undefined ? undefined : { kind: 'move', paths: ctx.selected, parent: where, slot }
    }
  }
  if (mod && e.key.toLowerCase() === 'a') {
    return {
      handled: true,
      action: { kind: 'select', paths: [...listPaths], cursor: ctx.cursor ?? listPaths[0] ?? null }
    }
  }
  if (clipboard()) return { handled: true }
  if (mod || e.altKey) return NONE

  if (e.key === 'Enter') return { handled: true, action: { kind: 'edit' } }
  const at = ctx.cursor ? listPaths.indexOf(ctx.cursor) : -1
  const target = listKeyTarget(e.key, at, listPaths.length)
  if (target === undefined) return NONE
  const path = listPaths[target]
  if (path === undefined) return { handled: true }
  if (e.shiftKey && ctx.anchor) {
    return { handled: true, action: { kind: 'select', paths: pathRange(listPaths, ctx.anchor, path), cursor: path } }
  }
  return { handled: true, action: { kind: 'select', paths: [path], cursor: path, anchor: path } }
}

export type WindowKeyAction = 'back' | 'forward' | 'focus-library' | 'focus-sheets' | 'focus-editor'

/** Cmd/Ctrl+1, 2, 3 jump between the panes; Cmd/Ctrl+[ and ] go back and forward. */
export function windowKey(e: KeyInfo, hasLibrary: boolean, hasSheet: boolean): WindowKeyAction | undefined {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || !hasLibrary) return undefined
  if (e.key === '[') return 'back'
  if (e.key === ']') return 'forward'
  if (e.key === '1') return 'focus-library'
  if (e.key === '2') return 'focus-sheets'
  if (e.key === '3' && hasSheet) return 'focus-editor'
  return undefined
}
