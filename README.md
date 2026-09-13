# Mini Menu Bar

A lightweight macOS menu bar hub for two everyday things: recent screenshots and a countdown timer —
with independently toggleable glanceable previews rendered straight into the menu bar.

Built with Electron, TypeScript, React, Tailwind CSS v4, Motion, and Lucide.

The panel is a 632 x 235 pt card: a 64 pt icon rail down the left, and a content column of four
fixed bands — header, body, hairline divider, footer — that every section fills. The whole of a
section is visible at a glance; the panel itself never scrolls.

## The idea

Screenshots get lost. They scatter across the Desktop or land in a folder you forget about. This app
finds them **wherever they ended up** — it queries Spotlight's `kMDItemImageIsScreenshot` attribute,
which macOS stamps on every screenshot and which survives renaming and moving.

The app never touches your files on its own initiative. It indexes screenshots strictly read-only —
watching, reading metadata, building thumbnails — and never changes your system screenshot location.
The only exception is the one thing you explicitly click: **Delete** moves screenshots to the Trash,
where they stay recoverable in Finder. Nothing is ever hard-deleted, renamed, or overwritten.
Uninstalling leaves everything exactly as it was.

To get a screenshot into another application, drag it out of the panel — that hands the real file to
whatever you drop it on, and copies at the destination.

### One network request, and you have to ask for it

The app has no account, no telemetry, and no analytics. It makes exactly one outbound request: a
~150-byte version manifest from this repository's releases, fetched when you press **Check for
updates** in Settings — or once at launch, if you turn that on, which is off by default.

It carries no cookies, no credentials, and a User-Agent with no version and nothing identifying you
or your machine. There is no retry and no timer: nothing checks in the background. The download
itself is still handed to your browser rather than fetched in-app.

That request is declared in [FR-126](specs/004-release-and-updates/spec.md), because the project's
privacy rule requires any outbound request to be written into a spec before it is implemented. It
replaces an earlier decision to make no request at all, which was right while there was nothing to
download and stopped being right once there was ([R-401](specs/004-release-and-updates/research.md)).

## Installing

Download the `.dmg` for your Mac from
[Releases](https://github.com/Ri4Chaard/mini-menu-bar/releases) — `arm64` for Apple Silicon, `x64`
for Intel — and drag the app to Applications.

The app is signed, but not notarized by Apple, so macOS blocks it the first time:

1. Double-click the app. macOS refuses to open it.
2. Open **System Settings → Privacy & Security** and scroll down. An **"Open Anyway"** button appears
   there, naming the app.
3. Click it and authenticate.

> Control-click → Open no longer works: Apple removed that bypass for un-notarized apps in macOS
> Sequoia. The widely repeated "right-click and choose Open" advice is a dead end on current macOS.

If you prefer the terminal: `xattr -dr com.apple.quarantine "/Applications/Mini Menu Bar.app"`

**After an update, macOS will ask for Desktop access and notification permission again.** An ad-hoc
signature's code hash changes with every build, so the system treats each release as a different
application. That is the cost of shipping without a paid Developer ID rather than a bug — see
[RELEASING.md](RELEASING.md).

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
| `npm run package` | Build `.dmg` and `.zip` for arm64 and x64 via electron-builder |
| `npm run icons` | Regenerate the tray images and `build/icon.icns` |
| `npm run clean` | Remove build output, release artifacts and test results |

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
- No colour literal may appear in a section or component. Every colour, radius, and spacing value
  resolves to a token declared once in `src/renderer/styles/theme.css`, which
  `tests/unit/design-tokens.spec.ts` checks for contrast in both appearances.

### Appearance

Light and dark are the same design with the palette roles inverted — identical layout, spacing and
type. The switch is pure CSS (`prefers-color-scheme`); there is no JavaScript listener and no
re-render, so the panel follows a system appearance change while it is open.

### Two decisions worth knowing

**The countdown lives in the main process.** `menubar` hides the panel window rather than destroying
it, and Chromium throttles hidden windows to roughly one tick a minute — a renderer-owned timer would
silently stall whenever the panel was closed. Storing an absolute deadline instead of accumulating
ticks also makes surviving system sleep free.

**Nothing polls, ever.** Screenshot detection is push-based via FSEvents, and the countdown is a
single absolute deadline rather than a tick loop. With the panel closed the app does no periodic work
at all — the last polling loop in the codebase went when Spotify did.

## Budgets

These are enforced, not aspirational. `npm run build` fails if the renderer payload exceeds 500 KB
uncompressed (currently ~319 KB). Idle CPU must be effectively zero with the panel closed; the last
measurement was 0.185% with the screenshot and timer previews both on.

## Permissions

- **Screenshots** — read access to your screenshot folder and Desktop.
- **Notifications** — for timer completion.

The app does not request automation access to any other application. Both permissions are requested
again after an update, for the reason described under [Installing](#installing).

## Project docs

The full specification, plan, research decisions, and validation scenarios live in `specs/`, newest
first: [`004-release-and-updates/`](specs/004-release-and-updates/) made the app distributable and
added the update check, [`003-mvp-screenshots-timer/`](specs/003-mvp-screenshots-timer/) cut the app
to these two features, [`002-panel-ui-v2/`](specs/002-panel-ui-v2/) built the current panel, and
[`001-menu-bar-hub/`](specs/001-menu-bar-hub/) established the architecture. Project principles are in
[`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## License

MIT
