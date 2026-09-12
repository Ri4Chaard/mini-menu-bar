# Implementation Plan: MVP Scope — Screenshots & Timer

**Branch**: `003-mvp-screenshots-timer` | **Date**: 2026-09-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-mvp-screenshots-timer/spec.md`

## Summary

Cut the app to two features and sharpen both. Spotify and Notes are deleted outright — sections,
services, IPC channels, bridge methods, tests, and the Apple Events entitlement that only Spotify
needed. The Copy action goes with them, per the user's clarification, leaving drag-out as the single
path into another application.

What remains gets three behavioural changes. Clicking a screenshot selects it and double-clicking
opens it, with no click-delay timer: [R-206](./research.md#r-206) shows the spec's own wording
(FR-101) makes the naive implementation the correct one. The timer's big clock readout becomes
editable in place, which is what lets typed entry land without disturbing the fixed band arithmetic
that `002` locked down. And the menu bar gains a count badge composited into the corner of the
screenshot thumbnail.

That badge is the only genuinely new machinery. Electron's `nativeImage` cannot rasterise SVG —
[probed and confirmed](./research.md#r-201) — so the badge is blitted directly into the BGRA bitmap
by a pure function, using an embedded bitmap digit font. It costs no dependency, no renderer payload,
and it is exhaustively unit-testable without launching an app.

**This feature only ever shrinks the native boundary.** It removes eleven bridge methods and adds
none, which is why the Constitution Check below passes without a single Complexity Tracking entry —
the first feature in this project to do so.

## Technical Context

**Language/Version**: TypeScript 6.0 across main, preload, and renderer; React 19 in the renderer

**Primary Dependencies**: No additions, and one net reduction in reachable surface. Existing baseline
— `react`, `react-dom`, `menubar`, `motion`, `lucide-react`, `tailwindcss` v4

**Storage**: Existing atomic JSON store. Two persisted fields are *removed*
(`previews.spotify`, `screenshotsSeenWatermark`); `notes.json` is left on disk untouched
([R-209](./research.md#r-209))

**Testing**: Vitest for unit and contract suites, Playwright for browser-mode end-to-end

**Target Platform**: macOS menu bar, Electron 43 accessory app (`LSUIElement`)

**Project Type**: Desktop app — three build targets (main, preload, renderer) plus a renderer-only
browser target

**Performance Goals**: Panel open-to-interactive < 100 ms; menu bar reflects a change within 2 s
(SC-007 from `001`); idle CPU effectively 0% — measured at **0.277%** for the whole app before this
change, and expected to fall as the Spotify poll loop is deleted

**Constraints**: Renderer payload < 500 KB uncompressed (enforced build gate; currently ~404 KB of
`out/renderer`, and this feature is net-negative); no host global outside the adapter; every
remaining section exercisable in a plain browser against the mock

**Scale/Scope**: 2 sections + settings (down from 5), ~28 functional requirements (FR-091…FR-118),
**11 bridge methods removed, 0 added**, 2 persisted fields removed, 1 new main-process pure module
(badge compositing)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — see bottom of file.*

Evaluated against constitution **v2.0.0**.

### Principle-by-principle

| Principle | Status | How this plan satisfies it |
|---|---|---|
| **I. Browser-Runnable Core** | ✅ PASS | The renderer surface shrinks; nothing new reaches for a host global. Badge compositing lives entirely in the main process, so `dev:browser` is unaffected by the one piece of new machinery. The mock loses the same eleven methods as the real binding, in the same change set. Required mock failure paths are unchanged minus the deleted ones: screenshot source error, trash failure, thumbnail failure. |
| **II. Thin Native Boundary** | ✅ PASS | Eleven removals (`copyScreenshots`, `markScreenshotsSeen`, and all nine Spotify/Notes methods), **zero additions**. The removals are a contract change, so contract tests and the mock are updated alongside, per the principle's own clause. Screenshots stay addressed by **id**, never path. |
| **III. Menu Bar Ergonomics** | ⚠️ PASS with a named rule | Panel open/dismiss/keyboard behaviour is untouched — but the editable clock introduces a real conflict: `Escape` currently dismisses the panel, and `Escape` inside a text field must cancel the edit. Resolved in [R-208](./research.md#r-208) as a two-stage rule — first `Escape` reverts and exits the field, a second dismisses the panel. This is a behaviour change to a Principle III guarantee and is therefore called out rather than absorbed silently. |
| **IV. Contract-First Testing** | ✅ PASS | Four new pure functions, all unit-tested without a host runtime: badge blit, digit glyph lookup, duration parsing, preference migration. Contract tests for the eleven removals are updated in the same commit as the code, as the principle requires for contract changes. |
| **V. Lean Footprint** | ✅ PASS | No new runtime dependency. Renderer payload strictly decreases (two sections deleted). Badge compositing runs only on the existing tray-refresh path, which is already demand-driven, and adds no timer. Deleting the Spotify service removes a 2 s `osascript` poll loop and its child-process spawn — the single largest CPU consumer measured in this app. |

### Technology & Platform Constraints

| Constraint | Status | Note |
|---|---|---|
| Language and runtime | ✅ | No framework enters main or preload. The badge module is plain TypeScript over a `Buffer`. |
| Process model | ✅ | Count derivation and badge compositing belong to main, which already owns the tray. No logic moves into preload. |
| Build toolchain | ✅ | Unchanged. Icon generation is a **build-time** script, not a runtime path ([R-205](./research.md#r-205)). |
| Styling | ✅ | Token-driven; no new colour literals. The badge is composited in the main process and so is outside the CSS token system by necessity — its two colours are named constants with a recorded rationale. |
| State | ✅ | Two derived/persisted fields removed. Selection remains in-memory and unpersisted. |
| Privacy | ✅ | **Improves.** Album-art fetching dies with Spotify, returning the app to zero outbound requests. |
| Security | ✅ | **Improves.** Eleven IPC channels removed; the `com.apple.security.automation.apple-events` entitlement and `NSAppleEventsUsageDescription` are deleted ([R-211](./research.md#r-211)). |

### Gate result

**PASS.** No violations requiring justification — the Complexity Tracking table below is empty by
design, not by omission. The one item needing explicit attention is the Principle III `Escape`
conflict, which is resolved by a named rule rather than waived.

## Project Structure

### Documentation (this feature)

```text
specs/003-mvp-screenshots-timer/
├── plan.md              # This file
├── research.md          # Phase 0 output — R-201…R-212
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── host-bridge.md   # Interface delta (11 removals, 0 additions)
│   ├── ipc-channels.md  # Channel delta
│   └── tray-badge.md    # Badge compositing contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (16/16 PASS)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── index.ts                       # M: drop Spotify/Notes wiring
│   ├── ipc/register.ts                # M: drop 11 handlers
│   ├── services/
│   │   ├── notes/                     # D: delete
│   │   ├── spotify/                   # D: delete
│   │   ├── preferences/
│   │   │   └── preferences-service.ts # M: migration for removed fields
│   │   └── screenshots/
│   │       ├── clipboard.ts           # D: delete (Copy removed)
│   │       ├── actions.ts             # M: drop copy path
│   │       └── screenshot-store.ts    # M: drop unseen/watermark
│   └── tray/
│       ├── badge.ts                   # A: pure BGRA blit + digit font
│       ├── preview-composer.ts        # M: total count, no Spotify segment
│       └── tray-controller.ts         # M: composite badge, app-icon fallback
├── preload/index.ts                   # M: drop 11 methods
├── renderer/
│   ├── host/
│   │   ├── host-contract.ts           # M: 11 removals
│   │   ├── host-bridge.ts             # M: 11 removals
│   │   └── host-mock.ts               # M: 11 removals
│   ├── sections/
│   │   ├── notes/                     # D: delete
│   │   ├── spotify/                   # D: delete
│   │   ├── registry.ts                # M: two sections
│   │   ├── screenshots/
│   │   │   ├── screenshot-card.tsx    # M: click=select, dblclick=open, folder icon
│   │   │   └── screenshots-section.tsx# M: drop Copy action
│   │   └── timer/
│   │       ├── duration-input.tsx     # A: editable clock readout
│   │       ├── parse-duration.ts      # A: pure parser
│   │       └── timer-section.tsx      # M: typed entry replaces preset spawning
│   └── components/section-chrome.tsx  # M: remove three-dot control
├── shared/
│   ├── channels.ts                    # M: 11 channel removals
│   └── types.ts                       # M: SectionId, PreviewPreferences, watermark
└── resources/
    ├── trayTemplate.png               # M: wine glass, replaces grid glyph
    ├── trayTemplate@2x.png            # M: as above
    └── icon.icns                      # A: app icon

