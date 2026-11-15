# WritingApp — roadmap

## Status

- **Done:** milestones 1–9 and numbered items 1–87 (see [CHANGELOG.md](CHANGELOG.md)). Licensed AGPL-3.0.
- **Next:** confirm the items in `UAT.md` section 15 live, then pick from "Still open" and "Later" below, one commit per feature.

If you are picking this up in a new session, read [ARCHITECTURE.md](ARCHITECTURE.md) ("Working in this repo") first.

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

## Later, in rough order

- Preferences navigation: top tabs are right for four sections; move to a sidebar (wider dialog, icons, a search box for settings) when there are about six or more, for example Shortcuts, Export or Library.
- Export styles: running headers and footers beyond the title and page number, chapter numbering in Word, a title page in Word and EPUB, page setup stored per style as a setting (see item 81 for what exists).
- iPad and iPhone apps: a Capacitor shell over the same core and UI, with
  its own filesystem implementation and iCloud folder access.
- Publishing to WordPress and Ghost.

- Release signing and notarization: needs your Apple Developer ID and a Windows
  code-signing certificate (see the release notes in the CI section).
- Maths inside tables and footnotes (rendered in the editor and exports).
- Undo that survives a restart (see the Trash note under item 69's neighbours).
- Verify how Ulysses really treats names (own database, no sheet file names?) before
  leaning on it for more naming decisions.
- Keep Markdown file names in step: a sheet's keywords and fold state are stored by
  file name, so a rename outside the app still drops them.
- CI housekeeping: about 1,000 prettier warnings in lint; bump `actions/*` for the Node 20
  deprecation notice; `App.svelte` (~3,300 lines) has no component tests.

## Open questions

- **"Join".** Confirm whether this means something different from merge.
- **Images.** Where attached images live on disk: next to the sheet, or
  in a shared assets folder with a browsable stash (see item 23, which
  lists both). Parked.
- **Name.** "WritingApp" is a placeholder; the sidecar filename depends on it.
