---

description: "Task list for Panel UI v2"
---

# Tasks: Panel UI v2

**Input**: Design documents from `/specs/002-panel-ui-v2/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: **Required**, and scoped by governance rather than preference. Constitution Principle IV
mandates tests-before-implementation for exactly two categories — the expand/collapse state machine
(untouched by this feature) and **every adapter method** — plus unit tests for any logic expressible
as a pure function. It equally exempts pure rendering and styling from prior tests. Test tasks below
follow that line precisely: 6 contract tests for the 6 new bridge methods, 6 unit tests for the new
pure functions, and no test tasks for markup.

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4, mapping to the user stories in spec.md
- Exact file paths in every description

## Path Conventions

Three-target Electron project, paths from repository root: `src/main/`, `src/preload/`,
`src/renderer/`, `src/shared/`, `tests/`. Per [plan.md](./plan.md#project-structure).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Groundwork that later phases build on, including the lint rule that makes SC-007
mechanically enforceable rather than a review convention.

- [X] T001 Create the `src/renderer/components/ui/` directory for the five primitives the design repeats across sections (chip, pill, icon button, switch, range)
- [X] T002 [P] Add a `no-restricted-syntax` rule to `eslint.config.mjs` forbidding hex colour literals under `src/renderer/sections/` and `src/renderer/components/`, so SC-007 fails lint rather than review
- [X] T003 [P] Create `tests/unit/design-tokens.spec.ts` as a failing placeholder asserting the token set in `src/renderer/styles/theme.css` matches `contracts/design-tokens.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The token set, the panel geometry, and the shared primitives. Every user story renders
against these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Replace the token block in `src/renderer/styles/theme.css` with the measured set from `contracts/design-tokens.md` — both appearances, one `@theme`, switched by `prefers-color-scheme` with no JavaScript (FR-052, FR-081, FR-082, FR-083)
- [X] T005 Implement `tests/unit/design-tokens.spec.ts`: every token in the contract exists; body-text pairs clear 4.5:1 and large-text/icon pairs clear 3:1 in **both** appearances; `--color-text-tertiary` is asserted as caption-only since it fails the body threshold by design (FR-053, SC-005)
- [X] T006 Change the panel from `{ width: 460, height: 420 }` to `{ width: 632, height: 235 }` in `src/main/index.ts:59-62`, and set the panel radius to 20 in `src/renderer/components/panel-shell.tsx` (FR-041, R-101)
- [X] T007 [P] Create `src/renderer/components/ui/chip.tsx` — 6/12 padding, radius 9, active variant with `--color-accent-border`
- [X] T008 [P] Create `src/renderer/components/ui/pill.tsx` — the header status pill on `--color-fill-strong`
- [X] T009 [P] Create `src/renderer/components/ui/icon-button.tsx` — 24 and 36 sizes, radius 12, requires an `aria-label` by type (FR-048)
- [X] T010 [P] Create `src/renderer/components/ui/switch.tsx` — 34×20 track, 16 knob, keyboard-operable with `role="switch"`
- [X] T011 [P] Create `src/renderer/components/ui/range.tsx` — a styled native `<input type="range">` (4 pt track, 10 pt knob) exposing separate `onInput` and `onCommit`, so callers can render continuously but act on release (R-117)
- [X] T012 Add a structural case to `tests/contract/host-bridge.spec.ts` asserting every method on the `HostBridge` type exists on both `host-bridge.ts` and `host-mock.ts`, so an interface addition without a mock fails the build (Principle II)

**Checkpoint**: Tokens, geometry, and primitives ready — user story work can begin.

---

## Phase 3: User Story 1 - A panel that reads at a glance (Priority: P1) 🎯 MVP

**Goal**: The shared skeleton — 64 pt icon rail plus a content column of four fixed bands (header,
body, divider, footer) — with section switching, keyboard navigation, and the footer preview toggle.

**Independent Test**: Run `npm run dev:browser`, switch between all five sections via the rail, and
confirm each renders header / body / divider / footer inside 632 × 235 with no clipping and no
panel-level scrollbar. Verified by V-101 to V-105 and V-119 to V-121 in [quickstart.md](./quickstart.md).

