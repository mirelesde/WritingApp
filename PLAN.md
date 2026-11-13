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
| Editor style | Markdown markers stay visible but dimmed | Avoids the hide/reveal cursor problems of live-preview editors |
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
  a snippet. Plain substring only; no ranking, regex or word matching.
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
  "a (conflicted copy).md") shows up as an ordinary extra sheet; there is no
  merge tool. A moved or renamed file outside the app drops it from the
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
36. **Jump between headings.** Cmd/Ctrl+Alt+Up and Down move the cursor to
    the previous or next heading; the outline marks the current section.
   Audited and covered by tests; the default keymap already provides each of these, so no code changes were needed. Cmd/Ctrl+Alt+Up/Down (multiple cursors there) are taken over by item 36.

43. **Reveal and open externally.** Reveal in Finder or Explorer, copy the
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

37. **Preferences window.** A real settings window, opened with
    Cmd/Ctrl+, so settings stop being menu-only. Holds the existing theme,
    font and size, plus the writing comfort options (item 38), smart
    quotes (item 39) and hide markers (item 41) as they arrive.
38. **Writing comfort settings.** All stored with the view settings:
    - Text column width: narrow, medium, wide, or full window.
    - Line spacing and paragraph spacing, as separate controls.
    - Caret: highlight the current line (off, subtle), caret width.
    - Focus mode scope: dim all but the current line, sentence or
      paragraph, and how strongly.
    - Typewriter position: centre, or upper third.
    - Scroll past the end of the text, on or off.
    - Distraction-free mode: hides both side panes and the header rows,
      which return when the pointer reaches the top or left edge.
    - Text alignment (left, justified) and an optional first-line indent
      for prose.
39. **Smart quotes and dashes.** Optional: straight quotes become curly,
    `--` becomes an en or em dash, `...` becomes an ellipsis. A setting,
    off by default; never applied inside code or comments. Needs the
    Preferences window (item 37).
40. **Format menu and style popover.** Keep the editor header uncluttered:
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

44. **Toggle line numbers (user).** A preference (item 37) that shows a
    line-number gutter in the editor. Off by default; remembered with the
    view settings; applies to every sheet of a glued run.
45. **Command palette.** Cmd/Ctrl+Shift+P opens a fuzzy list of every
    menu command and setting by name, with its shortcut. Reuses the quick
    open dialog; commands come from one registry shared with the menus.
46. **Clickable task lists.** `- [ ]` and `- [x]` draw as checkboxes in the
    editor; clicking one toggles the marker in the text. Cmd/Ctrl+Enter
    toggles the item at the cursor.
47. **Sheet list sorting and dates.** Sort a group's sheets by manual order
    (default), title, modified date, created date or word count; the card
    can show the date. Manual order stays in the sidecar, so sorting only
    changes the view until the user reorders.
48. **Sheet templates and daily note.** New Sheet from Template, with
    templates kept as sheets in a hidden `.templates` group, and a Daily
    Note command that opens or creates today's sheet in a chosen group.
49. **External change handling.** When a sheet changes on disk while it is
    open: reload it silently if it has no unsaved edits, otherwise ask
    whether to keep the editor's version or take the disk's, and show
    both. Check first what the watcher and autosaver do today.
50. **Custom themes and accent colour.** An accent colour picker, and user
    theme files (a small JSON of the colour tokens) dropped in a themes
    folder and listed in Preferences.
51. **Accessibility pass.** VoiceOver and screen-reader labels on every
    control and pane, a high-contrast option, honouring reduced motion,
    and full keyboard-only use of every dialog and menu.

**Medium**

16. **Rename sheet and group.** Sheets take their name from the first line,
    so renaming a sheet means moving focus to that line (and the file
    renames itself on save); groups rename the folder and keep the sidecar.
    Needs a rename operation with undo. Comes before item 17 so the context
    menu can offer it.
17. **Right-click menus (user).** On a sheet, a group and the library root:
    new sheet/group, rename, move to…, duplicate, cut / copy / paste,
    delete. A native menu from the main process, reusing the existing
    `op:*` handlers. Cut/copy/paste and duplicate need a node clipboard and
    a copy operation in core (new, with undo).
