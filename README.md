# WritingApp

Working title. A free, open-source writing app: a library of ordered
Markdown sheets, keyboard-driven organisation, and clean export.
See [PLAN.md](PLAN.md) for scope and build order.

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
npm test           # core unit tests
npm run typecheck  # type-check every package
npm run build      # production build of the desktop app
```

## Licence

[AGPL-3.0](LICENSE).
