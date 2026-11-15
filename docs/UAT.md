# User acceptance scripts

Manual checks for the features added on 2026-11-13: wiki links and backlinks, hiding Markdown marks, folding sections, import, code colours and maths, and drag-and-drop drop lines. Run `npm run dev` in `apps/desktop` (or open a build), use a throwaway library, and tick each step.

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
| 10.4 | "Make my own…", rename it, add `body { background: #fee }`, Save style. | The preview updates as you type; the style appears under "Yours" and is selected; a `.css` file is in the app's `export-styles` folder. |
| 10.5 | Choose your style, Edit…, change it, Save; then Save as new. | The first overwrites; the second adds another. |
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

The dialog has one Format picker (PDF, Word, EPUB, HTML, Markdown) and one Export button; the row below shows only that format's options (page size, margins and page numbers for PDF and Word; title, author, language and cover for EPUB; the pictures choice for HTML; nothing for Markdown), an extras row (Number chapters, Title page, title in the margin) shows for PDF, HTML and EPUB, and the Style row shows for PDF, HTML and EPUB. The last format is remembered.

Known gaps: maths appears as its TeX source; export styles do not apply to Word; SVG and WebP pictures appear as their alt text.

## 11. Tabs and windows

| # | Do | Expect |
|---|----|--------|
| 11.1 | Open a sheet, press Cmd/Ctrl+T. | A tab bar appears with two tabs; the new one is in front. |
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

1. Select a group with several sheets, open Export, choose Format > EPUB. A row shows title, author, language and Cover….
2. Fill in a title and author, pick a cover picture, and Export as EPUB….
3. Run `epubcheck` on the file if you have it: no errors expected.
4. Open it in Apple Books (or another reader): the cover shows, the contents list the headings, each sheet starts a new chapter, pictures and tables show, and the style you chose is applied. Footnotes jump to their notes.

## 13.26 Export extras

1. Export > Format PDF. Tick Number chapters, Title page (fill title and author) and Title in the top margin. The preview shows a title page and numbered headings. Export: page 1 is the title page, headings read "1. …", each page has the title at the top. A table of contents (if any) still shows the right page numbers.
2. Make a style with `@page { size: 6in 9in; margin: 0.8in }`, export as PDF: the pages are 6 by 9 inches whatever the dialog says.
3. Number chapters also works for HTML and EPUB; Title page for HTML.

## 13.27 Dropdowns in dialog headers (macOS)

1. Open Export. Click the Format picker: the list opens below it, with the same row height as the buttons beside it.
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
