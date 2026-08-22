# Implementation Plan: Panel UI v2

**Branch**: `002-panel-ui-v2` | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-panel-ui-v2/spec.md`

**Design source**: `design/mini-menu-bar-design.pen` → `Screenshots Widget v2`, `Timer Widget v2`,
`Spotify Widget v2`, `Notes Widget v2`, `Settings Widget v2`

## Summary

Rebuild the panel to the v2 design: a 632 × 235 pt window with a 64 pt icon rail and a content column
of four fixed bands — header, body, divider, footer — that every section fills. The palette, spacing,
and radii come from tokens measured directly out of the design file; the light appearance is derived
from the drawn dark one by role inversion, both emitted from one `@theme` block with no JavaScript.

Alongside the layout, the feature delivers the controls the design introduces: screenshot
multi-select with Copy and Delete, user-editable timer presets, Spotify seek / volume / shuffle /
repeat, note deletion and word count, and the Settings secondary actions. Two of the drawn controls
cannot be built as specified and are amended rather than faked — see **Constitution Check**.

The work is overwhelmingly renderer-side. The main process gains six IPC handlers and one new
outbound network path (album art), all behind the existing adapter.

## Technical Context

**Language/Version**: TypeScript 6.0 across main, preload, and renderer; React 19 in the renderer

**Primary Dependencies**: No additions. Existing baseline — `react`, `react-dom`, `menubar`,
`motion`, `lucide-react`, `tailwindcss` v4 (approved in feature 001's Complexity Tracking, C-1…C-6)

**Storage**: Existing atomic JSON store via the preferences service. One new persisted field
(`timerPresets`); selection state is deliberately not persisted ([R-106](./research.md))

**Testing**: Vitest for unit and contract suites, Playwright for browser-mode end-to-end

**Target Platform**: macOS menu bar, Electron 43 accessory app (`LSUIElement`)

**Project Type**: Desktop app — three build targets (main, preload, renderer) plus a renderer-only
browser target

**Performance Goals**: Panel open-to-interactive < 100 ms; section switch < 150 ms (SC-003); idle CPU
effectively 0% with the panel closed and no preview enabled

**Constraints**: Renderer payload < 500 KB uncompressed (enforced build gate; est. ~330 KB after this
feature, [R-116](./research.md)); no host global outside the adapter; every section exercisable in a
plain browser against the mock

**Scale/Scope**: 5 sections, 1 shared chrome component, ~46 functional requirements (FR-041…FR-086),
6 new bridge methods, 1 new persisted preference field

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Evaluated against constitution **v2.0.0**.

### Principle-by-principle

| Principle | Status | How this plan satisfies it |
|---|---|---|
| **I. Browser-Runnable Core** | ✅ PASS | Every new control routes through `HostBridge`. Six new methods each get a mock implementation in the same change set. Album art is a main-process fetch that returns a data URL, so the renderer stays network-free and the mock returns a static placeholder — the Spotify section is fully exercisable in `dev:browser`. Mock failure paths required: Spotify unavailable, trash failure, clipboard failure, artwork fetch failure. |
| **II. Thin Native Boundary** | ✅ PASS | Six additions to the adapter (`copyScreenshots`, `deleteScreenshots`, `setVolume`, `setShuffle`, `setRepeat`, `quitApp`). All are data-in/data-out over plain JSON; screenshots are addressed by **id**, never by path ([R-107](./research.md)). Errors normalise to the existing `BridgeError` shape. Contract tests and mocks land with the interface change, per the principle's own clause. |
| **III. Menu Bar Ergonomics** | ✅ PASS | Escape / re-click / blur dismissal is untouched. Both appearances are required and delivered ([R-104](./research.md)) — this is the principle that independently confirms the user's Q3 answer. Keyboard operability is why seek and volume are native range inputs ([R-117](./research.md)). Reduced motion already handled twice over ([R-115](./research.md)). |
| **IV. Contract-First Testing** | ✅ PASS | The six new adapter methods get contract tests before implementation, run against both the real binding and the mock. New pure functions — word count, preset normalisation, selection reconciliation, clipboard mode choice — are unit-tested without a host runtime. The rest of this feature is rendering and styling, which the principle explicitly exempts from prior tests. |
| **V. Lean Footprint** | ✅ PASS | No new runtime dependency; +18–25 KB estimated, ~165 KB of headroom ([R-116](./research.md)). Volume, shuffle, and repeat fold into the *existing* single-round-trip poll script rather than adding `osascript` spawns ([R-109](./research.md)). Seek commits on release, not on every pointer-move ([R-117](./research.md)). Artwork fetch is demand-driven behind the same gate as playback polling and cached per track ([R-111](./research.md)). Animation stays opacity-only. |

### Technology & Platform Constraints

| Constraint | Status | Note |
|---|---|---|
| Frameworks renderer-only | ✅ PASS | No UI dependency added under `src/main/` or `src/preload/` |
| Styling: tokens once, `prefers-color-scheme`, no JS | ✅ PASS | One expanded `@theme` block; FR-083's live appearance change is a CSS media query, not a listener |
| No per-component colour literals | ✅ PASS | Measured tokens ([contracts/design-tokens.md](./contracts/design-tokens.md)); SC-007 audits it |
| IPC channels explicitly enumerated | ✅ PASS | Six additions to [contracts/ipc-channels.md](./contracts/ipc-channels.md) and `src/shared/channels.ts`, matched exactly |
| No renderer-supplied filesystem paths | ✅ PASS | Copy and Delete take `{ ids: string[] }`; main resolves against its own store |
| Handler arguments validated | ✅ PASS | New validators for the id array, volume range, and booleans in `src/main/ipc/validate.ts` |
| State: derived state not persisted | ✅ PASS | Selection is ephemeral by design ([R-106](./research.md)) |
| **Privacy: no undeclared network calls** | ⚠️ **AMENDMENT REQUIRED** | Album art needs one outbound request. See below. |

### Proposed spec amendments

The constitution forbids proceeding by silent waiver: *"A plan that conflicts with the constitution
MUST record the conflict in its Constitution Check and propose the amendment explicitly."* Three
conflicts were found in Phase 0. All three are amendments to **the spec**, not to the constitution —
the constitution is satisfied once the spec declares what it requires.

| # | Conflict | Research | Proposed amendment |
|---|---|---|---|
| **A-1** | FR-064 requires album art. No local source exists; the scripting interface yields an `https://i.scdn.co/…` URL. The Privacy clause forbids network calls "without an explicit approved spec entry". | [R-111](./research.md) | **Add FR-087** declaring the artwork fetch: image bytes only, main-process only, no credentials, demand-driven, cached per track, silent fallback. This is the entry the Privacy clause asks for. |
| **A-2** | FR-068 requires marking the current track as **liked**. Spotify's AppleScript dictionary has no writable liked/saved property; the only route is the Web API with OAuth and per-toggle HTTPS. | [R-110](./research.md) | **Amend FR-068** to drop Like. Adding an account and a network dependency for one control contradicts feature 001's offline-no-account promise. |
| **A-3** | FR-068 says "cycle repeat", implying Spotify's three-state off → all → one. The scripting property `repeating` is a boolean. | [R-109](./research.md) | **Amend FR-068** — repeat ships as an on/off toggle. |

