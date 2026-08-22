# Feature Specification: Panel UI v2

**Feature Branch**: `002-panel-ui-v2`

**Created**: 2026-08-22

**Status**: Draft

**Input**: User description: "Check selected nodes which I selected in pen.dev, we need to update our UI"

**Design source**: `design/mini-menu-bar-design.pen` → frame `Frame 1`, nodes selected by the user:
`Screenshots Widget v2`, `Timer Widget v2`, `Spotify Widget v2`, `Notes Widget v2`, `Settings Widget v2`.

## Overview

The five selected design frames describe a second-generation layout for the menu bar panel. Every
frame shares one skeleton — a narrow icon rail on the left, and a content column made of a header
row, a body, a hairline divider, and a footer row — and each section fills that skeleton with its
own body. The panel is wider and much shorter than today's, so the whole of a section is visible at
a glance without scrolling.

This feature covers adopting that layout and its visual language across all five sections. It is a
presentation-layer change: the underlying capabilities (screenshot list, timer, playback control,
notes, preferences) already exist and are not being redefined here, except where the design shows a
control the panel does not have today.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A panel that reads at a glance (Priority: P1)

A user clicks the menu bar icon. The panel opens as a wide, short, dark card: a slim icon-only rail
runs down the left edge with one icon per section and the current one highlighted; the rest is the
active section, laid out as a titled header, a body, and a footer strip. Nothing is cut off and
nothing scrolls — the user takes in the whole section in one look and clicks straight to what they
came for.

**Why this priority**: The shared skeleton is the feature. Every other story is a body that drops
into it; without it there is nothing to drop into. Delivered alone it already replaces the current
labelled sidebar and vertical layout with the designed one.

**Independent Test**: Open the panel in the browser harness against mock data, switch between all
five sections using the rail, and confirm each renders header / body / divider / footer inside the
designed panel dimensions with no clipping and no scrollbar.

**Acceptance Scenarios**:

1. **Given** the panel is closed, **When** the user opens it, **Then** the panel appears at the
   designed size with the left rail showing five section icons and the previously used section
   active.
2. **Given** the panel is open on Screenshots, **When** the user clicks the Timer icon in the rail,
   **Then** the content column swaps to the Timer section while the rail, header row position,
   divider, and footer row stay in place.
3. **Given** any section is open, **When** the user inspects the header, **Then** it shows the
   section title, a status pill beside it, a text action on the right, and an overflow button.
4. **Given** the user navigates with the keyboard only, **When** they move through the rail and into
   the content, **Then** every control is reachable and the focused control is visibly indicated.
5. **Given** a section is active, **When** the user looks at its rail icon, **Then** that icon is
   rendered in the accent treatment while the other four are rendered in the muted treatment.
6. **Given** the panel is open on Screenshots, Timer, or Spotify, **When** the user flips the menu
   bar preview switch in the footer, **Then** that section's menu bar preview appears or disappears
   and the matching checkbox in Settings shows the same new state.
7. **Given** the panel is open, **When** the system appearance switches between dark and light,
   **Then** the panel repaints in the other palette with its layout unchanged.

---

### User Story 2 - Screenshots as a browsable strip (Priority: P2)

The Screenshots section shows recent captures as a horizontal row of thumbnails rather than a
vertical grid. Each thumbnail carries a relative-time chip, a selection badge in its corner, and a
filename with a save affordance underneath. The header counts what is available and offers "Select
All"; the footer reports how many are selected and offers Copy and Delete.

**Why this priority**: Screenshots is the section the app is most often opened for, and the strip
plus selection model is the largest behavioural change in the design.

**Independent Test**: Load the section with mock screenshot entries, select and deselect
thumbnails, and confirm the count, the badges, and the footer actions respond.

**Acceptance Scenarios**:

1. **Given** recent screenshots exist, **When** the section opens, **Then** they appear as a
   horizontal strip of thumbnails, each with its relative capture time and its filename.
2. **Given** the strip is shown, **When** the user clicks a thumbnail's selection badge, **Then**
   that thumbnail reads as selected and the footer selection count increases by one.
3. **Given** at least one thumbnail is selected, **When** the user activates Copy or Delete,
   **Then** the action applies to exactly the selected screenshots.
4. **Given** more screenshots exist than fit the strip, **When** the section opens, **Then** the
   most recent are shown and the header count reflects the full number available.
5. **Given** no screenshots exist, **When** the section opens, **Then** the skeleton still renders
   with an empty-state message in the body instead of the strip.

