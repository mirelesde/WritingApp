# WritingApp — architecture and design

Working title. A free, open-source writing app in the spirit of Ulysses: a library of ordered sheets, fast keyboard-driven organisation, and clean export. Cross-platform on desktop first, iPad and iPhone later.

Companion docs: [ROADMAP.md](ROADMAP.md) (what is next), [CHANGELOG.md](CHANGELOG.md) (what was built, by item number), [RELEASING.md](RELEASING.md), [WORKFLOWS.md](WORKFLOWS.md) (the saving and tab styles the app supports), [UAT.md](UAT.md) (manual test scripts).

## Working in this repo

### Layout

```
package.json            npm workspace root; scripts delegate to the packages
packages/core/          @writingapp/core — library model, operations, export
  src/filesystem.ts     the FileSystem interface (the core's only door to disk)
  src/sheet.ts          sheetTitle(), sheetPreview(); tests sit next to sources as *.test.ts
  src/sidecar.ts        parse and reconcile .writingapp.json with the folder
  src/library.ts        loadLibrary() -> tree of group and sheet nodes
  src/filename.ts       readableName(), sheetFileName(), stemFitsTitle(), slugify() (old names)
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
  src/renderer/src/     Svelte UI. App.svelte only builds and wires the
                        modules below; the logic lives in them (see
                        "How the renderer is organised")
```

### How the renderer is organised

`App.svelte` constructs each module with `window.api` (as a `Pick<Api, ...>` of just
what it uses) and a small host object of callbacks, then wires them to the template.
Because modules see only that narrow surface, each has a `.test.ts` using fakes.

- **Stores** (`*.svelte.ts`, Svelte 5 runes): own reactive state. `ViewState`, `TabsState`,
  `SelectionState`, `GroupNav`, `SheetList`, `GroupWords`, `OutlineState`, `Trail`.
- **Flows** (classes, some `*.svelte.ts` when they hold state for a dialog): one user task
  each, such as `FindFlow`, `ExportFlow`, `MoveFlow`, `SheetCreation`, `NodeOps`, `TabFlow`,
  `SelectionFlow`, `OpRunner`, `Navigation`, `ContextMenus`, `KeyboardFlow`.
- **Pure functions** (`.ts`): `listing`, `organise`, `keyActions`, `menuCommands` (a command
  table), `tabRuns`, `pageClick`, `findScopes`, `paletteCommands`.
- **Components** hold markup and local styles: panes, dialogs, `TabBar`, `EditorBar`.

Conventions: callbacks are arrow-function properties so `this` survives destructuring;
a `$derived` that reads the constructor's host uses `$derived.by`; a plain `Set` is not
allowed in a `.svelte.ts` file (lint); anything passed bare to a constructor must be
declared before it in `App.svelte` (temporal dead zone). New logic goes in a module with a
test, not into `App.svelte`.

### Commands (run from the repo root)

| Command | What it does |
| --- | --- |
| `npm install` | Install everything, including the Electron binary |
| `npm run dev` | Launch the desktop app with hot reload |
| `npm test` | Unit tests for every package (Vitest) |
| `npm run typecheck` | Type-check both packages |
| `npm run build` | Type-check, then production build into `apps/desktop/out` |
| `npm run e2e -w @writingapp/desktop` | End-to-end checks of the built app (run `npm run build` first; opens real windows, so it needs a display) |

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
- **Filenames** are generated from the sheet's first line, readably
  (`Why is it so.md`: case and spaces kept, only characters disks refuse
  dropped), with " 2", " 3" on collision. The old hyphenated lowercase form
  still counts as fitting, so existing libraries are not renamed.
- **A sheet's title** is its first line, as in Ulysses; it may hold any
  characters. A **group's** typed name is stored as `title` (with `titleFor`,
  the folder name it applies to) in the group's own sidecar and shown instead
  of the folder name; a Finder rename makes it fall back to the folder name.
- **Ignored:** dotfiles and anything that is not a folder or a `.md` file.

Sidecar shape (as built; `color`, `keywords`, `title` and `titleFor` are optional):

```json
{
  "version": 1,
  "order": ["opening.md", "the-station.md", "Part One"],
  "glued": ["opening.md"],
  "title": "Part One: Why?",
  "titleFor": "Part One"
}
```

`order` holds child names in display order, sheets and groups mixed.
`glued` holds the sheets that are glued to the sheet after them.


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