18. **Markdown preview.** Toggle or side-by-side live preview, reusing the
    HTML export renderer in the sandboxed iframe. Scroll sync is optional.
19. **Favorites (pinned sheets).** A pinned section at the top of the
    library; stored in the root sidecar so it travels with the folder.
20. **Footnotes.** `[^1]` syntax rendered in export and preview, with
    editor highlighting and jump between reference and definition. Needs a
    `marked` footnote extension.
21. **Goals and progress.** A word target per sheet or group with a
    progress indicator in the status bar. Stored in the sidecar. (Moved up
    from "Later".)
22. **Drag and drop to reorder (user).** Drag one or more selected sheets
    or groups within and between groups, with a drop indicator and
    auto-expand on hover. Uses `moveNodesUndoable`, so undo already works.
    Must refuse dropping a group into itself. The Move to… command stays as
    the keyboard route. Hit testing and multi-selection are the hard parts.

41. **Hide Markdown markers (setting).** Off by default: the editor keeps
    showing markers, dimmed, as Ulysses does. When on, `**`, `#`, link
    addresses and similar markers are hidden except on the line or
    selection that holds the cursor. Risks are cursor movement across
    hidden ranges and selection that includes hidden text. Needs the
    Preferences window (item 37).
42. **Folding sections.** Collapse the text under a heading from a gutter
    arrow or Cmd/Ctrl+Alt+[ and ]; fold all and unfold all. Fold state is
    remembered per sheet. The outline and quick jump (item 36) keep
    working on folded text.

52. **Paste rich text as Markdown.** Copying from a web page or a word
    processor pastes as Markdown (headings, emphasis, links, lists), with
    Paste as Plain Text as the escape. HTML-to-Markdown conversion in core,
    with tests; the editor's paste handler calls it.
53. **More Markdown in the editor and export.** Strikethrough, `==highlight==`,
    syntax colours in fenced code, and maths (`$...$`), rendered in the
    editor styling and in HTML and PDF export. Maths needs a renderer
    (KaTeX) bundled for export.
54. **Library-wide replace.** Find in Library gains a Replace field with a
    per-match preview, replace one, replace all, and one undo step for the
    whole replacement. Skips sheets with unsaved edits until they are saved.
55. **Writing session stats.** Words written today, a streak, and a daily
    target shown in the word-count pill; history kept in the app's own
    settings, not the library. Builds on goals (item 21).
56. **Writing aids.** Highlight repeated or overused words, a readability
    score in the stats, and the system dictionary lookup on right-click.
    Each is its own switch in Preferences.
57. **Import.** Bring `.txt`, `.rtf` and `.docx` files in as sheets, or an
    existing folder of Markdown as a project, by menu or by dropping files
    onto the window. `.docx` needs a converter library.
58. **More export routes.** Copy a sheet as rich text or HTML, export a
    whole group as one Markdown file, and print. EPUB export is a bigger
    sibling of these and lives in "Later".

**Medium to hard**

23. **Images.** Not supported yet. Wanted:
    - **Insert** an image from a file picker, through a toolbar button, an
      Insert menu item and a keyboard shortcut.
    - **Paste** an image from the clipboard (screenshots, copied images).
    - **Drag and drop** image files, or images dragged from other apps and
      browsers, into the editor at the drop position.
    - Each becomes a Markdown image link, `![](assets/name.png)`, copied
      into the library, rendered inline in the editor and embedded on
      HTML and PDF export. Unreadable or missing images show a placeholder
      rather than failing the sheet.
    - Blocked on the open question of where images live on disk; moves,
      renames and deletes of sheets must keep their images with them.
    - **Alternative A, next to each sheet** (in the folder or a
      `sheet.assets/` subfolder). Pros: self-contained, images belong to
      one sheet and go with it, short links, works in other Markdown apps.
      Cons: clutters the tree; moves, renames, merges and splits must move
      or rewrite images; the same image pasted twice is stored twice.
    - **Alternative B, shared assets folder** (one hidden `.assets/` at
      the library root, or one per folder). Pros: the tree stays clean,
      moves never break links, easy to store a duplicate once, a common
      convention. Cons: images outlive their sheets, so unused images
      pile up; per-folder assets break when a sheet changes group.
    - **B plus a stash:** unused images are a feature, not a leak. Insert
      opens a picker of every image in the library with "Add new…" first;
      paste and drop add to the stash and insert at once; the picker marks
      images no sheet uses and can delete them, warning when one is still
      linked. Keep original file names (a short suffix only on a
      collision) so the picker is browsable. Leaning towards this, not
      decided. Parked until the user picks it up again.
