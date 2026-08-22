/**
 * The token set is a contract, not a stylesheet detail.
 *
 * Two things are asserted here, both of which SC-005 and SC-007 depend on:
 *  - Every token named in contracts/design-tokens.md exists in BOTH
 *    appearances. A token defined only in the dark block renders as nothing in
 *    light mode, which is invisible in a dark-mode screenshot review.
 *  - Contrast is computed, not eyeballed. A palette sampled from a rendered
 *    image is "nearly right" in exactly the way that fails an audit.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(join(__dirname, '../../src/renderer/styles/theme.css'), 'utf8')

/** Tokens that MUST be defined in both appearances (contracts/design-tokens.md). */
const COLOUR_TOKENS = [
  'surface',
  'rail',
  'rail-border',
  'hairline',
  'fill-subtle',
  'fill',
  'fill-strong',
  'text',
  'text-secondary',
  'text-tertiary',
  'text-strong',
  'accent',
  'accent-strong',
  'accent-text',
  'accent-subtle',
  'accent-faint',
  'accent-border',
  'on-accent',
  'danger',
  'danger-subtle',
  'scrim'
]

/** Geometry and type are appearance-independent: declared once, in the base block. */
const STRUCTURAL_TOKENS = [
  'panel-width',
  'panel-height',
  'radius-panel',
  'radius-control',
  'radius-chip',
  'rail-width',
  'rail-padding',
  'rail-gap',
  'rail-item',
  'rail-icon',
  'content-padding-y',
  'content-padding-x',
  'content-gap',
  'band-header',
  'band-body',
  'band-footer',
  'header-gap-left',
  'header-gap-right',
  'footer-gap',
  'chip-padding-y',
  'chip-padding-x',
  'switch-w',
  'switch-h',
  'switch-knob',
  'thumb-w',
  'thumb-h',
  'thumb-gap',
  'track-height',
  'track-knob',
  'text-display',
  'text-title',
  'text-track',
  'text-body',
  'text-control',
  'text-meta',
  'text-caption',
  'text-micro',
  'duration-fast',
  'duration-base'
]

/**
 * The dark block is the one nested inside the prefers-color-scheme media query;
 * everything before it is the light (default) declaration.
 */
const DARK_START = CSS.indexOf('@media (prefers-color-scheme: dark)')
const LIGHT_BLOCK = CSS.slice(0, DARK_START)
const DARK_BLOCK = CSS.slice(DARK_START, CSS.indexOf('html,', DARK_START))

