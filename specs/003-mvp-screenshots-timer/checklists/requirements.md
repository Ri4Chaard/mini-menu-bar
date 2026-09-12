# Specification Quality Checklist: MVP Scope — Screenshots & Timer

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-12
**Last validated**: 2026-09-12 (iteration 2, after clarifications)
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

**Status: PASS — 16/16.** Ready for `/speckit-plan`.

Iteration 1 findings, all resolved:

- Success criteria originally named the pasteboard and the tray API; rewritten as user-observable
  outcomes (SC-015, SC-017).
- "Open a screenshot" was left unspecified once click-to-select took the click; resolved to
  double-click (FR-101), recorded as an assumption rather than raised as a question.
- Two stored-preference edge cases were added after inspecting the real `preferences.json`, which
  names a removed section as `lastSection` and enables a removed preview.

Iteration 2 — both clarifications answered by the user:

- **Q1 → remove Copy entirely.** Became FR-096 (removal) and FR-103 (drag-out is now the sole path
  into other applications). US3 "Copy screenshots as pictures" was deleted and its removal folded
  into US1, where it belongs as scope reduction. SC-015 was rewritten from a copy metric to a
  drag-out metric. A "muscle memory for copy" edge case was added.
  - *Recorded tension*: this supersedes the user's original request #2, which asked that Copy place
    images rather than paths on the clipboard. Single-selection copy currently does produce a real
    image, and that capability is being dropped rather than fixed. Called out in the spec's
    Clarifications block and in the "Dragging replaces copying" assumption so the trade is visible
    at planning time.
- **Q2 → count all listed screenshots.** Became FR-110 (total) and FR-112 (remove the seen/unseen
  distinction and its persisted watermark). Key entities updated: Screenshot entry no longer implies
  a seen status; Preferences loses the watermark. A stale-watermark edge case and a US4 scenario
  asserting that viewing does not change the count were added.

Both answers remove a host-interface method (copy, mark-as-seen), which is a contract change under
constitution Principle II — noted in Assumptions so the plan carries mock and contract-test updates
in the same change set.
