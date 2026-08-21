# Implementation Plan: Menu Bar Hub

**Branch**: `001-menu-bar-hub` | **Date**: 2026-08-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-menu-bar-hub/spec.md`

## Summary

A persistent macOS menu bar app presenting one panel with four sections — Screenshots, Timer,
Spotify, Notes — plus independently toggleable glanceable previews rendered directly into the menu
bar for the first three.

**Technical approach**: Electron with a strict three-role process split. The main process owns every
OS integration (tray, screenshot discovery, the countdown clock, AppleScript, global shortcut,
persistence); a sandboxed preload script exposes one narrow bridge and nothing else; a React +
TypeScript renderer draws the panel and is runnable in a plain browser against a mock bridge.

Two research findings shaped the design more than the framework choices did:

1. **Spotlight's `kMDItemIsScreenCapture` attribute** survives renaming and moving, so the app can
   find screenshots *wherever they ended up* — which is the user's actual stated problem, not just
   "show me the folder". ([R-003](./research.md))
2. **The countdown must live in the main process.** Electron throttles hidden windows, and the panel
   window is hidden rather than destroyed, so a renderer-owned timer would silently stall while the
   panel is closed — failing FR-017 in a way that only shows up after shipping.
   ([R-004](./research.md))

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS (main, preload) and TypeScript + React 19
(renderer)

**Primary Dependencies**: Electron; `menubar` v9.5.3 (tray + panel scaffolding); electron-vite (build);
React + React DOM; Tailwind CSS v4; `motion` (the package formerly named `framer-motion`);
`lucide-react`

**Storage**: Local JSON files under `app.getPath('userData')`, written atomically. Notes,
preferences, and the unseen-screenshot watermark only — the screenshot collection is re-derived from
Spotlight on each launch rather than cached. ([R-010](./research.md))

**Testing**: Vitest for unit and contract suites (the contract suite runs against both bridge
implementations); Playwright for end-to-end against the packaged Electron app

**Target Platform**: macOS 12+, menu bar resident. macOS-only by design — `Tray.setTitle()`, Spotlight
metadata, and AppleScript automation have no cross-platform equivalents and none are needed.

**Project Type**: Desktop application, three-process (main / preload / renderer)

**Performance Goals**: Panel open-to-interactive < 100 ms (constitution) and content visible < 1 s
(SC-001); new screenshot surfaced < 3 s (SC-002); preview reflects external change < 2 s (SC-007);
timer notification within 1 s of zero (SC-005)

**Constraints**: Idle CPU effectively 0% with the panel closed and no previews active (SC-011);
renderer bundle < 500 KB uncompressed, enforced as a build gate (constitution Principle V); no
network calls, no account, fully offline (FR-037, FR-038); screenshot files strictly read-only
(FR-014a)

**Scale/Scope**: Single local user; 4 sections + settings; ~50 screenshot entries held in memory;
one timer; tens of notes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Constitution version evaluated**: 2.0.0 (adopted 2026-08-21)

### Initial gate — ✅ PASS

This plan was originally written against constitution v1.1.0 and failed that gate. The stack chosen
for this feature (React, TypeScript, Tailwind, Motion, Lucide) conflicted with two clauses that had
no escape hatch. Rather than reinterpret them, the conflict was recorded here and an amendment was
proposed; **constitution v2.0.0 adopted it, and the gate now passes.**

| # | Clause (v1.1.0) | Then | Now (v2.0.0) |
|---|---|---|---|
| 1 | I — "No framework, bundler, or transpiler… unless justified in Complexity Tracking" | ✅ Justifiable | ✅ Permitted outright in the renderer; dependencies still justified in C-1, C-2 |
| 2 | I — "`index.html` opened **directly** in Safari or Chrome MUST render" | ❌ Blocked | ✅ **Amended** to "`npm run dev:browser` MUST serve the complete UI in a standard browser"; verified by V-001 |
| 3 | Tech Constraints — "**No TypeScript compilation step in the core UI**" | ❌ Blocked | ✅ **Amended** to "TypeScript across all three processes. React in the renderer." |
| 4 | Tech Constraints — "**Native CSS** with custom properties" | ✅ In substance | ✅ Utility CSS now explicitly permitted; tokens-defined-once retained ([R-008](./research.md)) |
| 5 | V — "Runtime dependencies **default to zero**" | ✅ Justifiable | ✅ Retained; approved baseline is this plan's Complexity Tracking table (C-1…C-6) |
| 6 | V — Payload < 500 KB uncompressed | ✅ Passes | ✅ Now an enforced build gate, not a target. Est. ~310 KB ([R-006](./research.md), V-013) |

**What the amendment preserved**: Principle I's rationale was never "vanilla for its own sake" — it
was inspectability, testability without a native build, and portability. The React stack delivers all
three, because the renderer is a normal Vite web app that runs in Chrome against a mock bridge
([R-011](./research.md)). Only the mechanism changed. The amendment kept the adapter boundary, the
"no host globals in UI code" rule, and the browser-mode requirement — the parts that make the
principle load-bearing.

**New obligations introduced by v2.0.0**, and where this plan already meets them:

| v2.0.0 addition | Satisfied by |
|---|---|
| Periodic work MUST be demand-driven (start on first observer, stop on last) | `spotify:subscribe` channel ([ipc-channels.md](./contracts/ipc-channels.md)); timer emits only while observed ([R-004](./research.md)) |
| Infinite/looping animations forbidden | Animation rules in [R-006](./research.md); usage confined to `src/renderer/motion/` |
| Frameworks renderer-only; main and preload stay plain TypeScript | Structure: no UI dependency appears under `src/main/` or `src/preload/` |
| IPC handler arguments MUST be validated; no renderer-supplied file paths | Validation rules in [ipc-channels.md](./contracts/ipc-channels.md) — `screenshots:open` takes an `id`, not a path |
| Payload budget enforced by a failing build | V-013 in [quickstart.md](./quickstart.md) |
| Mock MUST expose failure paths, not just success | Mock obligations in [host-bridge.md](./contracts/host-bridge.md) |

**Gate status**: PASS against constitution v2.0.0. No open violations, no waivers.

### Post-design re-check — ✅ PASS (constitution v2.0.0)

Re-evaluated after Phase 1. No new violations introduced by the design:

- **Principle I / browser-runnable**: single `HostBridge` module with a mock implementation
  ([contracts/host-bridge.md](./contracts/host-bridge.md)); `window.__hostBridge` confined to one
  file by lint rule; V-001 verifies it.
- **Principle II / thin boundary**: one adapter, plain-JSON in and out, no `Date` objects, no Electron
  types. Every method has a mock obligation and a contract test.
- **Process model**: `sandbox: true` forces the preload to a CJS build with no general Node access
  ([R-002](./research.md)) — "no business logic in preload" is now mechanically enforced, not merely
  agreed.
- **Principle III / ergonomics**: all four dismissal paths (FR-002) verified by V-006; reduced motion
  honoured via Motion's `useReducedMotion`; light/dark via CSS variables with no JS (V-014).
- **Principle IV / contract-first**: contract suite runs against both implementations; the timer state
  machine ([data-model.md](./data-model.md)) is unit-testable without an Electron runtime, as is the
  tray composer.
- **Principle V / lean**: no polling anywhere by default — screenshots use push-based FSEvents,
  Spotify polls only while subscribed, the timer holds a single `setTimeout` when nothing observes it.
  Idle cost verified by V-012, payload by V-013.
- **Security**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` passed through
  `menubar`'s `browserWindow` option; channels explicitly enumerated in
  [contracts/ipc-channels.md](./contracts/ipc-channels.md); no renderer-supplied file paths accepted.