24. **Sheet notes.** A side note per sheet that is never exported, like
    Ulysses' notes. Stored in the sidecar or a companion file; decide which
    when starting.
25. **Trash bin (user).** Today deletes go to the operating-system trash.
    Decide between keeping that and an in-app Trash: a hidden `.trash`
    folder in the library, a Trash entry in the tree, Restore and Empty
    Trash, and undo that survives a restart. Needs a decision on sync
    behaviour and on how sidecar order is restored.
26. **Keywords (tags) and filters.** Tags per sheet in the sidecar, a
    filter by tag in the library pane, and tag search. (Moved up from
    "Later".)
27. **Snapshots / version history.** Automatic copies of a sheet before big
    edits, merges and deletes, with a browse-and-restore list. Overlaps the
    trash design, so do it after item 25 and share the storage.

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

28. **Table editor (user).** Render GFM tables in the editor as editable
    grids (CodeMirror block widget): edit cells, Tab to move, add/remove
    rows and columns, column alignment, write back clean Markdown. The
    cursor entering the table shows raw source. Widget focus, undo
    integration, round-tripping and IME are the risks.
29. **Tabs and windows (user).** Several sheets open at once as tabs, plus
    extra windows on the same library. Needs per-tab editor state and
    unsaved edits, save and reload rules when two views show the same
    sheet, a window-aware main process (watcher, undo stack and library
    root are currently one per app), and menu commands routed to the
    focused window. Touches almost every layer.
30. **Wiki-links `[[sheet]]` and backlinks.** Links by sheet title,
    autocomplete, a backlinks panel, rewriting links on rename (so after
    item 16). Worth doing only if notes-style use is wanted.
31. **Sync conflict handling.** Detect conflict copies from iCloud or
    Dropbox (`name (conflicted copy).md`) and offer a side-by-side merge.
    Needs a diff view.
32. **Global quick capture.** A system-wide hotkey that opens a small
    window and appends to an Inbox sheet. Depends on windows (item 29).

Open decisions for this list: where images
live (item 23, alternatives written out there), where sheet notes are stored (item 24) and in-app Trash
versus the system trash (item 25).

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

## Still open

- Get signing certificates (Apple Developer ID, a Windows code-signing
  certificate) and run the release workflow once end to end.
- Try export, watching and builds on Windows and Linux.
- Whether "Join" is different from merge.
- Undo for creating and renaming; undo that survives a restart.

## Later, in rough order

- **DOCX export.** Deferred: it needs a dedicated library (or hand-written
  Office XML), and neither is worth taking on before HTML and PDF are solid.
- Export styles: user-selectable and user-editable stylesheets.
- iPad and iPhone apps: a Capacitor shell over the same core and UI, with
  its own filesystem implementation and iCloud folder access.
- **EPUB export.** Another export target next to HTML and PDF: one book
  from a group, sheets as chapters, headings as the table of contents,
  title and author from a small dialog. An EPUB is a zip of XHTML, so the
  HTML export can be reused; needs a zip writer, a cover option, and a
  validity check (epubcheck) before release.
- Publishing to WordPress and Ghost.

## Open questions

- **"Join".** Confirm whether this means something different from merge.
- **Images.** Where attached images live on disk: next to the sheet, or
  in a shared assets folder with a browsable stash (see item 23, which
  lists both). Parked.
- **Name.** "WritingApp" is a placeholder; the sidecar filename depends on it.
