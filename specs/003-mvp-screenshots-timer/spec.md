# Feature Specification: MVP Scope — Screenshots & Timer

**Feature Branch**: `003-mvp-screenshots-timer`

**Created**: 2026-09-12

**Status**: Draft

**Input**: User description: "Lets remove Spotify & notes feature for the mvp, so we will have only screenshots & timer features for now. The improvements for the screenshots tab: 1) by clicking screenshot we should select screenshot isntead of opening it; 2) by clicking copy button in the right bottom corner we should copy images to the clipboard and not the paths to this screenshots; 3) the icon in right bottom corner image should be "show directory" icon and not "download" icon; 4) if we are doing screenshots and have topbar minibar enabled for the screenshots we should always show the number of screenshots available (in top right corner of screenshot preview). The improvements of timer tab: 1) we should be able to type time ourselves and not spawn random timer presets. Overral changes: 1) lets remove 3-dots icon from top right corner; 2) lets change our generic app icon to something like bar-themed, like a wine-glass (if we can ofcorse); 3) If I select to show screenshots in my topbar and I delete all screenshots I start seeing image placeholder, we shouln't show it, lets show application icon instead."

**Clarifications applied (2026-09-12)**:

- **Multi-selection copy** → the Copy action is removed from the screenshots section entirely. The
  system clipboard holds one image at a time, which made "copy several as images" unsatisfiable;
  rather than ship a half-capability, dragging becomes the single way to move screenshots into
  another application. This supersedes the original request that Copy place images on the clipboard.
- **Menu bar count semantics** → the badge counts every screenshot currently listed. The "unseen"
  concept and its seen-watermark are removed rather than retained.

> **Numbering note**: FR and SC identifiers continue the ranges established by
> `001-menu-bar-hub` and `002-panel-ui-v2` (which ended at FR-090 and SC-012), because
> existing source comments cite those identifiers directly.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A two-feature app (Priority: P1)

A person opens the panel and finds exactly two things the app does — recent screenshots and a
countdown timer — plus settings. Spotify, Notes and the Copy action are gone: not hidden behind a
flag, but removed, along with the permission prompts and menu bar text they brought with them.

**Why this priority**: This is the largest change and the one that makes every other item cheaper.
It also removes the app's only reason to request Apple Events access, so the app stops asking the
user for a permission it no longer needs.

**Independent Test**: Launch the app and confirm only Screenshots, Timer and Settings are reachable,
that no automation permission is requested, and that a previously-saved Spotify or Notes section
selection does not break startup.

**Acceptance Scenarios**:

1. **Given** the app launches, **When** the panel opens, **Then** the navigation offers exactly
   Screenshots, Timer and Settings, and no Spotify or Notes destination exists anywhere in the UI.
2. **Given** stored preferences that name a removed section as the last-viewed section, **When** the
   app launches, **Then** it opens on a section that still exists and reports no error to the user.
3. **Given** the music app is running and playing, **When** the app launches and runs, **Then** the
   user is never prompted for automation access and no track information appears in the menu bar.
4. **Given** Settings is open, **When** the user reviews the menu bar preview toggles, **Then** only
   Screenshots and Timer are offered.
5. **Given** the user previously wrote notes, **When** the app launches after the change, **Then**
   the user is not shown a broken or empty Notes surface.
6. **Given** screenshots are selected, **When** the user reviews the available actions, **Then** no
   Copy action is offered anywhere in the section.
7. **Given** the Copy action is gone, **When** the user wants a screenshot in another application,
   **Then** dragging it out of the panel still delivers the file.

---

### User Story 2 - Select a screenshot by clicking it (Priority: P1)

A person clicks a thumbnail to select it, clicks another to add it, and clicks a selected one again
to drop it. Selection is the primary gesture, because the section's remaining bulk actions — delete
and drag — operate on a selection.

**Why this priority**: Clicking the largest target in the section currently triggers the one action
the user least often wants. The selection control today is a small corner badge, which makes the
common task the fiddliest one.

**Independent Test**: Click several thumbnails and confirm the selection count and the enabled state
of the bulk actions track exactly what was clicked, with no file ever opening.

**Acceptance Scenarios**:

1. **Given** an unselected thumbnail, **When** the user clicks it, **Then** it becomes selected and
   the section's selection count increases by one.
2. **Given** a selected thumbnail, **When** the user clicks it again, **Then** it becomes unselected
   and the count decreases by one.
