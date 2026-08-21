# Mini Menu Bar

A lightweight macOS menu bar hub for four everyday things: recent screenshots, a countdown timer,
Spotify control, and quick notes — with independently toggleable glanceable previews rendered
straight into the menu bar.

Built with Electron, TypeScript, React, Tailwind CSS v4, Motion, and Lucide.

## The idea

Screenshots get lost. They scatter across the Desktop or land in a folder you forget about. This app
finds them **wherever they ended up** — it queries Spotlight's `kMDItemIsScreenCapture` attribute,
which macOS stamps on every screenshot and which survives renaming and moving.

It is strictly read-only over your filesystem. It never moves, renames, or deletes a file, and never
changes your system screenshot location. Uninstalling it leaves everything exactly as it was.

## Getting started

```bash
npm install
npm run dev          # the full Electron app
npm run dev:browser  # the UI alone, in your browser
```

`npm run dev:browser` is not a convenience — it is the architecture. The renderer is a standard web
app that runs against a mock host bridge with no Electron present. If a feature only works inside
Electron, something has leaked past the adapter.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Full Electron app with HMR |
| `npm run dev:browser` | Renderer only, in a browser, against the mock bridge |
| `npm run build` | Typecheck, build all three targets, enforce the payload budget |
| `npm test` | Unit + contract suites (Vitest) |
| `npm run test:e2e` | End-to-end against the built app (Playwright) |
| `npm run lint` | ESLint, including the architecture rules below |
| `npm run package` | Build a signed `.dmg` via electron-builder |

## Architecture

Three processes, kept strictly distinct:

```
src/main/       Node. Tray, windows, and every OS integration. Nothing else touches the OS.
src/preload/    contextBridge only. Forwarding, zero business logic.
src/renderer/   The React app. A plain web page that must run in a browser.
src/shared/     Types and the IPC channel enumeration, used by both sides.
```

Everything crosses through **one** module: `src/renderer/host/host-contract.ts`. It has two
implementations — `host-bridge.ts` (real) and `host-mock.ts` (browser) — and one contract test suite
runs against both. A bridge method added without a mock is an incomplete change.

Two rules are enforced by lint rather than by review:

- The preload-exposed global may only be referenced inside `src/renderer/host/`.
- `lucide-react` must be imported by name; namespace imports defeat tree-shaking and blow the budget.

### Two decisions worth knowing

**The countdown lives in the main process.** `menubar` hides the panel window rather than destroying
it, and Chromium throttles hidden windows to roughly one tick a minute — a renderer-owned timer would
silently stall whenever the panel was closed. Storing an absolute deadline instead of accumulating
ticks also makes surviving system sleep free.

**Nothing polls by default.** Screenshot detection is push-based via FSEvents. Spotify polls only
while something is watching, and stops when the last observer goes away. With the panel closed and no
previews enabled, the app does no periodic work at all.

## Budgets

These are enforced, not aspirational. `npm run build` fails if the renderer payload exceeds 500 KB
uncompressed (currently ~305 KB). Idle CPU must be effectively zero with the panel closed.

## Permissions

- **Screenshots** — read access to your screenshot folder and Desktop.
- **Spotify** — automation access, requested the first time you open the Spotify section. Denial is
  handled as a distinct state, not an error.
- **Notifications** — for timer completion.

## Project docs

The full specification, plan, research decisions, and validation scenarios live in
[`specs/001-menu-bar-hub/`](specs/001-menu-bar-hub/). Project principles are in
[`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## License

MIT
