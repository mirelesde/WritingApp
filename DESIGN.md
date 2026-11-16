---
name: WritingApp
description: A quiet, OS-neutral writing desk of three gray panes, where the page is the only thing asking for attention.
colors:
  accent: "#6b7280"
  accent-theme: "#2f6f6a"
  on-accent: "#ffffff"
  editor-paper: "#fcfcfc"
  sheet-list: "#f4f4f4"
  sidebar: "#ebebeb"
  ink: "#222222"
  muted-ink: "#757575"
  hairline: "#e2e2e2"
  hover: "#eaeaea"
  selected: "#dcdcdc"
  text-selection: "#d3e0de"
  marker: "#b4b4b4"
  comment-red: "#c8372d"
  quote-blue: "#1f6fd0"
  highlight: "rgba(255, 214, 10, 0.4)"
  danger: "#c0392b"
  control-fill: "rgba(34, 34, 34, 0.08)"
  control-fill-hover: "rgba(34, 34, 34, 0.13)"
  field-fill: "rgba(34, 34, 34, 0.07)"
  scrim: "rgba(0, 0, 0, 0.3)"
  editor-paper-dark: "#1c1c1c"
  sheet-list-dark: "#242424"
  sidebar-dark: "#2d2d2d"
  ink-dark: "#e6e6e6"
  muted-ink-dark: "#8e8e8e"
  hairline-dark: "#353535"
  hover-dark: "#393939"
  selected-dark: "#464646"
  accent-theme-dark: "#6fb3ac"
  on-accent-dark: "#0f1f1e"
typography:
  empty-state:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "30px"
    fontWeight: 300
  dialog-title:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  pane-title:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 600
  control:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  card-title:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  secondary:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  caption:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 400
  writing:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.75
  writing-h1:
    fontSize: "2.7em"
    fontWeight: 700
    lineHeight: 1.3
  writing-h2:
    fontSize: "2.1em"
    fontWeight: 700
    lineHeight: 1.3
  writing-h3:
    fontSize: "1.6em"
    fontWeight: 700
    lineHeight: 1.3
rounded:
  check: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  pane-inset: "21px"
  topbar: "40px"
components:
  button:
    backgroundColor: "{colors.control-fill}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
  button-hover:
    backgroundColor: "{colors.control-fill-hover}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
  button-danger:
    backgroundColor: "{colors.control-fill}"
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
  tool-button:
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.sm}"
    width: "30px"
    height: "28px"
  tool-button-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.ink}"
  input:
    backgroundColor: "{colors.field-fill}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "6px 9px"
  sheet-card:
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "10px 12px"
  sheet-card-selected:
    backgroundColor: "{colors.selected}"
  sheet-card-selected-focused:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
  group-row:
    typography: "{typography.control}"
    rounded: "{rounded.md}"
  group-row-selected-focused:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
  pill:
    backgroundColor: "{colors.control-fill}"
    textColor: "{colors.muted-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "5px 12px"
  menu:
    backgroundColor: "{colors.editor-paper}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    padding: "5px"
  menu-item-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "5px 10px"
  dialog:
    backgroundColor: "{colors.editor-paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
---

# Design System: WritingApp

## Overview

**Creative North Star: "The Quiet Desk"**

A tidy writing desk where every tool is within reach and none of them speaks up. The window is three flat gray panes (library sidebar, sheet list, editor) that step in tone toward the page, and the page is the one place that asks for attention. Chrome is drawn in near-monochrome: muted ink for icons and secondary text, tinted fills instead of outlines, hairline dividers. Color comes in only when something is chosen, focused or being moved, or when it belongs to the writer's own text (comments, quotes, highlights, code).

The look is inspired by Ulysses and is identical on macOS, Windows and Linux. It does not try to look native. Everything drawn inside the window belongs to the app: menus, dropdowns, checkboxes, scrollbars, dialogs and the interface font (Geist, bundled). Only the window frame, the menu bar, file panels, spellcheck, the system light/dark setting and the color picker stay with the OS. Density is that of a desktop tool: 13px controls, compact rows, nothing oversized except empty-state messages.

