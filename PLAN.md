# WritingApp — plan

Working title. A free, open-source writing app in the spirit of Ulysses:
a library of ordered sheets, fast keyboard-driven organisation, and clean
export. Cross-platform on desktop first, iPad and iPhone later.

## Status

- **Done:** milestones 1 (scaffold) to 9 (hardening). Licensed AGPL-3.0.
- **Next:** the UI backlog (round 2), worked in order, one commit per item.
  See "UI backlog" below. Then "Later" and "Still open".
- The app edits and organises a library, splits, merges, glues and
  unglues sheets, deletes (to the system trash), searches, exports to HTML
  and PDF, and follows changes made outside the app. Undo covers move,
  delete, split, merge, glue and unglue. Not in the UI yet: renaming a sheet
  (its file name comes from its first line) and undo for creating or
  renaming groups and sheets.

If you are picking this up in a new session, read "Working in this repo"
below, then pick from "UI backlog", "Still open" and "Later".

## Working in this repo

### Layout

```
package.json            npm workspace root; scripts delegate to the packages
packages/core/          @writingapp/core — library model, operations, export
  src/filesystem.ts     the FileSystem interface (the core's only door to disk)
  src/sheet.ts          sheetTitle(), sheetPreview(); tests sit next to sources as *.test.ts
  src/sidecar.ts        parse and reconcile .writingapp.json with the folder
  src/library.ts        loadLibrary() -> tree of group and sheet nodes
  src/filename.ts       slugify(), sheetFileName()
  src/operations.ts     create, rename, delete, move, reorder
  src/path.ts           path helpers
  src/testing/          MemoryFileSystem, for tests
apps/desktop/           @writingapp/desktop — Electron + Svelte 5
  src/main/             Electron main process (Node side);
                        nodeFileSystem.ts is the disk implementation,
                        library.ts the IPC handlers, settings.ts the
                        remembered library path (userData/settings.json)
  src/preload/          the bridge exposed to the UI as window.api;
                        api.ts holds its types
  src/renderer/src/     Svelte UI
```

### Commands (run from the repo root)

| Command | What it does |
| --- | --- |
| `npm install` | Install everything, including the Electron binary |
| `npm run dev` | Launch the desktop app with hot reload |
| `npm test` | Unit tests for every package (Vitest) |
| `npm run typecheck` | Type-check both packages |
| `npm run build` | Type-check, then production build into `apps/desktop/out` |

Requires Node.js 24 or newer.

### Rules that keep the mobile app possible

- **The core never touches the platform.** `packages/core` must not import
  Electron, Node built-ins, or the DOM. Its `tsconfig.json` deliberately
  loads no Node or DOM types, so doing so fails `npm run typecheck`.
- **All disk access goes through `FileSystem`.** Extend the interface when
  the core needs a new capability; implement it on the Node side in
  `apps/desktop/src/main`.
- **The UI never touches the disk.** The renderer calls `window.api`
  (defined in the preload script), which forwards to handlers in the main
  process, which call the core.

### Things that will bite you

- **Electron is pinned to an exact version** in `apps/desktop/package.json`.
  The packaging tool's post-install step fails on a version range inside a
  workspace. Keep it exact when upgrading.
- **`@writingapp/core` ships TypeScript source, not a build.**
  `electron.vite.config.ts` excludes it from dependency externalisation so
  the main and preload bundles compile it in. Any future workspace package
  used by the main process needs the same entry.
- **`svelte-check` runs against `tsconfig.web.json`**, not the root
  `tsconfig.json`. Pointed at the root file it reports errors from inside
  `node_modules`.
- **If a command fails with "Permission denied"** after an interrupted
  install, delete `node_modules` and run `npm install` again.

### Checking the app without looking at it

Useful for an automated session. Build, launch with a debugging port, and
read the page through it:

```bash
npm run build
cd apps/desktop && ../../node_modules/.bin/electron . --remote-debugging-port=9333
```

`http://127.0.0.1:9333/json/list` then lists the window, and its
`webSocketDebuggerUrl` accepts `Runtime.evaluate` (for example
`document.body.innerText`).

To test against a throwaway library without touching your real settings,
add `--user-data-dir=<dir>` and put `{"libraryPath": "<library>"}` in
`<dir>/settings.json`. The main process only lets the renderer read `.md`
files inside the open library (`isSheetInside`).

### Git

One commit per feature, each revertable on its own. Verify (tests,
typecheck, build) before committing.

## What v1 is

Three things, and nothing else until they are good enough to write in daily:

1. **Organisation** — project > group > sheets, manually ordered.
2. **Sheet operations** — split, merge, glue, move, all from the keyboard.
3. **Export** — HTML and PDF of any sheet, glued run, or group.

## Decisions already made

| Area | Choice | Why |
| --- | --- | --- |
| Desktop shell | Electron | Bundled Chromium renders identically on Mac, Windows, Linux; PDF export is built in |
| Mobile shell (later) | Capacitor | Same web UI and core on iPad and iPhone; the stack Obsidian ships on |
| Core | TypeScript package, no UI or platform knowledge | Library model, sheet operations, and export run unchanged under both shells |
| File access | A small filesystem interface the core depends on | Electron implements it with Node; Capacitor implements it with its own plugin later |
| Front end | TypeScript + Svelte + Vite | Small and fast; talks to the core through a narrow set of commands |
| Editor | CodeMirror 6 | Handles incremental parsing, long documents, and input methods |
| Editor style | Markdown markers stay visible but dimmed; an optional "Hide Markdown marks" setting (off by default) hides them except on the cursor's lines | Avoids the hide/reveal cursor problems of live-preview editors by default; the setting uses atomic ranges so the cursor never lands in hidden text |
| Storage | Plain `.md` files plus one sidecar file per folder | No lock-in; sync comes free from iCloud, Dropbox, or git |
| Export | HTML is the pivot format | Works on every platform including iOS; no Pandoc, nothing for users to install |

## On-disk format

A library is a folder the user picks. Top-level folders are projects,
nested folders are groups, `.md` files are sheets.

```
Library/
  Novel/                    project
    .writingapp.json        order + glue flags for this folder
    Part One/               group
      .writingapp.json
      opening.md            sheet
      the-station.md
    notes.md
```

- **Sidecar** (`.writingapp.json`) lists the folder's children in display
  order and records which sheets are glued to the one after them.
- **The sidecar is advisory.** Files on disk that it doesn't list are
  appended at the end; entries whose file is gone are dropped. Editing the
  folder in Finder or another app must never break the library.
- **Filenames** are generated from the sheet's first line when it is
  created, with a numeric suffix on collision. The user never sees or
  types them.
- **A sheet's title** is its first line, as in Ulysses.
- **Ignored:** dotfiles and anything that is not a folder or a `.md` file.

Proposed sidecar shape (not yet implemented):

```json
{
  "version": 1,
  "order": ["opening.md", "the-station.md", "Part One"],
  "glued": ["opening.md"]
}
```

`order` holds child names in display order, sheets and groups mixed.
`glued` holds the sheets that are glued to the sheet after them.

## Implementation order

Each milestone ends with something usable. Do not start the next one until
the "done when" line is true.

### 1. Scaffold — done
- `git init`, licence, npm workspace.
- `apps/desktop`: Electron + Svelte + TypeScript.
- `packages/core`: plain TypeScript with a test harness. It must never
  import Electron, Node's `fs`, or anything from the UI.
- **Done when:** the empty app builds and launches, and the core tests run.

### 2. Library core (TypeScript) — done
- Open a library folder and read it into a tree of projects, groups, sheets.
- Read and write the sidecar; reconcile it with what is actually on disk.
- Create, rename, delete (to system trash), and move sheets and groups.
- All disk access goes through the filesystem interface; the desktop app
  supplies the Node implementation.
- **Done when:** every operation above is covered by a passing test.

Suggested order of work, one commit each:

1. **Extend `FileSystem`** with what the operations need: `exists`,
   `makeDir`, `rename` (also used for moves), and `trash`. Add an in-memory
   implementation under `packages/core/src/testing/` for tests.
2. **Sidecar reconcile** as a pure function: given the sidecar's contents
   (or none, or malformed JSON) and the folder's real entries, return the
   ordered children. Unlisted entries go last, in name order; missing ones
   are dropped. Test this hardest: it is what makes outside edits safe.
3. **`loadLibrary(fs, root)`** returning a tree of nodes
   (`{ kind: 'group' | 'sheet', name, path, children? }`), where top-level
   groups are projects. Sheets carry a title (via `sheetTitle`) and a short
   preview. Reading every file on load is acceptable for now.
4. **Filename generation** as a pure function: slug of the first line,
   `untitled` when empty, numeric suffix on collision.
5. **Operations:** create sheet, create group, rename group, delete (trash),
   move to another group at an index, reorder within a group. Each one
   updates the sidecar of every folder it touches.
6. **Node implementation** of `FileSystem` in
   `apps/desktop/src/main/nodeFileSystem.ts`, using Electron's
   `shell.trashItem` for `trash`. Add Vitest to the desktop package and test
   it against a temporary folder, including one edited by hand between
   loads.

### 3. Library UI — done
- Three panes: library tree, sheet list (title + first lines), editor area.
- Pick a library folder; remember it between launches.
- Select a sheet and see its text in a plain text area.
- **Done when:** a real folder of Markdown files can be browsed.

Notes for this milestone:

- **Bridge:** add main-process handlers (`ipcMain.handle`) for choosing a
  library folder (`dialog.showOpenDialog`), loading the tree, and reading a
  sheet. Expose them through `window.api` in `src/preload/index.ts` and type
  them in `src/preload/index.d.ts`, where `api` is currently `unknown`.
- **Remembering the library:** a small JSON settings file under
  `app.getPath('userData')`.
- **Empty state:** replace the placeholder in `App.svelte` with a real
  "Choose library folder" button.
- **Menu:** add File > Open Library, with a keyboard shortcut.
- The window now runs with `sandbox: true`; the preload imports only
  `electron`. Keep it that way (no other npm imports in the preload).

### 4. Editor — done
- CodeMirror 6 with Markdown parsing.
- Styled headings, emphasis, lists, links, code; markers dimmed, not hidden.
- Autosave on pause and on blur. No save button.
- Writing typography: readable column width, line height, light and dark.
- List continuation on Enter, sensible Tab and Backspace in lists.
- **Done when:** writing a full sheet in it feels unremarkable.

