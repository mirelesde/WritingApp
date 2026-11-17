# User acceptance scripts

Manual checks (section 17 covers the everyday paths and section 18 the packaged build; section 16 covers the menus, Preferences and first launch; section 15 lists everything still to confirm live) for the features added on 2026-11-13: wiki links and backlinks, hiding Markdown marks, folding sections, import, code colours and maths, and drag-and-drop drop lines. Run `npm run dev` in `apps/desktop` (or open a build), use a throwaway library, and tick each step.

Items marked **(not yet checked live)** are ones the developer could not drive in the test harness, so look at them closely.

## Setup: a test library

Create a library folder with a project `Test`, and these sheets (the first line is the title):

**Plot**
```
# Plot

Intro text.

## Act one

Para one.

### Scene A

Scene text.

## Act two

Act two text.
```

**Cast**
```
# Cast

See [[Plot]] and [[plot|the plot]]. Missing: [[Nobody]].
```

**Notes**
```
# Notes

Also [[Cast]] and `[[Plot]]` in code.
```

---

## 1. Wiki links

| # | Steps | Expected |
|---|-------|----------|
| 1.1 | Open **Cast**. | `[[Plot]]`, `[[plot\|the plot]]` and `[[Cast]]`-style links each show as one outlined chip. `[[Nobody]]` is dashed and fainter. No chip sits inside another chip. |
| 1.2 | In **Notes**, look at `` `[[Plot]]` `` in backticks. | Not drawn as a link (code is skipped). |
| 1.3 | Cmd/Ctrl-click `[[Plot]]` in Cast. | The Plot sheet opens. A plain click only places the cursor. |
| 1.4 | Cmd/Ctrl-click `[[Nobody]]`. | A new sheet titled "Nobody" is created beside Cast, opened, starting `# Nobody`. Back in Cast, the link is now solid. |
| 1.5 | In any sheet type `[[Ca`. | A list of titles pops up with Cast first. Press Enter. The text becomes `[[Cast]]` and the cursor sits after `]]`. |
| 1.6 | Type `[[` then pick a title with the arrow keys and Enter. | Same result. Typing `]]` yourself over the auto-closed brackets steps over them. |
| 1.7 | Type `[[CAST]]` or `[[ cast ]]`. | Still links to Cast (case and spaces ignored). |
| 1.8 | Open **Plot** with the outline panel shown. | "Linked from" lists Cast and Notes, each with its location. A link inside a code span or from the sheet itself is not counted. |
| 1.9 | In Cast, delete the `[[Plot]]` links, then look at Plot's "Linked from". | Cast disappears from the list as you type. |
| 1.10 | Click a name in "Linked from". | That sheet opens. |
| 1.11 | Open a sheet nobody links to. | The list shows the hint "No sheet links here yet. Use [[title]] to link." |
| 1.12 | Make two sheets with the same title in different groups, link to the title. | The first in library order wins. **(duplicate titles not yet checked live)** |
| 1.13 | Quit and reopen the app. | Links and "Linked from" are correct straight away (stored in the sheet cache). |

Known gaps, not bugs: renaming a sheet does not rewrite links to it; no `[[Title#Heading]]`; exports show wiki links as plain text.

## 2. Hide Markdown marks

Add this to a sheet:

```
# A heading

Some **bold**, *italic*, ~~gone~~, ==marked== and `code`.

> A quote

See [the site](https://example.com "title") and [[Cast]].

- item one
```

| # | Steps | Expected |
|---|-------|----------|
| 2.1 | Preferences, turn on **Hide Markdown marks**. | Off by default. When on, `**`, `*`, `~~`, `==`, backticks, `#`, `>` disappear on every line except the one the cursor is on. |
| 2.2 | Click into the bold line. | Marks on that line reappear. Move to another line: they hide again. |
| 2.3 | Look at the link line away from the cursor. | Only "the site" shows, as one chip, with no empty box after it. The address and title are gone. |
| 2.4 | Look at `[[Cast]]`, the `- ` bullet and any fenced code or table. | These keep their marks. |
| 2.5 | With the cursor on the bold line, press Right through `**bold**`. | The cursor moves one character at a time through visible marks. |
| 2.6 | On a neighbouring line press Right/Left across where a hidden mark is. | The cursor steps over the hidden mark in one move, never landing in invisible text. |
| 2.7 | Select across several lines (shift-click). | Marks on every selected line show. |
| 2.8 | Type a new heading `# ` with no text yet. | The hashes stay visible until there is text. |
| 2.9 | Toggle the setting off. | All marks visible again, dimmed as before. |
| 2.10 | Restart the app. | The setting is remembered. |
| 2.11 | Turn on **Hang heading marks** too. | Headings and the hide setting work together with no layout jumps. |
| 2.12 | Copy a hidden-marks paragraph and paste elsewhere. | The pasted text includes the marks (hiding is display only). |

## 3. Folding sections

| # | Steps | Expected |
|---|-------|----------|
| 3.1 | Open **Plot**. Move the pointer to the left of "Act one". | A small chevron fades in near the heading. Move the pointer away and it fades out. Nothing shows beside ordinary text. |
| 3.2 | Click the chevron. | Everything under "Act one" (including Scene A) hides, up to "Act two". A "…" pill appears after the heading. |
| 3.3 | Click the "…" pill. | The section opens again. |
| 3.4 | Fold "Scene A" only. | Only its text hides; Act one's other text stays. |
| 3.5 | Put the cursor in "Para one." and press Cmd/Ctrl+Alt+[. | The section under the nearest heading above folds and the cursor moves to its heading. Cmd/Ctrl+Alt+] opens it. **(shortcuts not yet checked live)** |
| 3.6 | Use the **Fold** menu: Fold All Sections, then Unfold All Sections. **(not yet checked live)** | Every section folds, then opens. |
| 3.7 | Put `# not a heading` inside a code fence. | No chevron on that line, and it does not end a fold. |
| 3.8 | Fold "Act one", then click its entry in the outline. | The heading is shown and works. Click a heading deeper in a folded part: it unfolds so the heading is visible. **(not yet checked live)** |
| 3.9 | Fold a section, close the app, reopen, go to Plot. | The section is still folded. |
| 3.10 | Fold a section, then edit text elsewhere. | Folds stay on the right headings. |
| 3.11 | Fold a section, then use Find in the sheet for a word inside it. | The match is revealed (folded text should open). **(not yet checked live)** |
| 3.12 | Fold a section and check the word count. | Counts are unchanged by folding. |
| 3.13 | Turn on Focus Mode and typewriter scrolling with folds present. | Neither breaks; folded text is skipped sensibly. **(not yet checked live)** |

Known gaps: lists and code blocks do not fold; a renamed heading loses its remembered fold; the chevron sits near the top of a two-line title heading.

## 4. Import

Make these files in a scratch folder:

`plain.txt`: two paragraphs, one containing an accented letter (save once as UTF-8 and once as Windows-1252/Latin-1 to check both).

`rich.rtf`: create in TextEdit (Format > Make Rich Text) or Word with a bold title line, a paragraph with *italic* and **bold** words, a bullet list of two items, a numbered list of two items, and a hyperlink.

`notes.md`: a few lines of Markdown including `# heading`.

`report.docx` (a Word file with a heading, bold and italic words, a bulleted and a numbered list, a link, a small table, a footnote and a picture) and `broken.txt` (a file you have removed read permission from with `chmod 000`).