---

### User Story 3 - Timer, Spotify, and Notes in the new skeleton (Priority: P2)

Each remaining content section is rebuilt to its designed body: the Timer shows a large countdown
readout with a status line, a primary transport button, a reset button, and a row of duration
presets; Spotify shows album art, track and artist, a seek bar with elapsed and total time, and
transport controls; Notes shows a list of notes on the left and the selected note's editor on the
right, split by a vertical hairline.

**Why this priority**: These three carry the everyday value of the panel, but each depends on the
skeleton from Story 1 and none blocks the others.

**Independent Test**: Open each of the three sections against mock data and confirm its body matches
the designed arrangement and that its primary control (start/pause, play/pause, edit a note) works.

**Acceptance Scenarios**:

1. **Given** the Timer section is open and idle, **When** the user picks a duration preset, **Then**
   the readout shows that duration and the selected preset reads as active.
2. **Given** a timer is running, **When** the user looks at the status line under the readout,
   **Then** it shows the running state and the projected finish time.
3. **Given** Spotify is playing, **When** the section opens, **Then** album art, track title, artist,
   elapsed time, total time, and a progress indicator at the correct position are all shown.
4. **Given** Spotify is playing, **When** the user activates the primary transport button, **Then**
   playback pauses and the button flips to its play state.
5. **Given** the Notes section is open, **When** the user selects a different note in the list,
   **Then** the editor pane swaps to that note and the list marks it as the selected one.
6. **Given** a note is open in the editor, **When** the user types, **Then** the edit is saved
   without an explicit save action and the footer reflects that it was saved.

---

### User Story 4 - Settings as a two-column panel (Priority: P3)

The Settings section splits into two columns divided by a vertical hairline: on the left, a "Show in
menu bar" group with one checkbox row per previewable section; on the right, the timer shortcut
shown as individual key chips with an Apply button and an explanatory hint beneath. The footer
carries the version number alongside secondary actions.

**Why this priority**: Settings is visited least often, and the underlying preferences already work
— this is the smallest delta of the five.

**Independent Test**: Open Settings, toggle each menu bar checkbox, change and apply the shortcut,
and confirm the changes persist across a panel close and reopen.

**Acceptance Scenarios**:

1. **Given** Settings is open, **When** the user views the left column, **Then** each previewable
   section has its own checkbox row showing its icon, its name, and its current state.
2. **Given** a checkbox is toggled, **When** the panel is closed and reopened, **Then** the new
   state is still shown.
3. **Given** Settings is open, **When** the user views the right column, **Then** the current timer
   shortcut is shown as one chip per key with an Apply action beside it.
4. **Given** the user records an unavailable shortcut, **When** they apply it, **Then** the panel
   explains the conflict in place and keeps the previous shortcut.
5. **Given** Settings is open, **When** the user views the footer, **Then** it shows the version and
   the secondary actions only — no menu bar preview switch.
6. **Given** the user flipped a preview switch from a section footer, **When** they open Settings,
   **Then** the corresponding checkbox already shows that state.

---

### Edge Cases

- A section's body has more content than the designed height (many screenshots, a long note, a very
  long track or note title): content is truncated or the body scrolls internally, but the header,
  divider, and footer stay fixed and the panel itself never grows or scrolls.
- A section has nothing to show (no screenshots, no notes, Spotify not running): the skeleton still
  renders and the body carries an empty state sized to the body area.
- A source fails (screenshot folder unreadable, Spotify unreachable): the error is shown inside the
  body without collapsing the header or footer.
- The system appearance flips from dark to light while the panel is open: the palette follows
  immediately, the layout does not shift, and no section loses its place or its in-progress edit.
- A note is deleted while it is the one open in the editor: the editor moves to the next note, or to
  an empty state if none remain.
- The user has reduce-motion or reduce-transparency enabled: transitions between sections are
  suppressed rather than merely shortened.
- The display is not Retina, or the menu bar is on a small laptop screen: the panel still fits fully
  on screen below the menu bar icon at the designed size.

## Requirements *(mandatory)*

### Functional Requirements

Requirement IDs continue the sequence used by `specs/001-menu-bar-hub/spec.md` (which ends at
FR-040) so the two specifications can be read side by side without collision.

#### Panel shell and navigation

- **FR-041**: The panel MUST use the designed panel proportions — noticeably wider than tall, with a
  fixed left rail and a content column — replacing the current taller, narrower layout.
