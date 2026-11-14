# User acceptance scripts

Manual checks for the features added on 2026-11-13: wiki links and backlinks, hiding Markdown marks, folding sections, and import. Run `npm run dev` in `apps/desktop` (or open a build), use a throwaway library, and tick each step.

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

`photo.docx` (any Word file) and `broken.txt` (a file you have removed read permission from with `chmod 000`).

| # | Steps | Expected |
|---|-------|----------|
| 4.1 | Select a sheet. File > Import…, pick `plain.txt`. **(dialog not yet checked live)** | A new sheet appears after the current one, selected, titled by its first line. A notice says "Imported 1 sheet." |
| 4.2 | Check the accented letter in both encodings. | Shown correctly. |
| 4.3 | Import `rich.rtf`. | Bold and italic show as `**` and `*`. Bullets are `- `, numbers `1.`, the link is `[text](url)`. Accents correct. Paragraphs separated by blank lines. |
| 4.4 | Import `notes.md`. | Content arrives unchanged. |
| 4.5 | Import `plain.txt`, `rich.rtf` and `notes.md` together (multi-select). | Three sheets, in the order picked, after the current sheet, all selected. Notice "Imported 3 sheets." |
| 4.6 | Import `plain.txt` and `broken.txt` together. | `plain.txt` imports; a notice says "Imported 1. Could not import broken.txt." |
| 4.7 | In the picker, try to choose `photo.docx` (the filter may hide it; switch to All Files if offered). | Not importable; if it gets through it is named in the "Could not import" notice. |
| 4.8 | Import several files, then use **Undo Library Change** once. | All imported sheets go to the trash together and the sheet order is as it was before. The undo label reads "Import of N files". |
| 4.9 | Cancel the dialog. | Nothing changes, no notice. |
| 4.10 | Import with a group selected, then with a sheet in the middle of a long list selected. | New sheets land right after the current sheet (end of the group when a group is selected). |
| 4.11 | Import 30+ text files. | Completes in a reasonable time; the list stays correct. |
| 4.12 | Import an RTF with a table or picture. | The text comes through; the table and picture are dropped without error. |

Known gaps: `.docx`, importing a folder as a project, and dropping files onto the window are not built.

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

## 6. Regression sweep

Quick checks that earlier features still work with today's changes.

- Typing, undo/redo, and autosave ("Saved" indicator) in a sheet with folds and hidden marks on.
- Cmd/Ctrl+Click on an ordinary Markdown link `[text](https://…)` still opens it in the browser.
- Cmd/Ctrl+K inserts a link; the link chip still draws as one box.
- Footnotes, tables, images and task boxes still render and edit.
- Find in the sheet (Cmd/Ctrl+F) and Find in Library (Cmd/Ctrl+Shift+F) still work.
- Export (Cmd/Ctrl+E) of a sheet with wiki links: the links come out as plain text and nothing breaks.
- Open a very large sheet (5,000+ lines) with folds on: scrolling stays smooth.
- Try on the other platforms you use (Windows/Linux): the Fold menu and shortcuts, since only macOS was checked.