| # | Steps | Expected |
|---|-------|----------|
| 4.1 | Select a sheet. File > Import…, pick `plain.txt`. **(dialog not yet checked live)** | A new sheet appears after the current one, selected, titled by its first line. A notice says "Imported 1 sheet." |
| 4.2 | Check the accented letter in both encodings. | Shown correctly. |
| 4.3 | Import `rich.rtf`. | Bold and italic show as `**` and `*`. Bullets are `- `, numbers `1.`, the link is `[text](url)`. Accents correct. Paragraphs separated by blank lines. |
| 4.4 | Import `notes.md`. | Content arrives unchanged. |
| 4.5 | Import `plain.txt`, `rich.rtf` and `notes.md` together (multi-select). | Three sheets, in the order picked, after the current sheet, all selected. Notice "Imported 3 sheets." |
| 4.6 | Import `plain.txt` and `broken.txt` together. | `plain.txt` imports; a notice says "Imported 1. Could not import broken.txt." |
| 4.7 | Import `report.docx`. | One new sheet: `#` heading, `**`/`*` marks, `- ` and `1.` lists, `[text](url)` link, a Markdown table, `[^1]` with its definition at the end, and the picture shown (it is now in the library's assets). Import a `.doc` too: it is named in the "Could not import" notice. |
| 4.8 | Import several files, then use **Undo Library Change** once. | All imported sheets go to the trash together and the sheet order is as it was before. The undo label reads "Import of N files". |
| 4.9 | Cancel the dialog. | Nothing changes, no notice. |
| 4.10 | Import with a group selected, then with a sheet in the middle of a long list selected. | New sheets land right after the current sheet (end of the group when a group is selected). |
| 4.11 | Import 30+ text files. | Completes in a reasonable time; the list stays correct. |
| 4.12 | Import an RTF with a table or picture. | The text comes through; the table and picture are dropped without error. |

Known gaps: legacy `.doc`, Word comments and text boxes, importing a folder as a project, and dropping files onto the window are not built.

## 5. Code colours and maths

| # | Steps | Expected |
|---|-------|----------|
| 5.1 | Type a fence ```` ```js ```` with `const x = 'hi' // note` and a function. | Keywords, strings, numbers, function names and comments are coloured; all lines of the fence are monospace. |
| 5.2 | Try ```` ```python ````, ```` ```css ````, ```` ```html ```` and an unlabelled fence. | Labelled ones colour; the unlabelled one stays plain monospace. An unknown label stays plain. |
| 5.3 | Switch the app theme to dark. | Code colours stay readable. |
| 5.4 | Type `Euler: $e^{i\pi} + 1 = 0$.` | The formula is drawn as maths when the cursor leaves it; the TeX shows while the cursor is inside. |
| 5.5 | Type `$$`, a line of TeX such as `\frac{1}{2}`, then `$$`. | Drawn as a centred block once the cursor is outside; source shows when inside. |
| 5.6 | Type `It costs $5 and $10.` and `` `$x$` `` and a fenced block containing `$x$`. | None of these are drawn as maths. |
| 5.7 | Write bad TeX such as `$\frac{$`. | No crash; the TeX shows as plain text or in red. |
| 5.8 | Export (HTML preview and PDF) a sheet with formulas. | Inline and block formulas appear as maths; prices stay as text. **(PDF not yet checked live)** |
| 5.9 | Fold a section holding maths; hide Markdown marks on. | No errors; formulas still draw. |
| 5.10 | Click a drawn formula, then arrow out of it. | Click shows the TeX with the cursor in it; arrowing away redraws it. Undo/redo works across both states. |
| 5.11 | Put a formula in a table cell and in a footnote. | Not drawn as maths (known gap); nothing breaks. |
| 5.12 | Open a sheet with 50+ formulas and type at its end. | Typing stays responsive. |
| 5.13 | Select across a formula and copy, then paste elsewhere. | The pasted text is the `$…$` source. |
| 5.14 | Word count, sheet previews and Find on a sheet with formulas. | Counts and search work on the TeX text; previews show the raw `$…$`. |
| 5.15 | Open a very large fenced block (500+ lines) in a labelled language. | Scrolling and typing stay smooth. |

Known gaps: exports leave code uncoloured; no KaTeX macros; no menu entry or shortcut for maths; maths in table cells and footnotes is not drawn.

## 6. Drag-and-drop drop lines

| # | Steps | Expected |
|---|-------|----------|
| 6.1 | Drag a sheet card over the gap between two other cards. | A straight 3px accent bar appears above or below the target, as wide as the card minus its rounded corners. It does not curve over the corners. |
| 6.2 | Drag over the top half, then the bottom half, of a card. | The bar sits on the top edge, then the bottom edge. |
| 6.3 | Drag a sheet over a group row in the sidebar tree. | Over its upper or lower edge: a straight bar inset from the corners. Over its middle: the whole row is outlined (drop inside). |
| 6.4 | Drop in each case. | The sheet lands where the bar was shown; bars disappear afterwards. **(real drag not yet checked live)** |
| 6.5 | Repeat in dark mode. | The bar stays visible. |
| 6.6 | Drag several selected sheets. | Same bars; all move together. |

## 7. Images

| # | Steps | Expected |
|---|-------|----------|
| 7.1 | Insert > Image… (Cmd/Ctrl+Alt+I), pick one or more files. | A square thumbnail appears at the cursor for each; the raw `![name](.assets/name.png)` shows while the cursor is on it. **(native picker not yet clicked through)** |
| 7.1b | Click the picture button in the toolbar. | The same picker opens; chosen files insert at the cursor. The button is disabled with no sheet open. **(picker not yet clicked through)** |
| 7.2 | Paste a screenshot, then a picture file copied in the file manager. | Each saves into the library's hidden `.assets` folder and shows a thumbnail. |
| 7.3 | Drop picture files on the editor. | Thumbnails land where dropped. |
| 7.4 | Insert the same picture twice. | Only one file is stored in `.assets`. |
| 7.5 | Click a thumbnail. | A full-size preview opens; click or Escape closes it. |
| 7.6 | Export (HTML preview) a sheet with a picture; choose "folder" for pictures. | The picture shows in the preview; the folder option is preselected when embedding would add 50% or more. |
| 7.7 | Export as PDF a sheet with a picture. | The picture prints at a sensible size (checked in Electron with the app's settings; **the native save dialog not yet clicked through**). |
| 7.8 | Remove the last link to a picture, then File > Clean Up Unused Images…. | The picture is listed; confirming moves it to the system trash. |
| 7.9 | Save as Markdown… with pictures. | The pictures are copied to a `<name>-images` folder beside the file and links are rewritten. |
| 7.10 | Link a picture that does not exist. | A dashed box with a warning mark and the file name replaces the thumbnail (no preview on click); the sheet still opens and edits normally. |
| 7.11 | Hover a thumbnail, click "Alt" (or "+ Alt"), type, press Enter; repeat with Escape and with text containing brackets. | Enter rewrites the alt text in the Markdown; Escape leaves it; brackets become spaces; the cursor returns to the editor. |
| 7.12 | Link a picture by `![alt](https://…)`. | A dashed "Load from host" box shows and nothing is fetched until clicked; clicking loads the thumbnail (a click then opens the preview); a dead link shows the missing box. |
| 7.13 | Drag a picture file from the file manager onto the sidebar, the sheet list and the toolbar. | Nothing happens: the window does not turn into the picture. **(real drag not yet checked live)** |

## 8. Sync conflicts

| # | Steps | Expected |
|---|---|---|
| 8.1 | In a group, create `a.md` and a file `a (conflicted copy).md` with slightly different text (outside the app). | The sidebar shows "1 sync conflict — compare and resolve". |
| 8.2 | Click it. | A diff window shows the sheet and the copy side by side; changed words are highlighted. |
| 8.3 | Choose the copy for one difference, then click the primary button. | The sheet holds the mixed text, the copy is in the trash, the banner is gone. Undo Library Change restores the copy. |
| 8.4 | Edit a sheet in the app, then change the same file outside it. | The "changed outside the app" dialog shows the diff; "Use my choices" saves the combined text. |

## 9. Search options

| # | Steps | Expected |
|---|---|---|
| 9.1 | Open Find in Library with a group selected. | A "Look in" row offers that group and "Whole library"; the group is chosen. |
| 9.2 | Search a word that is in another group too, then switch to "Whole library". | Results grow to include the other group. |
| 9.3 | Search `cat` with Whole words on. | "catalog" and "concat" are not counted. Match case (`Aa`) separates "Cat" from "cat". |
| 9.4 | Turn on Regular expression and search `(\d+)-(\d+)-(\d+)`; Replace with `$3/$2/$1`. | Dates are rewritten day first; Undo Library Change restores them. |
| 9.5 | Type `(` in regex mode. | "That is not a valid regular expression". |
| 9.6 | Close and reopen the dialog. | The three toggles keep their state. **(Replace in a Windows or Linux build not yet checked)** |

## 10. Export styles

| # | Steps | Expected |
|---|---|---|
| 10.1 | Open Export (`Cmd/Ctrl+E`) and pick each style from the Style menu. | The preview changes at once: Book is centred and justified, Manuscript monospaced and double spaced. |
| 10.2 | Pick Manuscript, Save as PDF. | The PDF is in that style. **(not yet checked live: needs a save dialog)** |
| 10.3 | Pick Book, Save as HTML, open the file in a browser. | Same look as the preview. **(not yet checked live)** |
| 10.4 | "Copy and edit…", rename it, add `body { background: #fee }`, Save style. | The preview updates as you type; the style appears under "Yours" and is selected; a `.css` file is in the app's `export-styles` folder. |
| 10.5 | Choose your style, Edit…, change it, Save; then Save as new style. | The first overwrites; the second adds another. |
| 10.6 | Delete your style (click twice). | It leaves the list and the Default is chosen. |
| 10.7 | Put `@import url(https://example.com/a.css);` in a style. | It is ignored: nothing is fetched. |
| 10.8 | Reopen Export. | The last style used is still chosen. |

**Word export (10.x).** Select a sheet with headings, a list, a table, a footnote, a link and a picture, then Export…

| # | Steps | Expected |
|---|-------|----------|
| 10.W1 | In the Export dialog choose Format > Word, A4, Normal margins, Page numbers on, then Export as Word…. Open the file in Word, Pages or LibreOffice. | Headings are real Heading styles (they show in the navigation pane); lists are real lists; the table has borders and a shaded header row; the footnote is a real footnote; the link is clickable; the picture is embedded and fits the page; page numbers are centred in the footer. |
| 10.W2 | Repeat with Letter and Wide margins. | The page size and margins change accordingly. |
| 10.W3 | Export a group of several sheets. | One document, sheets separated by a rule. |
| 10.W4 | Import the file you just saved. | The text comes back as it was (the round trip). |

The preview fills the dialog; a column on the right reads top to bottom: Format (all five listed, each with what it is for: PDF, Word, EPUB, HTML, Markdown), then Options for that format only (page size, margins and page numbers for PDF and Word; title, author, language and cover for EPUB; the pictures choice for HTML; Number chapters for PDF, HTML and EPUB; Title page for PDF and HTML; title in the top margin for PDF; only a note for Markdown), then Style for PDF, HTML and EPUB. Close and Export as … sit at the foot of the column. Arrow keys move between formats; Return exports. The last format is remembered.

Known gaps: maths appears as its TeX source; export styles do not apply to Word; SVG and WebP pictures appear as their alt text.

## 11. Tabs and windows

| # | Do | Expect |
|---|----|--------|
| 11.1 | Open a sheet, press Cmd/Ctrl+T. | A tab bar appears with two tabs; the new one is in front, called "New tab", with no sheet shown. Choosing a sheet fills it. |
| 11.2 | Click another sheet in the list. | The front tab changes to it; the other tab is unchanged. |
| 11.3 | Click the first tab. | Its sheet opens and the list follows it. |
| 11.4 | Window > Next Tab / Previous Tab. | The tabs cycle. |
| 11.5 | Close a tab with × or Cmd/Ctrl+W, or middle-click. | It goes; with one tab left the bar hides. |
| 11.6 | Right-click a sheet, Open in New Tab (twice). | A tab opens, then the second time switches to it. |
| 11.7 | Right-click a sheet, Open in New Window. | A second window opens on that sheet; the first is unchanged. |
| 11.8 | Type in one window. | The other window's list updates; editing the same sheet in both raises the conflict dialog on the later save. |
| 11.9 | Trash a sheet that has a tab. | Its tab closes. |
| 11.10 | File > Open Library in one window. | Every window switches. |
| 11.11 | Cmd/Ctrl+W with a single tab. | The window closes. |
| 11.12 | Drag a tab left or right along the bar. | A line shows where it will land; it moves there and the front tab stays in front. |
| 11.13 | Drag a tab off the window onto the desktop. | It becomes a new window near the drop point and leaves the first window's bar. |
| 11.14 | With two windows, drag a tab onto the other window. | It is added there and removed from the first. |
| 11.15 | With three tabs, press Ctrl+Tab, then Ctrl+Shift+Tab (also Ctrl+PageDown/PageUp, and Cmd/Ctrl+Shift+] and [). | The front tab moves to the next, then the previous, wrapping round at the ends. |
| 11.16 | Close a tab with Cmd/Ctrl+W, then press Cmd/Ctrl+Shift+T. | The tab comes back with its sheet; pressing again brings back the one closed before it. |

## 12. Keywords and filters

| # | Do | Expect |
|---|----|--------|
| 12.1 | Select a sheet, Sheet > Keywords… (Cmd/Ctrl+Alt+K), type `plot`, press Return, then Return again. | The dialog closes and the card shows a `plot` chip. |
| 12.2 | Select two sheets and open Keywords…. | The title says "for 2 sheets"; a keyword on only one shows dashed with 1/2. |
| 12.3 | In the dialog, click a keyword under "Used in this library". | It is added to every selected sheet. |
| 12.4 | Click × on a keyword, then Done. | It is removed from the selected sheets. |
| 12.5 | Library > Undo Library Change after a keyword edit. | The keywords go back. |
| 12.6 | Type `#plot` in the sheet filter. | The list shows every sheet in the library with that keyword, each with its group name. |
| 12.7 | Type `#plot dragon`. | Only those with the keyword whose title or preview has "dragon". |
| 12.8 | Click the # button beside the filter and pick a keyword. | `#keyword` is added to the filter; picking again removes it. |
| 12.9 | Click a result in a keyword-filtered list. | The sheet opens and the list stays filtered. |
| 12.10 | Move, duplicate, split, merge or rename a sheet that has keywords. | The keywords follow (merge keeps all of them). |
| 12.11 | Right-click a sheet, Keywords…. | The dialog opens for it. |

## 13. UI consistency

| # | Do | Expect |
| 13.1 | Open Quick Open, Command Palette, Move To, Find in Library, Preferences, Export, Keywords, Clean Up Images (Library > Clean Up Images…). | All look like one family: same corner radius, shadow and dim; buttons borderless with a light tint, the main one in the accent colour. |
| 13.2 | Repeat 13.1 in dark mode (Preferences > Theme > Dark). | Text on the accent colour is readable everywhere; nothing is stuck white or red. |
| 13.3 | In Export, open the Style dropdown. | An in-app list opens under it with "Built in" and "Yours" headings and a tick on the current one. |
| 13.4 | With the dropdown open, press Down, Return. | The next style is chosen. Escape closes only the list, not the dialog. |
| 13.5 | Open a dropdown near the bottom of the window. | It opens above the field instead of off screen. |
| 13.6 | Look at "Page numbers" in Export. | A drawn checkbox (rounded square, accent when ticked), not the system one. |
| 13.7 | Scroll the editor and the sheet list. | Thin rounded scrollbars, the same colour logic in light and dark. |
| 13.8 | Right-click a sheet, a group and the library name. | An in-app menu opens at the pointer with the items for that kind; Paste is dimmed until something is cut or copied. |
| 13.9 | In a menu, press Down twice, then Return; also try Escape and clicking elsewhere. | The highlighted row runs; Escape or a click closes it without acting. |
| 13.10 | Right-click near the right or bottom edge of the window. | The menu is pulled back inside the window. |
| 13.11 | Right-click a misspelled word in the editor. | Up to five suggestions, Add to Dictionary, then Undo, Redo, Cut, Copy, Paste, Select All with shortcuts. **(the real right-click path was not clicked through)** |
| 13.12 | Choose a suggestion, then Cut and Paste from that menu. | The word is replaced; cut and paste act on the editor's selection. |
| 13.13 | Press Tab through a dialog's buttons. | A visible accent ring on the focused button; no ring around the dialog itself. |
| 13.14 | Look at any section label (Preferences, Outline). | Sentence case, not spaced capitals; text is in Inter on every OS. |
| 13.15 | Preferences > Accent colour > the last swatch. | The system colour panel opens (kept on purpose). |

**Subgroup sections (13.16).**

| # | Steps | Expected |
|---|-------|----------|
| 13.16 | Make a group with two sheets, a subgroup with one, and a sub-subgroup with one. Select the outer group. | The list shows the group's own sheets, then a heading with the subgroup's name and its sheet, then `Sub › Subsub` and its sheet. Empty subgroups get no heading. |
| 13.17 | Click a sheet under a heading; use the arrow keys down the list; shift-click to select across two sections. | The sheet opens; arrows cross headings; the range selects across sections. |
| 13.18 | Drag a sheet to another place in its own section; then try dropping it among another section's sheets. | The first reorders; the second shows no drop line. Sorting by title sorts within each section. |

**Click anywhere to write (13.19).** Open an empty sheet and click far below the first line, then in the empty space beside the text: the cursor is in the sheet and typing works. On a long sheet, clicking in the empty space under the last line puts the cursor at the end. Clicking on text still puts the cursor where you click.

**First sheet opens (13.20).** Click a group that has sheets: its first sheet is selected in the list and open in the editor, and the sidebar keeps keyboard focus. Click an empty group: the "no sheet selected" message shows.

## 14. Regression sweep

Quick checks that earlier features still work with today's changes.

- Preferences: every switch changes behaviour at once and is remembered after a restart (Hide Markdown marks, Hang heading marks, Smart punctuation, theme).
- Typing, undo/redo, and autosave ("Saved" indicator) in a sheet with folds and hidden marks on.
- Cmd/Ctrl+Click on an ordinary Markdown link `[text](https://…)` still opens it in the browser.
- Cmd/Ctrl+K inserts a link; the link chip still draws as one box.
- Hide marks, folds, code colours and maths all on together in one long sheet: no flicker or console errors.
- Footnotes, tables, images and task boxes still render and edit.
- Find in the sheet (Cmd/Ctrl+F) and Find in Library (Cmd/Ctrl+Shift+F) still work.
- Export (Cmd/Ctrl+E) of a sheet with wiki links: the links come out as plain text and nothing breaks.
- Open a very large sheet (5,000+ lines) with folds on: scrolling stays smooth.
- Try on the other platforms you use (Windows/Linux): the Fold menu and shortcuts, since only macOS was checked.


## 13.21 Find bar

1. Click the magnifier. A bar opens above the editor with "Look in sheet", a box, Aa / ab / .* and a close button.
2. Type a word in the open sheet. The box shows "1 of N", matches are marked, the first is selected. Enter and the arrows step through; Shift+Enter goes back; the count wraps.
3. Pick "Look in project" (or group, library). The count covers every sheet; stepping past the last match in a sheet opens the next sheet.
4. Click the chevron. A Replace box, Replace and Replace All appear. Replace changes the current match and moves on. Replace All in a sheet can be undone with Cmd/Ctrl+Z in the editor; in a group or project it reports the count and File > Undo Library Change restores it.
5. Select text in the editor and press Cmd/Ctrl+F: the bar opens with it as the query. Escape closes the bar and returns to the editor.
6. A bad pattern with .* on shows "Invalid" instead of a count.

## 13.22 Table of contents

1. In a sheet type a heading, then a line with only `(cnt)`, then a few headings (`#`, `##`) below it. Move the cursor off the `(cnt)` line: it shows as a "Table of Contents" chip. Move onto it: the text `(cnt)` returns.
2. Export as HTML (or preview it). Where `(cnt)` was is a nested list of the later headings; clicking an entry jumps to that heading.
3. Export as Markdown: the same list appears with each entry linking to its heading (`[Title](#title)`), and `(cnt)` is gone. Open it in a Markdown viewer and click an entry, including one with accents.
4. Select several sheets or a group and export: the list covers headings from all of them that come after the marker.
5. Put the cursor in a sheet and choose Insert > Table of Contents: `(cnt)` appears on its own line with a blank line either side. Choosing it on a `(cnt)` line does nothing.
6. Export as PDF a group with several long sheets and a `(cnt)` sheet first. Each entry has a dotted line and a page number; go to that page: the heading is on it. Turning page numbers off in the dialog does not remove them from the contents.
7. Export as Word and open it in Word: it asks whether to update fields; say Yes. The contents shows headings with page numbers. Right-click > Update Field refreshes it after edits.

## 13.23 Shortcuts in the menus

1. Format > Toggle Task with the cursor on `- [ ] item` ticks it; again unticks it. Elsewhere it says to put the cursor on a task.
2. Fold > Go to Next Heading and Go to Previous Heading move the cursor between headings.
3. File > Find and Replace… opens the Find bar on the sheet with the Replace row showing.
4. Open the command palette (Cmd/Ctrl+Shift+P) and type "paste", "heading", "task" or "replace": each command appears with its shortcut. Copy Sheets then Paste Sheets duplicates the selected sheet.

## 13.24 Undo create and rename

1. Make a new sheet, then File > Undo Library Change: it disappears and the order is as before. Make another, type in it, then undo: a message says it has text and it stays.
2. Make a new group or project, then undo: it is gone.
3. Rename a group, then undo: the old name and position return.

## 13.25 EPUB export

1. Select a group with several sheets, open Export, choose EPUB under Format. Options shows title, author, language and Cover….
2. Fill in a title and author, pick a cover picture, and Export as EPUB….
3. Run `epubcheck` on the file if you have it: no errors expected.
4. Open it in Apple Books (or another reader): the cover shows, the contents list the headings, each sheet starts a new chapter, pictures and tables show, and the style you chose is applied. Footnotes jump to their notes.

## 13.26 Export extras

1. Export, choose PDF. Tick Number chapters, Title page (fill title and author) and Title in the top margin. The preview shows a title page and numbered headings. Export: page 1 is the title page, headings read "1. …", each page has the title at the top. A table of contents (if any) still shows the right page numbers.
2. Make a style with `@page { size: 6in 9in; margin: 0.8in }`, export as PDF: the pages are 6 by 9 inches whatever the dialog says.
3. Number chapters also works for HTML and EPUB; Title page for HTML.

## 13.27 Dropdowns in dialog headers (macOS)

1. Open Export (PDF). Click the Margins picker: the list opens below it, the same height as the Page size picker beside it.
2. Click an option: it is chosen and the list closes. Open it again and click outside it (on the preview or the title): the list closes and the dialog responds as normal.
3. Press Escape with the list open: the list closes first; Escape again closes the dialog.
4. Repeat for the Page size, Margins, Language and Style pickers. None of them leaves the dialog unresponsive or drags the window.

## 13.28 Find: patterns that could freeze

1. Open Find (⌘F) and turn on the regular-expression toggle (`.*`). Type `(a+)+$`. The bar says the pattern repeats a repeat and that it can freeze the app; the app stays responsive. Try it in both the sheet and library scopes.
2. Type `(\w+\s?)+$` and `([a-z]+)*`: the same message.
3. Ordinary patterns still work: `(foo|bar)+`, `^#+ `, `(\d+)-(\d+)`, `Chapter \d+`. Replace All with `$1` still expands.

## 13.29 Recovery when the sheet is gone

1. Type in a sheet, then quit the app abruptly (force quit) within a second of typing, before it saves. While it is closed, delete or rename that sheet in Finder.
2. Reopen the app. A dialog says the sheet "has since been deleted, renamed or moved" and shows the recovered text alone.
3. "Restore as a sheet" makes the sheet again in its old folder (or at the top of the library if the folder is gone), with a different name if that one is taken, and says where it went. "Throw it away" discards the text.

## 13.30 Closing right after typing

1. Type a few words and press ⌘W (or click the red close button, or press ⌘Q) within a fraction of a second. Reopen the app: the words are there, and no recovery dialog appears.
2. With two windows open and unsaved typing in both, press ⌘Q: both save, both close, the app quits.
3. Make the save fail (put the library on a disk image and eject it, or make the folder read-only), type, then close. The window closes within a few seconds, and the next launch offers the text back in the recovery dialog.

## 13.31 Unreadable and enormous files

1. In a library folder, add a file you cannot read (`chmod 000 locked.md`) and a very large one (`head -c 60000000 /dev/zero | tr '\0' a > huge.md`). The library still loads. The locked file is listed under its file name with no preview; the huge one says "Too large to preview".
2. Opening the huge file shows an error saying it is too large; the app stays responsive. Find in Library and Replace All skip both files and still work on the rest.
3. `chmod 644` the locked file: it shows its real title and text after the library reloads.

## 13.32 Find: more slow patterns

1. With the regular-expression toggle on, type `(a|aa)+$` and `(\w|\d)+x`: the bar says the pattern could take far too long; the app stays responsive.
2. Type `.*a.*b.*c.*d`: the same message. `.*a.*b` and `(foo|bar)+` still work.

## 13.33 A crashed window comes back

1. Start the app, then in a terminal kill its renderer process (Activity Monitor → the "WritingApp Helper (Renderer)" process → Force Quit). The window reloads by itself within a second or two and shows the library again.
2. If you had typed just before, the text is offered back by the recovery dialog.
3. Killing the renderer three times within a minute shows "This window keeps crashing" instead of reloading again.
4. `errors.log` in the app's data folder (`~/Library/Application Support/WritingApp`) has a line for each crash.

## 13.34 Split and merge never half-finish

1. Make a sheet's folder read-only mid-way is hard to do by hand, so this is covered by automated tests: a failure while splitting leaves the original sheet whole and no new sheet; a failure while merging leaves every sheet as it was.
2. Check the normal case still works: split a sheet at the cursor, merge two sheets, and undo each.

## 13.35 Settings survive a crash; the watcher recovers

1. Settings and export styles are written through a temporary file (automated tests). Change the sidebar width, force quit at once, reopen: the setting is either old or new, never lost, and recent libraries are intact.
2. After changing a file in the library from another app, the library updates by itself. This keeps working after a long session or after the disk was briefly unavailable (automated tests simulate the watcher failing and restarting).

## 13.36 Import skips enormous files; settings updates do not collide

1. Make a very large text file (`head -c 60000000 /dev/zero | tr '\0' a > ~/Desktop/big.txt`) and a small one. Import both (File → Import). The small one appears as a sheet; the message lists `big.txt` as skipped. The app stays responsive.
2. With two windows open, change the font size in one and the theme in the other in quick succession, then quit and reopen: both changes are kept.

## 13.37 Autosave and save status settings

1. Open Preferences ▸ Saving: a Save choice (While typing, or When I switch or close) and a Show save status switch. The defaults are While typing, and on.
2. Choose When I switch or close. Type in a sheet and wait several seconds: the toolbar says "Unsaved" and the file on disk does not change (check in Finder or a text editor). Click out of the editor: still unsaved.
3. Press ⌘S (File ▸ Save): the toolbar says "Saved" and the file has the text. Type more, then switch to another sheet, and back: the text is kept, and the file has it (switching saves). Type, then close the window: the text is saved, with no prompt.
4. Type in the "When I switch or close" mode, then choose While typing: the waiting text is saved at once.
5. In the "When I switch or close" mode, force quit within a second of typing: the next launch offers the text back (the journal still keeps it).
6. Turn Show save status off: the Saved / Saving note disappears from the toolbar. Make a save fail (read-only folder): "Could not save" still appears.
7. Both settings are kept after quitting and reopening.

## 13.38 Tabbed Preferences

1. Open Preferences: five tabs, General, Appearance, Editor, Writing and Saving, with General first on a fresh install. The dialog stays the same size as you change tabs; a tab with many settings scrolls inside it.
2. Click each tab: its settings appear and every switch, picker and stepper still works.
3. With a tab focused, the Left and Right arrow keys move to the previous or next tab. Escape closes the dialog.
4. Choose Editor, close Preferences, reopen it: it opens on Editor. Quit and reopen the app: still Editor.

## 13.39 Saving only when I ask (manual mode)

1. Preferences ▸ Saving ▸ Save: choose "Only when I save".
2. Type in a sheet and wait: the file does not change, the toolbar says "Unsaved" (the tab dot appears once a second tab is open).
3. Click another sheet in the list: it opens in a new tab beside the first, and the first tab keeps its dot. Click the first tab again: your typing is still there, and the file on disk still has the old text.
4. Click a sheet while the front tab has no changes: it replaces the front tab, as usual (no pile of tabs). Click a sheet that already has a tab: that tab comes to the front.
5. ⌘S (File ▸ Save) saves the sheet in front (and the sheets glued to it); other tabs keep their dots. File ▸ Save All (⌘⌥S) saves every tab.
6. Close a tab with a dot (the ×, ⌘W or a middle-click): "Do you want to save the changes to…?" with Don't Save, Cancel and Save. Cancel keeps the tab. Save saves it, then closes. Don't Save closes it and the typing is gone (the file is unchanged, and it is not offered back at the next launch).
7. With changes in two tabs, close the window (red button or ⌘W on the last tab): the question lists both sheets, with Save All. The dialog stays up as long as you like. Cancel keeps the window open; Save All saves and closes; Don't Save closes and drops the changes.
8. ⌘Q with unsaved changes in manual mode asks the same question; Cancel cancels the quit.
9. Choose Library… with unsaved changes asks first.
10. Make a save fail (read-only folder) and choose Save: the window or tab stays open, with the message "Could not save, so nothing was closed."
11. Drag a tab with a dot onto another window, or off the window: it does not move (its text lives in this window). A tab without a dot still moves.
12. Force quit with unsaved changes: the next launch offers the text back (recovery) as usual.
13. Switch back to "While typing": the unsaved text is saved at once and the dots go.

Known limits: operations that rewrite sheets on disk (merge, split, move, Replace All in the library, export) still save outstanding changes first; renaming sheets to match their titles waits until nothing has unsaved text; File ▸ Open Library chosen while changes are unsaved cannot ask afterwards (the app has already switched), so it relies on recovery at the next launch.

## 13.40 Names with special characters

1. Right-click a group ▸ Rename, type `Act I: Why? Because` and press Return. The list and the sheet-list heading show exactly that; in Finder the folder is `Act I Why Because` (the characters `/ \ : * ? " < > |` are left out, case and spaces stay).
2. Quit and reopen the app: the group still shows `Act I: Why? Because`. Rename the folder in Finder: the group now shows the new folder name (the typed name no longer applies).
3. Rename a group to a plain name such as `Act One`: the typed name is cleared and the folder name is shown. Rename it again to the same text: nothing changes and no undo step is added.
4. Rename a group to `Notes?` when a `Notes` folder already exists: the folder becomes `Notes 2` and the group shows `Notes?`. Typing exactly `Notes` instead says it already exists.
5. Undo (Edit ▸ Undo) after renaming: the old folder name and the old display name return.
6. Give a sheet the first line `# Why: is it so?`, then leave it: the file is renamed `Why is it so.md` (readable, capitals and spaces kept; the title in the list keeps its `:` and `?`). A second sheet with the same title becomes `Why is it so 2.md`.
7. Existing sheets named the old way (`the-station.md`) are not renamed just because of this change.
8. Quick Open, the Move picker and Find results show group names as typed.

## 16. Coverage sweep: first launch, menus and Preferences

Added after an audit found features with no script: the folder chooser and Close Library, Reset preferences, the Appearance, Editor and Writing settings, the Format menu, Daily Note and templates, Quick Open and the command palette, the outline, and the error log. These steps were written from the menus and code, not yet run, so a step that does not match what you see may be a wrong script as much as a bug. Use the test library from the Setup section. For a first-launch test, rename the settings folder first (`~/Library/Application Support/@writingapp/desktop` on macOS) and put it back afterwards.

### 16.1 First launch, Close Library and Open Recent

| # | Do | Expect |
|---|----|--------|
| 16.1.1 | With no settings folder, start the app. | The "choose a folder" screen shows, not a library. |
| 16.1.2 | Choose the test library. | It opens. Quit and start again: it opens again without asking. |
| 16.1.3 | File > Close Library. | The folder chooser shows in every open window; no sheet or tab is left. |
| 16.1.4 | Quit and start again after closing. | The folder chooser shows. The library is not reopened. |
| 16.1.5 | File > Open Recent. | The closed library is listed. Choosing it opens it again. |
| 16.1.6 | Type in a sheet, then File > Close Library (in "Only when I save" mode). | It asks "Do you want to save the changes…?" first. Cancel keeps the library open. |
| 16.1.7 | File > Open Recent > Clear Menu. | The list empties. The open library stays open. |
| 16.1.8 | Open Recent, choose a library whose folder you have renamed. | An error says the folder could not be read, and it is dropped from the list. |

### 16.2 Preferences: Appearance

| # | Do | Expect |
|---|----|--------|
| 16.2.1 | Theme: Light, Dark, then Match system. | The whole window follows each; Match system follows the computer's setting. |
| 16.2.2 | Pick each accent colour, then the custom colour picker. | Buttons, selection and the sheet-card highlight change. Text on a light accent stays readable. |
| 16.2.3 | Colour theme: choose one, then None; Open folder. | The colours change and revert. The folder opens in Finder; a theme file added there shows after reopening Preferences. |
| 16.2.4 | System font, then System text size − and +. | Lists, menus and dialogs change font and size; the editor text does not. |
| 16.2.5 | Turn off Sheet count in groups. | The numbers beside the groups disappear; on again, they return. |

### 16.3 Preferences: Editor and Writing

| # | Do | Expect |
|---|----|--------|
| 16.3.1 | Editor font: Follow System Font, a bundled font, an installed font. Then Text size − and +. | The editor changes font and size at once, and the choice is kept after a restart. |
| 16.3.2 | Text column: Compact through Full. | The text column narrows and widens. |
| 16.3.3 | Line spacing − and +. Space between paragraphs: Compact, Normal, Airy. | The editor's spacing follows. |
| 16.3.4 | Turn on Indent paragraphs. | Paragraphs are indented, the gaps close, and the Space between paragraphs choice disappears. Export to HTML: the indent shows there too. |
| 16.3.5 | Hang heading marks on and off. | The # sits in the margin, or in the line. |
| 16.3.6 | Hide Markdown marks on and off. | ** and # hide except on the line being edited. |
| 16.3.7 | Alignment: Left, Justified. Cursor width: Thin to Thick. Highlight current line: Off, Subtle. | Each shows in the editor. |
| 16.3.8 | Choosing a sheet opens it in: This tab, A new tab, A new window. | Clicking a sheet does each; the grey note under the heading changes with the choice. |
| 16.3.9 | Focus mode on; Focus on: Line, Sentence, Paragraph; Fade the rest: Light to Strong. | Everything but the chosen part dims by the chosen amount. |
| 16.3.10 | Typewriter scrolling on; Typewriter line sits: Middle, Upper third. | The line being written stays at that height. |
| 16.3.11 | Scroll past the end on and off. | There is, or is not, room below the last line. |
| 16.3.12 | Smart punctuation on; type `"hi"`, `--` and `...`. | Curly quotes, a dash and … appear. Off: they stay as typed. |
| 16.3.13 | Line numbers on and off (also View > Line Numbers). | Numbers show beside each line, or not. |

### 16.4 Reset all preferences

| # | Do | Expect |
|---|----|--------|
| 16.4.1 | Change the theme, accent, text size and Save mode. Open Preferences, press Reset all preferences… (bottom left). | A question: "Reset all preferences?", saying nothing in the library is touched. Focus is in the dialog. |
| 16.4.2 | Press Cancel, or Escape. | The question closes. Preferences stay open and nothing changed. |
| 16.4.3 | Press Reset all preferences… then Reset Preferences. | Every setting is back to its default, on every tab. The sidebar, sheet list and outline stay as you arranged them. |
| 16.4.4 | Quit and start again. | The defaults are still in force. The library and sheets are unchanged. |

### 16.5 Format and Insert menus

| # | Do | Expect |
|---|----|--------|
| 16.5.1 | Format > Heading 1, 2, 3, then Body Text, on a line. | The line gets #, ##, ### and then plain text. |
| 16.5.2 | Format > Quote, Bulleted List, Numbered List, Task List. | The line gets the matching prefix; choosing it again takes it off. |
| 16.5.3 | Select a word; Format > Bold, Italic, Strikethrough, Highlight, Inline Code. | The word is wrapped in the marks; choosing again unwraps it. Cmd/Ctrl+B and I do the same. |
| 16.5.4 | Format > Link (Cmd/Ctrl+K), Code Block, Comment (Cmd/Ctrl+/), Horizontal Rule. | Each inserts or wraps correctly. A comment does not appear in an export. |
| 16.5.5 | Format > Toggle Task (Cmd/Ctrl+Return) on a `- [ ]` line. | It ticks, then unticks. |
| 16.5.6 | Insert > Table, Image…, Footnote, Table of Contents; Go to Footnote. | Each inserts; Go to Footnote jumps between the mark and its note. |
| 16.5.7 | Fold menu: Fold Section, Unfold Section, Fold All, Unfold All, Go to Previous/Next Heading. | Each does what it says. |

### 16.6 Sheets, templates and finding things

| # | Do | Expect |
|---|----|--------|
| 16.6.1 | File > Daily Note (Cmd/Ctrl+Alt+D) twice. | A sheet for today is made, then the second time opens that same sheet. |
| 16.6.2 | Save Sheet as Template; then New Sheet from Template…. | The template is offered, and a new sheet is made from it. |
| 16.6.3 | Select two sheets; Sheet > Merge Sheets, then Undo Library Change. | They join, then separate again. |
| 16.6.4 | Put the cursor mid-sheet; Sheet > Split at Cursor, then Undo Library Change. | The sheet becomes two, then one. |
| 16.6.5 | Sheet > Glue Sheets on two neighbours; then Unglue. | They read as one run (a bar along the edge), then separate. |
| 16.6.6 | Duplicate; then Move to Trash on the copy. | A copy appears; then it is removed, and it is in the computer's trash. |
| 16.6.7 | Cmd/Ctrl+P and type part of a sheet's name. | Matching sheets are listed; Return opens one. Escape closes the box. |
| 16.6.8 | Cmd/Ctrl+Shift+P and type `export`. | The commands are listed with their shortcuts; Return runs one. |
| 16.6.9 | Cmd/Ctrl+Shift+F, search for a word. | Every sheet that has it is listed; clicking a result opens the sheet at that place. |
| 16.6.10 | Show the outline (View) in a sheet with headings; click a heading. | The editor jumps to it. |
| 16.6.11 | The sheet list's sort button: choose each order. | The list re-orders; Manual puts it back. |

### 16.7 Window, View and Help

| # | Do | Expect |
|---|----|--------|
| 16.7.1 | View > Distraction-Free Mode, then again. | The sidebar and sheet list hide, then return. |
| 16.7.2 | View > Larger Text, Smaller Text, Default Text Size. | The editor size follows; Default returns it. |
| 16.7.3 | View > Toggle Sidebar, Toggle Sheet List. | Each hides and shows. |
| 16.7.4 | Close Window (Cmd/Ctrl+Shift+W) with two windows open. | Only that window closes. |
| 16.7.5 | Help > Show Error Log. | The log opens (or says there are no errors). |

### 16.8 General settings, and the newer Editor, Writing and Saving ones

| # | Do | Expect |
|---|----|--------|
| 16.8.1 | Preferences ▸ General ▸ When the app starts: Ask me. Quit and start again. | The folder chooser shows. Choosing a folder opens it; a second window (File > New Window) then opens that library, not the chooser. |
| 16.8.2 | Set it to Open the last library; quit and start again. | The library opens by itself, as before. |
| 16.8.3 | Turn on Confirm before moving to the trash. Select a sheet and press Cmd/Ctrl+Alt+Backspace. | "Move “name” to the trash?" with Cancel and Move to Trash. Cancel changes nothing; Escape also cancels. |
| 16.8.4 | Choose Move to Trash. Then select three sheets and do it again. | The sheet goes and the notice says how to undo. The second question says "Move 3 items to the trash?". Right-click ▸ Move to Trash asks too. Undo Library Change brings them back. |
| 16.8.5 | Turn the setting off. | Deleting needs no question, as before. |
| 16.8.6 | Turn off Word count. | The word-count pill leaves the corner of the editor; on again, it returns. |
| 16.8.7 | Editor ▸ Alignment Justified: the Hyphenate switch shows. Turn it on in a narrow column with long words. | Long words break with a hyphen at line ends and the gaps between words even out. Choose Left alignment: the Hyphenate switch disappears. |
| 16.8.8 | Writing ▸ Close brackets and quotes off; type `(` at the end of a line. | Only `(` appears. On: `()` appears with the cursor between. Selecting a word and typing `(` still wraps it when on. |
| 16.8.9 | Saving ▸ with While typing chosen, set Save after you stop typing for: Quick, Normal, Relaxed. Type and watch the toolbar. | "Unsaved" turns to "Saved" after about 0.3 s, under a second, or about 3 s. The choice is not offered in the other two save modes. |

## 17. Core workflows: the everyday paths

Added after a second audit that compared this file with the CHANGELOG, ARCHITECTURE, WORKFLOWS and ROADMAP. Sections 1 to 13 test the features added late; the basics a writer meets first (browsing, creating, organising, writing, sheet operations, export, outside changes) had no script of their own. Steps are written from the documented behaviour and have not all been run; where a step differs from what you see, check the CHANGELOG item named in brackets before filing a bug. Use the test library from the Setup section.

### 17.1 Opening and browsing a library [milestone 3, L1 to L10]

| # | Do | Expect |
|---|----|--------|
| 17.1.1 | Open a library folder holding projects, nested groups and `.md` files. | Three panes: the library tree, the sheet list (cards with a title and the first lines) and the editor. Folders are projects and groups; `.md` files are sheets. |
| 17.1.2 | Put a `notes.txt`, a `photo.png` and a `.hidden.md` file in a group. | None of them shows. Only folders and `.md` files appear. |
| 17.1.3 | Click a group, then a sheet. | The sheet's text shows in the editor. A group with sheets opens its first sheet by itself. |
| 17.1.4 | Click the library name at the top of the sidebar. | The root is selected and lists its own sheets. |
| 17.1.5 | Look at each group row. | An icon for projects and for groups, a chevron on groups with children, and a sheet-count badge (Preferences ▸ Appearance ▸ Sheet count in groups turns it off). |
| 17.1.6 | Type part of a title in the Filter box above the sheet list. | The list narrows to matching sheets; clearing it restores the list. Choosing another group clears the filter. |
| 17.1.7 | Click a few sheets, then the back and forward arrows in the editor's toolbar. | The arrows step through the sheets visited, and are dim when there is nowhere to go. |
| 17.1.8 | Hover a group or project row and click its colour button (tooltip "Colour"), then pick a swatch; try "No colour". | A row of swatches opens under it; the folder icon takes the colour, and "No colour" clears it. It is still there after a restart and is kept in the folder's `.writingapp.json`. [L8] |
| 17.1.9 | Hide the sidebar (View > Toggle Sidebar, Cmd/Ctrl+\, or its button), then move the pointer to the window's left edge. | The sidebar hides and the editor widens. At the left edge the sidebar slides in over the editor and goes when the pointer leaves. The state is kept after a restart. [item 9] |
| 17.1.10 | View > Toggle Sheet List. | The sheet list hides and shows; the editor widens. |
| 17.1.11 | Rename a folder outside the app, add a file, delete a file. | The tree and list update by themselves. An open sheet that was not edited reloads quietly. [milestone 9] |
| 17.1.12 | Delete a folder's `.writingapp.json` in Finder, then edit the folder. | Nothing breaks: sheets list in name order, and the sidecar is made again. A damaged sidecar (not valid JSON) is also survived. |
| 17.1.13 | Quit and start again. | The same library and the same sheet come back (without stealing the keyboard focus). [item 12] |

### 17.2 Creating, renaming, moving and the keyboard [milestone 5, items 16, 17]

| # | Do | Expect |
|---|----|--------|
| 17.2.1 | Cmd/Ctrl+N. | A new sheet appears in the selected group and is selected, with the cursor in the editor. Titled "Untitled" until you type a first line. |
| 17.2.2 | Cmd/Ctrl+Shift+N, then type a name and press Return. | A new group in the selected group, with its name open for editing. Cmd/Ctrl+Alt+Shift+N makes a project at the top level. |
| 17.2.3 | Type a first line `# The Station` in a new sheet and click away. | The sheet's file becomes `The Station.md`; the card title is "The Station". Two sheets with the same title get `The Station 2.md`. |
| 17.2.4 | Focus the tree with Cmd/Ctrl+1, the sheet list with 2, the editor with 3. | The keyboard focus moves to each pane. Escape in the editor returns to the sheet list. |
| 17.2.5 | In the tree: Up/Down, Left/Right (collapse/expand), Return or F2. | The selection moves, groups open and close, and Return or F2 opens the rename box. |
| 17.2.6 | In the tree, Alt+Up / Alt+Down on a group. | The group moves up or down among its siblings; Undo Library Change moves it back. |
| 17.2.7 | In the sheet list: Up/Down, Shift+Up/Down, Home, End, Cmd/Ctrl+A. | The selection moves and extends; Home and End jump to the ends; Cmd/Ctrl+A selects every sheet in the list. |
| 17.2.8 | With sheets selected, Alt+Up / Alt+Down. | The selection moves up or down together, in the saved order. |
| 17.2.9 | Select a sheet; Cmd/Ctrl+Shift+M, type a group name, Return. | "Move to" lists the groups, narrows as you type, and the sheet moves there. The library and the sheet list follow. |
| 17.2.10 | Select two groups' worth of sheets with Shift+click across sections. | The range selects across the section headings. |
| 17.2.11 | Drag a sheet into a group row, and a group into another group. | The sheet moves; the group moves with its sheets. Dropping a group into itself or its own child is refused. One undo reverses it. |
| 17.2.12 | Restructure a project (new group, move three sheets in, reorder, rename) without touching the mouse. | It can be done; that is the milestone's "done when". [milestone 5] |
| 17.2.13 | Rename a group to the name of a sibling. | It says the name is taken (or adds a number) and nothing is lost. |

### 17.3 Right-click, clipboard and Finder [items 17, 43, 81]

| # | Do | Expect |
|---|----|--------|
| 17.3.1 | Right-click a sheet. | New Sheet, New Group, Open in New Tab, Open in New Window, Keywords…, Duplicate, Cut, Copy, Paste (dimmed until something is cut or copied), Move to…, Move to Trash, Reveal in Finder (Show in File Manager on Windows and Linux) and Copy Path. There is no Rename for a sheet: its title is its first line. |
| 17.3.2 | Copy Path, then paste into any text box. | The sheet's full file path. |
| 17.3.3 | Reveal in Finder. | Finder opens with the file selected. |
| 17.3.4 | Select a sheet; Cmd/Ctrl+C, click another group, Cmd/Ctrl+V. | A copy lands there. The original stays. One Undo Library Change removes the copy. |
| 17.3.5 | Cut with Cmd/Ctrl+X, then paste in another group. | The sheet moves. Cutting then pasting a group into itself is refused. |
| 17.3.6 | Cmd/Ctrl+D on a sheet in the list. | A duplicate appears next to it (the editor keeps Cmd/Ctrl+D for itself). |
| 17.3.7 | Right-click a group, then the library name. | Group: the same list plus Rename. Library name: New Sheet, New Group, Paste, Reveal and Copy Path. |

### 17.4 Writing basics [milestone 4, items 4 to 7, 33 to 36, 46, 52]

Use a scratch sheet.

| # | Do | Expect |
|---|----|--------|
| 17.4.1 | Type `- one`, Return, `two`, Return, Return. | Return continues the bullet; Return on an empty bullet ends the list. Same for `1. ` (numbers count up) and for `> ` quotes and `- [ ] ` tasks. |
| 17.4.2 | In a list, Tab and Shift+Tab (also with several lines selected). | The item (or lines) indent and outdent by four spaces under both bullets and numbers. Backspace at the start of an item removes its marker. |
| 17.4.3 | Select a word; Cmd/Ctrl+B, Cmd/Ctrl+I; again. | It is wrapped in `**` / `*`, and unwrapped the second time. The toolbar's Bold and Italic do the same and keep the selection. |
| 17.4.4 | Type `*` then text, then `*`. Also `**`, and `_`. At a line start type `* ` for a bullet. | The closing mark is inserted and typing it steps over it. A bullet `* ` does not auto-close. Backspace on an empty pair removes both. |
| 17.4.5 | Select text and type `(`, `[`, `` ` `` or `"`. | The selection is wrapped. Typing `"` straight after a word (`5"`, `don`t`) does not open a pair. |
| 17.4.6 | Select text and paste a URL. | The text becomes `[text](url)`. |
| 17.4.7 | Select text; Cmd/Ctrl+K. | `[text](url)` with the `url` selected, ready to type over. |
| 17.4.8 | Copy a formatted paragraph from a web page or Word and paste. | It arrives as Markdown (headings, bold, links, lists). Cmd/Ctrl+Shift+V pastes plain text instead. |
| 17.4.9 | Format > Strikethrough, Highlight (`==`), Inline Code, Code Block, Quote, Horizontal Rule on a line. | The marks go on, and off again when repeated. A rule draws as a dashed line. |
| 17.4.10 | Click the Aa button in the editor header. | A popover offers styles, lists and inline marks; each acts on the cursor or selection. |
| 17.4.11 | Press Alt+Up / Alt+Down on a line in the editor. | The line moves up or down. |
| 17.4.12 | Type `- [ ] item`; click the box; press Cmd/Ctrl+Return on it. | The box draws as a checkbox; clicking ticks and unticks it in the text (`[x]`); Cmd/Ctrl+Return toggles the item at the cursor. |
| 17.4.13 | Cmd/Ctrl+/ on a line and on a selection. | `<!-- … -->` wraps it and it is dimmed. A comment does not appear in HTML or PDF export, is not counted in the word count, but Find still finds it. A comment inside a code fence stays as code. [item 13] |
| 17.4.14 | Insert > Footnote; type its note; click the `[^1]` chip. | The chip opens the note in an editable popover; the definition is hidden from the text, previews and word count; the export numbers it. Insert > Go to Footnote moves between mark and note. [item 20] |
| 17.4.15 | Insert > Table; edit a cell; Tab through cells; add and delete rows and columns; change a column's alignment. | The table is an editable grid. Clicking into it shows its Markdown; the saved Markdown is clean. Undo works. [item 28] |
| 17.4.16 | Cmd/Ctrl+Alt+Up and Down in a sheet with headings. | The cursor moves to the previous and next heading; the outline marks the current one. |
| 17.4.17 | Right-click a misspelled word. | Spelling suggestions appear and Add to Dictionary. The red wavy underline shows on misspellings. |
| 17.4.18 | Type `Wait -- really...` with Smart punctuation on, inside text, a code span and a comment. | Outside code and comments: an en or em dash and a real ellipsis. Inside code and comments they stay as typed. |
| 17.4.19 | Write a full sheet (a few hundred words with headings, lists, a quote). | It feels unremarkable: no lag, no stray marks, undo and redo behave. [milestone 4] |
| 17.4.20 | Use Preferences ▸ Editor ▸ Indent paragraphs with a sheet of paragraphs. | Paragraphs indent and the gaps close, except the first after a heading, lists and quotes. The file's text is unchanged. |

### 17.5 Word count, outline, templates and sorting [items 3, 14, 47, 48]

| # | Do | Expect |
|---|----|--------|
| 17.5.1 | Look at the pill in the editor's corner; select some text. | "N words"; with a selection, "n of N words selected". Hovering shows characters with spaces, minutes to read and the group's total. Folding does not change it. |
| 17.5.2 | Type a comment `<!-- x -->` and a footnote definition. | They do not add to the count. |
| 17.5.3 | Show the outline (View > Show Outline, Cmd/Ctrl+Alt+O, or the toolbar button). | Headings of the open sheet are listed, indented by level; clicking one moves the cursor there. Headings in code and comments are skipped. The panel's state is kept. |
| 17.5.4 | Sort button in the sheet list header: Manual, Title, Modified, Created, Words. | The list re-orders each way within each section; Modified, Created and Words also show the value on each card. Dragging to reorder is off while sorted; Manual restores your saved order. |
| 17.5.5 | Save Sheet as Template; File > New Sheet from Template…; open the Command Palette and type the template's name. | The template is listed in both; the new sheet has its text. `{{date}}`, `{{time}}` and `{{weekday}}` in the template are filled in. Templates live in a hidden `.templates` group that the tree does not show. |
| 17.5.6 | Make a template titled "Daily Note" with `{{date}}`; File > Daily Note. | Today's sheet is made from it; running it again the same day opens the same sheet. |

### 17.6 Sheet operations [milestone 6]

| # | Do | Expect |
|---|----|--------|
| 17.6.1 | Put the cursor mid-sheet; Cmd/Ctrl+Shift+Return (Sheet > Split at Cursor). | Two sheets: the text before stays, the tail becomes the next sheet. Both are on disk. |
| 17.6.2 | Select three sheets; Cmd/Ctrl+Shift+J (Merge). | One sheet in the first position of display order, the texts joined with a blank line; the others are in the trash. |
| 17.6.3 | Select two or more neighbours; Cmd/Ctrl+Shift+G (Glue). | The cards show an accent bar joining them. In the editor they read as one continuous document: arrow keys cross from one to the next. A text selection cannot span two sheets. |
| 17.6.4 | Select a sheet in a glued run; Cmd/Ctrl+Alt+G (Unglue). | It detaches from its neighbours on both sides. |
| 17.6.5 | Export a glued run with one sheet selected. | The whole run exports as one flowing document. |
| 17.6.6 | Do split, merge, glue, move and delete one after another; then Cmd/Ctrl+Alt+Z repeatedly. | Each is undone in reverse order, up to 20 steps. Plain Cmd/Ctrl+Z still undoes typing, not these. Opening another library clears the stack. |
| 17.6.7 | Split a sheet that was glued to the one after it. | The tail inherits the glue to what follows. |
| 17.6.8 | Delete a group (Cmd/Ctrl+Alt+Backspace with the tree focused) then undo. | The group and its sheets are back; the group is in the system trash meanwhile. |

### 17.7 Export, the basic paths [milestones 7 and 8, items 58, 69]

| # | Do | Expect |
|---|----|--------|
| 17.7.1 | Select one sheet; Cmd/Ctrl+E; choose HTML; Export as HTML…. | A preview shows first (a sandboxed page; scripts do not run). The saved file opens alone in a browser with its styling. |
| 17.7.2 | Select several sheets, then export. | One document, in library order, with a `* * *` break between unglued sheets and none inside a glued run. |
| 17.7.3 | With the tree focused, export. | The whole selected group exports. |
| 17.7.4 | Put raw HTML such as `<script>alert(1)</script>` in a sheet and export. | It shows as text; nothing runs. |
| 17.7.5 | Export as PDF; open it. | Paginated, black on white even in dark mode, headings kept with their text, page numbers "n / total" in the footer. A4 and Letter differ. |
| 17.7.6 | Export as Markdown. | A single `.md` file; pictures go in a `-images` folder beside it. |
| 17.7.7 | Export a sheet with a comment, a footnote, a task list, a table, highlight, strikethrough and a code block. | The comment is gone; the footnote is numbered; the others render. |
| 17.7.8 | Cancel each save dialog. | Nothing is written and the dialog closes cleanly. |
| 17.7.9 | Export with Indent paragraphs on. | The HTML and PDF are indented too. |

### 17.8 Find in Library, outside changes and undo [milestone 9, items 49, 54]

| # | Do | Expect |
|---|----|--------|
| 17.8.1 | Cmd/Ctrl+Shift+F; type a word. | Matching sheets, in library order, with a snippet each; case does not matter by default; the first 50 sheets are searched. Clicking a result opens that sheet at the match. |
| 17.8.2 | Type a replacement; Replace in this sheet; Replace All. | The snippets preview the change; unsaved edits are saved first; one Undo Library Change reverses a Replace All. |
| 17.8.3 | Edit an open, unedited sheet in another editor and save. | The sheet in the app updates quietly. |
| 17.8.4 | Type in an open sheet in the app, then change the same file outside, then type again. | The save raises the "changed outside the app" dialog with both versions. |
| 17.8.5 | Delete the open sheet's file outside the app. | The sheet leaves the list; the editor empties; nothing crashes. |
| 17.8.6 | Move a project out of the library folder and back. | The library follows both changes. |

### 17.9 Themes, accent and look [items 8, 38, 50, 60]

| # | Do | Expect |
|---|----|--------|
| 17.9.1 | Open Preferences ▸ Appearance ▸ Colour theme ▸ Open folder; add a JSON file with a few colour tokens (see the other themes); reopen Preferences. | The theme is listed and changes the colours when chosen. A broken file is ignored, not fatal. |
| 17.9.2 | View > Theme: Light, Dark, Match System; View > Editor Font; Larger, Smaller, Default Text Size (Cmd/Ctrl + / - / 0). | Each applies at once and is remembered. Dialogs and menus follow the theme. |
| 17.9.3 | Distraction-Free Mode (Cmd/Ctrl+Shift+D); move the pointer to the top and the left edge; press Escape. | Panes and header rows hide, return when the pointer reaches an edge, and Escape leaves the mode. |
| 17.9.4 | Focus Mode (Cmd/Ctrl+Shift+L) in a glued run. | The paragraph being written stays bright; other sheets of the run fade. |
| 17.9.5 | View > Typewriter Scrolling. | The cursor line stays vertically centred. |

### 17.10 Performance and large libraries [items 72, 75]

| # | Do | Expect |
|---|----|--------|
| 17.10.1 | Open a library of 1,000+ sheets (copy a folder many times). | It loads in a second or two, and the next launch is faster (the cache). |
| 17.10.2 | Change a file outside the app and reopen the app. | The changed sheet shows its new title and preview; unchanged ones are not slow. |
| 17.10.3 | Type in a 5,000-line sheet. | Typing and scrolling stay smooth. |

## 18. Checks only a packaged build can do

The dev build runs from the source folder; an installed app runs inside its own bundle, with its own paths and the OS's file rules. Do these on the DMG, installer or AppImage, not `npm run dev`. [ROADMAP section 2]

| # | Do | Expect |
|---|----|--------|
| 18.1 | Install from the DMG (drag to Applications) and open it. | It opens. On a Mac without the developer's certificate, Gatekeeper may ask you to confirm; note exactly what it says. The icon and the app name are right in the Dock and the About box. |
| 18.2 | Open a library from the Desktop, Documents and an external drive. | Each opens and saves. A folder macOS protects asks for permission once and then works. |
| 18.3 | Insert, paste and show pictures; export with pictures. | Thumbnails draw (the `wa-asset://` route works in the bundle); the export carries them. |
| 18.4 | Export to PDF, Word, EPUB, HTML and Markdown. | Each saves and opens. PDF fonts and page numbers are right. |
| 18.5 | Check the fonts: the interface in Geist, an editor with Source Serif 4. | They show; nothing falls back to a system font unless chosen. |
| 18.6 | Spell check: misspell a word. | The underline and suggestions appear. |
| 18.7 | Force quit while typing; relaunch. | The text comes back through the recovery dialog. |
| 18.8 | Open the settings folder (`~/Library/Application Support/@writingapp/desktop` on macOS, `%APPDATA%` on Windows, `~/.config` on Linux). | `settings.json`, `sheet-cache`, `journal`, `themes` and `export-styles` live there, and `errors.log` once something fails. |
| 18.9 | Replace the app with a newer build over the old one. | Settings, recent libraries and the open library survive the update. |
| 18.10 | Windows and Linux only: menu accelerators use Ctrl (not ⌘); the menu bar and window frame look right; tabs, drag-out, Save and Export work; a group named `Act I: Why?` is handled. | As on macOS. Note any toast or dialog that still says ⌘ on these platforms. |
| 18.11 | Uninstall the app. | Your libraries are untouched. |

## 15. Still to confirm live (checklist)

Things the developer could not drive in the test harness. Tick each one on your own machine; the full steps are in the section named at the end of each line.

- [ ] **⌘S from the File menu** saves the sheet in front (the harness could only send the command directly). 13.37, 13.39
- [ ] **Dropdowns in the export dialog** (Margins, Style) open and pick without crashing. 13.27
- [ ] **Sheet cards** update their title and preview right after typing, with no stale text after switching sheets. 13.31
- [ ] **Autosave off / "When I switch or close"**: the toolbar says "Unsaved" while typing and "Saved" after switching sheets. 13.37
- [ ] **Preferences tabs**: clicking, ←/→ keys, and the last tab being remembered after reopening. 13.38
- [ ] **Choose Library… with unsaved changes** (manual mode) asks first. 13.39 step 9
- [ ] **A failing save from the prompt** (read-only folder, then Save) keeps the tab or window open with the message. 13.39 step 10
- [ ] **Dragging a tab**: one with a dot cannot leave its window; one without can. 13.39 step 11
- [ ] **Windows and Linux**: launch the app itself (CI only runs the tests) and try tabs, Save, and a group name with `:` and `?`. 11, 13.39, 13.40
- [ ] **Word**: open an exported .docx and update the contents page (right-click ▸ Update Field). 13.22
- [ ] **EPUB**: open an exported .epub in a reader and a validator (epubcheck needs your permission to download). 13.25
- [ ] **Inline group rename**: right-click ▸ Rename, type `Act I: Why? Because`, Return; list shows it as typed. 13.40 step 1
- [ ] **Rename the group's folder in Finder**: the group then shows the folder name. 13.40 step 2
- [ ] **Sheet file rename**: first line `# Why: is it so?`, leave the sheet: file becomes `Why is it so.md`. 13.40 step 6
- [ ] **Export dialog layout**: open Export; the preview fills the left, the settings column scrolls if the window is short while Export stays at its foot, and nothing overflows. 13.27
- [ ] **Stray marks on sheet cards**: in your own library, no `<!-->` or `**` shows in card previews. 13.31
- [ ] **Native menus and dialogs**: click through Format, Insert and File menu items, the right-click menus, each save dialog and the Import and Insert Picture pickers; ⌘, opens Preferences; ⌘⇧V pastes plain; ⌘-click opens a link. Full list: ROADMAP section 1.
- [ ] **Everyday paths** (17): browsing, creating, keyboard organising, writing basics, sheet operations, export, outside changes. 17
- [ ] **Packaged build** (18): install, folders, pictures, exports, recovery, update, uninstall. 18
- [ ] **First launch and Close Library**: with the settings folder moved aside the chooser shows; Close Library then a restart shows it again. 16.1
- [ ] **New preferences** (16.8): When the app starts, Confirm before moving to the trash, Word count, Hyphenate, Close brackets and quotes, Save delay. 16.8
- [ ] **Reset all preferences** from the packaged app, including the question and Cancel. 16.4
- [ ] **Hard quit and quit with unsaved changes**: force-quit while typing, relaunch and get the text back; quit with unsaved changes and press Cancel. 13.28
