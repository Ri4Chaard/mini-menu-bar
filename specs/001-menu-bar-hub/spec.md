# Feature Specification: Menu Bar Hub

**Feature Branch**: `main` (no feature branch created — git extension hook not installed)

**Created**: 2026-08-21

**Status**: Draft

**Input**: User description: "Read the @business-prompt.md, that is the description of what's our project about" — see [`docs/business-prompt.md`](../../docs/business-prompt.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Never lose a screenshot again (Priority: P1)

The user takes screenshots throughout the day. Today they vanish into the Desktop or a
half-remembered folder. With this feature, the user clicks the menu bar icon and immediately sees
their most recent screenshots as thumbnails. From there they can open one, or jump straight to it
in Finder.

**Why this priority**: This is the stated core problem. It is also the smallest slice that
delivers standalone value — the panel shell, sidebar navigation, and one working section. Shipping
only this produces a useful app.

**Independent Test**: Take three screenshots, click the menu bar icon, confirm all three appear
newest-first as thumbnails, open one, and reveal another in Finder. Delivers the full "I can always
find my screenshots" value with no other section implemented.

**Acceptance Scenarios**:

1. **Given** the app is running and screenshots exist, **When** the user clicks the menu bar icon,
   **Then** the panel opens showing the Screenshots section with recent screenshots as thumbnails,
   newest first.
2. **Given** the panel is open on the Screenshots section, **When** the user takes a new screenshot,
   **Then** the new screenshot appears at the top of the list without the user refreshing anything.
3. **Given** a screenshot thumbnail is visible, **When** the user activates "open", **Then** the
   screenshot opens in the system default image viewer.
4. **Given** a screenshot thumbnail is visible, **When** the user activates "reveal", **Then** Finder
   opens with that file selected.
5. **Given** no screenshots exist yet, **When** the user opens the Screenshots section, **Then** an
   empty state explains that screenshots will appear here once taken.
6. **Given** the panel is open, **When** the user presses Escape, clicks the menu bar icon again, or
   clicks elsewhere, **Then** the panel closes.

---

### User Story 2 - Glanceable menu bar previews (Priority: P2)

The user wants selected information visible in the menu bar itself, without opening the panel — the
latest screenshot thumbnail with a count of new ones, a live timer countdown, or the current track
name. The user decides which of these appear, independently, so the menu bar stays as clean or as
informative as they want.

**Why this priority**: Explicitly called out by the user as "a key feature I care about". It is the
difference between "another app I have to open" and "a hub I glance at". It builds on P1 but is
independently valuable and independently testable.

**Independent Test**: Open the app's preview settings, enable the Screenshots preview, confirm a
thumbnail plus new-count appears in the menu bar; disable it and confirm the menu bar returns to the
plain icon. Repeat per section. Testable with only the Screenshots section implemented.

**Acceptance Scenarios**:

1. **Given** all previews are off, **When** the user enables the Screenshots preview, **Then** a
   compact thumbnail of the latest screenshot plus a count of new screenshots appears in the menu bar.
2. **Given** the Screenshots preview is on, **When** the user takes a new screenshot, **Then** the
   menu bar thumbnail and the new-count update without user action.
3. **Given** the Screenshots preview is on, **When** the user opens the Screenshots section, **Then**
   the new-count resets to zero.
4. **Given** the Timer preview is on and a timer is running, **When** time elapses, **Then** the menu
   bar shows a live-updating remaining-time readout.
5. **Given** the Spotify preview is on and music is playing, **When** the track changes, **Then** the
   menu bar shows the new track name.
6. **Given** any preview is on, **When** the user turns it off, **Then** that content disappears from
   the menu bar within one second and the other enabled previews are unaffected.
7. **Given** the user views the preview settings, **Then** the Notes section offers no preview toggle.

---

### User Story 3 - Countdown timer with keyboard control (Priority: P3)

The user sets a countdown, starts it, and gets notified when it finishes. They can start and pause it
with a global keyboard shortcut without opening the panel at all.

**Why this priority**: A self-contained utility with clear standalone value. Ranked below previews
because the user framed previews as the defining feature of the app.

**Independent Test**: Set a 10-second timer, start it, pause and resume it via keyboard shortcut with
the panel closed, and confirm a notification fires at zero.

**Acceptance Scenarios**:

1. **Given** the Timer section is open, **When** the user sets a duration and starts the timer,
   **Then** the remaining time counts down visibly.
2. **Given** a timer is running, **When** the user presses the global shortcut, **Then** the timer
   pauses, and pressing it again resumes from the same point.
3. **Given** a timer is paused, **When** the user resets it, **Then** it returns to the configured
   duration and is not running.
4. **Given** a timer reaches zero, **When** the countdown completes, **Then** the user receives a
   system notification, whether or not the panel is open.
5. **Given** a timer is running, **When** the user closes the panel, **Then** the timer continues
   running.

---

### User Story 4 - Control playing music (Priority: P4)

The user sees what is currently playing and controls it — play/pause, next, previous, and scrubbing
to a position in the track — without switching to the music app.

**Why this priority**: Convenience rather than a stated pain point, and it depends on an external
application being present.

**Independent Test**: With music playing, open the Spotify section, confirm the track and artist are
shown, pause it, skip forward, and scrub to a different position.

**Acceptance Scenarios**:

1. **Given** music is playing, **When** the user opens the Spotify section, **Then** the current track
   name, artist, and playback position are shown.
2. **Given** music is playing, **When** the user activates play/pause, **Then** playback toggles and
   the displayed state matches.
3. **Given** a track is playing, **When** the user activates next or previous, **Then** playback moves
   to the adjacent track and the displayed track updates.
4. **Given** a track is playing, **When** the user scrubs to a position, **Then** playback resumes
   from that position.
5. **Given** the music app is not running or nothing is playing, **When** the user opens the Spotify
   section, **Then** a clear state explains that there is nothing to control, with no broken controls.

---

### User Story 5 - Quick personal notes (Priority: P5)

The user jots down short notes and comes back to them later. Create, edit, delete — nothing more.

**Why this priority**: Lowest stated urgency and the simplest to build. Explicitly described as
"nothing fancy".

**Independent Test**: Create a note, type into it, close and reopen the panel, confirm the content
persisted, edit it, then delete it.

**Acceptance Scenarios**:

1. **Given** the Notes section is open, **When** the user creates a note, **Then** an empty note is
   added and ready for typing.
2. **Given** a note is being edited, **When** the user closes the panel, **Then** the content is saved
   without an explicit save action.
3. **Given** notes exist, **When** the user reopens the app after quitting it, **Then** all notes are
   still present with their content intact.
4. **Given** a note exists, **When** the user deletes it, **Then** it is removed from the list.
5. **Given** the user has no notes, **When** they open the Notes section, **Then** an empty state
   invites them to create one.

---

### Edge Cases

- **No screenshots yet, or the watched location is empty** — the Screenshots section shows an
  explanatory empty state rather than a blank panel.
- **A screenshot file is deleted or moved outside the app** while it is displayed — the entry is
  removed from the list; activating a stale entry surfaces a "file no longer available" message
  instead of failing silently.
- **The screenshot location is inaccessible** (permissions not granted, folder removed) — the section
  explains what is wrong and how to fix it, rather than appearing empty.
- **A screenshot is taken while the panel is open** — it appears at the top of the list immediately
  and does not disturb the user's scroll position or selection.
- **The music app is not installed, not running, playing an advertisement, or between tracks** — the
  Spotify section and its preview degrade to a clear inactive state; no control appears functional
  when it is not.
- **A timer is running when the panel is closed, when the display sleeps, or when the machine sleeps**
  — remaining time reflects real elapsed wall-clock time on wake, and a timer that expired during
  sleep notifies on wake.
- **All three previews are enabled at once on a crowded menu bar** — each preview stays within its own
  width budget and long content (track names, note-length strings) truncates rather than pushing other
  menu bar items off screen.
- **A very long track name or a screenshot with an unusual aspect ratio** — content is truncated or
  fitted; layout does not break.
- **System appearance switches between light and dark while the panel is open** — the panel updates
  to match without needing to be reopened.
- **Rapid repeated screenshots** (several within a second) — all are captured in the list and the
  new-count is accurate.
- **The user clicks the menu bar icon while the panel is already open** — the panel closes rather than
  reopening.

## Requirements *(mandatory)*

### Functional Requirements

**Shell and navigation**

- **FR-001**: The app MUST run persistently and present a single item in the macOS menu bar.
- **FR-002**: Clicking the menu bar item MUST open a panel; clicking it again, pressing Escape, or
  clicking outside the panel MUST close it.
- **FR-003**: The panel MUST present a left sidebar listing the sections and a right content area
  showing the selected section.
- **FR-004**: The panel MUST offer exactly four sections: Screenshots, Timer, Spotify, and Notes.
- **FR-005**: Selecting a section in the sidebar MUST switch the content area to that section in a
  single interaction.
- **FR-006**: The app MUST remember the last selected section and reopen on it.
- **FR-007**: The panel MUST be fully operable by keyboard, including moving between sidebar sections
  and reaching every control in the content area.
- **FR-008**: The panel MUST render correctly in both light and dark system appearance and MUST honor
  the system reduce-motion setting.

**Screenshots**

- **FR-009**: The app MUST display recent screenshots as thumbnails, ordered newest first.
- **FR-010**: The app MUST detect newly taken screenshots and add them to the list without user action.
- **FR-011**: Users MUST be able to open a screenshot in the system default image viewer from the list.
- **FR-012**: Users MUST be able to reveal a screenshot in Finder from the list.
- **FR-013**: The app MUST track which screenshots the user has not yet seen and expose that as a
  count; the count resets when the user views the Screenshots section.
- **FR-014**: The app MUST index screenshots in place, reading them from the location macOS is
  currently configured to save screenshots to, plus the Desktop when that is not already the
  configured location.

  > **Extended 2026-08-22 (amendment A-6).** The app also surfaces captures macOS has staged but
  > not saved — taken with the floating-thumbnail preview, or with "Save to → Clipboard" — which
  > never reach the configured location at all. Those files carry no Spotlight attribute, because
  > the temporary area is outside the index, so they are identified by provenance instead: the
  > directory `screencaptureui` created for them. They are marked as unsaved in the UI, since they
  > disappear on their own. Two limits are inherent rather than chosen, and both were measured:
  > the staging directory refuses `readdir` and `watch` with EPERM even for its owner, so a capture
  > staged **before** the app started cannot be discovered, and detection works by watching the
  > enclosing temporary directory instead. See `src/main/services/screenshots/staging-source.ts`.
- **FR-014a**: The app MUST treat screenshot files as read-only. It MUST NOT move, rename, copy,
  delete, or otherwise modify them, and MUST NOT change the system screenshot save location.

  > **Amended 2026-08-22 by feature 002 (amendment A-4).** Feature 002's FR-058 adds user-initiated
  > Copy and Delete, which this requirement as originally written forbids. The requirement is
  > narrowed, not dropped: **the app still never touches a screenshot file on its own initiative.**
  > The indexing path — watching, reading metadata, building thumbnails — remains strictly read-only.
  > Only an explicit click on Copy or Delete may act on a file, Delete moves it to the Trash rather
  > than unlinking it, and the app still never changes the system save location. See
  > `specs/002-panel-ui-v2/spec.md` FR-058 and `tests/unit/screenshots-readonly.spec.ts`, which
  > asserts both halves.
- **FR-014b**: The app MUST follow the system screenshot save location if the user changes it, and
  MUST reflect that change without needing a restart.
- **FR-015**: The app MUST handle an unavailable or unreadable screenshot source by explaining the
  problem in the section rather than showing an empty list.

**Timer**

- **FR-016**: Users MUST be able to set a countdown duration, and start, pause, resume, and reset it.
- **FR-017**: The timer MUST continue running while the panel is closed.
- **FR-018**: The app MUST deliver a system notification when the countdown reaches zero, regardless
  of whether the panel is open.
- **FR-019**: Users MUST be able to start and pause the timer via a global keyboard shortcut that
  works while the app is not focused and the panel is closed.
- **FR-020**: The timer MUST reflect real elapsed wall-clock time across display sleep and system
  sleep.

**Spotify**

- **FR-021**: The app MUST display the currently playing track's name, artist, and playback position.
- **FR-022**: Users MUST be able to toggle play/pause, skip to the next track, and return to the
  previous track.
- **FR-023**: Users MUST be able to scrub to an arbitrary position within the current track.
- **FR-024**: Displayed playback state MUST reflect changes made outside the app within a few seconds.
- **FR-025**: The app MUST present a clear inactive state when the music app is unavailable or nothing
  is playing, and MUST NOT present controls as functional in that state.

**Notes**

- **FR-026**: Users MUST be able to create, edit, and delete short text notes.
- **FR-027**: Note content MUST be saved without an explicit save action and MUST survive quitting and
  relaunching the app.
- **FR-028**: The Notes section MUST NOT offer a menu bar preview.

**Menu bar previews**

- **FR-029**: The app MUST offer an independently toggleable menu bar preview for each of Screenshots,
  Timer, and Spotify.
- **FR-030**: Preview toggles MUST be controlled from inside the app's panel.
- **FR-031**: Enabling or disabling a preview MUST take effect in the menu bar without restarting the
  app, and MUST NOT affect any other preview.
- **FR-032**: The Screenshots preview MUST show a compact thumbnail of the latest screenshot together
  with the count of unseen screenshots.
- **FR-033**: The Timer preview MUST show a live-updating remaining-time readout while a timer is
  running.
- **FR-034**: The Spotify preview MUST show the currently playing track name.
- **FR-035**: Each preview MUST stay within a bounded width and truncate overlong content rather than
  displacing other menu bar items.
- **FR-036**: Preview toggle states MUST persist across app restarts.

**Data and privacy**

- **FR-037**: All user data (notes, preferences, screenshot index, timer configuration) MUST remain on
  the user's machine.
- **FR-038**: The app MUST NOT require an account, sign-in, or network connection for Screenshots,
  Timer, or Notes to function.

### Key Entities

- **Section**: One of the four destinations in the panel. Has a name, an icon, an ordering in the
  sidebar, and a flag for whether it supports a menu bar preview.
- **Screenshot Entry**: A reference to a screenshot image file. Attributes: file location, capture
  time, thumbnail representation, and whether the user has seen it since it appeared.
- **Timer**: A single countdown. Attributes: configured duration, remaining time, and run state
  (idle, running, paused, finished).
- **Note**: A short user-authored text item. Attributes: content, creation time, last-modified time.
- **Playback State**: A read-through view of the external music app. Attributes: track name, artist,
  current position, total duration, playing/paused, availability.
- **Preview Preference**: Per-section on/off setting for menu bar display. Persisted.
- **User Preferences**: The persisted set of preview preferences, last selected section, timer
  duration, and global shortcut assignment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From clicking the menu bar icon, the user sees their most recent screenshots in under
  1 second.
- **SC-002**: A newly taken screenshot appears in the Screenshots section, and in the menu bar preview
  when enabled, within 3 seconds of being taken, with no user action.
- **SC-003**: The user can open or locate any of their 10 most recent screenshots in at most two
  interactions from the menu bar icon.
- **SC-004**: The user can start or pause a timer without opening the panel, using a single keystroke.
- **SC-005**: Timer completion is announced within 1 second of reaching zero, in 100% of runs,
  including when the panel is closed.
- **SC-006**: Each of the three previewable sections can be turned on or off independently, and the
  menu bar reflects the change within 1 second, with the other previews unchanged.
- **SC-007**: Menu bar previews reflect an externally caused change (new screenshot, track change,
  timer tick) within 2 seconds.
- **SC-008**: The user can move between any two sections in a single click or a single keystroke.
- **SC-009**: 100% of notes and preference settings survive quitting and relaunching the app.
- **SC-010**: With all previews enabled, the app's menu bar footprint stays within a fixed width
  budget and never displaces other menu bar items off screen.
- **SC-011**: During idle operation the app does not appear among the top energy consumers in Activity
  Monitor, and consumes no measurable CPU while the panel is closed and no timer is running.
- **SC-012**: A first-time user identifies and reaches all four sections without instruction.

## Assumptions

- **Single local user, no accounts**: The app serves one person on one Mac. There is no sign-in, no
  multi-user support, no cloud sync, and no sharing between devices.
- **Viewing, not capturing**: The app displays screenshots that macOS produces. It does not add its
  own screenshot capture command or replace the system screenshot shortcuts.
- **Read-only over the filesystem**: The app is a view onto files it does not own. It never moves
  files into a library of its own and never reconfigures system screenshot settings, so uninstalling
  it leaves the user's files exactly as they were. The trade-off accepted here is that screenshots
  remain physically scattered on disk — the app solves finding them, not organising them.
- **Screenshot identification**: An image in a watched location is treated as a screenshot based on
  the naming and metadata conventions macOS applies to screenshots. Unrelated images that happen to
  sit on the Desktop are not expected to appear.
- **Screenshot actions are limited to open and reveal**: The user's description asks to "open or
  locate" a screenshot. Editing, annotating, copying, dragging out, renaming, uploading, and deleting
  screenshots are out of scope for this feature.
- **Recent means a bounded window**: The Screenshots section shows a capped number of the most recent
  screenshots (assumed 50) rather than a complete searchable archive. There is no search, filtering,
  tagging, or album organization.
- **"New" means unseen**: A screenshot counts toward the new-count from the moment it appears until
  the user next opens the Screenshots section.
- **Spotify means the Spotify desktop application on the same Mac**: Controlling other players
  (Apple Music, browser playback, Spotify Connect devices) is out of scope. Search, playlist browsing,
  queue management, volume, shuffle, repeat, and liking tracks are also out of scope.
- **One timer at a time**: A single countdown, not multiple concurrent or named timers. Stopwatch
  mode, recurring timers, and Pomodoro cycles are out of scope.
- **One global shortcut**: Only the timer start/pause action gets a global shortcut in this feature.
  A default binding is provided and the user can change it.
- **Notes are plain text**: No formatting, attachments, images, tags, folders, or search. Notes are
  short; there is no expectation of long-document editing.
- **Autosave on blur**: Because the panel dismisses when it loses focus, note edits save continuously
  rather than on an explicit save action, so closing the panel never loses text.
- **Notifications use the system notification centre**: The user has granted notification permission;
  if they have not, the app explains this in the Timer section.
- **Preferences live inside the panel**: Preview toggles and the shortcut binding are configured in
  the app's own UI, not in a separate preferences window or a system settings pane.
- **Deferred, explicitly out of scope**: Translator, calendar, weather, battery status, and
  performance monitoring (CPU/RAM) are named by the user as future ideas and are not part of this
  feature. The section list is fixed at four; user-added or reorderable sections are out of scope.