### Tests for User Story 1

- [X] T013 [P] [US1] Write `tests/e2e/panel-v2-shell.spec.ts` (Playwright, browser mode): rail shows five unlabelled icons with exactly one active; clicking each swaps the body while the rail and band structure stay fixed; the band heights sum to 235; no panel scrollbar in any section (FR-041 to FR-047)

### Implementation for User Story 1

- [X] T014 [US1] Create `src/renderer/components/rail.tsx` — 64 pt wide, 12 padding, 6 gap, 36×36 items at radius 12 with 18 pt icons, `--color-rail` background and a 1 pt `--color-rail-border` right edge; active item takes `--color-accent-subtle` background and `--color-accent` icon (FR-042, FR-043)
- [X] T015 [US1] Add arrow-key navigation and a visible focus ring to `src/renderer/components/rail.tsx`, porting the `onKeyDown` behaviour from `src/renderer/components/sidebar.tsx:22-29` and giving every icon-only item an accessible name (FR-048, SC-004)
- [X] T016 [US1] Create `src/renderer/components/section-chrome.tsx` — the four bands with content padding 16/18 and gap 14; the header slot takes title, pill, text action, and overflow button left to right; the body slot is a fixed 108 pt that clips and scrolls internally rather than growing (FR-044, FR-045, FR-047, R-105)
- [X] T017 [US1] Create `src/renderer/components/preview-toggle.tsx` — the footer switch, rendered **only** when `SectionDefinition.supportsPreview` is true in `src/renderer/sections/registry.ts`, writing `previews.<section>` via `updatePreferences`; label it for the menu bar preview and do not reproduce the design's "Floating capture bar" copy (FR-077 to FR-080, R-114)
- [X] T018 [US1] Rewrite `src/renderer/components/panel-shell.tsx` as rail plus content column, keeping the existing Escape handling and Tab containment intact (FR-046, Principle III)
- [X] T019 [US1] Update `src/renderer/app.tsx` to render `Rail` instead of `Sidebar` and to pass `preferences` and `onUpdate` down so the footer toggle and the Settings checkbox read one lifted state (FR-078)
- [X] T020 [US1] Delete `src/renderer/components/sidebar.tsx` and remove its imports — the 124 pt labelled sidebar and the 64 pt icon rail share no markup

**Checkpoint**: The skeleton is complete and every section renders inside it, even with its old body.

---

## Phase 4: User Story 2 - Screenshots as a browsable strip (Priority: P2)

**Goal**: A horizontal thumbnail strip with per-thumbnail selection, Select All, and footer Copy and
Delete acting on the selection.

**Independent Test**: Load the section with mock entries, select and deselect thumbnails, and confirm
the header count, the badges, and the footer actions respond. Verified by V-110 to V-112.

**Depends on**: User Story 1 (renders into `section-chrome.tsx`).

### Tests for User Story 2

- [X] T021 [P] [US2] Unit-test selection reconciliation in `tests/unit/screenshot-selection.spec.ts`: ids absent from an incoming `screenshots:changed` payload are dropped from the selection (R-106 — the phantom-selection bug this rule exists to prevent)
- [X] T022 [P] [US2] Unit-test the clipboard mode choice in `tests/unit/clipboard-mode.spec.ts`: one id selects image mode, two or more select file-reference mode, zero resolving ids throws (R-107)
- [X] T023 [P] [US2] Add contract tests for `copyScreenshots` and `deleteScreenshots` to `tests/contract/host-bridge.spec.ts`, run against both the real binding and the mock: unresolvable ids are skipped, all-unresolvable throws `BridgeError`, delete emits survivors via `onScreenshotsChanged`

### Implementation for User Story 2

