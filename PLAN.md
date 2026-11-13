# WritingApp — plan

Working title. A free, open-source writing app in the spirit of Ulysses:
a library of ordered sheets, fast keyboard-driven organisation, and clean
export. Cross-platform on desktop first, iPad and iPhone later.

## Status

- **Done:** milestones 1 (scaffold), 2 (library core) and 3 (library UI).
  Licensed AGPL-3.0.
- **Next:** milestone 4 (editor).
- The app opens a library folder, remembers it, and shows three panes:
  groups, sheets (title + preview), and a read-only text view of the
  selected sheet. File > Open Library (Cmd/Ctrl+O) switches library. Nothing
  can be edited or saved yet.

If you are picking this up in a new session, read "Working in this repo"
below, then start at milestone 3.

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

### 4. Editor
- CodeMirror 6 with Markdown parsing.
- Styled headings, emphasis, lists, links, code; markers dimmed, not hidden.
- Autosave on pause and on blur. No save button.
- Writing typography: readable column width, line height, light and dark.
- List continuation on Enter, sensible Tab and Backspace in lists.
- **Done when:** writing a full sheet in it feels unremarkable.

### 5. Organising
- New sheet, new group, new project, from menu and keyboard.
- Reorder by drag and drop and by keyboard (move up / move down).
- Move sheets between groups.
- Multi-select in the sheet list.
- **Done when:** a project can be restructured without touching the mouse.

### 6. Sheet operations
- **Split** at the cursor into two sheets.
- **Merge** selected sheets into one.
- **Glue / unglue** selected sheets: they stay separate files but display
  and export as one run.
- Glued runs scroll as one continuous document in the editor.
- A keyboard shortcut for each.
- **Done when:** all three round-trip correctly on disk and are undoable.

### 7. HTML export
- Export a sheet, a glued run, a selection, or a whole group as one HTML file.
- Markdown to HTML in the core package.
- One built-in stylesheet, embedded in the output so the file stands alone.
- Preview before saving.
- **Done when:** a multi-sheet group exports to a single readable HTML file.

### 8. PDF export
- Render the exported HTML with a print stylesheet through Electron's
  built-in print-to-PDF.
- Page size, margins, page numbers.
- This path is desktop-only. The mobile apps will need their own PDF route
  through the iOS print system.
- **Done when:** the same group exports to a paginated PDF on Mac, Windows,
  and Linux.

### 9. Hardening
- Watch the library folder and pick up outside changes, including sync
  conflicts.
- Undo for structural operations (delete, move, merge, split).
- Search across the library.
- Signed builds and a release workflow.
- **Done when:** it is the app the daily writing happens in.

## Later, in rough order

- **DOCX export.** Deferred: it needs a dedicated library (or hand-written
  Office XML), and neither is worth taking on before HTML and PDF are solid.
- Export styles: user-selectable and user-editable stylesheets.
- iPad and iPhone apps: a Capacitor shell over the same core and UI, with
  its own filesystem implementation and iCloud folder access.
- ePub export.
- Writing goals, keywords, filters.
- Publishing to WordPress and Ghost.

## Open questions

- **"Join".** Confirm whether this means something different from merge.
- **Images.** Where attached images live on disk (next to the sheet, or in
  a per-folder assets directory). Needed before milestone 7.
- **Name.** "WritingApp" is a placeholder; the sidecar filename depends on it.
