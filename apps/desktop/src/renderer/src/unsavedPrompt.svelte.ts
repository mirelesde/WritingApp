export type UnsavedAnswer = 'save' | 'discard' | 'cancel'
export type UnsavedWhat = 'tab' | 'window' | 'library'

/** The question "save, discard or cancel?" about sheets with unsaved text, one at a time. */
export class UnsavedPrompt {
  /** What the dialog shows, or null when nothing is being asked. */
  current = $state<{ names: string[]; what: UnsavedWhat } | null>(null)
  private settle: ((answer: UnsavedAnswer) => void) | null = null

  /** Shows the question and resolves with the user's answer. */
  ask(names: string[], what: UnsavedWhat): Promise<UnsavedAnswer> {
    return new Promise((resolve) => {
      this.current = { names, what }
      this.settle = (answer) => {
        this.current = null
        this.settle = null
        resolve(answer)
      }
    })
  }

  answer = (answer: UnsavedAnswer): void => this.settle?.(answer)
}
