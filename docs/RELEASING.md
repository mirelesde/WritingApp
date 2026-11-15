# Releasing

- `.github/workflows/ci.yml` (typecheck, tests, lint) runs on Ubuntu, Windows and macOS for every push; it passes on all three as of a4b89e2.
- `.github/workflows/release.yml`: a tag `v*` builds a Mac dmg, a Windows installer and a Linux AppImage and deb into a draft GitHub release. Signing and Mac notarization turn on when the secrets named at the top of `release.yml` exist. **This workflow has never run**, and no certificates exist yet; only a local unsigned Mac build (`npm run build:mac`) was tried.
- Signing needs an Apple Developer ID and a Windows code-signing certificate (see [ROADMAP.md](ROADMAP.md), "Later").
- Tag a release (`git tag vX.Y.Z && git push origin vX.Y.Z`) only when asked.