function token(block: string, name: string): string | null {
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`))
  return match?.[1]?.trim() ?? null
}

/** sRGB relative luminance, WCAG 2.1 §relative luminance. */
function luminance(hex: string): number {
  const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((pair) => {
    const c = parseInt(pair, 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

function contrast(foreground: string, background: string): number {
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x)
  return (a! + 0.05) / (b! + 0.05)
}

const BODY_MIN = 4.5
const LARGE_MIN = 3

describe('design tokens', () => {
  describe('completeness', () => {
    it.each(COLOUR_TOKENS)('--color-%s is defined in the light appearance', (name) => {
      expect(token(LIGHT_BLOCK, `color-${name}`)).toMatch(/^#[0-9a-f]{6,8}$/i)
    })

    it.each(COLOUR_TOKENS)('--color-%s is defined in the dark appearance', (name) => {
      expect(token(DARK_BLOCK, `color-${name}`)).toMatch(/^#[0-9a-f]{6,8}$/i)
    })

    it.each(STRUCTURAL_TOKENS)('--%s is declared once, outside any appearance block', (name) => {
      expect(token(LIGHT_BLOCK, name)).toBeTruthy()
      // Geometry and type are identical across appearances (FR-082). Redeclaring
      // one in the dark block is how the two silently drift apart.
      expect(token(DARK_BLOCK, name)).toBeNull()
    })
  })

  describe.each([
    ['light', LIGHT_BLOCK],
    ['dark', DARK_BLOCK]
  ])('%s appearance contrast', (_appearance, block) => {
    const surface = token(block, 'color-surface')!
    const accent = token(block, 'color-accent')!

    it('primary text clears the body threshold on the panel surface', () => {
      expect(contrast(token(block, 'color-text')!, surface)).toBeGreaterThanOrEqual(BODY_MIN)
    })

    it('secondary text clears the body threshold on the panel surface', () => {
      expect(contrast(token(block, 'color-text-secondary')!, surface)).toBeGreaterThanOrEqual(
        BODY_MIN
      )
    })

    it('accent TEXT clears the body threshold — raw accent does not, which is why it exists', () => {
      // --color-accent is a fill and large-text colour. At 12 pt on a light
      // surface it lands at ~3.5:1. Accent-coloured labels use
      // --color-accent-text; see the rule in contracts/design-tokens.md.
      expect(contrast(token(block, 'color-accent-text')!, surface)).toBeGreaterThanOrEqual(BODY_MIN)
    })

    it('danger text clears the body threshold on the panel surface', () => {
      expect(contrast(token(block, 'color-danger')!, surface)).toBeGreaterThanOrEqual(BODY_MIN)
    })

    it('text on a filled accent BUTTON clears the body threshold', () => {
      // White on the measured #2b89fa is 3.46:1 — fine for an icon, short of
      // the body threshold for a 12-13 pt label like "Start" or "Apply". That
      // is why --color-accent-strong exists; see contracts/design-tokens.md.
      expect(contrast(token(block, 'color-on-accent')!, token(block, 'color-accent-strong')!))
        .toBeGreaterThanOrEqual(BODY_MIN)
    })

    it('icons on the accent fill clear the icon threshold', () => {
      expect(contrast(token(block, 'color-on-accent')!, accent)).toBeGreaterThanOrEqual(LARGE_MIN)
    })

    it('the accent fill clears the large-text and icon threshold', () => {
      expect(contrast(accent, surface)).toBeGreaterThanOrEqual(LARGE_MIN)
    })

    it('tertiary text clears the caption threshold but NOT the body one', () => {
      const ratio = contrast(token(block, 'color-text-tertiary')!, surface)
      expect(ratio).toBeGreaterThanOrEqual(LARGE_MIN)
      // Deliberate, and asserted so it cannot be quietly promoted: tertiary is
      // for 10-11 pt captions and non-essential metadata only. If a future
      // change darkens it to pass BODY_MIN, this test fails and the caller is
      // sent to update contracts/design-tokens.md rather than drifting.
      expect(ratio).toBeLessThan(BODY_MIN)
    })

    it('the rail reads as recessed against the content surface', () => {
      // R-104: this relationship is the reason the light palette is a role
      // inversion rather than a hex inversion.
      expect(luminance(token(block, 'color-rail')!)).toBeLessThan(luminance(surface))
    })
  })

  describe('band arithmetic', () => {
    it('the bands and gaps sum to the panel height', () => {
      const px = (name: string): number => parseFloat(token(LIGHT_BLOCK, name)!)
      const total =
        px('content-padding-y') * 2 +
        px('band-header') +
        px('band-body') +
        px('band-footer') +
        1 + // divider
        px('content-gap') * 3
      // If this drifts, the panel scrolls and FR-047 breaks. It is a contract,
      // not a coincidence — see contracts/design-tokens.md.
      expect(total).toBe(px('panel-height'))
    })

    it('exactly four thumbnails fit the content width with no partial fifth', () => {
      const px = (name: string): number => parseFloat(token(LIGHT_BLOCK, name)!)
      const contentWidth = px('panel-width') - px('rail-width') - px('content-padding-x') * 2
      expect(px('thumb-w') * 4 + px('thumb-gap') * 3).toBe(contentWidth)
    })
  })

  describe('appearance switching', () => {
    it('is CSS-only — no media-query listener anywhere in the renderer', () => {
      // FR-083 falls out of the media query. A listener would mean a re-render
      // on appearance change, which the constitution's styling clause forbids.
      expect(CSS).toContain('@media (prefers-color-scheme: dark)')

      const renderer = join(__dirname, '../../src/renderer')
      const sources = execFileSync('find', [renderer, '-name', '*.ts', '-o', '-name', '*.tsx'], {
        encoding: 'utf8'
      })
        .trim()
        .split('\n')
      for (const file of sources) {
        expect(readFileSync(file, 'utf8'), `${file} must not listen for appearance changes`).not.toContain(
          'matchMedia'
        )
      }
    })
  })
})