- [X] T024 [P] [US2] Add `screenshotsCopy: 'screenshots:copy'` and `screenshotsDelete: 'screenshots:delete'` to `INVOKE_CHANNELS` in `src/shared/channels.ts`
- [X] T025 [P] [US2] Add `requireIdArray(value, max)` to `src/main/ipc/validate.ts` — string array of length 1…`MAX_SCREENSHOTS`, rejecting null bytes, never treating an entry as a path (contracts/ipc-channels.md)
- [X] T026 [US2] Create `src/main/services/screenshots/clipboard.ts` — one id writes the image via `nativeImage.createFromPath`; two or more write `text/uri-list` file references plus a plain-text path list (R-107)
- [X] T027 [US2] Add delete-by-ids to `src/main/services/screenshots/screenshot-store.ts` using `shell.trashItem`, then reconcile and emit `screenshots:changed` with the survivors (R-108)
- [X] T028 [US2] Register the `screenshots:copy` and `screenshots:delete` handlers in `src/main/ipc/register.ts`, resolving ids against the store — never accepting a path from the renderer
- [X] T029 [US2] Add `copyScreenshots` and `deleteScreenshots` to `src/renderer/host/host-contract.ts`, `host-bridge.ts`, and `host-mock.ts` in one change, including the mock failure paths listed in `contracts/host-bridge.md` (Principle II)
- [X] T030 [US2] Add the preload bindings for both channels in `src/preload/index.ts` — **no change needed**: the preload is generic (`invoke`/`subscribe`) and its allowlist derives from `ALL_INVOKE_CHANNELS`, so enumerating the channel in `src/shared/channels.ts` is the whole binding
- [X] T031 [US2] Rewrite `src/renderer/sections/screenshots/screenshot-card.tsx` as a 124×88 thumbnail with a corner selection badge, a `--color-scrim` relative-time chip, and a 124×13 meta row of filename plus save icon (FR-055, FR-056)
- [X] T032 [US2] Rewrite `src/renderer/sections/screenshots/screenshots-section.tsx` as a horizontal strip inside the body band — 12 pt gaps, four visible, horizontal scroll beyond that, most recent first (FR-054, R-105)
- [X] T033 [US2] Add selection state to `screenshots-section.tsx` — ephemeral `useState`, never persisted, never sent as state — with the reconciliation effect from T021 (FR-057, R-106)
- [X] T034 [US2] Wire the header for Screenshots: total count in the pill, "Select All" as the text action (FR-057, FR-059)
- [X] T035 [US2] Wire the footer for Screenshots: selection count, Copy, and Delete calling the T029 bridge methods with the selected ids (FR-058)
- [X] T036 [US2] Render the empty and error states from `src/renderer/components/states.tsx` inside the 108 pt body band so the header, divider, and footer stay in place (spec edge cases)

**Checkpoint**: Screenshots is fully functional; User Story 1 still passes.

---

## Phase 5: User Story 3 - Timer, Spotify, and Notes in the new skeleton (Priority: P2)

**Goal**: The three remaining content bodies — timer readout with editable presets, Spotify player
with seek/volume/shuffle/repeat and album art, and the notes list-plus-editor split.

**Independent Test**: Open each of the three against mock data and confirm its body matches the
designed arrangement and its primary control works. Verified by V-113 to V-117.

**Depends on**: User Story 1. The three sub-areas below are independent of each other and can be
worked in parallel by different people.

### Tests for User Story 3

- [X] T037 [P] [US3] Unit-test preset normalisation in `tests/unit/timer-presets.spec.ts`: sort ascending, de-duplicate, clamp to 1_000…86_400_000, cap at 8, and repair a malformed persisted array rather than throwing (R-112, data-model.md)
- [X] T038 [P] [US3] Unit-test word counting in `tests/unit/note-stats.spec.ts`: split on whitespace runs, discard empties, empty and whitespace-only notes are 0 words (FR-072, data-model.md)
- [X] T039 [P] [US3] Unit-test the artwork cache in `tests/unit/artwork-cache.spec.ts`: one fetch per distinct URL, LRU capped at 20, a failed fetch yields `null` with no retry storm (R-111)
- [X] T040 [P] [US3] Add contract tests for `setVolume`, `setShuffle`, and `setRepeat` to `tests/contract/host-bridge.spec.ts`: volume rejects `-1`, `101`, `50.5`, and `"50"` while accepting `0` and `100`; shuffle and repeat reject non-booleans; all three throw when Spotify is unavailable
- [X] T041 [P] [US3] Extend the `PlaybackState` contract test to assert `volume`, `shuffling`, `repeating`, and `artworkDataUrl` are all `null` whenever `availability` is not `playing` or `paused` (data-model.md)