Notes from building it:

- `renderer/src/editor.ts` builds the CodeMirror extensions (theme,
  Markdown styling, keymap); `Editor.svelte` mounts it. A new editor is
  created per sheet, so undo history is per sheet and does not survive
  switching.
- `renderer/src/autosave.ts` is the debounced, serialised saver (800 ms
  pause, flush on blur, on switching sheet or group, and on window close,
  retry after a failure). The main process side is `sheet:write`, which
  only overwrites existing `.md` files inside the open library.
- Markers stay visible but use `--marker`. Tab indents four spaces, which
  nests under both `- ` and `1. `. Pressing Enter on an empty second list
  item first loosens the list; a further Enter ends it (CodeMirror's
  behaviour, tested in `editor.test.ts`).
- The sheet list's title and preview update as you type.

### 5. Organising — done
- New sheet, new group, new project, from menu and keyboard.
- Reorder by drag and drop and by keyboard (move up / move down).
- Move sheets between groups.
- Multi-select in the sheet list.
- **Done when:** a project can be restructured without touching the mouse.

Notes from building it:

- **Shortcuts** (Cmd on Mac, Ctrl elsewhere): `N` new sheet, `Shift+N` new
  group, `Alt+Shift+N` new project, `Shift+M` Move to…, `1`/`2`/`3` focus
  the tree, sheet list, editor. In the tree: arrows, Enter or F2 to rename,
  `Alt+Up/Down` to move a group. In the sheet list: arrows, Shift to extend,
  Home/End, `A` to select all, `Alt+Up/Down` to move the selection. Escape
  in the editor returns to the sheet list.
- **Structure changes go through the main process.** The renderer calls
  `window.api.createSheet / createGroup / renameGroup / move`; each runs the
  core operation, reloads the library, and returns it with the list of
  `[from, to]` paths that changed, which `remapPath` applies to the
  selection, expanded groups and open sheet.
- **Never send Svelte state across the bridge.** `$state` arrays are
  proxies and fail with "An object could not be cloned"; copy with `[...x]`.
- The editor shows a sheet only when exactly one is selected.
- Pure logic lives in `renderer/src/organise.ts` (tested): `moveSlot`,
  `visibleGroups`, `moveTargets`, `dropZone`, `remapPath`.
- Drag and drop was checked with synthetic DOM drag events, not a real
  mouse drag.

### 6. Sheet operations — done
- **Split** at the cursor into two sheets.
- **Merge** selected sheets into one.
- **Glue / unglue** selected sheets: they stay separate files but display
  and export as one run.
- Glued runs scroll as one continuous document in the editor.
- A keyboard shortcut for each.
- **Done when:** all three round-trip correctly on disk and are undoable.

Notes from building it:

- **Menu (Sheet):** Split at Cursor `Shift+Enter`, Merge `Shift+J`, Glue
  `Shift+G`, Unglue `Alt+G`, Undo `Alt+Z` (all with Cmd on Mac, Ctrl
  elsewhere). Plain Cmd/Ctrl+Z still undoes typing in the editor.
- **Core:** `splitSheet`, `mergeSheets`, `glueSheets`, `unglueSheets` in
  `operations.ts`. Each returns `undo`, a list of `UndoAction` steps (write a
  file, trash a file, restore a sidecar) that `applyUndo` runs. The main
  process keeps the last 20 on an in-memory stack for the open library.
- **Semantics worth knowing:** split cuts the text the editor holds (not the
  file) and the tail becomes the next sheet, inheriting the original's glue
  to what follows. Merge joins with a blank line into the first sheet in
  display order and trashes the rest. Glue links each selected sheet to the
  next one it touches (one sheet: to the one after it). Unglue detaches the
  selected sheets from neighbours on both sides.
- **Undo is a stack of whole operations.** Undoing a split restores the
  sheet's text from before the split, so typing done after the split in
  either half is lost. Moves, renames and creation are not on the stack yet
  (milestone 9).
- **Runs in the editor** are one CodeMirror per sheet, stacked in one scroll
  container (`.run`), not a single document. Arrow keys cross the seams, but
  a text selection cannot span sheets. `runOf` (organise.ts) works out the
  run from the group's order.
- **Open question:** "Join" (see below) is still unconfirmed; this milestone
  built merge only.

### 7. HTML export — done
- Export a sheet, a glued run, a selection, or a whole group as one HTML file.
- Markdown to HTML in the core package.
- One built-in stylesheet, embedded in the output so the file stands alone.
- Preview before saving.
- **Done when:** a multi-sheet group exports to a single readable HTML file.

Notes from building it:

- **Use it:** File > Export as HTML… (`Cmd/Ctrl+E`). Exports the selected
  sheets, or the selected group when the tree has focus. A single sheet in a
  glued run exports the whole run. Shows a preview (sandboxed iframe), then
  Save as HTML… asks where to write it.
- **Core:** `export.ts` (`exportRuns`, `exportHtml`, `markdownToHtml`) using
  the `marked` package. Sheets in library order; glued sheets flow together,
  other sheets are separated by a `* * *` break. Raw HTML in a sheet is
  escaped, not passed through. The stylesheet is embedded and has a print
  rule, which milestone 8 can build on.
- **Not yet:** no export options (title page, per-sheet headings) and no
  front matter handling.

### 8. PDF export — done
- Render the exported HTML with a print stylesheet through Electron's
  built-in print-to-PDF.
- Page size, margins, page numbers.
- This path is desktop-only. The mobile apps will need their own PDF route
  through the iOS print system.
- **Done when:** the same group exports to a paginated PDF on Mac, Windows,
  and Linux.

Notes from building it:

- **Use it:** File > Export… (`Cmd/Ctrl+E`) opens the preview; choose page
  size (A4 or Letter), margins and page numbers, then Save as PDF….
- **How:** `main/pdf.ts` writes the export HTML to a temp file, loads it in a
  hidden window with JavaScript off, and calls `printToPDF`. The page's
  `@media print` rules apply (black on white whatever the system theme,
  headings kept with their text). Page numbers are "n / total" in the footer.
- **Verified on Mac only** (21-page output from a 4-sheet group looked right).
  Windows and Linux use the same Electron call but have not been tried.
- **Not yet:** custom fonts or sizes, title page, table of contents.

### 9. Hardening — done
- Watch the library folder and pick up outside changes, including sync
  conflicts.
- Undo for structural operations (delete, move, merge, split).
- Search across the library.
- Signed builds and a release workflow.
- **Done when:** it is the app the daily writing happens in.

Notes from building it:

- **Search:** File > Find in Library (`Cmd/Ctrl+Shift+F`). Case-insensitive
  substring over every sheet's text, first 50 sheets in library order, with
  a snippet. Item 73 later added case, whole-word and regex options and a group scope; there is still no ranking.
- **Delete and undo:** File > Move to Trash (`Cmd/Ctrl+Alt+Backspace`).
  Undo (`Cmd/Ctrl+Alt+Z`, "Undo Library Change") now covers move, delete,
  split, merge, glue and unglue, in-memory, 20 deep, cleared when another
  library opens. Undoing a delete rewrites the text of the sheets (and
  sidecars) from a snapshot; other file types in a deleted group only come
  back via the system trash.
- **Outside changes:** the library folder is watched (`fs.watch`, recursive;
  `main/watcher.ts`) and a burst of events becomes one `library:changed`.
  The sheet list updates; an open sheet reloads if it changed on disk and has
  no unsaved edits. With unsaved edits, the app's next save overwrites the
  outside change (last write wins). A sync-conflict copy (for example
  "a (conflicted copy).md") shows up as an ordinary extra sheet, and the
  sidebar offers a diff window to resolve it (item 31). A moved or renamed file outside the app drops it from the
  list and reorders by name for unknown files.
- **Releases:** `.github/workflows/ci.yml` (typecheck, tests, lint) and
  `release.yml` (tag `v*` builds Mac dmg, Windows installer, Linux AppImage
  and deb into a draft GitHub release). Signing and Mac notarization turn on
  when the secrets named at the top of `release.yml` exist. **The workflows
  have never run**, and no certificates exist yet; only a local unsigned Mac
  build (`npm run build:mac`) was tried.

## UI backlog (round 2)

Ordered from easiest to hardest; implement top to bottom, one commit each,
verified in the running app first. The first eleven requested items came
from the user after milestone 9; the rest are standard writing-app features
suggested afterwards and accepted into the list. Items marked (user) were
asked for directly.

**Easy**

1. ~~**More side margins in the editor (user).**~~ **Done.** CSS only: wider horizontal
   padding and a centred, max-width text column.
2. ~~**Spell check.**~~ **Done.** Turn on Electron's built-in checker and add suggestions
   to the editor's context menu. Language follows the system.
3. ~~**Word and character count, reading time.**~~ **Done.** A status bar showing the
   open sheet, the selection, and the group total. Computed from text core
   already has.
4. ~~**Smart list continuation.**~~ **Done.** Enter continues a bullet or number, Tab
   indents, Enter on an empty item ends the list. CodeMirror's Markdown
   commands cover most of it; mostly configuration.
5. ~~**Auto-close emphasis markers (user).**~~ **Done.** Typing `*` or `**` inserts the
   closing marker and leaves the cursor between. With a selection it wraps
   the selection; typing the closing marker steps over it. Must not misfire
   on list bullets (`* ` at line start). Do this after item 4 so the two
   agree on how `*` behaves.
6. ~~**Bold, italic and link shortcuts (user).**~~ **Done.** Cmd/Ctrl+B and +I wrap the
   selection in `**` / `*` (and unwrap if already wrapped); Cmd/Ctrl+K wraps
   it as `[text](url)` and selects the `url`. These are editor commands that
   the top bar (item 11) reuses.
7. ~~**Find and replace in the open sheet.**~~ **Done.** CodeMirror's search panel,
   styled to match, with Cmd/Ctrl+F and Cmd/Ctrl+Alt+F. Distinct from Find in
   Library.
   (Already worked through the Markdown keymap from milestone 4; this added tests for task lists, Shift-Tab and ordered nesting, and a check in the running app.)
   (Built as an input handler in `emphasis.ts`, not `closeBrackets`, so it also handles `_`, widening `*|*` to `**|**`, a list-bullet exception and Backspace on an empty pair.)
   (Acts on one sheet at a time: in a glued run each sheet has its own bar.)

