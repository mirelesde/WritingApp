# WritingApp — roadmap

This is the register of everything that is not finished: things only the owner can do, things to check live, gaps in what exists, features not built, and ideas parked on purpose. Item numbers (for example "item 57") point into [CHANGELOG.md](CHANGELOG.md), where each feature's full notes live. Nothing here is a promise; the owner picks the order.

## Status

- **Done:** milestones 1–9 and numbered items 1–90 (see [CHANGELOG.md](CHANGELOG.md)). Licensed AGPL-3.0. App version is `0.0.0`; no tags or releases exist.
- **Next:** confirm the items in `UAT.md` section 15 live, then pick from the lists below, one commit per feature, each verified live first.

If you are picking this up in a new session, read [ARCHITECTURE.md](ARCHITECTURE.md) ("Working in this repo") first.

## 1. Only the owner can do these

- **Run the live checks** in `UAT.md` section 15 (⌘S from the menu, Format dropdown, sheet cards, save modes, Preferences tabs, tab dragging, the Word contents page, EPUB in a reader, the group rename box, a Finder rename, a sheet rename with `:` or `?`). Also open **Export** once to confirm the dialog layout fix (the toolbar used to overflow and shift the preview left; fixed by widening to 1160 px and wrapping the toolbar) and that the stray `<!-->` and `**` no longer show on sheet cards in a real library.
- **Native-menu and OS-dialog click-through.** The test harness cannot click native menus or dialogs, so these were checked only underneath (the command or code behind them): the whole Format and Insert menus (including Format ▸ Table and the shortcut hints), File menu entries (Import, Save, New from Template, Open Library), the sheet, group and library right-click actions (Rename, Move, Trash, Reveal, Copy Path), the text right-click menu and spelling suggestions, ⌘, opening Preferences, ⌘⇧V (paste as plain text), ⌘-click on a link opening the browser, every save dialog (HTML, PDF, Word, EPUB, Markdown: writing the file was reviewed in code only), the import file dialog and Insert Picture's file picker. The macOS title bar (traffic lights, sidebar vibrancy) was never seen in screenshots.
- **Behaviour never tried by hand:** a hard quit (force quit, power loss) and quit with unsaved changes (Cancel keeps the app open); restoring recovered text while that sheet is open in the editor; moving and copying sheets between groups in the running app; shift-click ranges across sections in the sheet list; first-sheet selection on nested groups and an empty group (only the root project was tried); the sheet-list collapse button, distraction-free mode, and the hover edge while the sheet list is also hidden; very small windows (about 800 px) in the Export dialog; an undone regular-expression replace in the app (core tests cover it); the "Use my choices" button in the changed-outside-the-app dialog; pasting rich text from a real browser or Word; opening an exported Markdown or HTML file in another viewer; arrowing across hidden marks, clicking among marks with the mouse, and levels 2 to 3 of hanging headings; whether the dark theme looks right on every feature added after the UI sweep, and whether exported HTML and PDF colours match the editor.
- **Windows and Linux:** launch the app itself (CI runs only the tests) and try file watching, tabs, Save, export, PDF, group names with `:` and `?`, and the UI (see section 5).
- **Signing:** an Apple Developer ID (US$99 a year; notarization) and a Windows code-signing certificate. Linux needs none. An unsigned first release is possible if the notes say so.
- **epubcheck:** the validator needs a download, which the project does not do without explicit permission. Alternative: open an exported EPUB in a real reader.
- **Decisions waiting on the owner:** see "Open questions" at the end.

## 2. Release (never run end to end)

- **Dry run.** Push a throwaway pre-release tag such as `v0.1.0-rc.1` so `release.yml` builds the Mac dmg, Windows installer and Linux AppImage and deb, unsigned. Install each and run the UAT list on the packaged build. Likeliest differences from the dev build: file access under the sandbox, the `wa-asset://` picture protocol, PDF export, fonts. A tag pushes to the owner's GitHub and triggers builds, so it needs their go-ahead.
- **Auto-update (optional).** `electron-updater` with the GitHub release feed; on Mac it needs signed builds.
- **Release hygiene:** release notes drafted from the CHANGELOG, a README install section, the app icon and About text, and a version scheme (suggested: `0.x` betas, `1.0` once signed and verified). Review this register for anything that must be fixed before a stable label; data-loss paths come first.
- Details of the pipeline: [RELEASING.md](RELEASING.md).

