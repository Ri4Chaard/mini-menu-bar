---

description: "Task list for 003-mvp-screenshots-timer"
---

# Tasks: MVP Scope — Screenshots & Timer

**Input**: Design documents from `/specs/003-mvp-screenshots-timer/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **Required, not optional.** Constitution Principle IV mandates contract tests for every
adapter change and unit tests for every pure function, and each file in `contracts/` carries explicit
test obligations. Test tasks below are requirements.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1…US5, mapping to the user stories in [spec.md](./spec.md)

## Path Conventions

Three build targets plus a browser target, per [plan.md](./plan.md): `src/main/`, `src/preload/`,
`src/renderer/`, shared code in `src/shared/`, tests in `tests/`.

---

## Phase 1: Setup

**Purpose**: Capture the pre-change state. This feature is measured against a baseline and rewrites a
preferences file whose original is not otherwise recoverable.

- [X] T001 Back up the live preferences file to `/tmp/prefs-before.json` — it currently holds `lastSection: "spotify"`, `previews.spotify` and `screenshotsSeenWatermark`, which is the only real sample of the pre-migration shape and is destroyed on first write after T011
- [X] T002 [P] Record the pre-change renderer payload by running `npm run build` and writing the figure into the Gate 8 "Before" column of `specs/003-mvp-screenshots-timer/quickstart.md`
- [X] T003 [P] Confirm a green starting point: `npm run typecheck`, `npm run lint`, `npm test` all pass and the working tree is clean

**Checkpoint**: Baseline captured, original preferences preserved.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Every removal story edits the same seven boundary files. Doing those edits once, here,
is what lets US1–US5 proceed without fighting over `types.ts`, `channels.ts` and the host contract.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Narrow `SectionId` and `SECTION_IDS` to `'screenshots' | 'timer'`, remove `PreviewPreferences.spotify`, remove `screenshotsSeenWatermark` from `Preferences`, and delete the `PlaybackState` and `Note` types in `src/shared/types.ts`
- [X] T005 Remove the 17 Spotify/Notes/Copy/mark-seen channels from `src/shared/channels.ts` so it matches `specs/003-mvp-screenshots-timer/contracts/ipc-channels.md` exactly
- [X] T006 Remove the 11 Spotify/Notes/Copy/mark-seen methods from `src/renderer/host/host-contract.ts` per `contracts/host-bridge.md`
- [X] T007 [P] Remove the same methods from `src/renderer/host/host-bridge.ts`
- [X] T008 [P] Remove the same methods and delete the Spotify/Notes fixture data from `src/renderer/host/host-mock.ts`
- [X] T009 Remove the corresponding `contextBridge` methods from `src/preload/index.ts` — **no change required**: the preload derives its allowlist from `ALL_INVOKE_CHANNELS`/`ALL_EVENT_CHANNELS`, so it tightened automatically with T005. Verified, not edited.
- [X] T010 Remove the corresponding `ipcMain` handlers from `src/main/ipc/register.ts`
- [X] T011 Extend `revivePreferences` in `src/main/services/preferences/preferences-service.ts` to map a `lastSection` of `spotify`/`notes` to `screenshots` and to drop `previews.spotify` and `screenshotsSeenWatermark` on read, and remove the `spotify` key from the `mergePreferences` preview merge (R-209)
- [X] T012 [P] Write `tests/unit/preferences-migration.spec.ts` asserting that the exact JSON shape captured in T001 migrates cleanly and that removed fields are never written back — this is a P1 path, not a defensive one
- [X] T013 Update `tests/contract/host-bridge.spec.ts` to assert the exact surviving method set and that the mock and real binding expose identical key sets, so a re-added method fails the suite

**Checkpoint**: The native boundary is its final shape. User stories can now proceed.

---

## Phase 3: User Story 1 — A two-feature app (Priority: P1) 🎯 MVP

**Goal**: Spotify, Notes and Copy are gone — sections, services, packaging and permissions.

**Independent Test**: Launch and confirm only Screenshots, Timer and Settings are reachable, no Copy
control exists, and no automation permission is requested even with the music app playing.

- [X] T014 [P] [US1] Delete `src/main/services/spotify/` (applescript.ts, artwork.ts, playback-service.ts)
- [X] T015 [P] [US1] Delete `src/main/services/notes/`
- [X] T016 [P] [US1] Delete `src/renderer/sections/spotify/`
- [X] T017 [P] [US1] Delete `src/renderer/sections/notes/`
- [X] T018 [US1] Remove the Spotify and Notes entries from `src/renderer/sections/registry.ts` — `PREVIEWABLE_SECTIONS` and the Settings toggle list derive from this array, so the settings UI corrects itself (FR-091, FR-092)
- [X] T019 [US1] Remove the playback and notes service construction, the `setPreviewActive` call and the tray `setPlayback` wiring from `src/main/index.ts`
- [X] T020 [US1] Remove the Spotify segment and the `PlaybackState` input from `src/main/tray/preview-composer.ts`, and remove `setPlayback` from `src/main/tray/tray-controller.ts`
- [X] T021 [US1] Remove the Copy control from `src/renderer/sections/screenshots/screenshots-section.tsx`, remove the copy path from `src/main/services/screenshots/actions.ts`, and delete `src/main/services/screenshots/clipboard.ts` (FR-096, R-210)
- [X] T022 [P] [US1] Delete `tests/unit/clipboard-mode.spec.ts` and `tests/unit/artwork-cache.spec.ts`
- [X] T023 [US1] Remove `com.apple.security.automation.apple-events` from `build/entitlements.mac.plist` and `NSAppleEventsUsageDescription` from `electron-builder.yml`, leaving `NSDesktopFolderUsageDescription` and `allow-jit` in place (R-211)

**Checkpoint**: The app is two features. Idle CPU should already have fallen — the 2 s `osascript`
poll is gone. Typecheck, lint and 277 tests green; renderer payload 332.5 → 316.4 KB.

> **Pulled forward from US4**: removing `screenshotsSeenWatermark` in T004 made `markSeen()`,
> `unseenCount()` and `isSeen` uncompilable, so the store half of **T037** and the spec rewrite half
> of **T040** landed here rather than in Phase 6 — the MVP could not be green otherwise. The rail's
> unseen badge became a total count for the same reason. T037/T040 are marked where they sit.

---

## Phase 4: User Story 2 — Select a screenshot by clicking it (Priority: P1)

**Goal**: Click toggles selection; double-click opens; the corner icon reads as "show in folder".

**Independent Test**: Click three thumbnails and confirm the selection count tracks exactly, with no
file opening; double-click one and confirm it opens.

- [X] T024 [US2] Change the thumbnail button from `onOpen` to a selection toggle in `src/renderer/sections/screenshots/screenshot-card.tsx`, keeping the frame draggable so drag-out is unaffected (FR-097, FR-098)
- [X] T025 [US2] Add a `dblclick` handler on the same frame that calls `onOpen`, with **no click-delay timer** — FR-101 makes the naive implementation correct, and a deferral would make every selection feel laggy (R-206)
- [X] T026 [P] [US2] Replace the `Download` icon with a folder icon in `src/renderer/sections/screenshots/screenshot-card.tsx` — behaviour and `aria-label` are already correct, this is cosmetic only (FR-102)
- [X] T027 [US2] Make selection keyboard-operable and convey the selected state to assistive technology in `src/renderer/sections/screenshots/screenshot-card.tsx`, reconciling the existing corner checkbox badge so there are not two competing selection controls (FR-099)
- [X] T028 [US2] Update `tests/unit/renderer/screenshot-selection.spec.ts` for the new gesture mapping, including that a double-click leaves selection net-unchanged

**Checkpoint**: Selection is the primary gesture and drag-out still works.

---

## Phase 5: User Story 3 — Type the timer duration (Priority: P2)

**Goal**: The clock readout is editable in place; typed durations replace generated presets.

**Independent Test**: Type `7:30`, start, and confirm the countdown begins from 7 m 30 s.

- [X] T029 [P] [US3] Create `src/renderer/sections/timer/parse-duration.ts` as a pure parser implementing the format table in `data-model.md`, reusing `MIN_TIMER_PRESET_MS` and `MAX_TIMER_PRESET_MS` for bounds
- [X] T030 [P] [US3] Write `tests/unit/parse-duration.spec.ts` covering every row of that table, especially the deliberate split between **rejecting** unparseable input and **clamping** out-of-range input (FR-106 vs FR-107)
- [X] T031 [US3] Create `src/renderer/sections/timer/duration-input.tsx` — the existing large readout becomes editable on click or focus, `Enter` commits, blur reverts rather than committing a half-typed value
- [X] T032 [US3] Wire it into `src/renderer/sections/timer/timer-section.tsx`, removing the `Edit Presets` header action and the `Plus` control that spawns the next unused round number (FR-105)
- [X] T033 [US3] Implement the two-stage `Escape` rule — first `Escape` reverts the edit and keeps the panel open, a second dismisses the panel (R-208). This changes a Principle III guarantee and must be verified manually in T051
- [X] T034 [US3] Confirm `tests/unit/design-tokens.spec.ts` still passes — the editable readout must not add a row or disturb the asserted band arithmetic summing to 235

**Checkpoint**: Any duration is reachable by typing.

---

## Phase 6: User Story 4 — The menu bar always says how many (Priority: P2)

**Goal**: A count badge in the thumbnail's corner; the app icon when empty; no seen/unseen concept.

**Independent Test**: Take a screenshot and watch the count rise within 2 s; delete them all and
confirm the app icon appears with no badge.

- [X] T035 [P] [US4] Create `src/main/tray/badge.ts` with `digitGlyph` (the 3×5 bitmap font from R-202) and `composeBadge`, implementing every row of the behavioural contract in `contracts/tray-badge.md`
- [X] T036 [P] [US4] Write `tests/unit/tray-badge.spec.ts` covering all six test obligations — in particular that `count <= 0` leaves the buffer **byte-identical**, and that pixels outside the badge region are untouched (the test that catches a row-stride off-by-one)
- [X] T037 [US4] Replace `unseenCount()` and all seen-watermark tracking with a total count in `src/main/services/screenshots/screenshot-store.ts` (FR-110, FR-112)
- [X] T038 [US4] Change `composePreview` in `src/main/tray/preview-composer.ts` to emit `badgeCount` instead of an unseen title segment, per the `TrayPreviewModel` change in `data-model.md` (depends on T020)
- [X] T039 [US4] Composite the badge in `src/main/tray/tray-controller.ts` at 64×36 tagged `scaleFactor: 2`, and **never composite onto `defaultImage`** — a zero count must not paint "0" over the app icon (FR-114, FR-115)
- [X] T040 [US4] Update `tests/unit/preview-composer.spec.ts` for the new model and count semantics
- [X] T041 [US4] Remove any remaining mark-seen references from `tests/unit/screenshots-readonly.spec.ts` and `tests/unit/staging-source.spec.ts`
- [ ] T042 [US4] Verify via `specs/003-mvp-screenshots-timer/quickstart.md` Gate 5 that the menu bar reflects a new capture within the existing 2 s budget (FR-113)

**Checkpoint**: The menu bar reports an honest total and never shows a placeholder.

---

## Phase 7: User Story 5 — Bar-themed identity, less inert chrome (Priority: P3)

**Goal**: A wine-glass icon replaces the grid glyph; the inert three-dot control is gone.

**Independent Test**: No three-dot control in any section header; the app and menu bar carry the
wine-glass mark in both appearances.

- [X] T043 [P] [US5] Remove the `MoreHorizontal` control and the now-unused `onOverflow` / `overflowLabel` props from `src/renderer/components/section-chrome.tsx` — it is wired to nothing in any section, so this cannot regress behaviour (FR-117)
- [X] T044 [P] [US5] Create `scripts/make-icons.mjs` emitting PNGs with a hand-rolled encoder over Node's built-in `zlib`, since no SVG rasteriser is installed on the target machine (R-205)
- [X] T045 [US5] Generate `resources/trayTemplate.png` and `resources/trayTemplate@2x.png` as a **monochrome-plus-alpha template** wine-glass silhouette, replacing the four-square grid glyph that was being read as a broken image (R-204)
- [X] T046 [US5] Generate `build/icon.icns` via `iconutil` from a generated `.iconset` and reference it from `electron-builder.yml` (FR-118)
- [ ] T047 [US5] Verify via `specs/003-mvp-screenshots-timer/quickstart.md` Gate 5 that `resources/trayTemplate.png` tints correctly in both light and dark menu bars, which is what the template-image constraint exists to guarantee (FR-116)

**Checkpoint**: All five stories complete.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T048 Run Gates 1–3 of `specs/003-mvp-screenshots-timer/quickstart.md`: static checks, payload budget, browser mode
- [ ] T049 Run quickstart Gate 4 against `/tmp/prefs-before.json` and confirm no removed field persists
- [ ] T050 Run Gate 5 of `specs/003-mvp-screenshots-timer/quickstart.md` covering every badge state, watching for a single frame of "0" or the old glyph on the delete-all step
- [ ] T051 Run quickstart Gate 6 manual ergonomics including the two-stage `Escape`, and **note the result in the change description** as the constitution's manual gate requires
- [ ] T052 Run quickstart Gate 7 — the unprobed R-207 assumption that a drag suppresses the following `click`; apply the movement-threshold fallback if selection toggles after a drag
- [ ] T053 Run Gate 8 of `specs/003-mvp-screenshots-timer/quickstart.md` and record the after-figures for idle CPU, memory and payload in that file; idle CPU should fall from the 0.277% baseline now that the poll loop is gone
- [ ] T054 [P] Update `README.md` to describe two features rather than four, and remove the Spotify permission and network-access notes

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)** → no dependencies
- **Foundational (Phase 2)** → depends on Setup; **blocks every user story**
- **US1 (Phase 3)** → depends on Foundational
- **US2, US3, US5 (Phases 4, 5, 7)** → depend on Foundational only; independent of US1 and of each other
- **US4 (Phase 6)** → depends on Foundational, and T038 depends on **T020 in US1** (same file: `preview-composer.ts`)
- **Polish (Phase 8)** → depends on all desired stories

### The one cross-story dependency

`src/main/tray/preview-composer.ts` is edited twice: T020 removes the Spotify segment (US1) and T038
changes the count semantics (US4). **T020 must land before T038.** This is the only place two stories
touch one file, and it exists because the Foundational phase deliberately absorbed the other six
shared files to prevent exactly this.

### Within each story

- Pure functions and their tests before the components that consume them (T029/T030 before T031; T035/T036 before T039)
- Contract and unit tests land in the same change set as the code they cover, per Principle IV

### Parallel opportunities

- T002, T003 in Setup
- T007, T008 in Foundational; T012 alongside them
- T014–T017 (four independent deletions) and T022 in US1
- T026 alongside T024/T025 in US2
- T029 + T030 in US3
- T035 + T036 in US4
- T043 + T044 in US5
- After Foundational, **US2, US3 and US5 can be worked fully in parallel** by different people

---

## Parallel Example: User Story 1

```bash
# Four independent deletions, no shared files:
Task: "Delete src/main/services/spotify/"
Task: "Delete src/main/services/notes/"
Task: "Delete src/renderer/sections/spotify/"
Task: "Delete src/renderer/sections/notes/"
Task: "Delete tests/unit/clipboard-mode.spec.ts and tests/unit/artwork-cache.spec.ts"
```

## Parallel Example: after Foundational

```bash
# Three stories, no overlapping files:
Developer A: US2 — src/renderer/sections/screenshots/screenshot-card.tsx
Developer B: US3 — src/renderer/sections/timer/
Developer C: US5 — src/renderer/components/section-chrome.tsx + scripts/make-icons.mjs
```

---

## Implementation Strategy

### MVP scope

**Phases 1–3 (T001–T023).** US1 alone is a coherent, shippable increment: the app becomes two
features, stops requesting automation access, and sheds its only polling loop. Nothing in US2–US5 is
required for it to be correct.

Stop after T023 and validate: launch, confirm two sections, confirm no permission prompt, and
re-measure idle CPU — the largest single performance win in this feature lands here.

### Incremental delivery

1. Setup + Foundational → boundary is final
2. **US1 → MVP.** Two features, no permission prompt, poll loop gone
3. US2 → selection becomes the primary gesture
4. US3 → any duration reachable
5. US4 → the menu bar tells the truth about how many
6. US5 → the app looks like itself

### Risk ordering

The two highest-risk tasks are **T039** (the badge guard — a zero count painting over the app icon is
the exact bug FR-115 exists to prevent) and **T052** (the one assumption in the plan that could not be
probed). Neither blocks the MVP, which is why both sit after it.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task
- This feature is predominantly subtractive: 11 bridge methods and 17 IPC channels removed, none added
- Commit after each task or logical group; stop at any checkpoint to validate a story independently
- The constitution's performance gate applies (T053) because this feature touches polling and the adapter
