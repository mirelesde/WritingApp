/**
 * How the app looks and what the user last did with its layout. Stored in the
 * app's settings file, so these are per machine, not part of a library.
 */
export const THEMES = ['system', 'light', 'dark'] as const
/**
 * Editor fonts: `interface` follows the interface font, then the fonts that come with the app, and
 * `custom` (any installed font, named in `fontCustom`). `mono` is an old setting, still honoured but
 * no longer offered: generic names sit badly beside specific fonts.
 */
export const FONTS = ['interface', 'geist', 'source-serif-4', 'custom', 'mono'] as const

/** Options that are one of a few named choices; the first of each list is not necessarily the default. */
export const CHOICES = {
  columnWidth: ['compact', 'narrow', 'medium', 'wide', 'extra-wide', 'full'],
  paragraphSpacing: ['compact', 'normal', 'airy'],
  currentLine: ['off', 'subtle'],
  caretWidth: ['thin', 'normal', 'thick'],
  focusScope: ['line', 'sentence', 'paragraph'],
  focusDim: ['light', 'medium', 'strong'],
  typewriterPosition: ['centre', 'upper'],
  textAlign: ['left', 'justify'],
  sheetSort: ['manual', 'title', 'modified', 'created', 'words'],
  saveMode: ['auto', 'switch', 'manual'],
  openSheetIn: ['same', 'tab', 'window'],
  uiFont: ['geist', 'source-serif-4'],
  onLaunch: ['last', 'ask'],
  autosaveDelay: ['quick', 'normal', 'relaxed']
} as const

export type ColumnWidth = (typeof CHOICES.columnWidth)[number]
export type ParagraphSpacing = (typeof CHOICES.paragraphSpacing)[number]
export type CurrentLine = (typeof CHOICES.currentLine)[number]
export type CaretWidth = (typeof CHOICES.caretWidth)[number]
export type FocusScope = (typeof CHOICES.focusScope)[number]
export type FocusDim = (typeof CHOICES.focusDim)[number]
export type TypewriterPosition = (typeof CHOICES.typewriterPosition)[number]
export type TextAlign = (typeof CHOICES.textAlign)[number]
/** Where clicking a different sheet opens it: in the current tab, a new tab, or a new window. */
export type OpenSheetIn = (typeof CHOICES.openSheetIn)[number]
/** The typeface of the app's own interface (the editor has its own font setting). */
export type UiFont = (typeof CHOICES.uiFont)[number]
/** What starting the app does: open the library that was open last, or ask for a folder. */
export type OnLaunch = (typeof CHOICES.onLaunch)[number]
/** How long to wait after typing stops before saving, when saving while typing. */
export type AutosaveDelay = (typeof CHOICES.autosaveDelay)[number]
/** Milliseconds for each autosave delay. */
export const AUTOSAVE_DELAY_MS: Record<AutosaveDelay, number> = { quick: 300, normal: 800, relaxed: 3000 }
export type SheetSort = (typeof CHOICES.sheetSort)[number]
/** When text is written to disk: while typing; on Save, switching sheets and closing; or only when asked (manual, with tabs). */
export type SaveMode = (typeof CHOICES.saveMode)[number]

export const MIN_LINE_SPACING = 1.3
export const MAX_LINE_SPACING = 2.4

export type Theme = (typeof THEMES)[number]
export type Font = (typeof FONTS)[number]

export const MIN_FONT_SIZE = 12
export const MAX_FONT_SIZE = 32
/** Size of the interface's own text, in pixels (14 is the design size). */
export const MIN_UI_FONT_SIZE = 12
export const MAX_UI_FONT_SIZE = 18
export const UI_FONT_SIZE = 14

