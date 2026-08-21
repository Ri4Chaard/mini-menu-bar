<!--
SYNC IMPACT REPORT
==================
Version change: 1.1.0 → 2.0.0 (MAJOR — Principle I redefined)

Trigger: the stack chosen in specs/001-menu-bar-hub/plan.md (Electron + TypeScript + React +
Tailwind + Motion + Lucide) conflicted with two clauses that had no escape hatch. The plan recorded
the conflict rather than waiving it; this amendment resolves it.

Modified principles:
- I. Web-Standard Core → I. Browser-Runnable Core (REDEFINED — this is the MAJOR bump)
  The obligation moves from "use vanilla web technology" to "the renderer must build and run as a
  standard web application against a mock bridge, with no host API reachable from UI code". The
  stated rationale of the original — inspectability, testability without a native build, portability
  — is preserved in full; only the mechanism changed.
- V. Lean Footprint (expanded) — payload budget is now an enforced build gate rather than a target;
  the approved dependency baseline is named, and additions beyond it still require justification.

Modified sections:
- Technology & Platform Constraints — "Language and runtime" now specifies TypeScript across all
  three processes and React in the renderer, with a new prohibition on frameworks in main/preload;
  "Styling" now permits Tailwind while retaining the tokens-defined-once rule; new "Build toolchain"
  bullet records the sandbox/CJS preload constraint.
- Development Workflow & Quality Gates — "Browser-first verification" retargeted to the
  `dev:browser` script; new "Payload gate" and "Dependency gate" entries.

Sections added: none
Sections removed: none

Deferred TODOs: none

Prior amendments:
- 1.1.0 (2026-08-21) — host shell pinned to Electron; process model and security constraints added
- 1.0.0 (2026-08-21) — initial ratification from core template

Templates requiring review at runtime (not modified by this command):
- .specify/templates/plan-template.md — Constitution Check gate reads this file
- .specify/templates/spec-template.md — no constitution coupling detected
- .specify/templates/tasks-template.md — no constitution coupling detected

Downstream artifact already aligned with this version:
- specs/001-menu-bar-hub/plan.md — its Constitution Check was written against this amendment and
  its post-design re-check passes as of 2.0.0
-->

# Mini Menu Bar Constitution

## Core Principles

### I. Browser-Runnable Core (NON-NEGOTIABLE)

The renderer is a standard web application. It MUST build and run in an ordinary browser, with no
Electron present, against a mock implementation of the host bridge.

- `npm run dev:browser` MUST serve the complete UI in a standard browser, with every section
  navigable and every primary interaction exercisable against mock data.
- No `require`, `process`, `window.require`, `ipcRenderer`, or the preload-exposed bridge global may
  be referenced outside the single adapter module defined in Principle II. This MUST be enforced by a
  lint rule, not by convention.
- A feature that can only be exercised inside Electron is a violation of this principle. It MUST be
  redesigned so its UI is reachable in browser mode, or justified in the plan's Complexity Tracking.
- The mock implementation MUST expose failure paths, not only success paths. A mock that always
  succeeds proves nothing about how the UI behaves when a file is missing or a permission is denied.

**Rationale**: The menu bar is a delivery surface, not an architecture. What matters is that the core
stays inspectable in DevTools, testable without a native build, and portable if the host shell
changes — not which libraries produce the DOM. Browser mode is the executable proof of all three;
without it, this principle is a slogan.

### II. Thin Native Boundary

Every capability the browser cannot provide MUST be reached through a single explicit adapter module
exposing a documented, promise-based interface.

- The adapter ships two implementations — a real host binding and a browser mock. Both MUST satisfy
  the same contract tests.
- The adapter interface is data-in/data-out. It MUST NOT accept or return DOM nodes, callbacks into
  UI internals, host-specific object types, or values that do not survive structured cloning.
- Adding a method to the adapter is a contract change: it requires updated contract tests and a mock
  implementation in the same change set.
