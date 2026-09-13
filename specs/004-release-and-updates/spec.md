# Feature Specification: Releasable Build — Icon, Installer, Update Check

**Feature Branch**: `004-release-and-updates`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "We should make this project deployable, we need to create app icon, installer, merge all to main and add support version update"

**Decisions taken during specification (2026-09-13)**:

- **No Apple Developer ID exists** for this project, and none is being bought for this release. The
  app ships ad-hoc signed and un-notarized, and the installation instructions carry the Gatekeeper
  steps that requires. The configuration is shaped so that adding a certificate later is a
  configuration change rather than a rewrite.
- **Updates are checked, not installed.** The app reports that a newer version exists and hands the
  download to the browser. Silent auto-update was rejected: Squirrel.Mac refuses to install over an
  app it cannot verify, so an un-notarized build cannot auto-update even in principle, and
  `electron-updater` would add a runtime dependency to the main process to deliver nothing.
- **Releases are hosted on GitHub** at `Ri4Chaard/mini-menu-bar`, public. A private repository would
  require shipping a credential to read the manifest, which is not viable.

> **Numbering note**: FR and SC identifiers continue the ranges established by `001-menu-bar-hub`,
> `002-panel-ui-v2` and `003-mvp-screenshots-timer` (which ended at FR-118 and SC-021).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Installing the app (Priority: P1)

Someone downloads a `.dmg`, opens it, drags Mini Menu Bar to Applications, and gets a working menu
bar app with an icon that looks like it belongs on macOS.

**Why this priority**: Without this there is no product to hand anyone. Everything else in this
feature is downstream of an artifact that installs and launches.

**Acceptance**:

1. The DMG opens to a window with the app on the left and an Applications shortcut on the right.
2. The app icon is a macOS app icon — a rounded square on the Apple icon grid — at every size from
   the 16 pt Finder list to the 1024 pt Quick Look.
3. After the documented Gatekeeper step, the app launches and its menu bar item appears.
4. The menu bar item is still a template image: it tints correctly on light and dark menu bars.

### User Story 2 - Learning that an update exists (Priority: P2)

Someone running an older version opens Settings, presses "Check for updates", and is told either that
they are up to date or that a newer version is available — and can reach the download in one click.

**Why this priority**: An app distributed outside the App Store with no update path strands every
user on the version they first installed. It depends on User Story 1 having produced releases at all.

**Acceptance**:

1. Settings shows the running version, read from the application itself rather than a written-down
   string.
2. Pressing "Check for updates" reports up-to-date, a newer version, or a clear failure.
3. With no network, the failure is legible and every other part of the panel still works.
4. When a newer version exists, the action opens the releases page in the browser.

### User Story 3 - Publishing a release (Priority: P3)

A maintainer bumps the version, pushes a tag, and CI produces reviewable draft release artifacts.

**Acceptance**:

1. A tag whose version disagrees with `package.json` fails the build rather than publishing.
2. The published release carries the DMG and ZIP for both architectures plus the update manifest.
3. The manifest a released build reads is the one that release published.

## Requirements *(mandatory)*

### Functional

#### Identity and packaging

- **FR-119**: The application bundle icon MUST be a macOS app icon: a rounded square on the Apple
  icon grid, with a background, legible at every size the `.icns` carries.
- **FR-120**: The menu bar image MUST remain a template image — monochrome plus alpha — and MUST NOT
  acquire the app icon's background. This MUST be enforced by a test, not by convention.
- **FR-121**: The distributed application MUST carry a valid code signature. Absent a Developer ID,
  an ad-hoc signature satisfies this; an unsigned bundle does not, because macOS on Apple Silicon
  refuses to launch one.
- **FR-122**: The installer MUST be a DMG laid out for drag-to-install, and MUST be produced for both
  Apple Silicon and Intel.
- **FR-123**: Installation instructions MUST state the Gatekeeper steps an un-notarized app requires,
  and MUST state that an ad-hoc signature changes on every build, so macOS re-requests the Desktop
  and notification permissions after each update.

#### Version

- **FR-124**: The version shown in the interface MUST be read from the running application. A version
  written down anywhere in interface code is a defect, and MUST be prevented by a test.
- **FR-125**: `package.json` MUST be the single source of the version. A release tag that disagrees
  with it MUST fail the release.

#### Network

- **FR-126**: Checking for updates MUST retrieve a version manifest over the network, and this is the
  app's only outbound request. It is bounded as follows, and the bounds are the reason it is
  acceptable in an otherwise offline application:
  - A single small JSON document, from the project's own GitHub release assets, carrying a version
    and a publication date and nothing else.
  - Issued by the application core, never by the panel interface — the interface receives a version
    string, never the address, so it remains fully operable with no network access at all.
  - Sent without cookies or credentials, and with a fixed User-Agent that carries no version, no
    identifier, and nothing derived from the user or the machine.
  - Made only when the user asks for it, or once at launch if and only if the user has turned that
    on. It is off by default.
  - Bounded at one request in flight, a five second timeout, and no retry. No timer, no polling, no
    background scheduling — Principle V forbids periodic work and nothing here schedules any.
  - On failure, the panel says it could not check and every other part of the section renders
    normally.

  *This entry is the explicit declaration the project's privacy rule requires before any outbound
  request may be implemented. It supersedes the reasoning in [R-113](../002-panel-ui-v2/research.md),
  which rejected an in-app check on the grounds that the app made no network calls — sound while the
  app had no releases, and no longer sound once it has. See [R-401](./research.md).*

- **FR-127**: A version that cannot be parsed MUST NOT be reported as an update. The comparison fails
  closed.

### Success Criteria

- **SC-022**: A downloaded DMG installs and launches on a machine that has never run the app, after
  the documented Gatekeeper step and no other intervention.
- **SC-023**: The app icon is indistinguishable in shape and inset from a system application icon at
  1024 pt, and the wine glass is legible at 16 pt.
- **SC-024**: The version in Settings matches `app.getVersion()` in a packaged build.
- **SC-025**: With no network, a check reports failure within the timeout and the panel stays fully
  usable.
- **SC-026**: The app issues zero outbound requests on launch with the launch check off, which is the
  default.
- **SC-027**: Idle CPU remains effectively 0% and the renderer payload stays within the existing
  500 KB budget.

## Assumptions

- The GitHub repository is public. The manifest is read unauthenticated; a private repository would
  need a shipped credential, which this design does not accommodate.
- A release is published (not left as a draft) before its manifest is reachable, because
  `releases/latest/download/` resolves only for published releases.