### Implementation — Timer

- [X] T042 [P] [US3] Add `timerPresets: number[]` to `Preferences` and `DEFAULT_PREFERENCES` in `src/shared/types.ts`, defaulting to `[60_000, 300_000, 600_000, 1_500_000]` (data-model.md)
- [X] T043 [US3] Add the pure `normalisePresets` function to `src/main/services/preferences/preferences-service.ts` and apply it on every write and on read, so a hand-edited file is repaired rather than fatal (R-112)
- [X] T044 [US3] Rewrite `src/renderer/sections/timer/timer-section.tsx` to the designed body — 48 pt readout with 1.05 line-height, a status line with a dot and the projected finish time, an 88 pt primary transport button, a 36 pt reset button, and the preset chip row (FR-060, FR-061, FR-062)
- [X] T045 [US3] Add the add-preset control to `timer-section.tsx`, writing through `updatePreferences` and disabled once 8 presets exist (FR-063)

### Implementation — Spotify

- [X] T046 [P] [US3] Add `volume`, `shuffling`, `repeating`, and `artworkDataUrl` to `PlaybackState` in `src/shared/types.ts` (data-model.md)
- [X] T047 [US3] Extend `STATE_SCRIPT` in `src/main/services/spotify/applescript.ts` with `sound volume`, `shuffling`, `repeating`, and the track's `artwork url` as four more separator-delimited fields — one round trip, not four spawns (R-109, Principle V)
- [X] T048 [US3] Add the `sound volume`, `shuffling`, and `repeating` setter scripts to `src/main/services/spotify/applescript.ts`, routing them through the existing `runSpotifyScript` outcome handling
- [X] T049 [US3] Create `src/main/services/spotify/artwork.ts` — fetch image bytes from the artwork URL with no cookies or credentials, cache per URL (LRU, 20), return a data URL, and resolve `null` silently on failure (FR-087, R-111)
- [X] T050 [US3] Extend `src/main/services/spotify/playback-service.ts` with `setVolume`, `setShuffle`, and `setRepeat`; parse the four new fields; call `artwork.ts` only while observed; extend `unavailable()` to null all four (R-111, data-model.md)
- [X] T051 [P] [US3] Add `spotifySetVolume`, `spotifySetShuffle`, and `spotifySetRepeat` to `src/shared/channels.ts`, with validators in `src/main/ipc/validate.ts` (integer 0–100; strict booleans, no coercion)
- [X] T052 [US3] Register the three handlers in `src/main/ipc/register.ts` (preload needs no change — see T030)
- [X] T053 [US3] Add `setVolume`, `setShuffle`, and `setRepeat` to `host-contract.ts`, `host-bridge.ts`, and `host-mock.ts` in one change, with the mock returning a static inline artwork placeholder and never fetching (Principle I, II)
- [X] T054 [US3] Rewrite `src/renderer/sections/spotify/spotify-section.tsx` to the designed body — 88 pt album art, 17 pt track title, artist line, and a progress row of elapsed, track bar with knob, and duration (FR-064, FR-065)
- [X] T055 [US3] Add the seek interaction to `spotify-section.tsx` using `ui/range.tsx`, rendering position locally during the drag and firing `seekTo` **once on release** (FR-066, R-117)
- [X] T056 [US3] Build the Spotify transport row — 34 pt previous and next, 44 pt accent play/pause reflecting playback state (FR-067)
- [X] T057 [US3] Build the Spotify footer — volume via `ui/range.tsx`, shuffle toggle, repeat **toggle** (not a three-state cycle), and **no Like control** (FR-068 as amended, A-2, A-3)
- [X] T058 [US3] Render a neutral placeholder in the art slot when `artworkDataUrl` is `null`, leaving every other field intact (FR-087, R-111)

