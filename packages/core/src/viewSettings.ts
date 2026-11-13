/**
 * How the app looks and what the user last did with its layout. Stored in the
 * app's settings file, so these are per machine, not part of a library.
 */
export const THEMES = ['system', 'light', 'dark'] as const
export const FONTS = ['serif', 'sans', 'mono'] as const

export type Theme = (typeof THEMES)[number]
export type Font = (typeof FONTS)[number]

export const MIN_FONT_SIZE = 12
export const MAX_FONT_SIZE = 32

export interface ViewSettings {
  theme: Theme
  font: Font
  /** Editor text size in pixels. */
  fontSize: number
  /** True when the library pane is hidden (it still slides in on hover). */
  sidebarCollapsed: boolean
  /** True when the heading outline is shown beside the editor. */
  outline: boolean
  /** Dim everything but the paragraph being written. */
  focusMode: boolean
  /** Keep the line being written in the middle of the window. */
  typewriter: boolean
  /** Show a line-number gutter in the editor. */
  lineNumbers: boolean
}

export const DEFAULT_VIEW: ViewSettings = {
  theme: 'system',
  font: 'serif',
  fontSize: 18,
  sidebarCollapsed: false,
  outline: false,
  focusMode: false,
  typewriter: false,
  lineNumbers: false,
}

/** CSS font stacks, by name. */
export const FONT_STACKS: Record<Font, string> = {
  serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
}

export function clampFontSize(size: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)))
}

/** Keeps only the valid fields of untrusted data (a settings file, an IPC argument). */
export function parseViewSettings(data: unknown): Partial<ViewSettings> {
  const out: Partial<ViewSettings> = {}
  if (typeof data !== 'object' || data === null) return out
  const { theme, font, fontSize, sidebarCollapsed, outline, focusMode, typewriter, lineNumbers } = data as Record<string, unknown>
  if (typeof theme === 'string' && (THEMES as readonly string[]).includes(theme)) {
    out.theme = theme as Theme
  }
  if (typeof font === 'string' && (FONTS as readonly string[]).includes(font)) {
    out.font = font as Font
  }
  if (typeof fontSize === 'number' && Number.isFinite(fontSize)) {
    out.fontSize = clampFontSize(fontSize)
  }
  if (typeof sidebarCollapsed === 'boolean') out.sidebarCollapsed = sidebarCollapsed
  if (typeof outline === 'boolean') out.outline = outline
  if (typeof focusMode === 'boolean') out.focusMode = focusMode
  if (typeof typewriter === 'boolean') out.typewriter = typewriter
  if (typeof lineNumbers === 'boolean') out.lineNumbers = lineNumbers
  return out
}

/** The defaults with the saved fields laid over them. */
export function resolveView(saved: Partial<ViewSettings> = {}): ViewSettings {
  return { ...DEFAULT_VIEW, ...saved }
}