33. ~~**Auto-pair brackets, backticks and quotes.**~~ **Done.** Typing `(`, `[`, `` ` ``
    or `"` inserts the closing character and steps over it when typed;
    wraps a selection; Backspace removes the empty pair. Quotes and
    backticks open only after a non-word character. Lives in `pairs.ts`.
34. ~~**Paste a URL over selected text to make a link.**~~ **Done.** The selection
    becomes `[text](url)`. Also Cmd/Ctrl-click on a link opens it in the
    browser.
35. ~~**Keyboard behaviour audit.**~~ **Done.** Check and fix, with tests:
    Tab and Shift-Tab indent and outdent nested list items (and a
    selection of several), Enter inside a blockquote or task list
    continues it, Backspace at the start of an item removes its marker,
    move line up and down (Alt+Up/Down), duplicate line, select line,
    and Home/End on wrapped lines.
36. ~~**Jump between headings.**~~ **Done.** Cmd/Ctrl+Alt+Up and Down move the cursor to
    the previous or next heading; the outline marks the current section.
   Audited and covered by tests; the default keymap already provides each of these, so no code changes were needed. Cmd/Ctrl+Alt+Up/Down (multiple cursors there) are taken over by item 36.

43. ~~**Reveal and open externally.**~~ **Done** (reveal and copy path, in the right-click menu; "open in another editor" not added). Reveal in Finder or Explorer, copy the
    file path, and open the sheet in another editor, from the sheet's
    menu once item 17 exists. Electron's `shell` does all of it.

**Easy to medium**

8. ~~**Theme, font and size.**~~ **Done.** Light, dark or follow the system; editor font
   family and size. A small settings store in the main process, applied as
   CSS variables. Export keeps its own stylesheet.
9. ~~**Collapsible sidebar (user).**~~ **Done.** A toggle button collapses the library
   pane; when collapsed, moving the pointer to the left edge slides it in
   as an overlay that goes away when the pointer leaves. State is
   remembered. Also a menu item with a shortcut. Layout, hover timing and
   focus are the fiddly parts.
10. ~~**Quick open (Cmd/Ctrl+P).**~~ **Done.** Fuzzy jump to a sheet by title or group
    path. A smaller cousin of Find in Library, same dialog style.
11. ~~**Top bar (user).**~~ **Done.** Buttons: search (magnifier), new sheet (sheet with
    pencil), bold, italic, link, export (sheet with up arrow). Editor
    buttons come from item 6, the rest call existing menu commands.
    Tooltips show the shortcut.
12. ~~**Open recent library; restore the last sheet.**~~ **Done.** Reopens where you left
    off, with a recent-libraries submenu. Needs the settings store from
    item 8.
13. ~~**Commented-out text (user).**~~ **Done.** Syntax to settle first; proposal:
    `<!-- ... -->` (valid Markdown everywhere), toggled on the selection or
    line with Cmd/Ctrl+/. Dimmed in the editor, left out of HTML/PDF export
    and of word counts (so after item 3). Search still finds it. Needs an
    export change in core.
14. ~~**Heading outline.**~~ **Done.** A panel listing the headings of the open sheet;
    click to jump. Reads the Markdown syntax tree the editor already has.