export interface ViewSettings {
  theme: Theme
  font: Font
  /** Editor text size in pixels. */
  fontSize: number
  /** Family name of an installed font, used when `font` is `custom`. */
  fontCustom: string
  /** True when the library pane is hidden (it still slides in on hover). */
  sidebarCollapsed: boolean
  /** True when the sheet list is hidden, leaving the editor wider. */
  sheetsCollapsed: boolean
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
  /** Hang heading hashes in the left margin so heading text lines up with the body text. */
  hangHeadings: boolean
  /** Hide Markdown markers (**, #, link addresses) except on the lines the cursor is on. */
  hideMarkers: boolean
  /** Indent the first line of each paragraph and close the gap between paragraphs, in the editor and in exports. */
  paragraphIndent: boolean
  /** Accent colour as `#rrggbb`; empty keeps the theme's own. */
  accent: string
  /** Id of a theme file from the themes folder; empty for none. */
  colorTheme: string
  /** When text is saved: `auto` while typing; `switch` only on Save (⌘S), when switching sheets, and on close; `manual` only when asked, with a prompt before changes are dropped. */
  saveMode: SaveMode
  /** Where choosing a different sheet in the list opens it. Right-click always offers a new tab or window. */
  openSheetIn: OpenSheetIn
  /** Typeface of the interface: lists, menus, dialogs. */
  uiFont: UiFont
  /** Size of the interface's text in pixels. */
  uiFontSize: number
  /** Show how many sheets each group holds, beside its name in the library. */
  groupCounts: boolean
  /** Show the Saved / Saving indicator in the toolbar (a failed save is always shown). */
  saveIndicator: boolean
  /** Open the last library at launch, or ask for a folder every time. */
  onLaunch: OnLaunch
  /** Quiet time after typing before an automatic save. */
  autosaveDelay: AutosaveDelay
  /** Show the word count in the corner of the editor. */
  showWordCount: boolean
  /** Break long words at line ends in justified text, so the gaps between words stay even. */
  hyphenate: boolean
  /** Type an opening bracket or quote and get the closing one too. */
  autoCloseBrackets: boolean
  /** Ask before moving sheets or groups to the trash. */
  confirmTrash: boolean
}

export const DEFAULT_VIEW: ViewSettings = {
  theme: 'system',
  font: 'interface',
  fontSize: 16,
  fontCustom: '',
  sidebarCollapsed: false,
  sheetsCollapsed: false,
  outline: false,
  focusMode: false,
  typewriter: false,
  lineNumbers: false,
  columnWidth: 'medium',
  lineSpacing: 1.75,
  paragraphSpacing: 'normal',
  currentLine: 'off',
  caretWidth: 'normal',
  focusScope: 'paragraph',
  focusDim: 'medium',
  typewriterPosition: 'centre',
  scrollPastEnd: true,
  textAlign: 'justify',
  sheetSort: 'manual',
  smartTypography: false,
  hangHeadings: true,
  hideMarkers: false,
  paragraphIndent: false,
  accent: '#6b7280',
  colorTheme: '',
  saveMode: 'auto',
  openSheetIn: 'same',
  uiFont: 'geist',
  uiFontSize: UI_FONT_SIZE,
  groupCounts: true,
  saveIndicator: true,
  onLaunch: 'last',
  autosaveDelay: 'normal',
  showWordCount: true,
  hyphenate: false,
  autoCloseBrackets: true,
  confirmTrash: false,
}

/** Where the window's panes are, which Preferences does not own: a reset leaves these alone. */
const LAYOUT_KEYS = ['sidebarCollapsed', 'sheetsCollapsed', 'outline'] as const

/** Every setting back at its default, except the layout the writer has arranged. */
export function defaultPreferences(): Partial<ViewSettings> {
  const out: Partial<ViewSettings> = { ...DEFAULT_VIEW }
  for (const key of LAYOUT_KEYS) delete out[key]
  return out
}

/** CSS font names of the bundled interface fonts. */
export const UI_FONT_FAMILIES: Record<UiFont, string> = {
  geist: "'Geist'",
  'source-serif-4': "'Source Serif 4'"
}

/** CSS font stacks, by name. */
export const FONT_STACKS: Record<Font, string> = {
  interface: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  geist: "'Geist', sans-serif",
  'source-serif-4': "'Source Serif 4', serif",
  custom: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
}

/** True for a font family name that is safe to put in a CSS font stack. */
export function isFontName(value: string): boolean {
  return /^[^\\"'`;{}<>\n\r]{1,80}$/.test(value)
}

/** The CSS font stack for the editor. */
export function editorFontStack(view: Pick<ViewSettings, 'font' | 'fontCustom'> & Partial<Pick<ViewSettings, 'uiFont'>>): string {
  if (view.font === 'interface') return `${UI_FONT_FAMILIES[view.uiFont ?? DEFAULT_VIEW.uiFont]}, ${FONT_STACKS.interface}`
  if (view.font === 'custom' && isFontName(view.fontCustom)) return `'${view.fontCustom}', ${FONT_STACKS.interface}`
  return FONT_STACKS[view.font]
}

export function clampLineSpacing(spacing: number): number {
  return Math.min(MAX_LINE_SPACING, Math.max(MIN_LINE_SPACING, Math.round(spacing * 20) / 20))
}

export function clampFontSize(size: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)))
}