3. **Given** several thumbnails clicked in turn, **When** the user reviews the section, **Then** all
   of them are shown as selected simultaneously.
4. **Given** any thumbnail, **When** the user clicks it, **Then** no external application opens and
   the panel stays open.
5. **Given** a keyboard user has focused a thumbnail, **When** they activate it with the keyboard,
   **Then** selection toggles exactly as a click would.
6. **Given** any thumbnail, **When** the user double-clicks it, **Then** the screenshot opens in its
   default application and the panel's selection reflects the two clicks that occurred.

---

### User Story 3 - Type the timer duration (Priority: P2)

A person wants a 7-minute timer. They type it, rather than hunting a row of chips that offers 1, 5,
10 and 25 and a button that adds whichever round number happens to be missing next.

**Why this priority**: The current add-a-preset control chooses the duration on the user's behalf
from a fixed list, so the one duration the user actually wants is often unreachable.

**Independent Test**: Enter an arbitrary duration, start the timer, and confirm the countdown begins
from exactly that value.

**Acceptance Scenarios**:

1. **Given** the Timer section, **When** the user types a duration and confirms it, **Then** the
   timer is configured to exactly that duration and the readout shows it.
2. **Given** a typed duration, **When** the user starts the timer, **Then** the countdown begins
   from that duration.
3. **Given** the user types a value that is not a usable duration, **When** they confirm, **Then**
   the app rejects it visibly and leaves the previous configured duration intact.
4. **Given** the user types a duration beyond the supported range, **When** they confirm, **Then**
   the app constrains it to the supported range rather than accepting an unusable timer.
5. **Given** the timer is running, **When** the user types a new duration, **Then** the running
   countdown is not silently replaced without the user starting it.

---

### User Story 4 - The menu bar always says how many (Priority: P2)

With the screenshots preview enabled, the menu bar shows the latest screenshot with a count in its
top-right corner, so the user can see at a glance how many are on hand without opening the panel.
When there are none left, the menu bar shows the app's own icon — never a broken-image placeholder.

**Why this priority**: The count currently appears only when there is unseen work, so it vanishes
during normal use; and the empty state falls back to a generic grid glyph that reads as a failed
image load.

**Independent Test**: With the preview enabled, add and delete screenshots and confirm the count
tracks the total and that emptying the list yields the app icon rather than a placeholder.

**Acceptance Scenarios**:

1. **Given** the screenshots preview is enabled and screenshots exist, **When** the user looks at
   the menu bar, **Then** a count appears in the top-right corner of the preview image.
2. **Given** the count is shown, **When** the user compares it to the section, **Then** it equals the
   total number of screenshots the section currently lists, regardless of which have been viewed.
3. **Given** the screenshots preview is enabled, **When** the number of screenshots changes, **Then**
   the displayed count updates to match within the responsiveness budget.
4. **Given** the screenshots preview is enabled, **When** the user deletes the last screenshot,
   **Then** the menu bar shows the application icon and no count badge, and no placeholder or
   broken-image graphic is shown at any point.
5. **Given** the screenshots preview is disabled, **When** the user looks at the menu bar, **Then**
   the application icon is shown with no count.
6. **Given** the user opens and closes the panel, **When** they look at the menu bar, **Then** the
   count is unchanged by the act of viewing — viewing no longer alters what the badge reports.

---

### User Story 5 - A bar-themed identity, and less inert chrome (Priority: P3)

The app looks like the bar it is named after rather than a default placeholder, and the section
header no longer carries a three-dot button that does nothing when pressed.

**Why this priority**: Cosmetic and self-contained. The three-dot control is currently inert in
every section, so removing it cannot regress behaviour.

**Independent Test**: Inspect the app icon in the contexts where it appears (About, installer,
Finder) and confirm the header shows no three-dot control in any section.

**Acceptance Scenarios**:

1. **Given** any section, **When** the user views its header, **Then** no three-dot overflow control
   is present.
2. **Given** the application bundle, **When** the user sees it in Finder or an installer, **Then**
   it carries a bar-themed icon rather than a generic default.
3. **Given** the menu bar, **When** the app icon is shown there, **Then** it remains legible at menu
   bar size and adapts to light and dark menu bars.

---

### Edge Cases

- **Stale section preference**: saved preferences name `spotify` as the last-viewed section (this is
  the current state of at least one real user profile). Startup must land on a valid section.