Amendments A-1 to A-3 have been applied to the spec and are reflected in FR-068 and the new FR-087.

**Gate status**: ✅ **PASS** against constitution v2.0.0, with amendments A-1…A-3 recorded and
applied. No waivers, no open violations.

### Post-design re-check — ✅ PASS

Re-evaluated after Phase 1. The design introduces no violation the pre-check did not already cover:

- The six bridge additions stayed six; no capability leaked around the adapter.
- `data-model.md` adds exactly one persisted field and keeps selection ephemeral.
- The token contract has no colour outside it, so SC-007 is mechanically auditable.
- The artwork path is confined to the main process; `PlaybackState` gains a data URL, not a URL,
  so the renderer still cannot make the request even by accident.
- No new runtime dependency, so the Dependency gate is not engaged and feature 001's Complexity
  Tracking baseline (C-1…C-6) carries forward unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/002-panel-ui-v2/
├── plan.md                    # This file
├── spec.md                    # Feature specification
├── research.md                # Phase 0 — 17 decisions
├── data-model.md              # Phase 1 — type deltas against feature 001
├── quickstart.md              # Phase 1 — validation scenarios
├── contracts/
│   ├── host-bridge.md         # Phase 1 — adapter delta (6 new methods)
│   ├── ipc-channels.md        # Phase 1 — channel delta (6 new channels)
│   └── design-tokens.md       # Phase 1 — the measured token set, both appearances
├── checklists/
│   └── requirements.md        # Spec quality checklist
└── tasks.md                   # Phase 2 — via /speckit-tasks, NOT created here
```

### Source Code (repository root)

Files marked **new** do not exist yet; the rest are modified in place.

```text
src/
├── shared/
│   ├── types.ts                          # +timerPresets, +PlaybackState fields, +artworkDataUrl
│   └── channels.ts                       # +6 invoke channels
├── preload/
│   └── index.ts                          # +6 bridge bindings
├── main/
│   ├── index.ts                          # panel 460×420 → 632×235
│   ├── ipc/
│   │   ├── register.ts                   # +6 handlers
│   │   └── validate.ts                   # +id-array, volume, boolean validators
│   └── services/
│       ├── screenshots/
│       │   ├── clipboard.ts              # new — image vs file-reference choice (R-107)
│       │   └── screenshot-store.ts       # +delete-by-ids, reconcile
│       └── spotify/
│           ├── applescript.ts            # STATE_SCRIPT +volume/shuffle/repeat; +setter scripts
│           ├── artwork.ts                # new — fetch, cache, data URL (R-111)
│           └── playback-service.ts       # +setVolume/setShuffle/setRepeat, artwork wiring
└── renderer/
    ├── styles/theme.css                  # measured token set, both appearances
    ├── host/
    │   ├── host-contract.ts              # +6 methods
    │   ├── host-bridge.ts                # real implementations
    │   └── host-mock.ts                  # mock implementations incl. failure paths
    ├── components/
    │   ├── panel-shell.tsx               # rail + content column
    │   ├── rail.tsx                      # new — replaces sidebar.tsx
    │   ├── section-chrome.tsx            # new — header/body/divider/footer bands
    │   ├── preview-toggle.tsx            # new — footer switch, registry-driven (R-114)
    │   ├── sidebar.tsx                   # deleted
    │   └── ui/                           # new — chip, pill, icon-button, switch, range
    └── sections/
        ├── screenshots/                  # strip, selection, copy/delete
        ├── timer/                        # readout, transport, editable presets
        ├── spotify/                      # art, track, seek, transport, volume/shuffle/repeat
        ├── notes/                        # list + editor split, word count
        └── settings/                     # two columns, key chips, secondary actions

