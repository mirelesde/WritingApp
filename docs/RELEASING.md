# Releasing

- `.github/workflows/ci.yml` (typecheck, tests, lint, build, then the end-to-end checks; Ubuntu runs them under `xvfb-run`) runs on Ubuntu, Windows and macOS for every push; it passes on all three as of aef2214, with two end-to-end checks skipped on Windows.
- `.github/workflows/release.yml`: a tag `v*` builds a Mac dmg, a Windows installer and a Linux AppImage into a draft GitHub release (no .deb yet: it needs a public maintainer email in package.json). Dry run: the first three tries found and fixed a Linux executable name, empty signing secrets on Mac, and the deb maintainer. Signing and Mac notarization turn on when the secrets named at the top of `release.yml` exist. **This workflow has never run**, and no certificates exist yet; only a local unsigned Mac build (`npm run build:mac`) was tried.
- Signing needs an Apple Developer ID and a Windows code-signing certificate (see [ROADMAP.md](ROADMAP.md), "Later").
- Tag a release (`git tag vX.Y.Z && git push origin vX.Y.Z`) only when asked.