- **Stale preview preference**: saved preferences enable the Spotify menu bar preview. The stored
  value must not resurrect removed behaviour or block preference loading.
- **Stale seen-watermark**: saved preferences carry a seen-watermark that no longer has meaning. It
  must not block preference loading, and must not affect the count.
- **Orphaned notes data**: a notes store already exists on disk. The change must define whether it is
  left in place, and must not present the user with a half-removed feature.
- **Muscle memory for copy**: a user who expects a copy gesture must not be met with a silent
  no-op that looks like a failure.
- **Deleting the selected screenshots**: if the user deletes screenshots that are part of the current
  selection, the selection must not retain references to files that no longer exist.
- **Screenshot disappears underneath a selection**: a staged (unsaved) capture can vanish on its own.
- **Count exceeds the retained list**: the app retains a bounded number of screenshots, so the badge
  must not imply a number larger than what the section can actually show.
- **Two-digit and three-digit counts**: the badge must stay legible at menu bar size as the number
  grows, and must not push the preview image out of shape.
- **Typed duration of zero or empty input**: must not start a timer that finishes instantly.
- **Reduced motion and dark appearance**: all new or changed UI must honour both.

## Requirements *(mandatory)*

### Functional Requirements

#### Scope reduction

- **FR-091**: The system MUST remove the Spotify section and all of its user-facing surfaces,
  including its navigation entry, its menu bar preview, and its settings toggle.
- **FR-092**: The system MUST remove the Notes section and all of its user-facing surfaces,
  including its navigation entry and its settings toggle.
- **FR-093**: The system MUST NOT request or require automation access to any other application.
- **FR-094**: The system MUST load preferences that reference removed sections, removed previews, or
  the removed seen-watermark without error, resolving them to values that still exist.
- **FR-095**: The system MUST continue to offer Screenshots, Timer and Settings, with no change to
  the panel's fixed size or its open, dismiss and keyboard behaviour.
- **FR-096**: The system MUST remove the Copy action from the screenshots section, including its
  control, its keyboard path, and its place in the host interface.

#### Screenshots

- **FR-097**: Clicking a screenshot thumbnail MUST toggle its selection state.
- **FR-098**: Clicking a screenshot thumbnail MUST NOT open the file in another application.
- **FR-099**: Selection MUST be reachable by keyboard, and the selected state MUST be conveyed to
  assistive technology.
- **FR-100**: The system MUST continue to support selecting multiple screenshots, and the remaining
  bulk actions MUST operate on the full selection.
- **FR-101**: Double-clicking a screenshot thumbnail MUST open it in its default application, and
  MUST leave the selection state unchanged from what the constituent clicks produced.
- **FR-102**: The per-screenshot action in the card's lower-right MUST present an icon that reads as
  "show in folder", matching its existing reveal-in-file-manager behaviour.
- **FR-103**: Dragging screenshots out of the panel MUST remain available and unchanged, as the sole
  means of placing a screenshot into another application.

#### Timer

- **FR-104**: Users MUST be able to enter a timer duration directly, rather than choosing only from
  offered durations.
- **FR-105**: The system MUST NOT generate durations on the user's behalf from a fixed candidate
  list.
- **FR-106**: The system MUST validate entered durations, rejecting unusable input visibly and
  preserving the previously configured duration when input is rejected.
- **FR-107**: The system MUST constrain entered durations to a supported range.
- **FR-108**: Entering a duration MUST NOT silently replace a countdown that is already running.

#### Menu bar

- **FR-109**: When the screenshots preview is enabled and at least one screenshot exists, the menu
  bar MUST show the latest screenshot with a count in the image's top-right corner.
- **FR-110**: The count MUST equal the total number of screenshots the section currently lists.
- **FR-111**: The count MUST be shown whenever the screenshots preview is enabled and screenshots
  exist — not only when a threshold or unseen condition is met.
- **FR-112**: The system MUST remove the seen/unseen distinction for screenshots, including the
  persisted watermark and any means of marking screenshots as seen.
- **FR-113**: The count MUST update to reflect changes within the app's existing menu bar
  responsiveness budget.
- **FR-114**: When no screenshots exist, the menu bar MUST show the application icon with no count
  badge.
- **FR-115**: The system MUST NOT display a placeholder, broken-image, or generic grid graphic in the
  menu bar in any state.