tests/
├── unit/                                 # word count, preset normalisation, selection
│                                         #   reconciliation, clipboard mode, token contrast
├── contract/                             # 6 new adapter methods, real + mock
└── e2e/                                  # browser-mode section walkthroughs
```

**Structure Decision**: The existing three-process layout is unchanged — this feature adds no
architectural layer. The one structural addition is `src/renderer/components/ui/`, a home for the
primitives the design repeats across sections (chip, pill, icon button, switch, range). Those five
primitives appear 40+ times across the five frames; giving them one definition each is what makes
SC-007 ("no colour literal inside a section") achievable rather than aspirational. `sidebar.tsx` is
deleted rather than adapted — the labelled 124 pt sidebar and the 64 pt icon rail share no markup.

## Complexity Tracking

> No new dependency and no new architectural layer is introduced by this feature, so this table adds
> nothing. Feature 001's Complexity Tracking (C-1…C-6) remains the approved dependency baseline that
> Principle V refers to, and it carries forward unchanged.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| — | — | — |

**Considered and rejected**: bundling Inter to match the design file literally ([R-103](./research.md)
— the system stack is a better platform match at 0 KB); a custom pointer-drag slider
([R-117](./research.md) — native range inputs give keyboard and a11y for free); the Spotify Web API
for Like ([R-110](./research.md) — an account and a network dependency for one control).

## Phase Status

- [x] **Phase 0** — [research.md](./research.md): 17 decisions, all NEEDS CLARIFICATION resolved
- [x] **Phase 1** — [data-model.md](./data-model.md), [contracts/](./contracts/),
      [quickstart.md](./quickstart.md)
- [ ] **Phase 2** — `tasks.md` via `/speckit-tasks` (not produced by this command)