## Project Structure

### Documentation (this feature)

```text
specs/001-menu-bar-hub/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — 12 resolved decisions
├── data-model.md        # Phase 1 output — entities, transitions, validation
├── quickstart.md        # Phase 1 output — V-001..V-014 validation scenarios
├── contracts/
│   ├── host-bridge.md   # The renderer↔host adapter contract (Principle II)
│   └── ipc-channels.md  # Explicit channel enumeration (constitution, Security)
├── checklists/
│   └── requirements.md  # Spec quality checklist — 18/18
└── tasks.md             # Phase 2 — created by /speckit-tasks, NOT by this command
```

### Source Code (repository root)

```text
electron.vite.config.ts        # three build targets; preload emits CJS for sandbox (R-002)
tailwind.config.ts
tsconfig.json / tsconfig.node.json / tsconfig.web.json
package.json

src/
├── main/                      # Node. All OS access lives here and nowhere else.
│   ├── index.ts               # menubar bootstrap, security options, lifecycle
│   ├── tray/
│   │   ├── tray-controller.ts # owns the single Tray (R-005)
│   │   └── preview-composer.ts# pure fn: 4 inputs → {image, title}. Unit-tested.
│   ├── window/
│   │   └── panel-window.ts    # BrowserWindow options, show/hide, blur-dismiss
│   ├── services/
│   │   ├── screenshots/
│   │   │   ├── spotlight-source.ts  # mdfind backfill, kMDItemIsScreenCapture
│   │   │   ├── fs-watcher.ts        # FSEvents watch on the configured location
│   │   │   └── screenshot-store.ts  # in-memory collection, ≤50, newest first
│   │   ├── timer/
│   │   │   └── timer-service.ts     # absolute-deadline clock + powerMonitor (R-004)
│   │   ├── spotify/
│   │   │   ├── applescript.ts       # osascript wrapper
│   │   │   └── playback-service.ts  # adaptive polling, availability states (R-007)
│   │   ├── notes/notes-service.ts
│   │   ├── preferences/preferences-service.ts
│   │   ├── notifications/notification-service.ts
│   │   ├── shortcuts/shortcut-service.ts  # globalShortcut + registration failure
│   │   └── storage/json-store.ts    # atomic write-then-rename (R-010)
│   └── ipc/
│       ├── channels.ts        # MUST match contracts/ipc-channels.md exactly
│       └── register.ts        # handlers + argument validation
│
├── preload/
│   └── index.ts               # contextBridge only. Forwarding, zero logic.
│
├── renderer/                  # A plain web app. Must run in Chrome (V-001).
│   ├── index.html
│   ├── main.tsx
│   ├── app.tsx                # sidebar + content shell
│   ├── host/
│   │   ├── host-contract.ts   # the interface (Principle II)
│   │   ├── host-bridge.ts     # real impl — ONLY file allowed to touch window.__hostBridge
│   │   ├── host-mock.ts       # browser impl — fixtures + reachable failure paths
│   │   └── use-host.ts        # React context/hook
│   ├── sections/
│   │   ├── screenshots/ · timer/ · spotify/ · notes/ · settings/
│   ├── components/            # sidebar, panel chrome, empty states, error states
│   ├── motion/                # LazyMotion setup; the only import site for `motion` (R-006)
│   └── styles/
│       └── theme.css          # tokens defined once, switched by prefers-color-scheme
│
└── shared/
    └── types.ts               # domain types shared by main + renderer

tests/
├── contract/                  # host-bridge.spec.ts — runs against BOTH implementations
├── unit/                      # timer state machine, preview-composer, json-store, truncation
└── e2e/                       # Playwright against the packaged app

resources/                     # tray icons, app icon
docs/business-prompt.md        # original product brief
```

