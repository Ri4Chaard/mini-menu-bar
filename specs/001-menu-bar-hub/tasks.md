---
description: "Task list for Menu Bar Hub implementation"
---

# Tasks: Menu Bar Hub

**Input**: Design documents from `/specs/001-menu-bar-hub/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included, but **scoped** — constitution v2.0.0 Principle IV mandates tests-first for
exactly three categories: the panel state machine, every host-bridge method (against both the real
and mock implementations), and pure functions such as the preview composer. Rendering and styling
tasks carry no test obligation. This is deliberate: blanket TDD over CSS is explicitly *not* required.

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps to a user story in [spec.md](./spec.md)

## Path Conventions

Three-process desktop app per [plan.md](./plan.md): `src/main/`, `src/preload/`, `src/renderer/`,
`src/shared/`, `tests/`. All paths below are repository-root relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Toolchain, configuration, and the lint rules that mechanically enforce the constitution

- [ ] T001 Initialize npm project and define scripts (`dev`, `dev:browser`, `build`, `test`, `test:e2e`) in package.json
- [ ] T002 Install main/preload dependencies (electron, menubar@^9.5.3) and record versions in package.json
- [ ] T003 [P] Install renderer dependencies (react, react-dom, motion, lucide-react, tailwindcss v4) in package.json
- [ ] T004 [P] Install dev dependencies (electron-vite, typescript, vitest, @playwright/test, eslint) in package.json
- [ ] T005 Create three build targets (main, preload, renderer) in electron.vite.config.ts, with the preload target emitting CommonJS and bundling its dependencies per research.md R-002
- [ ] T006 [P] Create tsconfig.json, tsconfig.node.json, and tsconfig.web.json with strict mode enabled
- [ ] T007 [P] Define appearance tokens once in src/renderer/styles/theme.css using Tailwind v4 `@theme`, switched by `prefers-color-scheme` with no JavaScript
- [ ] T008 [P] Add ESLint rule banning `window.__hostBridge`, `require`, `process`, and `ipcRenderer` outside src/renderer/host/ in eslint.config.js (constitution Principle I)
- [ ] T009 [P] Add ESLint rule requiring named imports from lucide-react in eslint.config.js per research.md R-009
- [ ] T010 [P] Add a `dev:browser` vite target in electron.vite.config.ts that serves only the renderer with no Electron process
- [ ] T011 [P] Add a bundle-size gate to scripts/check-bundle-size.mjs that fails the build above 500 KB uncompressed (constitution Principle V)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The panel shell, the host bridge, and persistence — everything every section needs

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

**Note on scope**: spec.md frames the MVP as "panel shell + sidebar + one working section". The shell
half lives here because all five stories need it; the section half is User Story 1. Phase 2 + Phase 3
together produce exactly the MVP the spec describes.

- [ ] T012 Define all domain types (ScreenshotEntry, TimerState, Note, PlaybackState, Preferences, Section) in src/shared/types.ts per data-model.md, using epoch-millisecond numbers rather than Date objects
- [ ] T013 Define the HostBridge interface in src/renderer/host/host-contract.ts exactly matching contracts/host-bridge.md
- [ ] T014 [P] Define error codes and a `normalizeError` helper in src/shared/errors.ts so raw Node errors never cross the boundary
- [ ] T015 Create the IPC channel registry in src/main/ipc/channels.ts, matching contracts/ipc-channels.md exactly with no dynamically-named channels
- [ ] T016 [P] Implement argument validation helpers in src/main/ipc/validate.ts, rejecting any renderer-supplied filesystem path
- [ ] T017 Implement an atomic write-then-rename JSON store in src/main/services/storage/json-store.ts per research.md R-010
- [ ] T018 [P] Write unit tests for atomic write and corrupt-file fallback in tests/unit/json-store.spec.ts
- [ ] T019 Implement the preferences service with defaults and partial-merge semantics in src/main/services/preferences/preferences-service.ts
- [ ] T020 [P] Write unit tests asserting that writing one preview flag leaves the other two byte-identical (FR-031) in tests/unit/preferences-service.spec.ts
- [ ] T021 Implement the preload script in src/preload/index.ts exposing the bridge over `contextBridge` with forwarding only and zero business logic
- [ ] T022 Implement the real host bridge in src/renderer/host/host-bridge.ts as the only file referencing the preload-exposed global
- [ ] T023 Implement the mock host bridge skeleton with in-memory state and reachable failure paths in src/renderer/host/host-mock.ts
- [ ] T024 Implement capability-detecting host selection and a React context provider in src/renderer/host/use-host.ts
- [ ] T025 Create the contract test harness that runs one suite against both bridge implementations in tests/contract/host-bridge.spec.ts (constitution Principle IV)
- [ ] T026 Bootstrap menubar in src/main/index.ts, passing `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` through its `browserWindow` option per research.md R-001
- [ ] T027 [P] Deny new-window and non-local navigation via `app.on('web-contents-created')` in src/main/index.ts
- [ ] T028 Write panel state machine tests FIRST, covering all three dismissal paths, in tests/unit/panel-state.spec.ts (constitution Principle IV — these MUST fail before T029)
- [ ] T029 Implement panel show/hide with icon-toggle, Escape, and blur dismissal in src/main/window/panel-window.ts (FR-002)
- [ ] T030 Build the React shell with sidebar and content area in src/renderer/app.tsx and src/renderer/main.tsx (FR-003)
- [ ] T031 [P] Implement the sidebar component in src/renderer/components/sidebar.tsx (FR-005)
- [ ] T032 [P] Define the four-section registry with its `supportsPreview` flag in src/renderer/sections/registry.ts (FR-004, FR-028)
- [ ] T033 [P] Implement focus entry, Tab containment, and focus return in src/renderer/components/panel-shell.tsx (FR-007)
- [ ] T034 [P] Configure LazyMotion with the `domAnimation` feature set as the sole import site for `motion` in src/renderer/motion/index.tsx per research.md R-006
- [ ] T035 [P] Implement shared empty-state and error-state components in src/renderer/components/states.tsx
- [ ] T036 Wire last-selected-section persistence through preferences in src/renderer/app.tsx (FR-006)
- [ ] T037 Verify browser mode boots with all four sections navigable per quickstart.md V-001

**Checkpoint**: The panel opens, dismisses correctly, navigates between four (empty) sections, and the
whole UI runs in Chrome against the mock. User story work can now begin.

---

## Phase 3: User Story 1 - Never lose a screenshot again (Priority: P1) 🎯 MVP

**Goal**: Recent screenshots visible as thumbnails on click, openable and locatable — including ones
saved to folders the user has forgotten about.

**Independent Test**: Take three screenshots, click the menu bar icon, confirm all three appear
newest-first, open one, reveal another in Finder.

### Tests for User Story 1

- [ ] T038 [P] [US1] Write contract tests for `listScreenshots`, `openScreenshot`, `revealScreenshot`, `markScreenshotsSeen`, `onScreenshotsChanged`, and `getScreenshotSourceError` in tests/contract/host-bridge.spec.ts
- [ ] T039 [P] [US1] Extend the mock with screenshot fixtures, a simulate-new-screenshot trigger, and reachable `FILE_NOT_FOUND` and `PERMISSION_DENIED` paths in src/renderer/host/host-mock.ts

### Implementation for User Story 1

- [ ] T040 [P] [US1] Implement the Spotlight backfill querying `kMDItemIsScreenCapture == 1` in src/main/services/screenshots/spotlight-source.ts per research.md R-003
- [ ] T041 [P] [US1] Implement screenshot-location resolution from `com.apple.screencapture`, falling back to ~/Desktop, in src/main/services/screenshots/location-resolver.ts
- [ ] T042 [US1] Implement the FSEvents directory watch with metadata confirmation of new files in src/main/services/screenshots/fs-watcher.ts (no polling — constitution Principle V)
- [ ] T043 [US1] Implement the in-memory collection capped at 50 and ordered newest-first in src/main/services/screenshots/screenshot-store.ts
- [ ] T044 [US1] Generate tray- and panel-sized thumbnails via `nativeImage.createThumbnailFromPath` in src/main/services/screenshots/thumbnail.ts
- [ ] T045 [US1] Detect and classify source errors as `permission-denied`, `location-missing`, or `unknown` in src/main/services/screenshots/screenshot-store.ts (FR-015)
- [ ] T046 [US1] Re-point the watcher when the system screenshot location changes, on focus and on `powerMonitor` resume, in src/main/services/screenshots/fs-watcher.ts (FR-014b)
- [ ] T047 [US1] Register the `screenshots:*` handlers, resolving ids against the store rather than accepting paths, in src/main/ipc/register.ts
- [ ] T048 [US1] Emit `screenshots:changed` on add, remove, and location change in src/main/services/screenshots/screenshot-store.ts
- [ ] T049 [US1] Implement the screenshot methods of the real bridge in src/renderer/host/host-bridge.ts
- [ ] T050 [P] [US1] Build the newest-first thumbnail grid in src/renderer/sections/screenshots/screenshots-section.tsx (FR-009)
- [ ] T051 [P] [US1] Build the thumbnail card with open and reveal actions in src/renderer/sections/screenshots/screenshot-card.tsx (FR-011, FR-012)
- [ ] T052 [US1] Handle vanished files by dropping the entry and surfacing "file no longer available" in src/renderer/sections/screenshots/screenshots-section.tsx
- [ ] T053 [US1] Render the empty state and the source-error state in src/renderer/sections/screenshots/screenshots-section.tsx
- [ ] T054 [US1] Advance the seen-watermark when the section opens, preserving forward-only movement, in src/main/services/preferences/preferences-service.ts (FR-013)
- [ ] T055 [US1] Preserve scroll position and selection when a screenshot arrives while the panel is open in src/renderer/sections/screenshots/screenshots-section.tsx
- [ ] T056 [US1] Audit the screenshot code path for write, rename, move, and delete calls and assert their absence in tests/unit/screenshots-readonly.spec.ts (FR-014a)
- [ ] T057 [US1] Run quickstart.md scenarios V-002, V-003, V-004, and V-005

**Checkpoint**: MVP complete. The app finds and surfaces screenshots, including forgotten ones, and
provably never touches a file.

---

## Phase 4: User Story 2 - Glanceable menu bar previews (Priority: P2)

**Goal**: Independently toggleable compact previews rendered into the menu bar itself.

**Independent Test**: Enable the Screenshots preview, confirm a thumbnail plus unseen count appears in
the menu bar; disable it and confirm the plain icon returns.

**Note**: The composer is built with all three segment slots now. Timer and Spotify segments render
empty until US3 and US4 land, which keeps this story independently testable against US1 alone.

### Tests for User Story 2

- [ ] T058 [P] [US2] Write unit tests for segment ordering, per-segment truncation, total width cap, and the all-previews-off case in tests/unit/preview-composer.spec.ts (constitution Principle IV — pure function)
- [ ] T059 [P] [US2] Add preference-toggle support and assertions to the mock in src/renderer/host/host-mock.ts

### Implementation for User Story 2

- [ ] T060 [US2] Implement the composer as a pure function of preferences, screenshots, timer, and playback in src/main/tray/preview-composer.ts per research.md R-005
- [ ] T061 [US2] Implement the single-Tray controller driving `setImage` and `setTitle` in src/main/tray/tray-controller.ts (FR-001)
- [ ] T062 [US2] Scale tray thumbnails to menu bar height at the display scale factor in src/main/tray/tray-controller.ts
- [ ] T063 [US2] Recompose the tray on preference change and on any source-data change in src/main/tray/tray-controller.ts (FR-031, SC-007)
- [ ] T064 [P] [US2] Build the settings section deriving its toggle list from `supportsPreview` in src/renderer/sections/settings/settings-section.tsx (FR-028, FR-030)
- [ ] T065 [US2] Wire preview toggles through `prefs:update` without cross-reading other flags in src/renderer/sections/settings/settings-section.tsx (FR-031)
- [ ] T066 [US2] Render the latest-screenshot thumbnail and unseen count as the screenshots segment in src/main/tray/preview-composer.ts (FR-032)
- [ ] T067 [US2] Run quickstart.md scenario V-009

**Checkpoint**: Previews toggle independently and survive restart. US1 and US2 both work standalone.

---

## Phase 5: User Story 3 - Countdown timer with keyboard control (Priority: P3)

**Goal**: A countdown that runs while the panel is closed, notifies on completion, and responds to a
global shortcut.

**Independent Test**: Set a 10-second timer, pause and resume it by shortcut with the panel closed,
confirm the notification fires at zero.

### Tests for User Story 3

- [ ] T068 [P] [US3] Write state machine tests FIRST for all transitions, including no-op `pause` from idle and single-notification-on-wake, in tests/unit/timer-service.spec.ts (constitution Principle IV — MUST fail before T070)
- [ ] T069 [P] [US3] Write contract tests for `getTimerState`, `startTimer`, `pauseTimer`, `resumeTimer`, `resetTimer`, and `onTimerStateChanged` in tests/contract/host-bridge.spec.ts

### Implementation for User Story 3

- [ ] T070 [US3] Implement the timer as an absolute deadline in the main process in src/main/services/timer/timer-service.ts per research.md R-004 (FR-017, FR-020)
- [ ] T071 [US3] Handle `powerMonitor` resume, firing exactly one notification for a timer that expired during sleep, in src/main/services/timer/timer-service.ts
- [ ] T072 [US3] Emit state at most 1 Hz and only while observed, holding a single `setTimeout` otherwise, in src/main/services/timer/timer-service.ts (constitution Principle V)
- [ ] T073 [P] [US3] Implement completion notifications, including the missing-permission case, in src/main/services/notifications/notification-service.ts (FR-018)
- [ ] T074 [US3] Register the global shortcut and surface registration failure rather than swallowing it in src/main/services/shortcuts/shortcut-service.ts per research.md R-012 (FR-019)
- [ ] T075 [US3] Register the `timer:*` and `prefs:set-shortcut` handlers in src/main/ipc/register.ts
- [ ] T076 [US3] Implement the timer methods of the real bridge in src/renderer/host/host-bridge.ts
- [ ] T077 [P] [US3] Implement a mock timer using the same absolute-deadline logic so browser mode counts down for real in src/renderer/host/host-mock.ts
- [ ] T078 [P] [US3] Build duration entry plus start, pause, resume, and reset controls in src/renderer/sections/timer/timer-section.tsx (FR-016)
- [ ] T079 [US3] Add shortcut rebinding with an "already in use" message in src/renderer/sections/settings/settings-section.tsx
- [ ] T080 [US3] Add the live remaining-time segment to the composer in src/main/tray/preview-composer.ts (FR-033)
- [ ] T081 [US3] Run quickstart.md scenarios V-007 and V-008

**Checkpoint**: The timer survives a closed panel and a sleeping Mac, and is controllable without
opening the app.

---

## Phase 6: User Story 4 - Control playing music (Priority: P4)

**Goal**: See and control the current Spotify track without leaving the menu bar.

**Independent Test**: With music playing, open the Spotify section, confirm track and artist, pause,
skip, and scrub.

### Tests for User Story 4

- [ ] T082 [P] [US4] Write contract tests for `getPlaybackState`, `togglePlayPause`, `nextTrack`, `previousTrack`, `seekTo`, and `onPlaybackStateChanged` in tests/contract/host-bridge.spec.ts
- [ ] T083 [P] [US4] Add a cycling mock playback state reaching `not-running` and `permission-denied` in src/renderer/host/host-mock.ts

### Implementation for User Story 4

- [ ] T084 [US4] Implement the `osascript` wrapper with timeout and error classification in src/main/services/spotify/applescript.ts per research.md R-007
- [ ] T085 [US4] Implement state reads mapping onto the five-value availability enum in src/main/services/spotify/playback-service.ts (FR-021, FR-025)
- [ ] T086 [US4] Implement demand-driven polling that starts on first subscribe and stops on last unsubscribe in src/main/services/spotify/playback-service.ts (constitution Principle V)
- [ ] T087 [US4] Implement play/pause, next, previous, and seek with position clamped to track duration in src/main/services/spotify/playback-service.ts (FR-022, FR-023)
- [ ] T088 [P] [US4] Declare `NSAppleEventsUsageDescription` in the packaging configuration in electron-builder.yml
- [ ] T089 [US4] Register the `spotify:*` handlers including `spotify:subscribe` in src/main/ipc/register.ts
- [ ] T090 [US4] Implement the Spotify methods of the real bridge in src/renderer/host/host-bridge.ts
- [ ] T091 [P] [US4] Build the now-playing display, transport controls, and scrubber with between-poll interpolation in src/renderer/sections/spotify/spotify-section.tsx
- [ ] T092 [US4] Render each inactive state distinctly with controls presented as inoperable in src/renderer/sections/spotify/spotify-section.tsx (FR-025)
- [ ] T093 [US4] Add the truncated track-name segment to the composer in src/main/tray/preview-composer.ts (FR-034, FR-035)
- [ ] T094 [US4] Run quickstart.md scenario V-010

**Checkpoint**: Playback is controllable and degrades honestly when Spotify is absent or unauthorised.

---

## Phase 7: User Story 5 - Quick personal notes (Priority: P5)

**Goal**: Create, edit, and delete short notes that never lose text on dismissal.

**Independent Test**: Create a note, type, close and reopen the panel, confirm persistence, edit, then
delete.

### Tests for User Story 5

- [ ] T095 [P] [US5] Write contract tests for `listNotes`, `createNote`, `updateNote`, `deleteNote`, and `flushNotes` in tests/contract/host-bridge.spec.ts
- [ ] T096 [P] [US5] Add in-memory note support that resets on reload to the mock in src/renderer/host/host-mock.ts

### Implementation for User Story 5

- [ ] T097 [US5] Implement note CRUD ordered by `updatedAt` descending, persisted atomically, in src/main/services/notes/notes-service.ts (FR-026, FR-027)
- [ ] T098 [US5] Register the `notes:*` handlers including `notes:flush` in src/main/ipc/register.ts
- [ ] T099 [US5] Implement the notes methods of the real bridge in src/renderer/host/host-bridge.ts
- [ ] T100 [P] [US5] Build the note list, editor, and empty state in src/renderer/sections/notes/notes-section.tsx
- [ ] T101 [US5] Implement debounced autosave with a forced flush on panel blur so dismissal cannot lose text in src/renderer/sections/notes/notes-section.tsx (FR-027)
- [ ] T102 [US5] Confirm the settings section offers no Notes preview toggle in src/renderer/sections/settings/settings-section.tsx (FR-028)
- [ ] T103 [US5] Run quickstart.md scenario V-011

**Checkpoint**: All five stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: The constitution's measured gates, which cannot be evaluated until the app is whole

- [ ] T104 [P] Write the end-to-end suite covering panel lifecycle and one journey per story in tests/e2e/menu-bar-hub.spec.ts
- [ ] T105 [P] Verify keyboard navigation and all four dismissal paths per quickstart.md V-006
- [ ] T106 [P] Verify light/dark switching and reduced-motion behaviour per quickstart.md V-014
- [ ] T107 Measure idle CPU with the panel closed and previews off, and again with the Spotify preview on, per quickstart.md V-012 (constitution Principle V — must be effectively 0%)
- [ ] T108 Verify the build fails above the payload budget per quickstart.md V-013
- [ ] T109 Evaluate the research.md R-006 fallback trigger — if panel open-to-interactive exceeds 100 ms or idle CPU is above 0%, replace Motion with CSS transitions in src/renderer/motion/index.tsx
- [ ] T110 [P] Configure packaging, app icon, and bundle identifier in electron-builder.yml
- [ ] T111 [P] Write setup and architecture notes in README.md
- [ ] T112 Run the full quickstart.md suite V-001 through V-014 and record results

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **User Stories (Phases 3–7)**: All depend on Phase 2; then parallelisable or sequential by priority
- **Polish (Phase 8)**: Depends on all desired stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends only on Phase 2. No dependency on any other story.
- **US2 (P2)**: Depends only on Phase 2. Reads US1 data when present, but T060–T067 are testable with
  the screenshots segment alone; timer and Spotify segments stay empty until US3/US4.
- **US3 (P3)**: Depends only on Phase 2. T080 additionally needs T060 if previews are wanted.
- **US4 (P4)**: Depends only on Phase 2. T093 additionally needs T060.
- **US5 (P5)**: Depends only on Phase 2. Fully independent — no preview integration at all (FR-028).

The only cross-story coupling is the three composer segments (T066, T080, T093), each additive and
each guarded by its own preference flag.

### Within Each User Story

- Contract and state machine tests MUST be written and MUST fail before the implementation they cover
- Main-process services before IPC handlers before bridge methods before UI
- Mock implementation alongside the real one, never after
- Story complete and checkpoint validated before moving to the next priority

### Critical Path

```
T001..T011 (Setup)
   └─▶ T012 → T013 → T021 → T022/T023 → T024 → T025   (bridge spine)
        └─▶ T026 → T028 → T029 → T030                  (panel spine)
             └─▶ T037 checkpoint
                  ├─▶ US1 (T038..T057)  ← MVP
                  ├─▶ US2 (T058..T067)
                  ├─▶ US3 (T068..T081)
                  ├─▶ US4 (T082..T094)
                  └─▶ US5 (T095..T103)
                       └─▶ Polish (T104..T112)