### Implementation — Notes

- [X] T059 [P] [US3] Create `src/renderer/sections/notes/note-stats.ts` with the pure word-count function from T038 (FR-072)
- [X] T060 [US3] Rewrite `src/renderer/sections/notes/notes-section.tsx` as a split body — 186 pt note list, 1 pt `--color-hairline` pane divider, editor pane — each side scrolling internally within the 108 pt band (FR-069, R-105)
- [X] T061 [US3] Style the note list rows: title plus relative edit time, selected row on `--color-accent-faint`, delete affordance on the row (FR-070, FR-071)
- [X] T062 [US3] Wire the Notes header "New Note" action and the Notes footer metadata line — edit time and word count from T059 — replacing the preview toggle, which Notes does not have (FR-071, FR-072, FR-079)
- [X] T063 [US3] On deleting the open note, move the editor to the next note, or to an empty state if none remain (spec edge case)

**Checkpoint**: All four content sections work; User Stories 1 and 2 still pass.

---

## Phase 6: User Story 4 - Settings as a two-column panel (Priority: P3)

**Goal**: Menu bar checkboxes and the timer shortcut side by side, with version and secondary actions
in the footer.

**Independent Test**: Toggle each checkbox, change and apply the shortcut, and confirm the changes
survive a panel close and reopen. Verified by V-118, V-120, V-122.

**Depends on**: User Story 1.

### Tests for User Story 4

- [X] T064 [P] [US4] Add a contract test for `quitApp` to `tests/contract/host-bridge.spec.ts` — the mock resolves and sets an assertable flag rather than exiting

### Implementation for User Story 4

- [X] T065 [P] [US4] Add `appQuit: 'app:quit'` to `src/shared/channels.ts` and register the handler in `src/main/ipc/register.ts` calling `app.quit()` (R-113)
- [X] T066 [US4] Add `quitApp` to `host-contract.ts`, `host-bridge.ts`, and `host-mock.ts` (preload needs no change — see T030)
- [X] T067 [US4] Rewrite `src/renderer/sections/settings/settings-section.tsx` as two columns split by a 1 pt vertical `--color-hairline`: preview checkboxes left, timer shortcut right (FR-073)
- [X] T068 [US4] Derive the checkbox list from `PREVIEWABLE_SECTIONS` in `src/renderer/sections/registry.ts` so a section without a preview cannot appear (FR-074)
- [X] T069 [US4] Render the timer shortcut as one chip per key using `ui/chip.tsx`, with an Apply button and the hint line beneath, keeping the existing conflict message in place (FR-075)
- [X] T070 [US4] Build the Settings footer — version from `package.json`, "Reset Defaults" as the header action writing `DEFAULT_PREFERENCES` and re-registering the shortcut, "Updates" via `shell.openExternal` to the releases page, and "Quit" calling `quitApp` (FR-076, R-113)
- [X] T071 [US4] Confirm the Settings footer renders **no** preview toggle — the `Settings Widget v2` frame shows one in error, and T017's registry-driven rendering must already prevent it (FR-076, FR-079, V-119)