**Structure Decision**: A three-role layout mirroring the constitution's process model, so the
boundary is visible in the directory tree rather than only in prose. `src/renderer/` has no
dependency on `src/main/`; the only shared code is `src/shared/types.ts`, which contains types and no
behaviour. `src/renderer/host/` is the single doorway between them — small enough that a lint rule and
a code-review glance can both police it.

Two placements are deliberate and worth not "tidying" later:

- **`preview-composer.ts` is a pure function.** It is the piece most exposed to fiddly formatting and
  truncation bugs, and keeping it free of Electron types means it can be exhaustively unit-tested
  without launching an app.
- **`timer-service.ts` is in main, not renderer.** This looks like an odd home for UI state right up
  until the panel is closed and the countdown stops ([R-004](./research.md)).

## Complexity Tracking

> Under constitution v2.0.0 these are permitted choices, not violations — frameworks are allowed in
> the renderer, and this table **is** the approved dependency baseline that Principle V refers to.
> Principle V still requires each entry to name the problem it solves and why hand-writing it is
> worse, and anything added beyond this table needs the same justification.

| Dependency / choice | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **C-1: React in the renderer** | Four sections with independent live-updating state (screenshot list, countdown, playback position, notes), each subscribing to push events from the host. Component-scoped state and effect cleanup are exactly what the subscribe/unsubscribe lifecycle in the bridge contract needs. | Hand-rolled DOM updates were the v1.1.0 assumption. Rejected: with four concurrently-updating sections, manual subscription teardown becomes the app's most likely leak source, and `lucide-react` (C-5) presumes React regardless. |
| **C-2: TypeScript + electron-vite** | Types are the enforcement mechanism for the boundary this whole design rests on — `HostBridge` as a compile-time contract makes mock/real divergence a build error rather than a runtime surprise. electron-vite's three targets mirror the process model and give the browser-only dev server that keeps Principle I verifiable. | Plain JS with JSDoc: the bridge contract degrades to a comment, and preload CJS/ESM output rules ([R-002](./research.md)) still demand a build step. Rejected — the build step is unavoidable, so the type safety is free. |
| **C-3: `menubar` v9.5.3** | Panel positioning relative to the tray item across multi-display and notch geometry, plus show/hide and blur-dismiss (FR-002). | Hand-rolled `Tray` + `BrowserWindow` is genuinely viable and stays the fallback if the package obstructs tray composition — but it re-implements positioning maths with real correctness risk for no user-visible gain. ([R-001](./research.md)) |
| **C-4: `motion` (ex-`framer-motion`)** | Enter/exit transitions on panel open, section switch, and list insertion — the polish that makes this feel like one hub rather than four utilities. | Native CSS transitions are entirely sufficient and remain the **explicitly triggered** fallback: adopted if panel open-to-interactive exceeds 100 ms or idle CPU rises above 0% ([R-006](./research.md)). Cost is bounded to ~4.6 KB initial via `LazyMotion` + `m`, and confined to `src/renderer/motion/` so the swap is contained. Answers the user's own "if it hurts performance, use CSS" hedge with a measurement rather than a preference. |
| **C-5: `lucide-react`** | ~15–20 interface icons across sidebar and controls. | Hand-drawn SVGs: a day of work plus ongoing consistency drift, versus a few KB tree-shaken. Named imports only — barrel imports would pull the full set and breach the payload budget ([R-009](./research.md)). |
| **C-6: Tailwind CSS v4** | Utility styling with tokens declared once in `@theme` and emitted as CSS custom properties. | Hand-written CSS satisfies the constitution's letter, but Tailwind v4 *outputs* exactly the native-CSS-with-custom-properties structure the constitution asks for, while scoping generated CSS to classes actually used. Substantively compliant. ([R-008](./research.md)) |

**Dependencies deliberately *not* taken**: state management library (React context suffices at this
size), `electron-store` (60-line atomic JSON store instead, C/o [R-010](./research.md)), date library
(epoch milliseconds throughout), HTTP client (the app makes no network calls at all).

## Phase Status

- [x] **Phase 0** — [research.md](./research.md): 12 decisions, all NEEDS CLARIFICATION resolved
- [x] **Phase 1** — [data-model.md](./data-model.md), [contracts/](./contracts/),
      [quickstart.md](./quickstart.md)
- [ ] **Phase 2** — `tasks.md` via `/speckit-tasks` (not produced by this command)

**No blockers.** Constitution v2.0.0 was adopted on 2026-08-21; both gates pass and no violation is
outstanding. Ready for `/speckit-tasks`.