- Errors crossing the boundary MUST be normalised to a documented shape. Raw host or Node errors MUST
  NOT reach the renderer.

**Rationale**: An unbounded native surface is what turns a web app into a shell-locked app. One
narrow, mocked seam is what keeps Principle I enforceable rather than aspirational.

### III. Menu Bar Ergonomics

The widget has exactly two visual states — collapsed (menu bar item) and expanded (panel) — and the
transition between them is a product contract, not styling detail.

- Expansion MUST be reversible by: clicking the menu bar item again, pressing `Escape`, and losing
  focus. All three MUST be implemented.
- The expanded panel MUST be fully keyboard navigable: focus enters the panel on open, `Tab` cycles
  within it, and focus returns to the trigger on close.
- The widget MUST render correctly in light and dark appearance, and MUST honor
  `prefers-reduced-motion` by disabling expand/collapse animation.
- The collapsed state MUST never obscure or displace adjacent menu bar items, and MUST remain
  legible at menu bar height without a background fill of its own.

**Rationale**: Menu bar widgets live beside system UI. Behaving unlike the surrounding OS is the
fastest way to feel broken, regardless of correctness.

### IV. Contract-First Testing

Tests MUST be written before implementation for two categories: the expand/collapse state machine
and every adapter method.

- State machine tests define legal transitions and MUST fail before the transition exists.
- Each adapter method requires a contract test that both the real binding and the mock pass.
- Logic that can be written as a pure function — content composition, formatting, truncation — MUST
  be, and MUST be unit-tested without a host runtime.
- Pure rendering and styling changes do not require prior tests; behavior changes do.
- A change that alters an existing contract MUST update the test in the same commit as the code.

**Rationale**: The state machine, the native seam, and the pure formatting helpers are where this app
actually breaks. Testing those first is worth the friction; blanket TDD over CSS is not.

### V. Lean Footprint

The widget is always running. Its resource cost MUST be budgeted and enforced, not assumed.

- Idle CPU MUST be effectively 0%. No polling timers, no animation loops, and no background work when
  the panel is closed and no live feature is enabled.
- Any periodic work MUST be demand-driven: it starts when something observes it and stops when the
  last observer goes away.
- Animations MUST be transient. Infinite or looping animations are forbidden, and animation MUST be
  limited to compositor-friendly properties.
- The expanded panel MUST reach interactive state within 100 ms of the trigger click.
- Total shipped renderer payload MUST stay under 500 KB uncompressed. The build MUST fail above this
  threshold — a warning does not satisfy this clause.
- Runtime dependencies default to zero. The approved baseline is recorded in the active plan's
  Complexity Tracking table; each entry names the specific problem it solves and why hand-writing it
  is worse. Anything beyond that baseline requires the same justification.

**Rationale**: A background widget that costs battery gets uninstalled. Budgets that a build enforces
are real; budgets stated as goals are decoration.

## Technology & Platform Constraints

- **Language and runtime**: TypeScript across all three processes. React in the renderer. Frameworks
  are permitted in the renderer only — the main and preload processes MUST remain plain TypeScript,
  because they are the security boundary and every dependency there widens it.
- **Target platform**: macOS menu bar, hosted by Electron using `Tray` plus a frameless,
  non-activating `BrowserWindow` for the expanded panel. Electron is the fixed shell, but it MUST
  NOT leak past the adapter — Principle I still holds, and the renderer must run in a plain browser.
- **Process model**: Three roles, kept distinct. The main process owns `Tray`, window lifecycle,
  and all OS access. The preload script is the adapter's host binding and its only job is to expose
  the Principle II interface over `contextBridge`. The renderer is the web app and nothing else.
  Business logic MUST NOT live in the preload script.
- **Build toolchain**: One build with three targets — main, preload, renderer — plus a renderer-only
  browser target for Principle I. Because `sandbox: true` is mandatory, the preload target MUST emit
  CommonJS with its dependencies bundled. This is not a preference; a sandboxed preload will not load
  otherwise.