scripts/
└── make-icons.mjs                     # A: build-time PNG/icns generation

tests/
├── contract/host-bridge.spec.ts       # M: assert removals
└── unit/
    ├── tray-badge.spec.ts             # A
    ├── parse-duration.spec.ts         # A
    ├── preferences-migration.spec.ts  # A
    ├── preview-composer.spec.ts       # M: count semantics
    ├── clipboard-mode.spec.ts         # D: delete with clipboard.ts
    └── artwork-cache.spec.ts          # D: delete with Spotify
```

**Structure Decision**: No structural change. The existing three-target layout already separates
main, preload, and renderer exactly as the constitution requires; this feature deletes from all
three and adds two small pure modules (`src/main/tray/badge.ts`, `src/renderer/sections/timer/parse-duration.ts`)
plus one build-time script. `A` = added, `M` = modified, `D` = deleted.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

**No violations.** This feature adds no framework, no build stage, no architectural layer, and no
runtime dependency; it removes an entitlement, eleven IPC channels, eleven bridge methods, two
persisted fields, and a polling loop. The table is intentionally empty.

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1 artifacts were written.

| Principle | Status | Change from pre-design assessment |
|---|---|---|
| I. Browser-Runnable Core | ✅ PASS | Unchanged. [Design confirmed](./contracts/host-bridge.md) the mock and real binding stay in lockstep. |
| II. Thin Native Boundary | ✅ PASS | Unchanged; the delta is purely subtractive. |
| III. Menu Bar Ergonomics | ✅ PASS | The `Escape` rule is now specified concretely in [R-208](./research.md#r-208) and carries its own quickstart check. |
| IV. Contract-First Testing | ✅ PASS | [data-model.md](./data-model.md) named one more pure function than anticipated (count derivation), raising the tested-pure surface rather than lowering it. |
| V. Lean Footprint | ✅ PASS | The badge composites on an existing refresh path; [R-201](./research.md#r-201) bounds the work at ~2 KB of pixel writes per refresh, only while the screenshot preview is enabled. |

**Result: PASS.** Ready for `/speckit-tasks`.
