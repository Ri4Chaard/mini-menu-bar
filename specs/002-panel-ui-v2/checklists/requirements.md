# Specification Quality Checklist: Panel UI v2

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-22
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- All three open scope questions were resolved by the user on 2026-08-22:
  - **New controls are in scope** (FR-086) — this is a behavioural change, not a re-skin. FR-063,
    FR-066, FR-068, FR-071, FR-072, and FR-076 describe controls the panel does not have today and
    will need new host bridge surface.
  - **"Minibar" is the existing menu bar preview toggle** (FR-077 to FR-080), not a new floating
    capture bar. It belongs only in sections that support a preview; its appearance in the
    `Settings Widget v2` footer is a drafting error and is explicitly excluded by FR-076/FR-079.
    The design's sublabel copy ("Floating capture bar") is placeholder text and must not ship.
  - **Both appearances are kept** (FR-081 to FR-083) — the light presentation is derived from the
    drawn dark one, sharing layout and structure.
- Requirement IDs run FR-041 to FR-087, continuing feature 001's sequence (which ends at FR-040).
  References to FR-026, FR-036, and FR-040 point at feature 001.
- **Amended 2026-08-22 during `/speckit-plan`.** Phase 0 research found three requirements that could
  not be built as written. Per the constitution's rule against silent waivers, each is recorded in
  the plan's Constitution Check and applied here:
  - **A-1** — FR-087 added, declaring the album art network request. FR-064 needs art and no local
    source exists; the privacy rule requires an explicit spec entry before any outbound request.
  - **A-2** — FR-068 no longer includes Like. Spotify exposes no writable liked property to
    scripting, and the Web API route would add an account, OAuth, and a per-toggle request.
  - **A-3** — FR-068's repeat is a toggle, not a three-state cycle. Only a boolean is scriptable.
- The spec's panel-scale assumption was corrected during planning: the design frames are 1:1 logical
  points (632 × 235), not a 2× rendering. The type scale and the exact band arithmetic both confirm
  it — see [R-101](../research.md).
- **Implemented 2026-08-22.** All 82 tasks complete; 257 unit/contract tests and 15 e2e tests pass;
  payload 330.0 KB / 500 KB. Two further amendments were made during implementation and recorded in
  `tasks.md`: **A-4** narrows feature 001's FR-014a so Copy and Delete are possible without giving up
  the read-only promise on the indexing path, and **A-5** adds `--color-accent-strong` because white
  on the measured accent fails the body-text contrast threshold at 12-13 pt.
