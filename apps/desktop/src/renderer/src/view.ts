import { editorFontStack, isHexColour, textOn, UI_FONT_SIZE, UI_FONT_FAMILIES, THEME_COLORS, type ColorTheme, type ViewSettings } from '@writingapp/core'

const COLUMN_WIDTH = {
  compact: '30rem',
  narrow: '38rem',
  medium: '46rem',
  wide: '60rem',
  'extra-wide': '76rem',
  full: '200rem'
}
const BLANK_LINE_SCALE = { compact: '0.4', normal: '1', airy: '1.6' }
const CARET_WIDTH = { thin: '1px', normal: '2px', thick: '3px' }
const DIM_OPACITY = { light: '0.55', medium: '0.3', strong: '0.15' }

/** Puts the look choices where the editor's styles read them. */
export function applyView(view: ViewSettings, theme?: ColorTheme): void {
  const style = document.documentElement.style
  // A colour theme and the accent override the stylesheet's own colours.
  for (const key of THEME_COLORS) style.removeProperty(`--${key}`)
  for (const [key, value] of Object.entries(theme?.colors ?? {})) style.setProperty(`--${key}`, value)
  // Text on the accent follows the accent, so a light accent never gets white text.
  const accent = view.accent || theme?.colors.accent
  if (accent && isHexColour(accent)) style.setProperty('--on-accent', textOn(accent))
  else style.removeProperty('--on-accent')
  if (view.accent) {
    style.setProperty('--accent', view.accent)
    if (!theme?.colors.selection) {
      style.setProperty('--selection', `color-mix(in srgb, ${view.accent} 28%, transparent)`)
    }
  }
  style.setProperty('--ui-scale', String(view.uiFontSize / UI_FONT_SIZE))
  style.setProperty('--ui-font', UI_FONT_FAMILIES[view.uiFont])
  style.setProperty('--editor-font', editorFontStack(view))
  style.setProperty('--editor-size', `${view.fontSize}px`)
  style.setProperty('--editor-width', COLUMN_WIDTH[view.columnWidth])
  style.setProperty('--editor-line-height', String(view.lineSpacing))
  style.setProperty('--blank-line-scale', view.paragraphIndent ? '0' : BLANK_LINE_SCALE[view.paragraphSpacing])
  style.setProperty('--caret-width', CARET_WIDTH[view.caretWidth])
  style.setProperty('--dim-opacity', DIM_OPACITY[view.focusDim])
  style.setProperty('--text-align', view.textAlign)
  style.setProperty(
    '--active-line',
    view.currentLine === 'subtle' ? 'color-mix(in srgb, var(--text) 6%, transparent)' : 'transparent'
  )
  document.documentElement.classList.toggle('hang-marks', view.hangHeadings)
  document.documentElement.classList.toggle('indent-paras', view.paragraphIndent)
  style.setProperty('--run-end-space', view.scrollPastEnd ? '40vh' : '4rem')
}
