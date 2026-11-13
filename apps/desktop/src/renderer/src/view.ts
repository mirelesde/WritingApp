import { FONT_STACKS, type ViewSettings } from '@writingapp/core'

/** Puts the font choices where the editor's styles read them. */
export function applyView(view: ViewSettings): void {
  const style = document.documentElement.style
  style.setProperty('--editor-font', FONT_STACKS[view.font])
  style.setProperty('--editor-size', `${view.fontSize}px`)
}