**Checkpoint**: All four user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T072 [P] Confirm the section cross-fade in `src/renderer/motion/index.tsx` animates only the body, never the rail or bands, and stays opacity-only (FR-046, R-115)
- [X] T073 [P] Update `README.md` for the v2 panel — new dimensions, the new controls, and the FR-087 network declaration with its bounds
- [X] T074 [P] Update `specs/002-panel-ui-v2/checklists/requirements.md` with the implementation outcome
- [X] T075 Run `npm run lint` — the T002 colour rule and the existing no-host-globals rule must both pass (SC-007, V-109, V-127)
- [X] T076 Run `npm run typecheck` across `tsconfig.node.json` and `tsconfig.web.json`
- [X] T077 Run `npm test` — all unit and contract suites, new and pre-existing
- [X] T078 Run `npm run test:e2e` in browser mode, exercising the mock failure paths: Spotify unavailable, delete failure, copy with no resolving id, artwork fetch failure (Principle I, V-126)
- [X] T079 Run `npm run build` and report the **measured** renderer bundle size against the 500 KB gate — not the R-116 estimate (Principle V, V-123)
- [X] T080 Measure and record idle CPU with the panel closed and no preview enabled, and panel open-to-interactive latency; required in the change description because this feature touches the adapter and the polling script (Principle V, V-124, V-125)
- [X] T081 Manually verify the Principle III ergonomics gate and note the result in the change description: Escape, blur-dismiss, re-click toggle, keyboard focus, **both appearances**, reduced motion (V-103, V-105, V-106)
- [X] T082 Run the full `quickstart.md` sweep V-101 to V-128, including V-128's regression check that feature 001's V-001 to V-014 still pass (SC-008)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — **blocks all user stories**
- **User Story 1 (Phase 3)**: Depends on Foundational
- **User Stories 2, 3, 4 (Phases 4–6)**: Depend on Foundational **and on User Story 1**
- **Polish (Phase 7)**: Depends on all desired stories

### User Story Dependencies

This feature has one genuine cross-story dependency, and the spec states it outright: US1 is the
shared skeleton, and US2, US3, and US4 are bodies that drop into it. They cannot render before
`section-chrome.tsx` exists.

- **US1 (P1)**: Depends only on Foundational. **This is the MVP.**
- **US2 (P2)**: Depends on US1. Independent of US3 and US4.
- **US3 (P2)**: Depends on US1. Independent of US2 and US4. Its three sub-areas (Timer, Spotify,
  Notes) are independent of each other.
- **US4 (P3)**: Depends on US1. Independent of US2 and US3.

Once US1 lands, US2, US3, and US4 proceed fully in parallel.

### Within Each User Story

- Contract and unit tests are written **before** the implementation they cover and must fail first
- Types and channels before services; services before handlers; handlers before UI
- A bridge method, its mock, and its contract test land together — never as follow-ups

### Parallel Opportunities

- **Phase 1**: T002 and T003
- **Phase 2**: T007–T011, the five UI primitives, are five separate files
- **Phase 3**: T013 runs alongside T014–T017 (test file vs. component files)
- **Phase 4**: T021, T022, T023 together; then T024 and T025
- **Phase 5**: T037–T041 together; then the Timer, Spotify, and Notes tracks in parallel
- **Phase 7**: T072, T073, T074 together

---

## Parallel Example: Phase 5 (User Story 3)

