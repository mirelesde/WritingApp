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

1. ~~**Organisation**~~ **Done.** — project > group > sheets, manually ordered.
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

1. **More side margins in the editor (user).** CSS only: wider horizontal
   padding and a centred, max-width text column.
2. **Spell check.** Turn on Electron's built-in checker and add suggestions
   to the editor's context menu. Language follows the system.
3. **Word and character count, reading time.** A status bar showing the
   open sheet, the selection, and the group total. Computed from text core
   already has.
4. **Smart list continuation.** Enter continues a bullet or number, Tab
   indents, Enter on an empty item ends the list. CodeMirror's Markdown
   commands cover most of it; mostly configuration.
5. **Auto-close emphasis markers (user).** Typing `*` or `**` inserts the
   closing marker and leaves the cursor between. With a selection it wraps
   the selection; typing the closing marker steps over it. Must not misfire
   on list bullets (`* ` at line start). Do this after item 4 so the two
   agree on how `*` behaves.
6. **Bold, italic and link shortcuts (user).** Cmd/Ctrl+B and +I wrap the
   selection in `**` / `*` (and unwrap if already wrapped); Cmd/Ctrl+K wraps
   it as `[text](url)` and selects the `url`. These are editor commands that
   the top bar (item 11) reuses.
7. **Find and replace in the open sheet.** CodeMirror's search panel,
   styled to match, with Cmd/Ctrl+F and Cmd/Ctrl+Alt+F. Distinct from Find in
   Library.

**Easy to medium**

8. **Theme, font and size.** Light, dark or follow the system; editor font
   family and size. A small settings store in the main process, applied as
   CSS variables. Export keeps its own stylesheet.
9. **Collapsible sidebar (user).** A toggle button collapses the library
   pane; when collapsed, moving the pointer to the left edge slides it in
   as an overlay that goes away when the pointer leaves. State is
   remembered. Also a menu item with a shortcut. Layout, hover timing and
   focus are the fiddly parts.
10. **Quick open (Cmd/Ctrl+P).** Fuzzy jump to a sheet by title or group
    path. A smaller cousin of Find in Library, same dialog style.
11. **Top bar (user).** Buttons: search (magnifier), new sheet (sheet with
    pencil), bold, italic, link, export (sheet with up arrow). Editor
    buttons come from item 6, the rest call existing menu commands.
    Tooltips show the shortcut.
12. **Open recent library; restore the last sheet.** Reopens where you left
    off, with a recent-libraries submenu. Needs the settings store from
    item 8.
13. **Commented-out text (user).** Syntax to settle first; proposal:
    `<!-- ... -->` (valid Markdown everywhere), toggled on the selection or
    line with Cmd/Ctrl+/. Dimmed in the editor, left out of HTML/PDF export
    and of word counts (so after item 3). Search still finds it. Needs an
    export change in core.
14. **Heading outline.** A panel listing the headings of the open sheet;
    click to jump. Reads the Markdown syntax tree the editor already has.
15. **Focus and typewriter mode.** Dim everything except the current
    paragraph or sentence; optionally keep the cursor line vertically
    centred. A toggle in the View menu.

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

**Medium to hard**

23. **Images.** Paste or drag an image into a sheet, render it inline,
    embed it on export. Blocked on the open question of where images live
    on disk (next to the sheet, or a per-folder assets directory).
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

Open decisions for this list: the comment syntax (item 13), where images
live (item 23), where sheet notes are stored (item 24) and in-app Trash
versus the system trash (item 25).

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
- ePub export.
- Publishing to WordPress and Ghost.

## Open questions

- **"Join".** Confirm whether this means something different from merge.
- **Images.** Where attached images live on disk (next to the sheet, or in
  a per-folder assets directory). Needed before milestone 7.
- **Name.** "WritingApp" is a placeholder; the sidecar filename depends on it.
