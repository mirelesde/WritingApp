# WritingApp — ways of working

People write differently, and the app is meant to suit each of them without forcing one style on the others. Two settings carry most of the difference: **when text is saved** and **where choosing a sheet opens it**. Tabs are optional: someone who never wants them never sees them.

## The three experiences

### 1. One sheet at a time, always saved (like Ulysses) — the default

For people who write in the sheet in front of them, switch to another, and assume everything is kept.

| Setting (Preferences) | Value |
|---|---|
| Writing ▸ Choosing a sheet opens it in | This tab |
| Saving ▸ Save | While typing |

- Text is written to disk a moment after typing stops, so there is nothing to remember and nothing to lose.
- Choosing a sheet replaces the one in the window. With one tab open there is no tab bar at all.
- Nothing asks "save changes?" except in the rare case that a save fails.

### 2. In between: saved when you move on

For people who like a sheet to stay as typed while they work on it, but do not want to think about saving.

| Setting | Value |
|---|---|
| Writing ▸ Choosing a sheet opens it in | This tab |
| Saving ▸ Save | When I switch or close |

- Text is saved with ⌘S/Ctrl+S, when switching to another sheet, before library operations, and when the window closes.
- Still one sheet at a time, and still no prompts: closing or switching saves.

### 3. Tabs and manual saving (like VS Code)

For people who want to keep several sheets open at once and never regret an automatic save.

| Setting | Value |
|---|---|
| Writing ▸ Choosing a sheet opens it in | A new tab (or This tab, and use right-click ▸ Open in New Tab, ⌘T for a blank tab) |
| Saving ▸ Save | Only when I save |

- Nothing is written until you save (⌘S saves the sheet in front, ⌥⌘S saves every tab).
- A tab with unsaved text shows a dot in place of its close mark and an italic title. Closing it, or the window, asks first.
- If the front tab has unsaved changes, choosing another sheet opens it in a tab beside it rather than replacing it, so nothing is lost by moving on.
- Unsaved text is also kept in a recovery journal, so a crash does not lose it.

## What is shared by all three

- Tabs appear only once there are two or more. A new tab (⌘T) starts empty. Tab keys: Ctrl+Tab and Ctrl+Shift+Tab, Ctrl+PageUp/PageDown, ⌘/Ctrl+Shift+[ and ], ⌘/Ctrl+Alt+←/→, ⌘/Ctrl+Shift+T to reopen a closed tab.
- "Choosing a sheet opens it in" can also send a click to **a new window**.
- Right-click ▸ Open in New Tab / New Window always works, in every experience.
- These are per-machine settings, not part of a library, so a library can be opened by someone using a different style.
- Every setting can be changed at any time in Preferences; the experiences above are just sensible combinations.

## Later: a setup experience

Today a new user gets the first experience and has to find the settings to change it. A short first-run setup would let them choose how they want to work up front:

- **One question, three answers**, each described in a sentence or two (and a small picture): "One sheet at a time, always saved", "One sheet at a time, saved when I move on", "Tabs, and I save myself".
- Choosing one sets the save mode, where sheets open, and the save indicator together. It could also offer the look (font, size, width, accent) at the same step, or as a second step.
- It is a **preset, not a mode**: afterwards each setting stays individually editable, and Preferences can say "Custom" when the combination no longer matches a preset.
- It can be run again from Preferences or the Help menu, and skipped; skipping keeps the defaults.
- Nothing about it should block opening a library, and a returning user with saved settings never sees it.

Not built yet. Open questions are listed in [ROADMAP.md](ROADMAP.md).