- **Styling**: Utility CSS is permitted. Appearance tokens MUST be declared once and emitted as CSS
  custom properties switched by `prefers-color-scheme`; per-component color literals are forbidden,
  and the light/dark switch MUST require no JavaScript and no re-render.
- **State**: In-memory state is authoritative during a session. Derived state MUST NOT be persisted
  when it can be recomputed at startup. Persisted data goes through the adapter, never directly to
  `localStorage` when a native store is available.
- **Privacy**: No network calls, telemetry, or analytics without an explicit approved spec entry.
  Any outbound request MUST be declared in the feature spec before implementation.
- **Security**: Every `BrowserWindow` MUST be created with `contextIsolation: true`,
  `nodeIntegration: false`, and `sandbox: true`. The renderer loads local files only — no remote
  URLs, no `webSecurity: false`. IPC channels MUST be explicitly enumerated in a checked-in contract
  and matched exactly in code; wildcard or dynamically-named channels are forbidden. Handler
  arguments MUST be validated before use, and filesystem paths MUST NOT be accepted from the
  renderer — the renderer passes identifiers that the main process resolves against its own state.
  `app.on('web-contents-created')` MUST deny new-window and navigation events to non-local origins.

## Development Workflow & Quality Gates

- **Spec Kit flow**: Features proceed `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` →
  `/speckit-implement`. Plans MUST pass the Constitution Check gate before task generation.
- **Browser-first verification**: Every feature MUST be demonstrable via `dev:browser` before it is
  wired into the host. Reviews MUST confirm that no host global is referenced outside the adapter
  module.
- **Manual gate for ergonomics**: Before merge, Principle III behaviors (Escape, blur-dismiss,
  toggle, keyboard focus, dark mode, reduced motion) MUST be manually verified and the result noted
  in the change description.
- **Payload gate**: The build reports renderer bundle size and fails above the Principle V budget.
- **Performance gate**: Any change touching timers, animation, polling, or the adapter MUST report
  measured idle CPU and panel open-to-interactive latency against the Principle V budgets.
- **Dependency gate**: Adding a runtime dependency requires a Complexity Tracking entry naming the
  problem solved and the rejected simpler alternative. Adding one to main or preload additionally
  requires justifying the widened security boundary.
- **Complexity justification**: Introducing a new framework, build stage, or architectural layer
  requires an entry in the plan's Complexity Tracking table naming the rejected simpler alternative.

## Governance

This constitution supersedes ad-hoc practice. Where a plan, task, or review conflicts with it, the
constitution wins until formally amended.

- **Amendment procedure**: Amendments are proposed as a change to this file, stating the principle
  affected, the rationale, and the migration impact on existing code. An amendment takes effect only
  when merged. A plan that conflicts with the constitution MUST record the conflict in its
  Constitution Check and propose the amendment explicitly; it MUST NOT proceed by silent waiver.
- **Versioning policy**: Semantic versioning applies to this document.
  - MAJOR — a principle is removed or redefined in a backward-incompatible way.
  - MINOR — a principle or section is added, or existing guidance is materially expanded.
  - PATCH — clarification, wording, or typo fixes with no change in obligation.
- **Compliance review**: Every plan runs the Constitution Check gate. Every review MUST confirm
  Principle I (no host globals outside the adapter, browser mode still works) and the Principle V
  budgets before approval.
- **Amending under pressure**: When a chosen technology conflicts with a principle, the correct
  response is to amend the principle deliberately or change the technology — never to reinterpret the
  text until the conflict disappears. An amendment MUST preserve the original principle's stated
  rationale, or explicitly state which part of it is being abandoned and why.
- **Runtime guidance**: Day-to-day agent and developer guidance lives in `CLAUDE.md` at the repo
  root. `CLAUDE.md` MUST NOT contradict this file; on conflict, this file governs and `CLAUDE.md`
  is corrected.

**Version**: 2.0.0 | **Ratified**: 2026-08-21 | **Last Amended**: 2026-08-21