/** True for `#rrggbb`. */
export function isHexColour(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

const channel = (hex: string, at: number): number => {
  const v = parseInt(hex.slice(at, at + 2), 16) / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/** The text colour that reads best on a `#rrggbb` fill: white, or a near-black. */
export function textOn(fill: string): string {
  const light = 0.2126 * channel(fill, 1) + 0.7152 * channel(fill, 3) + 0.0722 * channel(fill, 5)
  // White wins when the fill is darker than the point where both contrast equally (about 0.18).
  return light < 0.18 ? '#ffffff' : '#111111'
}

/** Keeps only the valid fields of untrusted data (a settings file, an IPC argument). */
export function parseViewSettings(data: unknown): Partial<ViewSettings> {
  const out: Partial<ViewSettings> = {}
  if (typeof data !== 'object' || data === null) return out
  const { theme, font, fontSize, sidebarCollapsed, sheetsCollapsed, outline, focusMode, typewriter, lineNumbers } = data as Record<string, unknown>
  if (typeof theme === 'string' && (THEMES as readonly string[]).includes(theme)) {
    out.theme = theme as Theme
  }
  // Settings from when the choices were Serif, Sans and Mono: Sans was the system look, Serif is closest to Source Serif.
  const named = font === 'sans' ? 'interface' : font === 'serif' ? 'source-serif-4' : font
  if (typeof named === 'string' && (FONTS as readonly string[]).includes(named)) {
    out.font = named as Font
  }
  if (typeof (data as Record<string, unknown>).fontCustom === 'string' && ((data as Record<string, unknown>).fontCustom === '' || isFontName((data as Record<string, unknown>).fontCustom as string))) {
    out.fontCustom = (data as Record<string, string>).fontCustom.trim()
  }
  if (typeof fontSize === 'number' && Number.isFinite(fontSize)) {
    out.fontSize = clampFontSize(fontSize)
  }
  if (typeof sidebarCollapsed === 'boolean') out.sidebarCollapsed = sidebarCollapsed
  if (typeof sheetsCollapsed === 'boolean') out.sheetsCollapsed = sheetsCollapsed
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
  if (typeof record.hangHeadings === 'boolean') out.hangHeadings = record.hangHeadings
  if (typeof record.hideMarkers === 'boolean') out.hideMarkers = record.hideMarkers
  if (typeof record.paragraphIndent === 'boolean') out.paragraphIndent = record.paragraphIndent
  // Settings saved before there were modes: autosave off meant saving on switch and close.
  if (record.saveMode === undefined && record.autosave === false) out.saveMode = 'switch'
  if (typeof record.uiFontSize === 'number' && Number.isFinite(record.uiFontSize)) {
    out.uiFontSize = Math.min(MAX_UI_FONT_SIZE, Math.max(MIN_UI_FONT_SIZE, Math.round(record.uiFontSize)))
  }
  if (typeof record.groupCounts === 'boolean') out.groupCounts = record.groupCounts
  if (typeof record.saveIndicator === 'boolean') out.saveIndicator = record.saveIndicator
  for (const key of ['showWordCount', 'hyphenate', 'autoCloseBrackets', 'confirmTrash'] as const) {
    if (typeof record[key] === 'boolean') out[key] = record[key]
  }
  if (typeof record.accent === 'string' && (record.accent === '' || isHexColour(record.accent))) {
    out.accent = record.accent.toLowerCase()
  }
  if (typeof record.colorTheme === 'string' && /^[\w .-]{0,80}$/.test(record.colorTheme)) {
    out.colorTheme = record.colorTheme
  }
  return out
}

/** The defaults with the saved fields laid over them. */
export function resolveView(saved: Partial<ViewSettings> = {}): ViewSettings {
  return { ...DEFAULT_VIEW, ...saved }
}
