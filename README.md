# WritingApp

Working title. A free, open-source writing app: a library of ordered
Markdown sheets, keyboard-driven organisation, and clean export.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design, [docs/ROADMAP.md](docs/ROADMAP.md) for what is next, and [docs/WORKFLOWS.md](docs/WORKFLOWS.md) for the different ways of working (saving and tabs) the app supports.

## Layout

- `packages/core` — library model, sheet operations, export. Plain
  TypeScript with no UI or platform imports, so it runs unchanged under
  Electron now and Capacitor later.
- `apps/desktop` — the Electron + Svelte desktop app.

## Development

Requires Node.js 24 or newer.

```bash
npm install
npm run dev        # launch the desktop app with hot reload
npm test           # unit tests
npm run typecheck  # type-check every package
npm run build      # production build of the desktop app
npm run e2e -w @writingapp/desktop   # drive the built app (build first; opens windows)
```

## Licence

[AGPL-3.0](LICENSE).