```bash
# All five test tasks first — they must fail before implementation:
Task: "Unit-test preset normalisation in tests/unit/timer-presets.spec.ts"
Task: "Unit-test word counting in tests/unit/note-stats.spec.ts"
Task: "Unit-test the artwork cache in tests/unit/artwork-cache.spec.ts"
Task: "Contract-test setVolume/setShuffle/setRepeat in tests/contract/host-bridge.spec.ts"
Task: "Extend the PlaybackState nulling contract test"

# Then three independent tracks:
Track A (Timer):   T042 → T043 → T044 → T045
Track B (Spotify): T046 → T047 → T048 → T049 → T050 → T051 → T052 → T053 → T054 → T055 → T056 → T057 → T058
Track C (Notes):   T059 → T060 → T061 → T062 → T063
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup — T001–T003
2. Phase 2: Foundational — T004–T012 (**blocks everything**)
3. Phase 3: User Story 1 — T013–T020
4. **STOP and VALIDATE**: V-101 to V-105, V-119 to V-121

At this checkpoint the panel already looks and navigates like the design, with the existing section
bodies inside it. That is a demonstrable, shippable increment.

### Incremental Delivery

1. Setup + Foundational → tokens, geometry, primitives
2. **US1** → the skeleton → validate → demo (**MVP**)
3. **US2** → screenshots strip → validate → demo
4. **US3** → timer, spotify, notes → validate → demo
5. **US4** → settings → validate → demo
6. Polish → the four gates (payload, performance, ergonomics, quickstart)

### Parallel Team Strategy

1. Everyone on Setup + Foundational
2. One person takes US1 — it blocks the rest, so it is not a place to parallelise
3. Once US1 lands: Developer A on US2, Developer B on US3 (or three people across its Timer,
   Spotify, and Notes tracks), Developer C on US4

---

## Notes

- The three spec amendments from planning are load-bearing in this list: **no Like control** (T057),
  **repeat is a toggle not a cycle** (T057), and **album art is a declared, main-process-only fetch**
  (T049, T058). Building any of them the way the design frame draws it is a regression, not a bonus.
- The `Settings Widget v2` frame draws a preview toggle in its footer. It is a drafting error. T017
  makes reproducing it structurally impossible, and T071 verifies that.
- No task adds a runtime dependency. If one seems necessary, it needs a Complexity Tracking entry and
  a justification for the widened boundary — not a quiet `npm install`.
- No new channel accepts a filesystem path. Copy and Delete take ids that main resolves against its
  own store; this is the constitution's Security rule and the reason T026 and T028 are shaped as
  they are.
- Commit after each task or logical group. Stop at any checkpoint to validate a story independently.

---

## Implementation Outcome (2026-08-22)

All 82 tasks complete. Gates: **257 unit + contract tests pass**, **15 e2e tests pass** against the
real Electron app, lint and typecheck clean, renderer payload **330.0 KB / 500 KB** (170 KB headroom,
matching the R-116 estimate of ~330 KB).

Layout verified by driving the built UI in both appearances: all five sections render at exactly
632 x 235 with bands of 24 / 108 / 28, no panel scrolling, and the preview switch present in exactly
Screenshots, Timer and Spotify.

### Amendments made during implementation

| # | What | Why |
|---|---|---|
| **A-4** | Feature 001's FR-014a narrowed | Copy and Delete are precisely what "never move, copy or delete a screenshot" forbade. The promise was narrowed rather than waived: the indexing path stays strictly read-only, only an explicit click acts on a file, and Delete goes to the Trash. Recorded on FR-014a in feature 001 and on FR-058 here; `tests/unit/screenshots-readonly.spec.ts` now asserts both halves and confines trashing to `actions.ts`. |
| **A-5** | `--color-accent-strong` added to the token set | White on the measured `#2b89fa` is 3.46:1 — fine for an icon, short of the 4.5:1 body threshold for the 12–13 pt "Start" and "Apply" labels. A darker fill carries labelled accent buttons; the measured accent still carries icons, fills and indicators. |

### Design deviations, each deliberate

- **"Open Spotify" header action not built.** No bridge method launches another application, and
  adding one widens the native boundary for something the Dock already does. A control that does
  nothing is worse than its absence (the same reasoning as R-110 on Like).
- **Inter → system font stack** (R-103): Inter is a pen.dev canvas stand-in for SF Pro, which is the
  native face and costs 0 KB.
- **Timer shortcut is a recorder, not a text field.** The frame shows key chips plus Apply. A text
  box beside the chips would show the same shortcut twice and leave the chips decorative, so the
  chip field itself records the combination.

### Bugs found and fixed by the verification gates

1. **The light appearance rendered dark.** Tailwind v4 hoists `@theme` to the top level, so an
   `@theme` nested in a media query is emitted unconditionally and the dark block simply won. Tokens
   are now plain `:root` custom properties — every one is consumed as an arbitrary value, so no
   generated utility depended on `@theme` anyway.
2. **Rail focus did not follow selection.** ArrowDown then ArrowUp landed two items away, because
   focus stayed on the originally focused button while selection moved.
3. **`input[type=range].track` declared `width: 100%`**, outranking every caller's width utility on
   specificity and stretching the volume slider across the footer.
4. **Settings checkboxes were `role="checkbox"` buttons**, re-implementing what a native checkbox in
   a label provides. Switched to native inputs, which also restored the FR-031 independence e2e.

