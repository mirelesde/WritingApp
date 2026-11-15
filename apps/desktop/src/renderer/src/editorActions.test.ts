import { describe, expect, it, vi } from 'vitest'
import { EditorActions, type ActiveEditor } from './editorActions'

function setup(present = true): { editor: Record<string, ReturnType<typeof vi.fn>>; host: { chooseImages: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> }; actions: EditorActions } {
  const editor = {
    format: vi.fn(),
    insertTableAtCursor: vi.fn(),
    insertFootnoteAtCursor: vi.fn(),
    insertContentsAtCursor: vi.fn(),
    insertImagesAtCursor: vi.fn(),
    foldSectionAtCursor: vi.fn(),
    foldSections: vi.fn(),
    goToFootnoteAtCursor: vi.fn(() => true),
    toggleTaskAtCursor: vi.fn(() => true),
    jumpHeading: vi.fn(),
    lineStyle: vi.fn()
  }
  const host = {
    editor: (): ActiveEditor | undefined => (present ? (editor as unknown as ActiveEditor) : undefined),
    chooseImages: vi.fn(async () => ['![](a.png)']),
    info: vi.fn()
  }
  return { editor, host, actions: new EditorActions(host) }
}

describe('EditorActions', () => {
  it('passes commands to the open editor', () => {
    const { editor, actions } = setup()
    actions.format('bold')
    actions.insertTable()
    actions.foldHere(true)
    actions.foldAll(false)
    actions.jumpHeading('next')
    expect(editor.format).toHaveBeenCalledWith('bold')
    expect(editor.insertTableAtCursor).toHaveBeenCalled()
    expect(editor.foldSectionAtCursor).toHaveBeenCalledWith(true)
    expect(editor.foldSections).toHaveBeenCalledWith(false)
    expect(editor.jumpHeading).toHaveBeenCalledWith('next')
  })

  it('does nothing with no editor open', async () => {
    const { host, actions } = setup(false)
    actions.insertTable()
    await actions.insertImage()
    actions.goToFootnote()
    actions.toggleTask()
    expect(host.chooseImages).not.toHaveBeenCalled()
    expect(host.info).not.toHaveBeenCalled()
  })

  it('inserts the chosen images', async () => {
    const { editor, actions } = setup()
    await actions.insertImage()
    expect(editor.insertImagesAtCursor).toHaveBeenCalledWith(['![](a.png)'])
  })

  it('says so when there is no footnote or task to go to', () => {
    const { editor, host, actions } = setup()
    editor.goToFootnoteAtCursor.mockReturnValue(false)
    editor.toggleTaskAtCursor.mockReturnValue(false)
    actions.goToFootnote()
    actions.toggleTask()
    expect(host.info).toHaveBeenCalledWith('This sheet has no footnotes.')
    expect(host.info).toHaveBeenCalledWith('Put the cursor on a task item (- [ ]) first.')
  })
})