15. ~~**Focus and typewriter mode.**~~ **Done.** Dim everything except the current
    paragraph or sentence; optionally keep the cursor line vertically
    centred. A toggle in the View menu.
   (Settings live in the app's settings file; the View menu has Theme, Editor Font, and Larger/Smaller/Default Text Size (Cmd/Ctrl + / - / 0). The theme drives `nativeTheme`, so dialogs agree.)
   (The sidebar is both the library and sheet panes. Toggle with the button at the top left of the editor, View > Toggle Sidebar, or Cmd/Ctrl+\\; the state is remembered. The top bar in item 11 will take over the button.)
   (File > Quick Open…, Cmd/Ctrl+P. Subsequence matching over the title and the group path, best first.)
   (Sidebar toggle, new sheet and find on the left; bold, italic, link in the middle; export on the right. Buttons keep the editor's focus and selection.)
   (File > Open Recent lists the last ten libraries, drops one that is gone, and has Clear Menu. The open sheet is saved on each selection and reopened, without taking focus, at launch.)
   (Syntax: `<!-- ... -->`, toggled with Cmd/Ctrl+/ on the selection or line. Comments inside fenced code blocks count as code and are kept. Resolved the open decision on comment syntax.)
   (View > Show Outline, Cmd/Ctrl+Alt+O, or the button at the right of the top bar. Clicking an entry moves the cursor there. Headings in code blocks and comments are skipped; the panel's state is remembered.)
   (View > Focus Mode (Cmd/Ctrl+Shift+L) dims all but the current paragraph, and other sheets of a glued run fade too; View > Typewriter Scrolling keeps the cursor line in the middle. Both are remembered.)

37. ~~**Preferences window.**~~ **Done.** A real settings window, opened with
    Cmd/Ctrl+, so settings stop being menu-only. Holds the existing theme,
    font and size, plus the writing comfort options (item 38), smart
    quotes (item 39) and hide markers (item 41) as they arrive.
38. ~~**Writing comfort settings.**~~ **Done.** All in Preferences, stored with the view
    settings, applied through CSS variables so they change live:
    - Text column width: narrow, medium, wide, or full window.
    - Line spacing (1.3 to 2.4) and paragraph spacing (the height of the
      blank line between paragraphs: compact, normal, airy).
    - Cursor width, and a subtle highlight on the current line.
    - Focus mode scope (line, sentence or paragraph) and how strongly the
      rest fades.
    - Typewriter position: the middle, or the upper third.
    - Scroll past the end of the text, on or off.
    - Text alignment: left or justified.
    Distraction-free mode and a first-line indent for prose were part of
    this idea and are separate items 60 and 61 below.
39. ~~**Smart quotes and dashes.**~~ **Done.** Optional: straight quotes become curly,
    `--` becomes an en or em dash, `...` becomes an ellipsis. A setting,
    off by default; never applied inside code or comments. Needs the
    Preferences window (item 37).
40. ~~**Format menu and style popover.**~~ **Done.** Keep the editor header uncluttered:
    it keeps only Bold, Italic and Link. Everything else lives in:
    - A **Format** menu in the menu bar, with shortcuts: Heading 1 to 3
      and Body (Cmd/Ctrl+Alt+1 to 4), Quote, Bullet list, Numbered list,
      Task list, Strikethrough, Inline code, Code block, Comment, Horizontal
      rule. Items show their checked state at the cursor.
    - One **Aa** button at the right of the header that opens a small
      popover with the same actions as compact rows (styles, lists,
      inline), so the mouse route is one click plus one click.
    - The same list as a Format submenu in the right-click menu (item 17).
    Core gets a pure function per block style (toggle line prefix) with
    tests; the editor applies them as a transaction.
   An in-app dialog (Cmd/Ctrl+,) with theme, font, text size, focus mode and typewriter; later settings (items 38, 39, 41, 44) go in it.
   A "Smart punctuation" switch in Preferences, off by default; skips code, comments and Markdown dashes at the start of a line.
   Format menu and Aa popover; menu check marks not done (shown in popover only)

44. ~~**Toggle line numbers (user).**~~ **Done.** A preference (item 37) that shows a
    line-number gutter in the editor. Off by default; remembered with the
    view settings; applies to every sheet of a glued run.
45. ~~**Command palette.**~~ **Done.** Cmd/Ctrl+Shift+P opens a fuzzy list of every
    menu command and setting by name, with its shortcut. Reuses the quick
    open dialog; commands come from one registry shared with the menus.
46. ~~**Clickable task lists.**~~ **Done.** `- [ ]` and `- [x]` draw as checkboxes in the
    editor; clicking one toggles the marker in the text. Cmd/Ctrl+Enter
    toggles the item at the cursor.
47. ~~**Sheet list sorting and dates.**~~ **Done.** Sort a group's sheets by manual order
    (default), title, modified date, created date or word count; the card
    can show the date. Manual order stays in the sidecar, so sorting only
    changes the view until the user reorders.
48. ~~**Sheet templates and daily note.**~~ **Done.** File > New Sheet from Template… (palette entries per template), Save Sheet as Template, and Daily Note (Cmd/Ctrl+Alt+D); `{{date}}`, `{{time}}`, `{{weekday}}` are filled in, and a template titled "Daily Note" seeds each day. New Sheet from Template, with
    templates kept as sheets in a hidden `.templates` group, and a Daily
    Note command that opens or creates today's sheet in a chosen group.
49. ~~**External change handling.**~~ **Done.** When a sheet changes on disk while it is
    open: reload it silently if it has no unsaved edits, otherwise ask
    whether to keep the editor's version or take the disk's, and show
    both. Check first what the watcher and autosaver do today.
50. ~~**Custom themes and accent colour.**~~ **Done.** An accent colour picker, and user
    theme files (a small JSON of the colour tokens) dropped in a themes
    folder and listed in Preferences.
51. **Accessibility pass.** VoiceOver and screen-reader labels on every
    control and pane, a high-contrast option, honouring reduced motion,
    and full keyboard-only use of every dialog and menu.
   A switch in Preferences and View > Line Numbers; each sheet of a glued run numbers its own lines.
   Sort menu in the sheet list header; dates shown on cards when sorting by date or words
   Accent presets and picker; theme files (colours only) in <userData>/themes, opened from Preferences
   Save guard + conflict dialog; silent reload when no edits of mine in that sheet
   File menu > Command Palette (Cmd/Ctrl+Shift+P); commands built in App.svelte, not one shared registry with the menus

60. ~~**Distraction-free mode.**~~ **Done.** Hides both side panes and the header rows so
    only the text remains; they return when the pointer reaches the top or
    left edge, and Escape or the shortcut leaves. Builds on the sidebar
    peek (already there) and macOS full screen.
61. ~~**First-line indent for prose.**~~ **Done.** An option to indent the first line of
    each paragraph and drop the blank line between paragraphs in the editor
    and in export, as printed books do. Headings, lists and quotes are left
    alone. Needs a decision on how it round-trips: it is a display and
    export style, never changes the Markdown.
   Cmd/Ctrl+Shift+D (View menu and palette); Escape leaves from the editor
   Preferences switch; display and export style only, the Markdown is untouched; first paragraph after a heading is not indented; export covers HTML preview/save and PDF

**Medium**

16. ~~**Rename sheet and group.**~~ **Done.** *Sheet files now rename themselves to follow the title when you leave the sheet; groups rename from the tree.* Sheets take their name from the first line,
    so renaming a sheet means moving focus to that line (and the file
    renames itself on save); groups rename the folder and keep the sidecar.
    Needs a rename operation with undo. Comes before item 17 so the context
    menu can offer it.
17. ~~**Right-click menus (user).**~~ **Done.** Sheets, groups and the library root have a right-click menu (drawn in the app since the UI consistency work, see U4) with new sheet/group, rename, duplicate, cut / copy / paste, move to…, move to trash, reveal in Finder / file manager and copy path. Cmd/Ctrl+C, X, V and D work in the sheet list and the tree (File > Duplicate has no shortcut, since the editor uses Cmd/Ctrl+D). Copies are one undo step (`copyNodes` in core). On a sheet, a group and the library root:
    new sheet/group, rename, move to…, duplicate, cut / copy / paste,
    delete. The menu items run the existing
    `op:*` handlers. Cut/copy/paste and duplicate need a node clipboard and
    a copy operation in core (new, with undo).
18. **Markdown preview.** Toggle or side-by-side live preview, reusing the
    HTML export renderer in the sandboxed iframe. Scroll sync is optional.
19. **Favorites (pinned sheets).** A pinned section at the top of the
    library; stored in the root sidecar so it travels with the folder.
20. ~~**Footnotes.**~~ **Done.** Insert > Footnote adds a `[^1]` reference drawn as a chip; clicking it opens the note in an editable popover; definitions are hidden from the text, previews and counts, and HTML/PDF export numbers them. Insert > Go to Footnote (Cmd/Ctrl+Alt+J) opens the note at the cursor, jumps from a definition to its reference, or moves to the next reference; inside an open note the same shortcut moves on to the next footnote (`footnoteJump` in core). Not done: `marked`-level footnote rendering in a live Markdown preview (item 18 does not exist yet).
21. **Goals and progress.** A word target per sheet or group with a
    progress indicator in the status bar. Stored in the sidecar. (Moved up
    from "Later".)
22. ~~**Drag and drop to reorder (user).**~~ **Done.** (The drop indicator is a straight 3px accent bar inset from the card corners, on sheet cards and group rows; the drop-inside outline is unchanged.) Drag one or more selected sheets
    or groups within and between groups, with a drop indicator and
    auto-expand on hover. Uses `moveNodesUndoable`, so undo already works.
    Must refuse dropping a group into itself. The Move to… command stays as
    the keyboard route. Hit testing and multi-selection are the hard parts.

41. ~~**Hide Markdown markers (setting).**~~ **Done.** Preferences > Hide
    Markdown marks (off by default). When on, emphasis, strikethrough and
    highlight marks, heading hashes, quote `>`, inline-code backticks and
    link brackets and addresses are hidden except on lines the selection
    touches. The cursor steps over a hidden mark as one unit (atomic
    ranges). List bullets, task boxes, fences, tables, images, wiki links
    and footnotes stay visible. Not built: revealing per element rather
    than per line, hiding fence lines.
42. ~~**Folding sections.**~~ **Done.** A heading folds the text under it, up
    to the next heading of the same or a higher level (headings inside code
    fences do not count). A chevron hangs in the left margin of each
    foldable heading and shows only while the pointer is near it; a folded
    section shows a "…" pill that unfolds on click. Cmd/Ctrl+Alt+[ and ]
    fold and unfold the section at the cursor; a Fold menu has Fold All and
    Unfold All. Folds are remembered per sheet (by heading text, in local
    storage) and reopen on a jump from the outline or search. Not built:
    folding lists or code blocks, and fold state that follows a renamed
    heading.

52. ~~**Paste rich text as Markdown.**~~ **Done.** `htmlToMarkdown` in core (own tag reader, handles Word and Google Docs styles); `richPaste.ts` in the editor; Cmd/Ctrl+Shift+V pastes plain. Copying from a web page or a word
    processor pastes as Markdown (headings, emphasis, links, lists), with
    Paste as Plain Text as the escape. HTML-to-Markdown conversion in core,
    with tests; the editor's paste handler calls it.
53. ~~**More Markdown in the editor and export.**~~ **Done.** Strikethrough (`~~text~~`), `==highlight==` (Format > Highlight; `<mark>` in exports), syntax colours in fenced code (any language named after the opening fence, loaded on demand from `@codemirror/language-data`; editor only, exports stay uncoloured), and maths: `$inline$` and `$$block$$` are drawn as MathML by KaTeX (`math.ts` in core, `mathWidgets.ts` in the editor, a marked extension for HTML/PDF export), with the TeX shown while the cursor is in a formula. Prices such as "$5 and $10" are left as text. Not done: maths inside table cells and footnotes, a maths shortcut/menu entry, KaTeX macros, code colours in exports.
54. ~~**Library-wide replace.**~~ **Done.** Replace… in Find in Library: the snippets preview the change, Replace in this sheet, Replace All, one undo step (Undo Library Change). Unsaved edits are saved first rather than skipped. Find in Library gains a Replace field with a
    per-match preview, replace one, replace all, and one undo step for the
    whole replacement. Skips sheets with unsaved edits until they are saved.
55. **Writing session stats.** Words written today, a streak, and a daily
    target shown in the word-count pill; history kept in the app's own
    settings, not the library. Builds on goals (item 21).
56. **Writing aids.** Highlight repeated or overused words, a readability
    score in the stats, and the system dictionary lookup on right-click.
    Each is its own switch in Preferences.
57. **Import.** *Partly done:* File > Import… adds `.txt`, `.rtf` and
    Markdown files as sheets after the current one (several at once; the
    sheet title is the first line). Plain text is tidied (line endings,
    BOM, spacing; UTF-8, UTF-16 or Windows-1252). RTF is read by a small
    parser in core (`importText.ts`): paragraphs, bold, italic, bullet and
    numbered lists, hyperlinks, accents and Unicode; tables, pictures and
    headers are dropped, and Markdown characters in the text are escaped.
    Not yet checked in the app: the file dialog itself (it cannot be driven
    by the test harness). Still to do: an existing folder of Markdown as a
    project, dropping files onto the window, RTF headings (from style or
    size) and tables. **`.docx` is done**, see item 73.
58. **More export routes.** Copy a sheet as rich text or HTML, export a
    whole group as one Markdown file, and print. EPUB export is a bigger
    sibling of these and lives in "Later".

**Medium to hard**

23. **Images.** *Done* (insert, paste, drag and drop, thumbnails, alt text, toolbar button, shared `.assets/` storage, clean-up, export), apart from the accepted limits listed below. Wanted:
    - **Shown as a thumbnail, not full size (user).** An image is drawn
      inline in the editor as a small fixed-size square thumbnail (cropped to
      fill the square, the way Ulysses does), so a sheet's text stays
      readable. Later: clicking a thumbnail opens a preview of the image at
      full size, closed by a click or Escape (built). HTML and PDF export embed the
      image at a sensible size, not as a thumbnail.
    - **Storage: decided, Alternative B (user), after first building A.**
      Every picture lives in one hidden `.assets/` folder at the library
      root, under its own file name (numeric suffix on a clash), linked as
      `![name](.assets/name.png)`: the link is relative to the library, not
      the sheet, so moving, copying or merging sheets never touches
      pictures. The editor loads them through a `wa-asset://` address the
      main process serves from that folder only. HTML export embeds each as
      a data URI; image links do not count as words. A was tried first
      (pictures next to each sheet, copied along on every move) and dropped
      for its costs: orphans after deletes and moves, duplicates, move and
      undo logic that had to carry pictures, and image files in every
      project folder.
    - **Still to build for B, in this order, one commit each:**
      (1) **built:** identical pictures stored once; insert, paste and drop
      compare a SHA-256 of the picture with a stored index
      (`.assets/.index.json`: size, modified time and hash per file), so
      only new or changed files are ever read, and reuse the file already
      there; a missing or damaged index is rebuilt; (2) **built, with (3):** an index of which sheets
      link which pictures, kept in the sheet cache, so "which pictures does
      nothing use" is a lookup; checked in the background after load, shown
      as a quiet count ("3 unused images, 4.2 MB"); (3) **built:** Clean Up Unused
      Images… (File menu, command palette with the count), which lists the unused pictures and, only when the user says
      so, moves them to the system trash (never automatic; a link anywhere
      in a sheet, even in a code fence or comment, counts as use; merging
      existing duplicates is left out on purpose, as it edits sheets);
      (4) **built:** Save as Markdown… in the export dialog, which copies the pictures used into a folder beside
      the file and rewrites the links, so the picture links work outside
      the app. A library already holding same-folder pictures would need a
      one-off migration; not written, as none exists yet.
    - **Export size (user):** HTML export can keep the pictures inside the
      file or in a `<name>-images/` folder beside it, chosen in the export
      dialog. When embedding would make the page 50% or more bigger than it
      is without the pictures, the dialog says so and preselects the folder.
      PDF always embeds; Markdown export always uses the folder.
    - **Built (a):** Insert > Image… (`Cmd/Ctrl+Alt+I`) picks one or more
      files and puts a thumbnail at the cursor; the raw Markdown shows
      while the cursor is on it. A toolbar button (picture icon, after Link) runs the same command (built).
    - **Built (b):** pasting a picture (screenshot, copied image, a file
      copied in the file manager) saves it in `.assets/` and shows its
      thumbnail at the cursor.
    - **Built (c):** dropping picture files on the editor saves them in
      `.assets/` and puts the thumbnails where they were dropped. A picture
      dragged out of a web page that comes as an address only (no file) is
      inserted as a Markdown link to that address, `![alt](https://…)`; it
      shows as plain text in the editor, not a thumbnail, and HTML export
      leaves it as a link to the web.
    - **Insert** an image from a file picker, through a toolbar button, an
      Insert menu item and a keyboard shortcut.
    - **Paste** an image from the clipboard (screenshots, copied images).
    - **Drag and drop** image files, or images dragged from other apps and
      browsers, into the editor at the drop position.
    - Each becomes a Markdown image link, `![](name.png)`, copied
      into the library, rendered inline in the editor and embedded on
      HTML and PDF export. Unreadable or missing images show a placeholder
      rather than failing the sheet.
    - **Image gaps, for later (not built):**
      PDF export with pictures was run in Electron with the app's own
      settings (scripts off, hidden window) and the picture printed
      correctly; only the native save dialog was not clicked through; the native Insert menu item, file picker and export save
      dialog were tested only underneath, never clicked through; dropping a file outside the editor
      (the sidebar, say) is now guarded (the window ignores the drop and refuses
      to navigate to a dropped file) but a real drag was not tried: a synthetic
      drop did not navigate even without the guard; alt text is edited from the thumbnail (hover, click Alt; done), captions only in the Markdown; a
      missing picture now shows a dashed "missing" box with its file name (done); dragging pictures between sheets inside the app is not handled;
      web pictures (https links) show a "Load from host" box and fetch only when clicked, once per session (done; http links get none, and the preference to load automatically is not built); resizing, cropping
      or choosing the thumbnail crop; merging existing duplicates (left out
      on purpose, it edits sheets); a migration for same-folder pictures
      from the dropped design (none exists outside a test library); and the
      image behaviour belongs in the user guide.
    - **Stale unused count: fixed.** The count refreshes a moment after
      every save, so removing a link (or undoing an insert) updates it; the
      Clean Up dialog still recomputes when opened. Undoing an insert or
      paste still leaves the file in `.assets/`, where Clean Up finds it.
    - **Images: known limits, accepted (no plans to build now).** The
      core feature is finished; these stay as limits: native dialogs and
      the `Cmd/Ctrl+Alt+I` menu accelerator checked only underneath, never
      clicked through; dragging pictures between sheets inside the app is
      not handled; undoing an insert or paste leaves the file in `.assets/`
      for Clean Up to find; duplicate detection is exact, so a resized or
      re-saved copy is a different picture; no resizing, cropping or choice
      of thumbnail crop; captions only in the Markdown; no merging of
      existing duplicates (it edits sheets); no migration for same-folder
      pictures from the dropped design; `http:` (not https) pictures get no
      thumbnail and there is no setting to load web pictures automatically;
      a drop outside the editor was guarded but not tried with a real drag;
      the image behaviour still needs a section in the user guide.
    - Where images live was an open question; options below, with the
      choice made.
    - **Alternative A, next to each sheet: tried, then dropped** (in the folder or a
      `sheet.assets/` subfolder). Built first, then dropped. Pros: self-contained, images belong to
      one sheet and go with it, short links, works in other Markdown apps.
      Cons: moves, renames, merges and splits must move
      or rewrite images; the same image pasted twice is stored twice.
    - **Alternative B, shared assets folder: CHOSEN** (one hidden `.assets/` at
      the library root, or one per folder). Pros: the tree stays clean,
      moves never break links, easy to store a duplicate once, a common
      convention. Cons: images outlive their sheets, so unused images
      pile up; per-folder assets break when a sheet changes group.
    - **B plus a stash: not chosen** (the stash picker; the unused-picture
      clean-up above covers the leak) — unused images are a feature, not a leak. Insert
      opens a picker of every image in the library with "Add new…" first;
      paste and drop add to the stash and insert at once; the picker marks
      images no sheet uses and can delete them, warning when one is still
      linked. Keep original file names (a short suffix only on a
      collision) so the picker is browsable. Not chosen.
24. **Sheet notes.** A side note per sheet that is never exported, like
    Ulysses' notes. Stored in the sidecar or a companion file; decide which
    when starting.
25. **Trash bin (user).** Today deletes go to the operating-system trash.
    Decide between keeping that and an in-app Trash: a hidden `.trash`
    folder in the library, a Trash entry in the tree, Restore and Empty
    Trash, and undo that survives a restart. Needs a decision on sync
    behaviour and on how sidecar order is restored.
26. ~~**Keywords (tags) and filters.**~~ **Done (first version).** Keywords are
    kept per sheet in its folder's sidecar (`keywords`, by file name), so the
    Markdown stays clean. They follow a sheet through rename, move, duplicate,
    split (both halves) and merge (union), and undo restores them. Sheet >
    Keywords… (and the sheet context menu) edits the selected sheets: chips,
    suggestions from the library, partial keywords shown dashed. Cards show
    their keywords. The sheet filter understands `#keyword` (`#two_words` for a
    space, several allowed, plus plain text); a keyword filter searches the whole
    library, not only the open group, and a # button lists the library's
    keywords. Gaps and ideas:
    - Keywords live by file name: a sheet renamed or moved outside the app loses them.
    - No keyword rename or delete across the library, no keyword counts in the sidebar.
    - Search (Find in Library) and Quick Open do not match keywords yet.
    - A keyword-filtered list cannot be reordered by drag; no OR between keywords.
    - Not shown in the inspector (the tabbed inspector, L11, is still to do).
    - Export does not include keywords.
27. **Version history.** Look at a sheet as it was at a point in time, compare it
    with now, and restore it. The files are plain Markdown on disk, so the
    library stays readable without the app; history is extra, kept beside
    it. Design notes (how other apps do it, the options, what we lean to)
    are in "Version history: design notes" below. Do it after item 25
    (Trash), which shares the storage.

59. **Project and group notes (user).** A place to talk to your future self
    ("add more quotes about this"): a note attached to a project or group,
    never exported, instead of extra sheets that exist only as reminders.
    Opens from the group's header or the inspector (L11) next to the
    sheet notes of item 24, and shares its storage decision: a companion
    hidden file in the folder (`.notes.md`, plain Markdown, easy to sync)
    or a field in the sidecar. Leaning to the companion file, because
    notes can get long and the sidecar is read on every load. Needs:
    a note editor reusing the editor component, a marker on groups that
    have notes, and exclusion from export, search-and-replace and counts.

**Hard**

28. ~~**Table editor (user).**~~ **Done.** Render GFM tables in the editor as editable
    grids (CodeMirror block widget): edit cells, Tab to move, add/remove
    rows and columns, column alignment, write back clean Markdown. The
    cursor entering the table shows raw source. Widget focus, undo
    integration, round-tripping and IME are the risks.
29. ~~**Tabs and windows (user).**~~ **Done (first version).** Windows share
    one library (the main process keeps a single library root, watcher and
    undo stack), so a new window only needs its own selection and editor;
    File > New Window (Cmd/Ctrl+Alt+N) opens one, and right-clicking a sheet
    offers Open in New Window, which opens on that sheet. Tabs live in the
    renderer: each holds a sheet path, opening another sheet in the front
    tab replaces it, and the bar appears only with two or more. File > New
    Tab (Cmd/Ctrl+T), Close Tab (Cmd/Ctrl+W; the last tab closes the
    window), Close Window (Cmd/Ctrl+Shift+W), Window > Next/Previous Tab
    (Cmd/Ctrl+Alt+Right/Left), middle-click closes a tab, and Open in New
    Tab on a sheet's menu reuses a tab that already shows it. Opening a
    library from the menu switches every window. Two windows editing one
    sheet fall back on the save guard's disk check, so the second save
    raises the usual conflict dialog.
    Tabs drag to reorder (a bar marks the drop point), drag onto another
    window to move there, and drag off the window onto the desktop to
    become a window of their own at the drop point.
    Gaps: tabs are not remembered across launches; the drag gestures were
    tested with synthetic drag events, not a real mouse, and moving a tab
    between windows was not tested live at all; a tab keeps only the sheet, not its group, scroll or cursor
    (the group list follows the sheet); a sheet renamed or moved by another
    window drops its tab here instead of following it; Cmd+T copies the
    current sheet rather than opening a blank tab; no tab-stripe overflow
    menu (it scrolls); a tab dropped back on its own window's empty area does nothing;
    live checks not done on Windows or Linux; menu accelerators were not
    pressed by hand (driven through menu items and IPC).
30. ~~**Wiki-links `[[sheet]]` and backlinks.**~~ **Done (first version).**
    `[[Title]]` and `[[Title|shown text]]` link to a sheet by title
    (case and spacing ignored; the first match in library order wins;
    code fences and inline code are skipped). Drawn as one chip, dashed
    when no sheet has that title; typing `[[` completes from titles;
    Cmd/Ctrl-click opens the sheet, or creates it (titled as the link,
    beside the current sheet) when none exists. The outline panel has a
    "Linked from" list of sheets linking to the open one, kept current as
    you type (links are stored in the sheet cache, version 3).
    Left to do:
    - Rewrite links when a sheet's title changes. Titles follow the first
      line, so it would fire while typing; broken links show dashed
      instead. Needs a rename step that commits on blur or Enter.
    - `[[Title#Heading]]` links that jump to a heading, with completion
      of headings.
    - A snippet of the surrounding text for each entry in "Linked from".
    - Unlinked mentions: sheets that use the title without a link, with a
      one-click "link it".
    - Wiki links in export: they come out as plain text; they could
      become links between exported files or in-page anchors.
    - Duplicate titles: the first sheet in library order wins; the editor
      should say so and offer `[[Group/Title]]` to pick another.
    - Completion beyond titles: aliases, and links to sheets by path.
31. ~~**Sync conflict handling.**~~ **Done.** Core `diff.ts` has a line diff grouped into hunks, a word diff, and `conflictCopyOf`/`findConflictCopies` (Dropbox, Nextcloud and Syncthing names). A sidebar banner and File > Resolve Sync Conflicts… open a side-by-side diff window (`DiffView`): changed words are highlighted, long unchanged stretches fold, and each difference is set to one side. Saving writes the result to the sheet and moves the copy to the trash (undoable). The "changed outside the app" dialog for unsaved edits uses the same view and gained "Use my choices". Limits: two-way diff only (no common ancestor), so a difference is never merged automatically; iCloud's numbered copies ("note 2.md") are not recognised; the crash-recovery dialog still shows plain text.
32. **Global quick capture.** A system-wide hotkey that opens a small
    window and appends to an Inbox sheet. Depends on windows (item 29).
   Edited in place in the editor (Insert > Table, command palette): a table is drawn as an editable grid with a title caption, add/delete rows and columns, alignment and Tab/Enter navigation, and bold, italics, strikethrough and code show inside cells; the cursor entering it shows the raw Markdown. Writes clean aligned Markdown. Sheet previews show (Table) instead of the raw text. (It began as a dialog and was changed to in-place editing.)

**Added after comparing with Ulysses (round 3)**

Not yet scheduled; the user picks the order. Items 62 to 71 are features
Ulysses has and we do not; 72 to 81 are suggestions of our own.

62. **Smart filters.** Saved searches shown in the sidebar as virtual
    groups ("sheets with keyword X", "modified this week", "status Draft").
    Builds on keywords (26), status labels (63) and search.
63. **Sheet status labels.** A per-sheet mark (Draft, Revise, Final, or
    user-defined), shown on the card and usable as a filter. Stored in the
    sidecar.
64. **Annotations.** Inline notes anchored to a passage and shown in the
    margin. Different from `<!-- -->` comments (item 13), which are only
    dimmed text. Never exported.
65. **Text replacement and autocorrect.** User-defined shortcuts (`;;sig`
    expands to a signature) and common typo fixes, in Preferences.
66. **Grammar and style check.** Optional, off by default, through
    LanguageTool (local or remote, the user's choice). Needs a decision on
    privacy, since text would leave the machine with a remote server.
67. **Inbox.** A permanent catch-all group that new sheets can land in;
    pairs with global quick capture (32).
68. **Automatic library backups.** A rolling zip of the whole library on a
    schedule, kept in a folder of the user's choice, with a cap on how many
    are kept. Separate from per-sheet history (27); protects against a
    corrupted library.
69. ~~**Export styles.**~~ **Done.** The export dialog has a Style picker: Default, Book, Manuscript, Modern, Academic and Plain notes, all written for this app, plus the writer's own. A style is a CSS file laid over the base stylesheet (`exportStyles.ts` in core); it applies to the live preview, HTML and PDF. "Make my own…" copies a style into an editor (name, description, CSS, live preview); own styles are `.css` files in `export-styles/` in the app's data folder (name and description in a leading comment), listed under "Yours", editable, deletable, and shareable by copying the file. CSS is sanitised: no `@import`, no web `url()`, no way out of the style element. Ulysses' own styles were not copied: their site states no licence and authors keep their rights, so the built-ins are original. Not done: a Ulysses `.ulstyle` importer, per-style page size or margins, fonts beyond what the system has, title pages and a table of contents.
70. **Publishing.** WordPress, Ghost and Medium. Already under "Later".
71. **Dictionary and thesaurus lookup.** Part of item 56; listed here so it
    is not forgotten if 56 is split.

72. ~~**Load performance.**~~ **Done.** Loading reads sheets in parallel (32 at a time) and skips any file whose modified time and size match the cache (`loadLibrary`'s `cache` option; `groupWordCount` now uses the loaded word counts). The main process keeps the cache between loads and saves it per library in the app's data folder (`sheet-cache/`), so the next launch starts warm. On a synthetic 3,000-sheet, 23 MB library a load went from about 750 ms to about 130 ms. Cold first load, and loads on slow or synced disks, still read every file once.
73. ~~**Search upgrades.**~~ **Done.** Find in Library has Match case (`Aa`), Whole words (`ab`) and Regular expression (`.*`) toggles, remembered between openings, and a "Look in" choice (the selected group, or the whole library) that limits both results and Replace All. Regex mode matches `^` and `$` per line, rejects invalid patterns and ones that match empty text, and lets the replacement use `$1`, `$<name>`, `$&` and `$$`. Not built: ranking, a 50-sheet cap notice, a single-sheet scope (the editor's own find bar covers that).
74. **Sample library on first run.** A small "Welcome" project that teaches
    the shortcuts, offered instead of the bare empty state.
75. ~~**Crash and data-loss safety.**~~ **Done.** The editor journals its unsaved text to the app's data folder (`journal/`, one file per sheet) 250 ms after a keystroke and clears it once the file is written. At launch, any entry that differs from its file (a crash, a power cut or a save that kept failing) opens a dialog showing the recovered text beside the file's, with Restore or Keep the file as it is. Entries whose sheet is gone, or that match the file, are dropped silently; text journaled during the current run is never offered.
76. **Format menu check marks.** The menu does not show the style at the
    cursor yet (only the popover does).
77. **Print.** A Print command (File menu, Cmd/Ctrl+P conflicts with Quick
    Open, so pick another shortcut), sharing the PDF path. Overlaps item 58.
78. **Session timer or sprint mode.** A timed writing sprint with a word
    goal, feeding the stats of item 55.
79. **Localisation.** Move UI strings into a table so the app can be
    translated; cheaper to start early than to retrofit.
80. **Windows and Linux pass.** Run the app, export, watching and builds on
    both, and the release workflow once end to end (see "Still open").
81. ~~**Duplicate sheet, and cut / copy / paste of sheets.**~~ **Done**, with item 17.

Suggested first five (not decided): 17 / 81, 72, 75, 21 + 55, 26 + 62.

Open decisions for this list: where images
live (item 23, alternatives written out there), where sheet notes are stored (item 24) and in-app Trash
versus the system trash (item 25).

## Also built, for the user guide

Behaviour that was added along the way and has no backlog item of its own.
Kept here so the user-facing documentation can describe it later. See also
the items marked done above.

**Panes and sidebar**
- The sidebar is two panes that hide separately. Hide sidebar (button,
  View > Toggle Sidebar, Cmd/Ctrl+\) hides only the library (project and
  group) pane; a second button above the sheets (two diagonal arrows),
  View > Toggle Sheet List, hides the sheet list. Both states are
  remembered.
- With the library pane hidden, moving the pointer to the left edge slides
  it in as an overlay, and the sheet list slides right with it; it goes
  away when the pointer leaves or focus leaves it. Cmd/Ctrl+1 also shows
  it. The group title at the top of the sheet list lines up with the sheet
  titles.
- The library's name is a large bold title above its projects. Empty states
  read "No Sheet Selected" and "No Sheets". Sheet cards all have the same
  height, and an empty sheet shows "(No Content)". With a sort other than
  manual order active, dragging to reorder sheets is switched off.
- The autosave indicator at the top right of the editor shows a spinner
  while saving and a check when saved.

**Editor look**
- Headings are drawn larger while their `#` marks stay body-sized and hang
  in the left margin; the marks come back into the line while the cursor is
  among them (the editor must have focus). A `---` separator is a full-width
  rule with its dashes hung in the margin, shown on the line with the cursor.
- Comments (`<!-- -->`) are red and quotations blue; both colours can be set
  by a colour theme. The default light and dark themes are neutral grey.
- Text column widths include Compact and Wider, and Narrow is the default.
- Indent paragraphs (a Preferences switch) is a display and export style; see
  item 61.

**Tables** are edited in place; see item 28. Insert > Table adds one.

**Safety**
- Unsaved text is journaled and offered back after a crash (item 75).
- Loading is cached and parallel (item 72).
- If a sheet changed on disk while you had unsaved edits, the app asks which
  version to keep (item 49).

## Look and feel (modelled on Ulysses)

Requested after comparing the app with a Ulysses screenshot. Worked in this
order, one commit each, checked off as done. The aim: panes separated by
tone instead of lines, quiet line icons, little chrome in the editor.

**Round 1: styling and layout**

- L1. ~~**Tonal panes.**~~ **Done.** Sidebar lightest, sheet list a step darker, editor
  darkest, no 1px pane borders; the selected row is a rounded accent pill.
- L2. ~~**Floating word-count pill**~~ **Done.** in the editor's top-right corner instead
  of the bottom status bar; hover or click shows characters, reading time
  and the group total.
- L3. ~~**Editor typography and Markdown styling.**~~ **Done.** Line height about 1.85,
  slightly softer text contrast, fainter `**` and `#` markers, links drawn
  as rounded outlined chips, a `---` rule drawn as a dashed accent line.
- L4. ~~**Sheet list as cards.**~~ **Done.** Rounded, roomy cards with a 3 to 4 line
  preview; the accent bar for glued runs stays.
- L5. ~~**Per-pane header rows**~~ **Done.** in place of the full-width top bar: sidebar
  (new group, hide sidebar), sheet list (new sheet), editor (search, bold,
  italic, link, outline, export). Uniform line icons, wide spacing.

**Round 2: window and structure**

- L6. ~~**Hidden title bar and vibrancy.**~~ **Done.** `titleBarStyle: 'hiddenInset'` and
  a translucent sidebar on macOS, with the traffic lights inside the
  sidebar header; plain solid tones on Windows and Linux.
- L7. ~~**Sidebar structure.**~~ **Done.** Small muted section headers, an icon per kind
  of item (project, group), chevrons, and sheet-count badges.
- L8. ~~**Project colours.**~~ **Done.** A colour per project, kept in its sidecar and
  shown on its icon.
- L9. ~~**Back and forward**~~ **Done.** arrows that step through the sheets visited.
- L10. ~~**Filter field**~~ **Done.** in the sheet list that narrows it by text.

**Waiting on backlog items**

- L11. **Tabbed inspector** on the right (outline now; notes, goals and
  keywords once items 24, 26 and 21 exist).
- L12. **Trash entry** in the sidebar, with backlog item 25.

Skipped from the Ulysses window: promotional buttons, and its blue accent
(ours stays teal unless asked otherwise).

**UI consistency (one look on every OS)**

The aim is a Ulysses-inspired look that is the same on macOS, Windows and
Linux, with the main window (sidebar, sheet list, editor) as the reference.
It is not an attempt to look native. What stays with the OS: file open and
save panels, the window frame and the application menu bar, spellcheck, the
system dark/light setting, and the custom accent's colour picker (kept on
purpose: pickers are a system tool, and the native ones have eyedroppers and
saved colours). Everything drawn inside the window is the app's own.

- U1. ~~**Shared tokens and shell.**~~ **Done.** `main.css` holds the radii, popover
  shadow, scrim, layering (`--z-peek` 30, `--z-dialog` 40, `--z-modal` 60),
  `--on-accent` and `--danger`, plus shared `.dlg`, `.btn` and `.input`
  styles. Every dialog uses one shell; palettes sit near the top, alerts
  (conflict, recovery) are centred. Buttons are borderless with a light tint,
  the accent only marks the main action, inputs match the sheet filter.
- U2. ~~**Pills and chips.**~~ **Done.** Keyword chips, the Find option toggles and the
  word-count pill share one look (tinted, no outline).
- U3. ~~**Type scale and focus.**~~ **Done.** Sizes are 11, 12, 13 and 15 px (larger
  ones only for headings and empty states). Keyboard focus draws an accent
  ring on buttons and selects; containers that take focus only for key
  handling (`tabindex="-1"`) draw none. Section labels are sentence case.
- U4. ~~**Controls drawn in the app.**~~ **Done.** `Select.svelte` replaces the browser's
  dropdown (keyboard driven, grouped options, flips above when short of
  room); checkboxes and scrollbars are drawn in CSS; right-click menus are
  one `ContextMenu.svelte` fed by `contextMenu.ts` (sheet, group and library
  menus, and the text menu with spelling suggestions). The main process only
  reports the right-click's position and spelling data (`context:edit`) and
  runs the edit commands, reveal and copy path. Keys are caught on the window
  while a menu is open, so the editor keeps its selection.
- U5. ~~**Bundled UI font.**~~ **Done.** Inter (SIL OFL; latin and latin-ext, about 130 KB
  in `assets/fonts`) replaces the per-OS system font. The editor fonts are
  the writer's own choice and are unchanged.
- Gaps, to do when needed:
  - The text context menu's main-process path (a real right-click on editor
    text, then Cut/Copy/Paste through `webContents`) was not clicked through;
    only the in-window half was checked.
  - Windows and Linux have not been looked at: Inter metrics, the solid
    (non-vibrant) sidebar, window-control spacing, scrollbars.
  - Dark mode was checked on the dialogs only, not every surface.
  - Inactive-window state (greyed selection and toolbar when the window is
    not frontmost) and a soft focus halo on fields are not done.
  - Escape and Return behaviour (Return = main button) was not checked in
    every dialog.
  - Row padding in the palettes (7 x 10) still differs from the menus
    (5 x 9); the dialogs' `h2` sizes follow the shared 15 px but the older
    scoped rules are not all removed.
  - Lint reports 5 errors (a `Map` in `KeywordsDialog.svelte`, a regex escape
    in `wikiLinks.ts`, missing return types in two tests, a needless mustache);
    none were introduced by this work except possibly the first.

## Version history: design notes

The worry: a writer wants to see their work as it was last Tuesday, or
before a bad merge or a rewrite, and bring it back. Today there is only
the one-step undo of library operations and the operating-system trash.

**How other apps do it**

- **Ulysses** keeps automatic backups (a snapshot of the whole library
  at intervals) and, per sheet, "Versions": it saves a version when a
  sheet is closed or after a pause, shows a list by date, lets you
  compare against the current text, and restore or copy out of one.
- **Scrivener** takes manual snapshots of a document (with a title and
  note), compares them with the current text as a diff, and rolls back.
  It also makes zipped project backups on close. Snapshots are explicit,
  not automatic.
- **Apple apps (Pages, Notes, TextEdit)** use the system's Versions:
  automatic saves, a browser that shows the document through time, and
  restore. iCloud Notes keeps recently deleted notes for 30 days.
- **Google Docs and Notion** keep a continuous revision history grouped
  by time and author, named versions, and per-change highlighting.
- **Bear and Obsidian** keep little history by default; Obsidian has a
  File Recovery core plugin that snapshots a note every few minutes and
  keeps them for a while. Many people also put the folder in git.
- **Plain files with git, Time Machine or Dropbox history** is what
  Markdown-folder users fall back on; none of it is aware of sheets.

What they share: history is automatic (nobody remembers to press save), is
browsed as a list by time, can be compared with the current text, and
restoring is itself undoable. Manual, named snapshots are an addition for
milestones ("first draft").

**What a writer needs from it**

1. Safety net, no effort: it should just be there after a bad edit.
2. Browse by time ("yesterday evening") and see a preview.
3. Compare with the current text (what changed), then restore all of it,
   or copy out one passage.
4. Restoring never loses the current text: it is saved as a version first.
5. Deleted sheets, merged sheets and split sheets are covered too.
6. Named snapshots of a sheet, a group or a whole project, for milestones.
7. Does not bloat the library, does not sync as clutter, never leaks into
   export, search, word counts or the sheet list.

**Storage options**

- **A. Files in a hidden folder in the library** (`.history/` at the
  library root, one folder per sheet, timestamped `.md` files).
  Pros: plain files, no database, easy to inspect, copy and back up,
  moves with the library, no new dependency. Cons: lots of small files
  (some sync services handle that badly), and a moved or renamed sheet
  needs its history carried along (key history by a stable sheet ID kept
  in the sidecar, not by path).
- **B. One history store file per library** (SQLite or an append-only
  log in `.history/`). Pros: compact, quick to search and prune, can
  store diffs. Cons: a binary file that sync tools can corrupt or
  conflict on, needs a dependency, opaque to the user.
- **C. Git underneath.** Pros: proven, diffs and branches for free.
  Cons: heavy, confusing for writers, conflicts with users who already
  keep the library in git, and does not map onto sheets.
- **D. Rely on the system** (trash, Time Machine). Pros: nothing to build.
  Cons: not browsable per sheet, not on every platform, no compare.

**Leaning to A**, with whole-text copies at first (writing is small text;
a million-word library is a few megabytes, and compression is trivial) and
pruning to keep it small: every save point in the last hour, one per hour
for the last day, one per day for the last month, then one per week;
named snapshots are never pruned. Delta storage (B) stays possible
later because the versions are only read through one module in core.

**When a version is taken**

- On a pause in typing of a few minutes, and on closing or leaving a sheet
  (not on every autosave, which is every 800 ms).
- Before any destructive library operation: merge, split, delete, move
  to Trash, replace in library, restore, and an external change that
  overwrites unsaved edits (item 49).
- Before restoring a version (so restoring is undoable).
- On request: "Save a snapshot…" with a name, from the sheet, group and
  project menus.
- Skip it when the text has not changed since the last version.

**The interface**

- A **History** view for the open sheet, from the editor's menu or the
  inspector tab (L11): a list by time with day groupings, "named" ones
  marked, and a read-only preview of the chosen version in the editor
  area.
- **Compare**: show additions and deletions against the current text
  inline (word-level diff, since this is prose), with Restore and
  "Restore selected passage".
- **Restore** replaces the sheet's text after taking a version of the
  current text; a notice offers Undo.
- Deleted and merged sheets appear in the Trash (item 25) with their
  history, so a sheet can come back with its past.
- Group and project level: "Browse snapshots" lists named snapshots, and
  restoring one restores the sheets in it, again saving the present first.
- Settings (Preferences, item 37): keep history on or off, how long,
  and a size cap; "Clear history" for a sheet or the library.

**Core pieces** (in `packages/core`, behind the `FileSystem` interface, so
tested with the in-memory one)

- A stable sheet ID in the sidecar, assigned on first need.
- `recordVersion`, `listVersions`, `readVersion`, `restoreVersion`,
  `pruneVersions`, each pure over the file system.
- A word-level diff function for the compare view.
- Pruning rules as a tested pure function of the version times.

**Open questions**

- Whole-text copies or deltas; start with copies unless sizes surprise us.
- Whether history syncs (it is inside the library) or is excluded; the
  usual advice for iCloud and Dropbox is to let it sync so history
  follows the user between machines, but conflicts must not corrupt it,
  which favours one file per version (option A).
- Whether the app also keeps a rolling whole-library backup (zip on a
  schedule), as Ulysses and Scrivener do. Probably yes as a separate,
  simple item: it protects against everything the per-sheet history does
  not, such as a corrupted library.
- Interaction with item 49 (external changes): a conflict should create
  a version of the other copy rather than discard it.

## Still open

- **Live checks still owed.** `docs/UAT.md` holds the manual test scripts for wiki links, hidden marks, folding, import, code colours and maths, and drop lines. Not yet seen working in the running app: the import file dialog, fold shortcuts and the Fold menu, unfolding through outline or search, focus mode with folds, duplicate wiki-link titles, PDF export of maths, a real mouse drag showing the straight drop bars, and anything on Windows or Linux.
- **Small gaps from recent features, none urgent:** maths in table cells and footnotes is not drawn, with no maths menu entry or KaTeX macros; exports leave fenced code uncoloured; folding does not cover lists or code blocks; a renamed heading loses its remembered fold. Wiki-link leftovers are listed under item 30 and import gaps under item 57.
- **Export styles: gaps and future tweaks (item 69).**
  - *Unverified:* saving HTML and PDF in a chosen style was not run live (the preview was); the user-style overwrite and delete paths, dark mode of the style editor, and Windows and Linux are unchecked. Built-ins name Palatino, Courier New and Times, which Linux may not have, so they fall back to another serif or mono face.
  - *Sanitiser is a filter, not a CSS parser.* It strips `@import`, `url()` to `http(s)` or `//`, and `</style`. CSS escapes (`u\72l(`), `image-set()` and `@font-face` sources could slip a web fetch past it. A real parser, or a Content-Security-Policy `<meta>` in the export that blocks remote loads, would close it. Exported HTML itself carries no such guard once opened elsewhere.
  - *Page setup is not part of a style.* Page size, margins and page numbers stay in the dialog; `@page` rules in a style are ignored by the PDF path. A style could carry its own defaults (Manuscript: Letter, 1 in).
  - *Editor:* plain textarea with no highlighting, no CSS error messages, no reset-to-original, no undo beyond the textarea's own. Built-ins cannot be edited in place (they are copied), and a renamed style keeps its old file name.
  - *Sharing:* styles are shared by copying a `.css` file; there is no import button, no style pack, and no Ulysses `.ulstyle` importer (that would parse user-supplied files only; the Ulysses catalogue is not licensed for copying, see item 69).
  - *Scope:* one style per export; no per-sheet or per-group override, no remembered style per library, and the choice is stored in the browser's local storage, not in settings. Markdown export and the editor's own look do not use styles.
  - *Content features a style cannot add:* title page, table of contents, running headers and footers, chapter numbering, drop caps and first-line small caps, widow and orphan control beyond the print basics, per-style horizontal-rule ornaments for the "break" between sheets beyond a character.
  - *Formats:* no ePub or DOCX, which Ulysses styles also target; both would reuse the style CSS (ePub) or need a mapping (DOCX).
  - *UI polish:* the export dialog header clips the title on narrow windows; style descriptions are cut off with an ellipsis; Book, Manuscript and Academic force a light page, so a dark-mode saved HTML does not follow the system, while Default, Modern and Plain notes do.

- Get signing certificates (Apple Developer ID, a Windows code-signing
  certificate) and run the release workflow once end to end.
- Try export, watching and builds on Windows and Linux, and look at the UI there (see the gaps under "UI consistency").
- Whether "Join" is different from merge.
- Undo that survives a restart.

73. **Word (.docx) import and export.** **Done**, hand-written so core stays
    platform-free (`fflate` for the zip, a small XML reader in `xml.ts`).
    *Import* (`docxImport.ts`, File > Import…): headings (by style, outline
    level or Title), bold, italic, strikethrough, highlight (`==`), code
    (monospace fonts or code styles), links, bulleted and numbered lists with
    nesting, quotes, tables, footnotes and endnotes (as `[^n]`), and pictures
    (stored in the library's assets folder). Tracked changes are accepted
    (insertions kept, deletions dropped). One file is one sheet. *Export*
    (`docxExport.ts`, Export dialog > Save as Word…): real Heading styles,
    lists, quotes, code, tables, footnotes, links, pictures embedded (PNG,
    JPEG, GIF), horizontal rules, task boxes; page size, margins and page
    numbers follow the PDF controls. Gaps: legacy `.doc` is not read;
    comments, text boxes, equations (OMML) and cell merges are dropped on
    import; maths exports as its TeX source in italics; export styles (the
    CSS) do not apply to Word; SVG/WebP pictures export as their alt text;
    not yet opened in Word itself (checked with macOS `textutil` and a
    round trip through our own reader, which agree), and `textutil` shows
    numbered lists as bullets, which looks like its own limitation.

74. **Subgroup sections in the sheet list.** **Done.** Selecting a group lists
    its own sheets, then the sheets of every group inside it, each run under
    a heading with the group's name (nested groups read `Parent › Child`),
    as Ulysses does. Sorting applies within each section; the filter applies
    across them; arrow keys and range selection walk the whole list. Sheets
    can be put in a new order by dragging within their own section (a
    selection spanning sections can still be dragged to another group), and
    New Sheet adds to the selected group. Selecting the library root lists
    every sheet in it, which is slow for very large libraries (no
    virtualised list yet). No setting turns this off.
75. **Selecting a group opens its first sheet.** **Done.** Choosing a group
    or project in the sidebar selects the first sheet of its list and opens it
    in the editor (without moving focus out of the sidebar), so "no sheet
    selected" shows only for groups with no sheets.

76. **One Find bar.** **Done.** The magnifier in the toolbar (and Cmd/Ctrl+F,
    Cmd/Ctrl+Alt+F in the editor, Cmd/Ctrl+Shift+F) opens a bar above the
    editor that replaces both the old Find in Library dialog and the editor's
    own search panel. A "Look in" menu picks the sheet, the selected group, its
    project or the whole library. The box shows "x of y" and back and forward
    arrows (Enter and Shift+Enter, Cmd/Ctrl+G in the editor); the current match
    is selected in the editor and all matches are marked, moving on into the
    next sheet when the scope has several. The chevron adds a Replace box with
    Replace (this match) and Replace All. In a sheet both are ordinary editor
    edits, so Cmd/Ctrl+Z undoes them; in a group, project or library Replace
    All is one Undo Library Change step. Selected text becomes the query.
    Case, whole-word and regex toggles are kept. Limits: the scope is fixed
    when chosen, not followed as the sidebar selection changes; marks use
    CodeMirror's matcher, so whole-word and regex edge cases can differ slightly
    from the counts (which use core `findMatches`); a library search stops at
    2,000 sheets.
77. **Automatic table of contents.** **Done.** A line holding only `(cnt)`
    (Ulysses writes it the same way) is a table of contents. Insert > Table of
    Contents (also in the command palette) puts one at the cursor. In the
    editor it shows as a "Table of Contents" chip until the cursor is on the
    line. On export it lists the headings that come after it, across every
    exported sheet. HTML: a nested list linked to anchors on the headings.
    Markdown: the same list, each entry linking to its heading with GitHub-style anchors (accents kept, repeats numbered -1, -2), which most viewers follow but some differ on for odd punctuation. PDF: the list gets dotted leaders and
    page numbers; the PDF is printed twice, the first time with the PDF outline
    switched on so each heading's page can be read (pdf-lib), then again with the
    numbers in. Word: `(cnt)` becomes a real TOC field over the headings that
    follow; Word fills in page numbers when the file is opened and asks to update
    fields. Limits: Word's page numbers are untested in Word itself (no copy here);
    other apps show the stored list without numbers; only headings after the
    marker are listed; setext (underlined) headings get no link or page number;
    no menu shortcut; HTML has no page numbers (it has no pages).

78. **Hidden shortcuts now listed.** **Done.** The keys that used to have no
    menu item are in the menus and the command palette, with their shortcut
    shown: Format > Toggle Task (Cmd/Ctrl+Enter), Fold > Go to Previous and
    Next Heading (Cmd/Ctrl+Alt+Up and Down), File > Find and Replace…
    (Cmd/Ctrl+Alt+F, opens the Find bar on the open sheet with Replace showing),
    and palette entries for Copy, Cut and Paste Sheets and Duplicate (Cmd/Ctrl+C,
    X, V, D in the list and tree). The editor-only keys use the display-only
    `shown()` helper on macOS so the editor keeps them; Copy, Cut, Paste and
    Duplicate have no native menu items, since the text roles own those keys.

79. **Undo for creating and renaming.** **Done.** New Sheet, New Group, New
    Project and renaming a group or project go on the same Undo Library Change
    stack as moves and deletes (File > Undo Library Change, Cmd/Ctrl+Alt+Z).
    Undoing a new sheet puts the group's order back and moves the file to the
    trash, but only while it is still empty: once text is in it the undo
    refuses with a message instead of discarding the writing. Undoing a new
    group removes it. Undoing a rename restores the old name and position.
    Sheet files are renamed automatically to follow their titles; those
    renames are deliberately not undoable steps, or every title edit would
    bury the last real undo.

80. **EPUB export.** **Done.** Export dialog > Format > EPUB writes an EPUB 3
    book from the selected sheets and groups (`epub.ts` in core, zip by
    `fflate`). Each sheet is a chapter file (glued sheets share one); the
    navigation document and the older NCX contents are built from the headings
    down to level 3, with a sheet that has none listed by its title. The dialog
    asks for title, author (remembered), language and an optional cover
    picture. The chosen export style's CSS and the paragraph-indent setting
    apply. Library pictures are packed into the book; maths is kept as MathML;
    a `(cnt)` line is dropped, since the book has its own contents. Checked
    here: every part is well-formed XML (core tests, and `xmllint` on a real
    export), the mimetype entry is first and stored. Not checked: epubcheck
    (not installed) and real readers (Apple Books, Kobo, Kindle via Send to
    Kindle), so run epubcheck and open one export in a reader before relying
    on it. Gaps: no inline contents page, no per-chapter titles beyond the
    headings, WebP pictures are included though some older readers cannot show
    them, no fonts embedded.

81. **Export extras: title page, chapter numbers, running title, page size.**
    **Done.** In the Export dialog, a row under the options (PDF, HTML, EPUB)
    has: *Number chapters* (each top-level heading gets "1.", "2." through
    CSS counters; HTML, PDF and EPUB), *Title page* (HTML and PDF: a page of
    its own with a title, defaulting to the export's name, and an author;
    kept out of the contents and the chapter count), and, for PDF, *Title in the
    top margin* (the document title on every page). A style may now set the
    PDF's page with `@page { size: 6in 9in; margin: … }`: when it sets `size`,
    the PDF follows it instead of the dialog's page size and margins. The
    preview shows the title page and numbering. Not done: Word gets none of
    these; EPUB has its cover instead of a title page; the running title is the
    export's name, not the title-page text; no left/right or chapter-name
    headers; styles are still CSS only, so these extras are dialog choices that
    are not saved inside a style.

82. **Stability pass.** **Done** (five commits, each live-checked except as noted).
    *Find*: a regular expression that repeats a repeat, like `(a+)+$`, is
    refused with a message, because it could run for minutes and the app cannot
    interrupt it (this guard is static, so some slow patterns, such as
    `(a|aa)+$` or long chains of `.*`, are still allowed). *Recovery*: text
    saved by the journal for a sheet that was since deleted, renamed or moved
    is now offered back ("Restore as a sheet", never overwriting, falling
    back to the library's top level if the folder is gone) instead of being
    thrown away. *Closing*: a window waits for its text to be saved before it
    closes (up to four seconds), quitting carries on across several windows,
    and a flush writes the journal at once, so a failed save loses nothing.
    *Files*: a sheet that cannot be read, or is over 50 MB, no longer stops the
    library loading (it is listed by file name), Find and Replace All skip it,
    and opening a file over 50 MB gives an error. *PDF*: printing is stopped
    after two minutes with a message; a failed first pass now only costs the
    page numbers in the contents. Not checked live: the PDF timeout itself
    (unit-tested only) and closing with the disk failing.

## Later, in rough order

- Export styles: running headers and footers beyond the title and page number, chapter numbering in Word, a title page in Word and EPUB, page setup stored per style as a setting (see item 81 for what exists).
- iPad and iPhone apps: a Capacitor shell over the same core and UI, with
  its own filesystem implementation and iCloud folder access.
- Publishing to WordPress and Ghost.

## Open questions

- **"Join".** Confirm whether this means something different from merge.
- **Images.** Where attached images live on disk: next to the sheet, or
  in a shared assets folder with a browsable stash (see item 23, which
  lists both). Parked.
- **Name.** "WritingApp" is a placeholder; the sidecar filename depends on it.