- **FR-042**: The left rail MUST present one icon per section (Screenshots, Timer, Spotify, Notes,
  Settings) in the designed order, with no text labels.
- **FR-043**: The rail MUST render exactly one section as active at a time, distinguished from the
  other four by both a background treatment and an icon colour.
- **FR-044**: Every content section MUST be composed of the same four bands in the same order:
  header row, body, hairline divider, footer row.
- **FR-045**: The header row MUST contain, from left to right: the section title, a status pill, a
  text action, and an overflow button.
- **FR-046**: Switching sections MUST replace only the body and the section-specific header and
  footer contents; the rail and the band structure MUST remain fixed.
- **FR-047**: The panel MUST render its entire active section within the panel bounds without the
  panel itself scrolling.
- **FR-048**: All controls introduced by this redesign MUST be reachable and operable by keyboard,
  with a visible focus indicator, and icon-only controls MUST carry an accessible name.

#### Visual language

- **FR-049**: In dark appearance the panel MUST use the design's dark surface palette. In both
  appearances the rail MUST read as a recessed surface, visually separated from the content surface.
- **FR-050**: A single accent colour MUST be used for active states, primary actions, and selection,
  and a single destructive colour for removal actions.
- **FR-051**: Type sizes, weights, and the muted/primary text distinction MUST follow the design's
  scale rather than per-component choices.
- **FR-052**: All colours, spacing, and radii introduced by this redesign MUST be defined once as
  shared tokens and referenced by every section.
- **FR-053**: Text and icons MUST meet at least a 4.5:1 contrast ratio against their background for
  body text, and 3:1 for large text and meaningful icons, in both appearances.

#### Screenshots section

- **FR-054**: Recent screenshots MUST be presented as a horizontal strip of thumbnails.
- **FR-055**: Each thumbnail MUST show its relative capture time and, beneath it, its filename.
- **FR-056**: Each thumbnail MUST carry a selection badge showing whether it is selected.
- **FR-057**: Users MUST be able to select and deselect individual screenshots, and to select all of
  them from the header action.
- **FR-058**: The footer MUST show the current selection count and offer Copy and Delete actions
  that apply to the selected screenshots. Delete MUST move files to the Trash so they stay
  recoverable, and MUST NOT permanently remove them.

  *Amended 2026-08-22 during implementation (amendment A-4).* Feature 001's FR-014a promised that
  screenshot files are strictly read-only — never moved, copied, deleted, or modified. Copy and
  Delete are exactly what that forbade, so FR-014a is narrowed rather than waived: the app still
  never touches a screenshot on its own initiative, and only an explicit user action may act on one.
  The amendment is recorded on FR-014a in `specs/001-menu-bar-hub/spec.md` and both halves are
  asserted in `tests/unit/screenshots-readonly.spec.ts`.
- **FR-059**: The header status pill MUST show the total number of screenshots available.

#### Timer section

- **FR-060**: The Timer body MUST show the remaining time as a large readout, with a status line
  beneath it giving the timer state and, when running, the projected finish time.
- **FR-061**: The Timer MUST offer a primary transport action (start / pause / resume) and a
  separate reset action.
- **FR-062**: Duration presets MUST be shown as a row of chips with the currently configured one
  marked active.
- **FR-063**: Users MUST be able to add a duration preset of their own and to edit the preset list.
- **FR-088**: The Timer footer's bell control MUST be an on/off setting governing whether reaching
  zero is audible. When on, the app MUST sound a macOS system alert; when off, the countdown MUST
  finish silently. The notification is shown either way — this setting governs only the sound. It
  MUST default to on and MUST persist across restarts.

  *Added 2026-08-22 (amendment A-7).* The design drew the bell and repeat controls in the footer but
  the redesign shipped them inert; FR-086 makes the new controls in the frames in-scope, so their
  behaviour belongs in the spec rather than being decided in the code. macOS does not expose the
  Clock app's own timer tone as a playable asset, so "the alarm sound" is the nearest system alert
  sound.
- **FR-089**: The Timer footer's repeat control MUST be an on/off setting governing whether reaching
  zero immediately starts the same duration again. The app MUST report the finish on every cycle, not
  only the first. The setting MUST be read at the moment the countdown finishes, so that toggling it
  affects a countdown already running, and MUST default to off.