## 3. Gaps in what exists

**Editor and Markdown**

- Maths in table cells and footnotes is not drawn; no maths menu entry or shortcut; no KaTeX macros (item 53). Exports leave fenced code uncoloured.
- Folding does not cover lists or code blocks, and a renamed heading loses its remembered fold (item 42).
- Hide Markdown markers works per line, not per element (item 41).
- Hanging heading marks: six `#` could reach the pane edge in a narrow window (unchecked), and caret and selection behaviour across the collapsed space after the hashes, and the cursor moving onto and off a hanging `---`, were not checked by hand.
- Footnote-aware live Markdown preview waits on item 18, which does not exist.
- Format menu does not show check marks for the style at the cursor (item 76; only the Aa popover does).
- Tables: cells are one line each and pasting flattens line breaks; inserting a table adds two empty body rows; columns are equal width.
- Wiki links and import leftovers are listed under items 30 and 57 (a folder of Markdown as a project, dropping files on the window, RTF headings and tables).

**Library, sheets and names**

- Keywords and fold state are stored by file name, so a rename outside the app drops them (item 26). Also: no library-wide keyword rename or delete, no keyword counts, Find in Library and Quick Open do not match keywords, a keyword-filtered list cannot be reordered, no OR between keywords, not shown in an inspector, not in exports.
- Group display names live in the folder's own sidecar and apply only while `titleFor` matches the folder name; verify Ulysses' real naming behaviour before leaning on it for more naming decisions.
- Library title does not accept drops (moving a project, group or sheet to the top level). It is small (about 20 lines): the old root row did this. Open point: dropped items land at the end, which for the root puts a project after all the others. Parked at the owner's request.
- No "No Group Selected" state (a group is always selected, starting with the library root); only needed if a nothing-selected sidebar state is wanted.
- The automatic rename of a sheet's file to follow its first line is not undoable, and editing a sheet's first line from outside the app while it is open was not checked.
- Tables inside lists or block quotes, and very wide tables, were not tried.
- Export styles: I wrote in the CHANGELOG that Ulysses' site states no licence, but I did not read its terms; re-read them before relying on that or copying any style.
- Sheet-list sorting and manual order: reordering is off while sorted (by design).

**Tabs and windows (item 29)**

- Not remembered across launches. A tab keeps only its sheet, not group, scroll or cursor. A sheet renamed or moved by another window drops its tab. Cmd+T copies the current sheet instead of opening a blank tab. No overflow menu on the tab strip; a tab dropped back on its own window's empty area does nothing.
- Drag gestures were tested with synthetic events only; moving a tab between windows was never tested live; menu accelerators were not pressed by hand.
- Manual save mode: structural operations still flush before running; File ▸ Open Library from the menu cannot ask afterwards (Choose Library can).

**Images (item 23; accepted limits)**

- Native Insert menu item, file picker, export save dialog, and the `Cmd/Ctrl+Alt+I` accelerator were checked only underneath, never clicked through; a real drag of a file onto the sidebar was not tried.
- Pictures dragged between sheets inside the app are not handled; undoing an insert leaves the file in `.assets/` for Clean Up; duplicate detection is exact (a resized or re-saved copy is a different picture); no resizing, cropping or thumbnail crop; captions only in the Markdown; no merging of existing duplicates (it edits sheets); no migration for same-folder pictures from the dropped design.
- `http:` (not https) pictures get no thumbnail and there is no setting to load web pictures automatically.
- **Export size:** HTML export embeds every picture at full size as a data URI, so a few photos make a very large file. Planned idea: an export option to either embed pictures in the `.html` or write a folder of assets beside it, and suggest the folder when pictures raise the size by a set percentage. Capping or scaling is the other half.
- The image behaviour still needs a section in the user guide.

**Search (item 73)**