The writer tunes a lot of it (accent, color theme, editor font, size, spacing, column width, interface font and scale). The system is therefore built on roles and CSS custom properties, not fixed values: new UI must read correctly under any accent preset, any color theme, both light and dark, and interface scales from 12 to 18px.

**Key Characteristics:**
- Three tonal panes, flat, separated by tone and hairlines rather than shadows.
- Near-monochrome chrome; the accent is a role the writer fills.
- Borderless controls with a light ink tint; the accent marks only focus, selection-with-focus and the main action.
- One look on every OS, with app-drawn controls and a bundled UI font.
- Quiet, compact desktop density: an 11/12/13/15px interface scale.

## Colors

A gray, paper-and-graphite palette with one swappable accent and a few semantic colors that belong to the writing itself.

### Primary
- **The Writer's Accent** (`accent`, default Graphite Gray): a role, not a hue. The default is a neutral gray; the writer can choose Blue (#3d6fd9), Purple (#8a5cd0), Pink (#d0488a), Orange (#d9722b), Green (#4c9a3f), or "Theme", which keeps the active theme's own accent. Used for keyboard focus rings, the selected card or row when its pane has focus, the primary button, the active menu or palette item, pressed tool buttons, drop lines while dragging, and the left bar of a glued run of sheets. Text selection in the editor is the accent mixed to 28% when a preset is set.
- **Stylesheet Teal** (`accent-theme`, dark `accent-theme-dark`): the stylesheet's own accent, shown when the writer picks "Theme" with no color theme loaded. A deep muted teal-green in light mode, a soft sea-glass teal in dark.
- **On Accent** (`on-accent`): text and icons sitting on the accent; white in light mode, near-black teal in dark.

### Neutral
- **Editor Paper** (`editor-paper`): the editor and every floating surface (dialogs, menus, popovers). In light mode the lightest tone in the window.
- **Sheet List Gray** (`sheet-list`): the middle pane.
- **Sidebar Gray** (`sidebar`): the library pane and the tab bar. On macOS it is 55% opaque so the system's vibrancy shows through, and solid when it floats over the editor.
- **Ink** (`ink`) and **Muted Ink** (`muted-ink`): body text, and secondary text, icons, counts, shortcuts.
- **Faint**: ink at 30%, for Markdown markers, link addresses, disabled menu items and empty-state messages.
- **Hairline** (`hairline`): pane dividers, card separators, dialog and menu borders.
- **Hover** (`hover`) and **Selected** (`selected`): row and card states when the pane does not have focus.
- In dark mode the three panes invert their order: sidebar lightest (`sidebar-dark`), editor darkest (`editor-paper-dark`).

### Semantic (the writer's text)
- **Comment Red** (`comment-red`): commented-out text; also the hover color of remove actions in the text.
- **Quote Blue** (`quote-blue`): quotations, footnote chips.
- **Highlight** (`highlight`): background of `==marked==` text.
- **Danger** (`danger`): destructive button text. It colors the text, never the button fill.
- Code inside fences has its own set (keyword purple, string green, number orange, function blue, type ochre, property teal, comment gray), redefined for dark mode.

### Named Rules
**The Accent Is a Slot Rule.** Never hard-code a hue where the accent belongs. Use `var(--accent)` and `var(--on-accent)`, and check the result in Gray (the default) and at least one saturated preset, in light and dark.

**The Focus Earns Color Rule.** A selected card or row is gray (`selected`) until its pane has keyboard focus; only then does it fill with the accent. Color tells the writer where their keys will go.

**The No Decoration Rule.** Color is never decoration: no colored headers, badges, banners or gradients. It signals state, the writer's own marks, or code, and nothing else.

## Typography

**Interface Font:** Geist (bundled, variable 100–900), falling back to the system UI stack. Preferences can switch it to Source Serif 4 (bundled).
**Writing Font:** the writer's choice. The default "Sans" is the OS's own UI font stack; Geist, Source Serif 4, monospace and any installed font are offered.
**Mono:** `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`, at 0.88em in the text.

**Character:** a neutral, slightly technical sans for the chrome that stays out of the way, and a writing surface that is entirely the writer's own.

