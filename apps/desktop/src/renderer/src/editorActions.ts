import type Editor from './Editor.svelte'
import type { FormatKind } from './blockStyle'

/** The parts of the editor these commands use. */
export type ActiveEditor = Pick<
  Editor,
  | 'format'
  | 'insertTableAtCursor'
  | 'insertFootnoteAtCursor'
  | 'insertContentsAtCursor'
  | 'insertImagesAtCursor'
  | 'foldSectionAtCursor'
  | 'foldSections'
  | 'goToFootnoteAtCursor'
  | 'toggleTaskAtCursor'
  | 'jumpHeading'
  | 'lineStyle'
  | 'focus'
>

/** What the commands need from the rest of the app. */
export interface EditorActionsHost {
  /** The editor being typed in, if a sheet is open. */
  editor(): ActiveEditor | undefined
  /** Asks which images to add and returns them as Markdown. */
  chooseImages(): Promise<string[]>
  info(text: string): void
}

/** Menu commands that act on the text at the cursor of the sheet being edited. */
export class EditorActions {
  constructor(private readonly host: EditorActionsHost) {}

  /** Puts the cursor in the text. */
  focus = (): void => this.host.editor()?.focus()
  format = (kind: 'bold' | 'italic' | 'link' | FormatKind): void => this.host.editor()?.format(kind)
  insertTable = (): void => this.host.editor()?.insertTableAtCursor()
  insertFootnote = (): void => this.host.editor()?.insertFootnoteAtCursor()
  insertContents = (): void => this.host.editor()?.insertContentsAtCursor()
  foldHere = (fold: boolean): void => this.host.editor()?.foldSectionAtCursor(fold)
  foldAll = (fold: boolean): void => this.host.editor()?.foldSections(fold)
  jumpHeading = (direction: 'previous' | 'next'): void => this.host.editor()?.jumpHeading(direction)

  insertImage = async (): Promise<void> => {
    if (!this.host.editor()) return
    const markdown = await this.host.chooseImages()
    // The sheet may have changed while the dialog was open.
    this.host.editor()?.insertImagesAtCursor(markdown)
  }

  goToFootnote = (): void => {
    if (this.host.editor() && !this.host.editor()?.goToFootnoteAtCursor()) this.host.info('This sheet has no footnotes.')
  }

  toggleTask = (): void => {
    if (this.host.editor() && !this.host.editor()?.toggleTaskAtCursor()) {
      this.host.info('Put the cursor on a task item (- [ ]) first.')
    }
  }
}