- **FR-090**: The alarm MUST continue sounding until it is dismissed. It MUST NOT stop after a fixed
  number of rings or a fixed time — an alarm that gives up while the user is out of the room has
  failed at the one thing it is for. The Timer MUST offer a dismiss action while the alarm is
  sounding, and dismissing MUST silence it without altering the countdown: with FR-089 on, the next
  cycle is already running by the time the user reaches the control, and silencing must not throw
  that countdown away. Starting or resetting the timer MUST also silence it, and the finish
  notification MUST offer a third route for when the panel is closed.

  *Added 2026-08-22 (amendment A-8).* FR-088 originally bounded the alarm to a small fixed number of
  rings, reasoning that a panel which dismisses on focus loss has nowhere to put a Stop control. The
  user asked for the opposite and the reasoning was wrong: the panel reopens from the tray, so the
  control has somewhere to live after all.

#### Spotify section

- **FR-064**: The Spotify body MUST show album art, track title, and artist for the current track.
- **FR-065**: The body MUST show elapsed time, total duration, and a progress indicator positioned
  to reflect playback position.
- **FR-066**: Users MUST be able to seek within the current track by dragging the progress indicator.
- **FR-067**: Transport controls MUST offer previous, play/pause, and next, with the play/pause
  control reflecting the current playback state.
- **FR-068**: Users MUST be able to adjust playback volume, toggle shuffle, and toggle repeat from
  the section footer.

  *Amended 2026-08-22 during planning (amendments A-2 and A-3, see [plan.md](./plan.md)).* Two
  controls drawn in the frame cannot be built as originally written:
  - **Like was dropped.** Spotify exposes no writable liked/saved property to scripting. The only
    route is its Web API, which needs an account, OAuth, and an outbound request per toggle —
    against this app's offline, no-account promise. The heart affordance is not built.
  - **Repeat is a toggle, not a cycle.** The three-state off → all → one in Spotify's own interface
    is not scriptable; only an on/off boolean is.

#### Notes section

- **FR-069**: The Notes body MUST show a list of notes and the selected note's editor side by side,
  separated by a vertical divider.
- **FR-070**: Each list entry MUST show the note title and its relative edit time, with the selected
  entry visually distinguished.
- **FR-071**: Users MUST be able to create a note from the header and delete a note from its list
  entry.
- **FR-072**: Edits MUST be saved without an explicit save action, and the footer MUST report the
  last edit time and the note's word count.

#### Settings section

- **FR-073**: The Settings body MUST present two columns divided by a vertical hairline: menu bar
  preview toggles on the left, timer shortcut on the right.
- **FR-074**: Each previewable section MUST have its own checkbox row showing its icon, name, and
  current state; a section that has no menu bar preview MUST NOT appear in the list.
- **FR-075**: The timer shortcut MUST be displayed as one chip per key, with an Apply action and an
  explanatory hint beneath.
- **FR-076**: The Settings footer MUST show the application version alongside its secondary actions,
  and MUST NOT carry a menu bar preview toggle — the design frame shows one in error (see FR-079).

#### Menu bar preview toggle

The switch labelled "Minibar" in the designed footers is the existing menu bar preview control —
the one that decides whether a section shows a live preview next to the menu bar icon (feature 001,
FR-026 to FR-036). It is not a new capability; the design surfaces the existing preference inline so
the user can flip it without opening Settings.

- **FR-077**: Sections that support a menu bar preview MUST offer that preview's toggle in their own
  footer, showing the section's current preview state.
- **FR-078**: The footer toggle and the matching Settings checkbox MUST reflect one shared
  preference: changing either MUST immediately update the other and the menu bar itself.
- **FR-079**: The footer toggle MUST NOT appear in Notes or in Settings. Notes has no menu bar
  preview, and Settings is not a previewable section — its footer carries only the version and its
  secondary actions.
- **FR-080**: The toggle's label and supporting text MUST describe the menu bar preview for that
  section. The design frames carry placeholder copy ("Floating capture bar") that MUST NOT ship.

#### Appearance

- **FR-081**: The panel MUST follow the system appearance, rendering a dark presentation and a light
  presentation of the same v2 layout.
- **FR-082**: The light presentation MUST be derived from the dark one drawn in the design —
  identical layout, spacing, type, and structure, with only the palette inverted in role — so the
  two read as one design rather than two.
- **FR-083**: A system appearance change while the panel is open MUST be reflected without the user
  reopening the panel.

#### Scope boundaries

- **FR-084**: The redesign MUST NOT change how screenshots, timer state, playback, notes, or
  preferences are sourced or stored; only their presentation and the controls over them change.
- **FR-085**: Every section MUST remain fully exercisable in a standard browser against mock data,
  with no host-only affordance introduced by this redesign.
