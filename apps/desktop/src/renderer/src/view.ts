import { FONT_STACKS, THEME_COLORS, type ColorTheme, type ViewSettings } from '@writingapp/core'

const COLUMN_WIDTH = { narrow: '38rem', medium: '46rem', wide: '60rem', full: '200rem' }
const BLANK_LINE_SCALE = { compact: '0.4', normal: '1', airy: '1.6' }
const CARET_WIDTH = { thin: '1px', normal: '2px', thick: '3px' }
const DIM_OPACITY = { light: '0.55', medium: '0.3', strong: '0.15' }

/** Puts the look choices where the editor's styles read them. */
export function applyView(view: ViewSettings, theme?: ColorTheme): void {
  const style = document.documentElement.style
  // A colour theme and the accent override the stylesheet's own colours.
  for (const key of THEME_COLORS) style.removeProperty(`--${key}`)
  for (const [key, value] of Object.entries(theme?.colors ?? {})) style.setProperty(`--${key}`, value)
  if (view.accent) {
    style.setProperty('--accent', view.accent)
    if (!theme?.colors.selection) {
      style.setProperty('--selection', `color-mix(in srgb, ${view.accent} 28%, transparent)`)
    }
  }
  style.setProperty('--editor-font', FONT_STACKS[view.font])
  style.setProperty('--editor-size', `${view.fontSize}px`)
  style.setProperty('--editor-width', COLUMN_WIDTH[view.columnWidth])
  style.setProperty('--editor-line-height', String(view.lineSpacing))
  style.setProperty('--blank-line-scale', BLANK_LINE_SCALE[view.paragraphSpacing])
  style.setProperty('--caret-width', CARET_WIDTH[view.caretWidth])
  style.setProperty('--dim-opacity', DIM_OPACITY[view.focusDim])
  style.setProperty('--text-align', view.textAlign)
  style.setProperty(
    '--active-line',
    view.currentLine === 'subtle' ? 'color-mix(in srgb, var(--text) 6%, transparent)' : 'transparent'
  )
  document.documentElement.classList.toggle('hang-marks', view.hangHeadings)
  style.setProperty('--run-end-space', view.scrollPastEnd ? '40vh' : '4rem')
}
