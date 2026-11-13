import { isHexColour } from './viewSettings'

/** The colours a theme file may set, named as the app's CSS variables. */
export const THEME_COLORS = [
  'bg',
  'list',
  'sidebar',
  'text',
  'muted',
  'border',
  'hover',
  'selected',
  'selection',
  'marker',
  'accent'
] as const
export type ThemeColor = (typeof THEME_COLORS)[number]

export interface ColorTheme {
  /** The file name without `.json`; what the view setting stores. */
  id: string
  name: string
  /** Light or dark, so native controls match; omit to follow the Theme setting. */
  mode?: 'light' | 'dark'
  colors: Partial<Record<ThemeColor, string>>
}

/**
 * Reads a theme file: `{ "name": "...", "mode": "dark", "colors": { "bg": "#112233", ... } }`.
 * Unknown keys and bad colours are dropped; a file with no usable colour is
 * not a theme, so this returns null.
 */
export function parseColorTheme(id: string, text: string): ColorTheme | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const { name, mode, colors } = data as Record<string, unknown>
  if (typeof colors !== 'object' || colors === null) return null
  const picked: Partial<Record<ThemeColor, string>> = {}
  for (const key of THEME_COLORS) {
    const value = (colors as Record<string, unknown>)[key]
    if (typeof value === 'string' && isHexColour(value)) picked[key] = value.toLowerCase()
  }
  if (Object.keys(picked).length === 0) return null
  return {
    id,
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : id,
    ...(mode === 'light' || mode === 'dark' ? { mode } : {}),
    colors: picked
  }
}
