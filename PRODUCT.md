# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

(Today an Electron desktop app for macOS, Windows and Linux with one OS-neutral look. A Capacitor mobile app is a possible later port; `packages/core` has no UI or platform imports so it can be shared. Which OS design language the mobile version would adopt is undecided.)

## Stack

Existing codebase: Electron, electron-vite, Svelte 5, CodeMirror 6 (Markdown), TypeScript; npm workspaces with `packages/core` (library model, sheet operations, export) and `apps/desktop`.

## Users

Writers who work in a library of many ordered pieces: long-form writers (novels, essays, theses) assembling a manuscript from sheets, and people writing regularly in shorter pieces (notes, journalling). One library serves both. They write in the sheet in front of them, reorder and group sheets by keyboard, and export the result.

## Product Purpose

A free, open-source writing app: a library of ordered Markdown sheets in folders the writer owns, keyboard-driven organisation, and clean export. Success is that the writer can trust their text is safe and can stay in the writing, with organisation and export out of the way.

## Positioning

Free, open (AGPL-3.0) and file-based: plain Markdown in ordinary folders, no lock-in and no subscription. It also lets each writer choose how they work: always saved, saved when moving on, or tabs with manual saving (see `docs/WORKFLOWS.md`). Tabs are optional and never forced.

## Operating Context

Desktop windows with a sidebar (library groups), a sheet list and the editor; several windows and optional tabs. Writing is long, quiet sessions; saving behaviour is a setting. Export covers Markdown and styled documents.

## Capabilities and Constraints

- Ordered sheets in groups and subgroups, keyboard-driven moves, keywords, filters, sorting, outline, fold sections under headings, Find, export, import.
- Three saving styles and three "choosing a sheet opens it in" modes (this tab, new tab, new window).
- Builds are unsigned for now; installers for macOS, Windows and Linux (AppImage). Release readiness is tracked in `docs/ROADMAP.md`.
- Undecided: a first-run setup experience, a spare window for faster tab drag-out, Preferences as a separate window, mobile design language.

## Brand Commitments

Working title "WritingApp". The look is OS X-inspired but identical on every OS, not native (see `docs/ARCHITECTURE.md`, "UI consistency"). Default writing style: Sans, 16px, spacing 1.65, medium width, justified, gray accent. Subtle hairline dividers between panes were chosen over none.

## Evidence on Hand

Documentation in `docs/` (ARCHITECTURE, ROADMAP, WORKFLOWS, UAT, RELEASING, CHANGELOG). Unit and e2e tests. No testimonials, user numbers or benchmarks exist; do not invent any.

## Product Principles

1. Never lose the writer's text: saving is either automatic or explicit, never ambiguous.
2. The writing surface comes first; organisation and chrome recede.
3. Optional power stays optional: tabs, manual saving and other advanced modes are never imposed.
4. The writer owns plain files in plain folders.
5. Quiet and consistent across operating systems.

## Accessibility & Inclusion

No product-specific requirement established yet. Reduced motion and increased contrast are on the roadmap.