```

---

## Parallel Example: User Story 1

```bash
# Tests first, together:
Task: "Contract tests for the six screenshot bridge methods in tests/contract/host-bridge.spec.ts"
Task: "Screenshot fixtures and failure paths in src/renderer/host/host-mock.ts"

# Then the two independent main-process sources:
Task: "Spotlight backfill in src/main/services/screenshots/spotlight-source.ts"
Task: "Location resolution in src/main/services/screenshots/location-resolver.ts"

# Then the two UI pieces:
Task: "Thumbnail grid in src/renderer/sections/screenshots/screenshots-section.tsx"
Task: "Thumbnail card in src/renderer/sections/screenshots/screenshot-card.tsx"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1)
2. **STOP and VALIDATE**: quickstart.md V-001 through V-005
3. This is a genuinely useful app: it finds every screenshot on the machine, including ones saved
   somewhere long forgotten, and provably never modifies a file.

### Incremental Delivery

| Increment | Adds | Validate |
|---|---|---|
| Setup + Foundational | Panel shell, sidebar, bridge, browser mode | V-001 |
| **+ US1** | **Screenshots — MVP** | **V-002…V-005** |
| + US2 | Menu bar previews | V-009 |
| + US3 | Timer + global shortcut | V-007, V-008 |
| + US4 | Spotify control | V-010 |
| + US5 | Notes | V-011 |
| + Polish | Measured constitution gates | V-006, V-012, V-013, V-014 |

### Parallel Team Strategy

After the Phase 2 checkpoint, US1 through US5 can be staffed independently — they touch disjoint
service, section, and test files. The three composer segments (T066, T080, T093) all edit
`preview-composer.ts` and MUST be serialised; assign them to whoever owns US2, applied as each source
story lands.

---

## Notes

- `[P]` = different files, no dependency on incomplete work
- Tests are scoped by constitution Principle IV, not applied blanket — see the header note
- Every task naming a mock has a matching real-implementation task; a bridge method added without both
  is an incomplete change (constitution Principle II)
- Commit after each task or logical group; stop at any checkpoint to validate a story standalone
- T107 and T108 are gates, not chores. Failing either is a constitution violation, not a nice-to-have.
