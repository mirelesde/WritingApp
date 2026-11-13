import { fuzzyScore } from '@writingapp/core'

export interface PaletteCommand {
  id: string
  label: string
  /** The group it belongs to, shown dimmed and matched too, e.g. "Format". */
  section: string
  /** Its keyboard shortcut, for display. */
  shortcut?: string
  run: () => void
}

/** Commands matching `query`, best first; with no query, all of them in the order given. */
export function rankCommands<T extends { label: string; section: string }>(
  commands: T[],
  query: string,
  limit = 40
): T[] {
  if (query.trim() === '') return commands.slice(0, limit)
  const scored: { command: T; score: number; order: number }[] = []
  commands.forEach((command, order) => {
    const inLabel = fuzzyScore(query, command.label)
    const inFull = fuzzyScore(query, `${command.section} ${command.label}`)
    if (inLabel === null && inFull === null) return
    scored.push({ command, score: Math.max((inLabel ?? -Infinity) * 2, inFull ?? -Infinity), order })
  })
  scored.sort((a, b) => b.score - a.score || a.order - b.order)
  return scored.slice(0, limit).map((s) => s.command)
}