- **FR-116**: The menu bar image MUST remain legible at menu bar height and MUST adapt to light and
  dark menu bar appearance.

#### Identity and chrome

- **FR-117**: The system MUST remove the three-dot overflow control from every section header.
- **FR-118**: The application MUST carry a bar-themed icon in place of the generic default icon,
  used both as the application's own icon and as its menu bar representation.

### Key Entities

- **Screenshot entry**: a captured image the app knows about — its identity, when it was captured,
  whether it is a temporary staged capture, and a thumbnail for display. It no longer carries or
  implies a seen/unseen status. Selection state is attached to entries by the section, not stored
  with them.
- **Selection**: the set of screenshot entries the user has clicked. Drives which bulk actions are
  available and what they operate on. Must not outlive the entries it names.
- **Timer configuration**: a user-entered duration, plus the finish behaviours (alarm, repeat) that
  already exist.
- **Menu bar preview model**: what the menu bar shows — an image slot and a count — derived from the
  screenshot list and the user's preview preferences.
- **Preferences**: the persisted user settings. Loses its Spotify preview toggle and its
  seen-watermark, and must tolerate previously-stored values that name removed sections, previews or
  the watermark.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-013**: The app presents exactly two features plus settings; a first-time user can enumerate
  everything it does within 10 seconds of opening the panel.
- **SC-014**: Selecting three screenshots takes three clicks, with no modifier keys and no
  intermediate target smaller than the thumbnail itself.
- **SC-015**: 100% of drags from the panel deliver the screenshot file to the receiving application.
- **SC-016**: A user can start a timer of any supported duration without being offered that duration
  in advance, in under 10 seconds.
- **SC-017**: With the screenshots preview enabled, the menu bar count matches the number of listed
  screenshots in 100% of states where at least one exists, and a placeholder graphic appears in 0% of
  states.
- **SC-018**: Deleting every screenshot leaves the menu bar showing the app icon, with no
  intermediate frame showing a placeholder.
- **SC-019**: The app never prompts for automation access to another application.
- **SC-020**: Idle CPU remains effectively 0% and the renderer payload stays within the existing
  budget, both measured after the change (constitution Principle V).
- **SC-021**: Panel open-to-interactive stays within the existing 100 ms budget.

## Assumptions

- **Reveal behaviour is already correct**: the lower-right per-screenshot action already reveals the
  file in the file manager; only its icon is wrong. This is treated as an icon change, not a
  behaviour change.
- **The three-dot control is inert**: it is currently disabled in every section and wired to nothing,
  so removing it cannot regress behaviour.
- **Dragging replaces copying**: removing the Copy action assumes drag-out is a sufficient path into
  other applications. Drag-out works into applications that accept dropped files; it does not serve
  a target that only accepts a paste. This is an accepted MVP limitation, not an oversight.
- **Opening moves to double-click**: the user asked for click to select "instead of" opening, but did
  not say opening should disappear. Double-click is assumed as its replacement, following the
  convention of every file browser on the platform. If opening should be dropped entirely, FR-101 is
  the requirement to revisit.
- **Presets survive as quick picks**: the user's objection is to durations being *generated* on their
  behalf, not to saved durations existing. Quick-pick durations are assumed to remain, with typed
  entry replacing the generate-next-round-number control. Durations the user types may be offered as
  quick picks thereafter.
- **Deletion remains recoverable**: screenshots continue to go to the Trash rather than being
  unlinked.
- **Notes data is left on disk**: existing notes files are not deleted as part of this change, to
  avoid destroying user data during a scope reduction. They simply become unreachable.
- **Removed host methods are a contract change**: dropping the copy and mark-as-seen capabilities
  changes the host interface, so contract tests and the browser mock must be updated in the same
  change set (constitution Principle II).
- **The bar-themed icon is monochrome**: a menu bar icon must be a template image to tint correctly
  for light and dark menu bars, so the wine-glass concept is assumed to be a single-colour silhouette
  rather than a full-colour illustration. The same silhouette is assumed acceptable as the
  application icon, rendered at higher fidelity.
- **Screenshot source is unchanged**: how screenshots are discovered, retained and bounded is not
  revisited by this feature.
- **No new network access**: the app remains offline; this feature introduces no outbound requests.
- **Browser mode still applies**: per constitution Principle I, every change here must remain
  exercisable in browser mode against the mock bridge, including the empty and failure states.
