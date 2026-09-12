# Contract: Tray Badge Compositing

**Feature**: `003-mvp-screenshots-timer` | New in this feature

Governs `src/main/tray/badge.ts`. This is an internal main-process contract, not a bridge surface —
it crosses no process boundary. It is specified because FR-109…FR-115 are asserted against it and
because the approach was chosen on probe evidence ([R-201](../research.md#r-201)).

---

## Interface

```text
composeBadge(bitmap: Buffer, width: number, height: number, count: number): void
```

Mutates `bitmap` in place. `bitmap` is raw **BGRA**, 4 bytes per pixel, length `width * height * 4`,
as returned by `NativeImage.toBitmap()`.

## Behavioural contract

| Condition | Required behaviour | Requirement |
|---|---|---|
| `count <= 0` | no-op | FR-114, FR-115 |
| `1 <= count <= 99` | right-aligned digits on a filled pill in the top-right corner | FR-109, FR-110 |
| `count > 99` | renders `99+` | [R-202](../research.md#r-202) |
| `bitmap.length !== width * height * 4` | no-op | defensive |
| badge would not fit in `width × height` | no-op, never a partial or clipped glyph | FR-116 |
| any call | writes only within the buffer; never throws | defensive |

**The `count <= 0` no-op is load-bearing.** It is what stops a "0" being painted over the wine-glass
fallback when the user deletes their last screenshot — the exact bug FR-115 exists to prevent.

## Compositing parameters

| Parameter | Value | Source |
|---|---|---|
| Canvas | 64 × 36, tagged `scaleFactor: 2` | probe-confirmed ([R-201](../research.md#r-201)) |
| Digit glyphs | 3 × 5 bitmap font | [R-202](../research.md#r-202) |
| Corner | top-right | FR-109 |
| Colours | two named constants (pill fill, digit ink) | outside the CSS token system by necessity |

## Test obligations

`tests/unit/tray-badge.spec.ts` runs without Electron — the function takes a plain `Buffer`, so a
test constructs one directly:

1. All ten digits render distinctly (exhaustive over `digitGlyph`).
2. `0` and negative counts leave the buffer **byte-identical**.
3. `100` renders `99+`.
4. Single- and double-digit counts both fit and right-align.
5. An undersized buffer is a no-op, not a throw and not an overflow.
6. Pixels outside the badge region are untouched — the thumbnail beneath is preserved.

Item 6 is the one that catches an off-by-one in the row stride, which is the most likely defect in
buffer arithmetic of this shape.
