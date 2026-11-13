/**
 * How the app looks and what the user last did with its layout. Stored in the
 * app's settings file, so these are per machine, not part of a library.
 */
export const THEMES = ['system', 'light', 'dark'] as const
export const FONTS = ['serif', 'sans', 'mono'] as const

/** Options that are one of a few named choices; the first of each list is not necessarily the default. */
export const CHOICES = {
  columnWidth: ['narrow', 'medium', 'wide', 'full'],
  paragraphSpacing: ['compact', 'normal', 'airy'],
  currentLine: ['off', 'subtle'],
  caretWidth: ['thin', 'normal', 'thick'],
  focusScope: ['line', 'sentence', 'paragraph'],
  focusDim: ['light', 'medium', 'strong'],
  typewriterPosition: ['centre', 'upper'],
  textAlign: ['left', 'justify'],
  sheetSort: ['manual', 'title', 'modified', 'created', 'words']
} as const

export type ColumnWidth = (typeof CHOICES.columnWidth)[number]
export type ParagraphSpacing = (typeof CHOICES.paragraphSpacing)[number]
export type CurrentLine = (typeof CHOICES.currentLine)[number]
export type CaretWidth = (typeof CHOICES.caretWidth)[number]
export type FocusScope = (typeof CHOICES.focusScope)[number]
export type FocusDim = (typeof CHOICES.focusDim)[number]
export type TypewriterPosition = (typeof CHOICES.typewriterPosition)[number]
export type TextAlign = (typeof CHOICES.textAlign)[number]
export type SheetSort = (typeof CHOICES.sheetSort)[number]

export const MIN_LINE_SPACING = 1.3
export const MAX_LINE_SPACING = 2.4

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
  /** Width of the text column. */
  columnWidth: ColumnWidth
  /** Line height as a multiple of the text size. */
  lineSpacing: number
  /** How tall the blank line between paragraphs is. */
  paragraphSpacing: ParagraphSpacing
  /** Tint the line the cursor is on. */
  currentLine: CurrentLine
  caretWidth: CaretWidth
  /** What stays bright in focus mode. */
  focusScope: FocusScope
  /** How strongly everything else fades in focus mode. */
  focusDim: FocusDim
  /** Where the line being written sits in typewriter mode. */
  typewriterPosition: TypewriterPosition
  /** Leave room below the last line so it can scroll up to the middle. */
  scrollPastEnd: boolean
  textAlign: TextAlign
  /** How the sheet list is ordered; only the view changes, not the saved order. */
  sheetSort: SheetSort
  /** Curly quotes, en and em dashes and ellipses as you type. */
  smartTypography: boolean
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
  columnWidth: 'medium',
  lineSpacing: 1.85,
  paragraphSpacing: 'normal',
  currentLine: 'off',
  caretWidth: 'normal',
  focusScope: 'paragraph',
  focusDim: 'medium',
  typewriterPosition: 'centre',
  scrollPastEnd: true,
  textAlign: 'left',
  sheetSort: 'manual',
  smartTypography: false,
}

/** CSS font stacks, by name. */
export const FONT_STACKS: Record<Font, string> = {
  serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
}

export function clampLineSpacing(spacing: number): number {
  return Math.min(MAX_LINE_SPACING, Math.max(MIN_LINE_SPACING, Math.round(spacing * 20) / 20))
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
  const record = data as Record<string, unknown>
  for (const key of Object.keys(CHOICES) as (keyof typeof CHOICES)[]) {
    const value = record[key]
    if (typeof value === 'string' && (CHOICES[key] as readonly string[]).includes(value)) {
      ;(out as Record<string, unknown>)[key] = value
    }
  }
  if (typeof record.lineSpacing === 'number' && Number.isFinite(record.lineSpacing)) {
    out.lineSpacing = clampLineSpacing(record.lineSpacing)
  }
  if (typeof record.scrollPastEnd === 'boolean') out.scrollPastEnd = record.scrollPastEnd
  if (typeof record.smartTypography === 'boolean') out.smartTypography = record.smartTypography
  return out
}

/** The defaults with the saved fields laid over them. */
export function resolveView(saved: Partial<ViewSettings> = {}): ViewSettings {
  return { ...DEFAULT_VIEW, ...saved }
}