### Hierarchy
Interface sizes are multiplied by `--ui-scale` (interface font size 12–18px over the default 14px), so always write them as `calc(Npx * var(--ui-scale, 1))`.
- **Empty state** (300, 30px; 17px in small panes): the quiet message in the middle of an empty pane, in Faint, with a 13px Muted sub-line.
- **Dialog title** (600, 15px): dialog `h2`s, the largest interface text outside empty states.
- **Pane title** (600, 14px): the group name at the top of the sheet list.
- **Control** (400, 13px): buttons, fields, menu items, group rows, tabs, the status pill. The workhorse.
- **Card title** (600, 13px): a sheet's title in its card.
- **Secondary** (400, 12px, line-height 1.4): card previews (always three lines tall), counts, keyboard shortcuts.
- **Caption** (400, 11px): the smallest labels.
- **Writing** (default 16px, line-height 1.75, justified, medium column of 46rem): the editor. Headings are 2.7em, 2.1em and 1.6em (H1–H3) and 1.2em (H4–H6), all bold at line-height 1.3; their `#` marks stay body-sized and hang in the left margin.

### Named Rules
**The Four Sizes Rule.** Interface text is 11, 12, 13 or 15px over the 14px body base (which pane titles inherit). A new size needs a reason that one of these cannot serve; larger sizes are for headings in the text and empty states only.

**The Sentence Case Rule.** Labels, section headings and menu items are sentence case. No all-caps labels.

## Layout

A three-column desktop window: library sidebar, sheet list, editor. Each pane can be collapsed, and the sidebar can float over the editor as a "peek". Pane widths are draggable and remembered. An optional tab bar (31px) sits above the editor, and an optional outline appears beside it.

- Every pane header is a 40px top bar (`topbar`), sticky, in the pane's own tone. On macOS the window has no title bar, so these headers are the drag region, and the leftmost visible header pads 84px for the traffic lights.
- The sheet list insets text 21px (`pane-inset`) so the group name lines up with card titles; cards sit in a 6px gutter with 4px between them.
- The editor column is centered with a writer-chosen max width: compact 30rem, narrow 38rem, medium 46rem (default), wide 60rem, extra-wide 76rem, full.
- Spacing steps are small and repeat: 4, 6, 8, 10, 12px, with 14px for groups inside the status pill.
- Dialogs: palettes (quick open, command palette, move) sit 12vh from the top; alerts (conflict, recovery, unsaved) are centered.
- There are no breakpoints. It is a resizable desktop window; panes collapse instead of reflowing.

## Elevation & Depth

Flat by default, with depth from tone. The three panes are distinguished only by their gray steps and hairline dividers; nothing in the main window casts a shadow. Shadows belong to things that float above the window: dialogs, menus, dropdowns and footnote popovers, which also get a 1px hairline border and Editor Paper background. Modal dialogs dim the window with a 30% black scrim. The status pill uses an 8px backdrop blur over the editor.

### Shadow Vocabulary
- **Popover** (`box-shadow: 0 12px 40px rgb(0 0 0 / 0.3)`): dialogs, context menus, dropdown lists.
- **Footnote** (`box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18)`): the lighter popover attached to a footnote chip in the text.

### Layering
Peek sidebar 30, dialogs 40, footnote popover 50, modal alerts 60, context menus above modals.

### Named Rules
**The Only Floating Things Cast Shadows Rule.** If it is part of the window, it is flat. If it floats over the window and goes away, it gets the popover shadow, a hairline border and Editor Paper.

## Shapes

Soft, consistent rounding at three steps, plus full pills. Small controls (buttons, tool buttons, menu items, tags) are 6px (`sm`); fields and sidebar rows 8px (`md`); sheet cards, dialogs and menus 10px (`lg`). The word-count pill and scrollbar thumbs are fully round. Checkboxes are 4px. The front tab is a folder tab: 6px top corners with outward curves where it meets the bar, flowing into the editor with no line under it. Drop indicators are 3px accent lines with rounded ends that stop where a row's corners begin. Icons are outline strokes (1.5 weight, round caps and joins) at 15–18px.

## Components

Character: quiet and tactile. Fills instead of frames, the accent held back for the moment it means something.