- Not built: result ranking, a notice when results are capped at 50 sheets, a single-sheet scope (the editor's own find bar covers that). The regex guard is static and incomplete: a few slow patterns, such as some alternations, still get through.

**Export and import (items 58, 69, 73, 77, 80, 81)**

- Export styles: gaps and future tweaks in the next list.
- Word: legacy `.doc` is not read; comments, text boxes, equations and cell merges are dropped on import; maths exports as TeX source in italics; export styles do not apply; SVG and WebP pictures become alt text; not opened in Word itself (checked with `textutil` and a round trip); no title page, chapter numbers or running title in Word.
- EPUB: has a cover instead of a title page; not run through epubcheck or a reader.
- Running title is the export's name, not the title-page text; no left/right or chapter-name headers; these extras are dialog choices, not saved inside a style.
- Not built: copy as rich text or HTML, export a group as one Markdown file, Print (item 58, 77; Cmd/Ctrl+P is Quick Open, so choose another shortcut), per-style page setup.
- **Export styles (item 69).**
  - *Unverified:* saving HTML and PDF in a chosen style was not run live (the preview was); overwrite and delete of user styles, dark mode of the style editor, and Windows and Linux. Built-ins name Palatino, Courier New and Times, which Linux may not have.
  - *Sanitiser is a filter, not a CSS parser.* It strips `@import`, `url()` to `http(s)` or `//`, and `</style`. CSS escapes (`u\72l(`), `image-set()` and `@font-face` sources could slip a web fetch past it. A real parser, or a Content-Security-Policy `<meta>` in the export, would close it. Exported HTML carries no such guard once opened elsewhere.
  - *Page setup is not part of a style* except that `@page { size }` is honoured by the PDF path; margins and page numbers stay in the dialog.
  - *Editor:* plain textarea with no highlighting, error messages or reset-to-original; built-ins are copied rather than edited in place; a renamed style keeps its old file name.
  - *Sharing:* by copying a `.css` file; no import button, style pack or Ulysses `.ulstyle` importer (it would parse user-supplied files only; the Ulysses catalogue is not licensed for copying).
  - *Scope:* one style per export; no per-sheet or per-group override; the choice is stored in browser local storage, not in settings; Markdown export and the editor do not use styles.
  - *Content a style cannot add:* running headers and footers beyond title and page number, drop caps, first-line small caps, widow and orphan control, horizontal-rule ornaments.
  - *UI polish:* the export dialog header clips the title on narrow windows; style descriptions are cut with an ellipsis; Book, Manuscript and Academic force a light page, so dark-mode HTML does not follow the system.

**Sync, safety and stability**

- Sync conflicts (item 31): two-way diff only (no common ancestor); iCloud's numbered copies ("note 2.md") are not recognised; the crash-recovery dialog shows plain text, not the diff view.
- Undo that survives a restart (item 25 shares the storage question with Trash and version history).
- Failures that were caught and not shown now go to `errors.log` (item 90), with Help ▸ Show Error Log. The `catch {}` blocks left are deliberate (storage that may be unavailable, files that may not exist yet).
- The PDF timeout is unit-tested only; the Word contents page in Word and EPUB in a validator are unchecked.
- Settings and the sheet cache are written atomically; there are no known data-loss paths open, but Windows file locking, sync-client locks and the watcher on Windows and Linux are untested.

## 4. Features not built

Numbers refer to [CHANGELOG.md](CHANGELOG.md). Roughly easiest first within each group.

**Small to medium**

- 18 Markdown preview (toggle or side by side, scroll sync optional); 19 Favorites (pinned sheets, stored in the root sidecar); 21 Goals and progress (a word target per sheet or group, in the status bar); 55 Writing session stats (words today, streak, daily target; history in app settings; builds on 21); 56 and 71 Writing aids (repeated words, readability score, dictionary and thesaurus lookup); 78 Session timer or sprint mode; 74 Sample "Welcome" library on first run; 79 Localisation (move UI strings into a table; cheaper to start early).
- 51 Accessibility pass: screen-reader labels, a high-contrast option, reduced motion, full keyboard use of every dialog and menu.
- 58 and 77 More export routes and Print (see above); 57 Import remainder (see above).
- 63 Sheet status labels (Draft, Revise, Final, user-defined); 62 Smart filters (saved searches as virtual groups; builds on 26, 63); 65 Text replacement and autocorrect (`;;sig`).

**Medium to hard**

- 24 Sheet notes and 59 Project and group notes (never exported; shared storage decision: companion `.notes.md` file or a sidecar field; leaning companion file because notes can be long and the sidecar is read on every load). L11 tabbed inspector in [ARCHITECTURE.md](ARCHITECTURE.md) is their home, with outline, goals and keywords.
- 25 Trash bin in the app (hidden `.trash`, a Trash entry, Restore and Empty, undo that survives a restart; decide sync behaviour and how sidecar order is restored).
- 27 Version history (design notes in ARCHITECTURE; do it after 25, which shares the storage); 68 Automatic library backups (rolling zip on a schedule, a cap on how many are kept).
- 64 Annotations (inline notes anchored to a passage, never exported); 66 Grammar and style check (optional, off by default, LanguageTool local or remote; needs a privacy decision).
- 67 Inbox (a catch-all group) with 32 Global quick capture (a system-wide hotkey and a small window; depends on windows, item 29).
- 70 Publishing to WordPress, Ghost and Medium.

**Platforms**

- **iPad and iPhone** (Capacitor shell over the same core and UI). `packages/core` and the Svelte and CodeMirror UI carry over; the `Api` interface in `apps/desktop/src/preload/api.ts` is the seam a mobile build would implement. To rebuild: storage (document picker, security-scoped bookmarks, iCloud Drive), file watching, conflict handling for iCloud duplicates, reveal in Finder and trash, search, undo, the crash journal, templates and `.docx` import and export (Node code today), PDF export (Electron's `printToPDF`; iOS needs the system print path), and the touch UI (a navigation stack on iPhone; a Markdown toolbar above the keyboard; touch equivalents for hover, drag and right-click). Rough size: an iPad prototype (open a library, edit, search) is a handful of focused sessions; a polished iPad and iPhone app is a project the size of the desktop app's later phases. A native SwiftUI app would feel best but discards the UI and CodeMirror.
  - *Getting a prototype on the owner's own iPad:* Xcode (Mac App Store), an Apple ID, a cable (or Wi-Fi pairing after the first connect). Wrap with Capacitor, open the `ios/` project, set the signing team to a Personal Team with a unique bundle ID, enable Developer Mode on the iPad, trust the Mac, run, then trust the developer profile on the iPad. A free Apple ID: the app expires after 7 days, at most three sideloaded apps, no iCloud entitlements. A paid account (US$99 a year): a year of validity, iCloud Drive, TestFlight. The iOS Simulator can be driven from the dev environment, so most of it can be verified before the iPad is plugged in.
  - *Habits that keep mobile cheap:* keep logic out of the renderer's Node and Electron assumptions and behind `Api`; keep `core` free of DOM and Node types; keep the library as plain files; prefer pure-JS libraries for main-process features. How much of the main process is already pure JS has not been audited.
- **Several libraries open at once.** Today one library per app run, with several windows sharing it. Two options, neither started: (1) one library per window (each window gets its own root, watcher, undo stack and saved text, and main-process handlers look up state from the sending window; about 1–2 days, mostly the refactor), recommended; (2) several libraries in one sidebar (every path would carry its library; tree, selection, search, export and undo all change), skip unless moving sheets between libraries is needed. In both, stop the same library opening in two windows.
- **Windows and Linux pass** (item 80): see sections 1 and 5.

**Ideas raised in conversation and parked** (no item number; none started)

- **Block-style control and a context-sensitive toolbar:** a paragraph / H1–H3 / quote / list picker in the formatting controls, and a toolbar whose buttons follow what is under the cursor. Offered when the formatting menu was designed; the Format menu and Aa popover were built instead.
- **File names that never follow the title:** an alternative to the current rename-on-leave behaviour: name the file once from the first line at creation, then never rename it. Considered and set aside for readable names with a " 2" suffix (item 87); worth revisiting if renames confuse sync clients or other tools that watch the folder.
- **Image stash and thumbnail grid:** a picker of every image in the library with "Add new…" first, and, if it grew into a media library, folders or tags. Not chosen (item 23); the unused-picture clean-up covers the leak.
- **Automatic orphan clean-up:** trash an unused picture only after a long time unused (about 30 days), as a setting that is off by default; deletion always goes to the system trash and never silently.
- **Markdown export that copies used pictures and rewrites links,** so other Markdown apps can read the sheets; the library format itself stays as is.
- **Don't Save drops the crash-recovery copy** (manual save mode): a deliberate choice so the text is not offered back later; revisit if anyone loses text this way.
- **Real-world size:** only small test libraries and a synthetic 3,000-sheet library were measured; a long real sheet (for example the owner's "La Ley Hoy") may behave differently in the editor, outline and export. The Export dialog's width cap is a fixed number, not computed from content, and nothing guards against something else growing too wide later (a long style name, a larger font).

## 5. UI and feel

The target is an OS X-inspired look that is the same on every OS, with the main window (sidebar, sheet list, editor) as the reference; not native. The list of what stays with the OS and what the app draws is in [ARCHITECTURE.md](ARCHITECTURE.md), "UI consistency". Still open:

- **Follow the system accent:** a "Match system" choice beside the fixed accents, using the colour Electron reports. Not built.
- **Inactive-window state:** greyed selection and toolbar when the window is not frontmost. Not built. A soft focus halo on fields (macOS draws about 3 px; the app uses a 1 px border or ring). Not built.
- **Dialogs:** Return should always trigger the primary button and Escape the cancel button (not checked in every dialog); macOS-style sheets that drop from the title bar for alert dialogs only (optional).
- **Preferences** as a separate window, as macOS does, instead of a dialog over the editor: a bigger change, undecided. Top tabs suit four sections; move to a sidebar (wider dialog, icons, a search box) at about six or more, for example Shortcuts, Export or Library. The owner also wants a way to choose the tabs' orientation in Preferences (top or side), to be built with that change.
- **Title-bar area:** a visible title-bar strip when the sidebar is hidden; on macOS the group title sits further right so the traffic lights do not cover it, and when the sidebar slides in on hover the sheet list is pushed with it (the fully open state was not seen; the screenshot was mid-animation). Windows and Linux have no traffic lights, so the title area and window-control spacing need a look there.
- **Cross-OS look:** Inter metrics, the solid (non-vibrant) sidebar, scrollbars, and fonts the built-in export styles name (Palatino, Courier New, Times) on Linux; dark mode was checked on dialogs only, not every surface; the editor's own font choices stay the writer's.
- Row padding in the palettes (7 × 10) still differs from the menus (5 × 9); older scoped `h2` rules are not all removed.
- The text context menu's main-process path (a real right-click on editor text, then Cut, Copy, Paste) was not clicked through.
- Accessibility settings (reduced motion, increased contrast) fall under item 51.

## 6. Housekeeping and maintainability

- `App.svelte` was split into tested modules (item 89), from 3,366 to 1,336 lines. What remains is wiring, template and styles; there are still no component-level tests of the wiring itself, so the unchecked paths listed in item 89 are where a regression would hide.
- CI does not run `npm run e2e` yet (item 90): macOS and Windows runners have a display, Linux needs `xvfb-run`. More end-to-end checks worth adding: export, import, the changed-outside dialog, quit with unsaved text.
- CI: about 1,000 prettier warnings in lint; the `actions/*` bump for the Node 20 deprecation notice; CI is green on Ubuntu, Windows and macOS as of a4b89e2. Ubuntu had been failing since 74f7c27 because a test used a lowercase file name, which only a case-sensitive file system notices; macOS and Windows missed it. Any new test that names a file should use the exact case.
- User-facing documentation: the plan has a "built, for the user guide" section in [CHANGELOG.md](CHANGELOG.md); the image behaviour in particular is not written up for users.

## Open questions

- **"Join".** Confirm whether this means something different from merge.
- **Images.** Resolved: one shared `.assets/` folder per library (alternative A, next to each sheet, was tried and dropped; the browsable "stash" picker was not chosen). Open: whether to offer web-picture auto-load and thumbnails for `http:`.
- **Name.** "WritingApp" is a placeholder; the sidecar filename depends on it.
- **Library title as a drop target:** add it or not (parked).
- **Preferences as its own window, and tab orientation:** undecided.
- **Release:** whether to ship an unsigned first release; whether to add auto-update.