- **FR-086**: The redesign MUST deliver the new per-section controls the design introduces alongside
  the new layout — screenshot multi-select with Copy and Delete, editable timer presets, Spotify
  seek, volume, shuffle and repeat, note deletion and word count, and the Settings secondary
  actions. This feature is a behavioural change as well as a visual one.

#### Network

- **FR-087**: Album art MUST be retrieved over the network, and this is the app's only outbound
  request. It is bounded as follows, and the bounds are the reason it is acceptable in an otherwise
  offline application:
  - Image bytes only, from Spotify's artwork host, for the track currently playing.
  - Issued by the application core, never by the panel interface — the interface receives the image,
    never the address, so it remains fully operable with no network access at all.
  - Sent without cookies, credentials, or any header identifying the user or the app.
  - Made only while the Spotify section is open or its menu bar preview is enabled, at most once per
    distinct artwork, and cached in memory for the session.
  - On failure, silent: the art slot shows a neutral placeholder and every other part of the section
    renders normally. No retry storm.

  *Added 2026-08-22 during planning (amendment A-1, see [plan.md](./plan.md)).* FR-064 requires album
  art and no local source for it exists. This entry is the explicit declaration the project's privacy
  rule requires before any outbound request may be implemented.

### Key Entities

- **Section**: One of the five destinations in the rail. Has an icon, a title, a status pill value, a
  header action, a body, and a footer. Knows whether it supports a menu bar preview.
- **Panel skeleton**: The fixed arrangement — rail, header band, body band, divider, footer band —
  that every section fills.
- **Screenshot selection**: The set of screenshots currently marked by the user; drives the footer
  count and which entries Copy and Delete act on.
- **Duration preset**: A named timer duration shown as a chip; the user may add to the set.
- **Design token**: A named colour, spacing, radius, or type value defined once and referenced
  everywhere, mirroring the values in the selected design frames.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All five sections render their complete designed content within the panel with no
  clipped element and no panel-level scrollbar, on every supported display.
- **SC-002**: A user can move from opening the panel to acting on the most recent screenshot in two
  interactions or fewer.
- **SC-003**: Switching between any two sections completes within 150 ms, with no visible reflow of
  the rail, header band, or footer band.
- **SC-004**: Every interactive element in every section is reachable by keyboard alone, and 100% of
  icon-only controls announce a name to assistive technology.
- **SC-005**: Every text and icon pair in the panel meets its contrast threshold (4.5:1 body text,
  3:1 large text and meaningful icons), verified across all five sections in both appearances.
- **SC-006**: A side-by-side comparison of each built section against its design frame shows matching
  structure, ordering, and spacing rhythm for all five sections.
- **SC-007**: No colour, spacing, or radius value appears as a literal inside a section; 100% of them
  resolve to a shared token.
- **SC-008**: All existing section behaviour continues to pass its current acceptance checks after
  the redesign, with no regression in the capabilities specified in feature 001.

## Assumptions

- The five selected frames are the authority for layout, and the earlier v1 frames in the same
  document are superseded.
- The design frames are drawn 1:1 in logical points: the panel is 632×235 with a 64 pt rail. The
  type scale settles this — 15 pt titles, 12 pt body, 10–11 pt captions, 18 pt rail icons are
  macOS-native sizes at 1×, and would be illegible if the frames were a 2× rendering.
- The panel keeps its current placement and dismissal behaviour (anchored under the menu bar icon,
  dismissed by Escape or focus loss); this feature does not revisit them.
- Every capability the design surfaces already has, or can reuse, an existing local data source; no
  new account, network service, or permission is introduced.
- Relative time labels ("2m ago", "Yesterday") and status text ("Ready · ends at 18:32") in the
  design are illustrative content, not fixed strings.
- The blue accent, the near-black surfaces, and the type scale in the frames are the intended brand
  values and are adopted as-is rather than re-derived.
- Only the dark appearance is drawn. The light appearance is derived from it during design and
  implementation and is not expected to exist as its own set of frames.
- Notes remains the one section without a menu bar preview, as established in feature 001, which is
  why its footer carries note metadata where the other content sections carry the preview toggle.
- The `Settings Widget v2` frame shows a menu bar preview toggle in its footer. The user has
  confirmed this is a drafting error; the frame is treated as authoritative for everything except
  that switch.
- Existing tests, contracts, and the host bridge from feature 001 stay valid; this feature changes
  the renderer's presentation layer and, where new controls require it, extends the bridge rather
  than replacing it.