### Buttons
- **Shape:** gently rounded (6px).
- **Default:** a light ink tint (8%) with ink text, 5px × 12px, 13px; no border. Hover deepens the tint to 13%.
- **Primary:** accent fill with on-accent text; hover mixes 12% black into the accent. One per dialog, for the main action (Return).
- **Danger:** default tint with danger-colored text.
- **Disabled:** 45% opacity.
- **Focus:** 2px accent outline, offset 1px, keyboard only.

### Tool buttons
- 30 × 28px, transparent, muted icon. Hover adds the Hover fill and ink color; pressed (`aria-pressed`) turns the icon accent. Focus draws an inset 2px accent ring.

### Inputs / Fields
- **Style:** ink tint (7%), 1px transparent border, 8px radius, 6px × 9px, 13px, placeholder in Muted Ink.
- **Focus:** the border turns accent. No glow.

### Checkboxes and scrollbars
- Drawn in CSS so they match on every OS. Checkbox: 16px, 4px radius, ink tint, accent when checked, with a white check that scales in over 100ms. Scrollbars: 12px with a round thumb in 22% ink (38% on hover) on a transparent track.

### Sheet cards (signature)
- The sheet list's cards: 10px radius, 10px × 12px, a 13px semibold title and a 12px Muted preview that is always three lines tall, so every card is the same height.
- Short inset hairlines (20px in from each side) separate cards, and step aside for a hovered or selected card.
- Hover: Hover fill. Selected: Selected fill; with pane focus, accent fill and on-accent text, preview at 92% opacity.
- A glued run of sheets shares a 3px accent left bar and its cards touch, so they read as one.

### Navigation (sidebar group tree)
- Rows 8px radius, inset 8px from the pane edge, 13px names with 15px outline icons and 12px tabular counts in Muted Ink. Chevrons rotate 90° over 120ms. Hover, Selected and accent-on-focus follow the same rules as cards.

### Tabs
- Optional folder tabs on the sidebar tone. Inactive tabs are Muted with a thin divider; the front tab takes Editor Paper and ink. Unsaved tabs are italic. Close buttons appear on hover.

### Menus, palettes and dropdowns
- One shell: Editor Paper, hairline border, 10px radius, popover shadow, 5px padding. Items 5px × 10px at 6px radius; the active item fills with the accent, shortcuts in 12px Muted on the right. Separators are hairlines. The dropdown (`Select`) is app-drawn, keyboard-driven, and flips above when short of room.

### Pills and chips
- Keyword chips, Find option toggles and the word-count pill share one look: an ink tint, no outline. The status pill floats at the editor's top right, fully round, Muted 13px tabular figures, revealing more counts on hover.

### Dialogs
- Editor Paper, hairline border, 10px radius, popover shadow over a 30% scrim. 15px titles, buttons right-aligned with 8px gaps, primary last.

## Do's and Don'ts

### Do:
- **Do** use the CSS custom properties (`--bg`, `--list`, `--sidebar`, `--text`, `--muted`, `--faint`, `--border`, `--hover`, `--selected`, `--accent`, `--on-accent`, `--danger`), because themes and settings replace them at runtime.
- **Do** scale interface sizes with `calc(Npx * var(--ui-scale, 1))` and stay on the 11/12/13/15px scale.
- **Do** make tinted fills from ink with `color-mix(in srgb, var(--text) N%, transparent)` so they work in light, dark and any theme.
- **Do** reuse the shared `.btn`, `.input`, `.dlg` and `ContextMenu`/`Select` components instead of restyling one-offs.
- **Do** show keyboard focus with the 2px accent outline, and draw no ring for the mouse or for `tabindex="-1"` containers.
- **Do** check new UI in light and dark, in the Gray accent and one saturated preset.

### Don't:
- **Don't** use native per-OS styling inside the window: no platform-specific controls, system dropdowns, native checkboxes or scrollbars, or per-OS fonts for the interface. The look is the same on every OS.
- **Don't** use color as decoration: no colored headers, badges, banners, icons-for-flair or gradients. Color signals state, the writer's own marks, or code.
- **Don't** hard-code an accent hue; the accent is whatever the writer picked.
- **Don't** introduce new interface font sizes or all-caps labels.
