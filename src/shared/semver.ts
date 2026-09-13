/**
 * Semantic version comparison, as a pure function.
 *
 * Lives in `shared` rather than under `src/main/` for one reason that matters:
 * the browser mock needs it too. If the mock decided "newer" by any other rule,
 * browser mode could disagree with the host about whether an update exists, and
 * Principle I's promise that the mock proves something would be hollow.
 *
 * Only the subset the update check needs is implemented - parse, compare, and a
 * fails-closed "is this newer". Nothing here does ranges, carets or tildes; the
 * app compares two exact versions and nothing else.
 */

export interface SemVer {
  major: number
  minor: number
  patch: number
  /**
   * Dot-separated prerelease identifiers, already split. Empty for a release.
   * Build metadata is discarded during parsing: SemVer 2.0.0 section 10 says
   * it MUST be ignored when determining precedence.
   */
  prerelease: string[]
}

/**
 * Strict enough to reject nonsense, lenient about a leading `v`.
 *
 * Leading zeros are rejected because SemVer forbids them, and because accepting
 * them would make `01.2.3` and `1.2.3` two spellings of one version.
 */
const PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/

export function parseSemver(input: string): SemVer | null {
  if (typeof input !== 'string') return null
  const match = PATTERN.exec(input.trim())
  if (!match) return null

  const prerelease = match[4] ? match[4].split('.') : []
  // An empty identifier ("1.0.0-alpha..1") is malformed, and a numeric one may
  // not have a leading zero.
  for (const id of prerelease) {
    if (id.length === 0) return null
    if (/^\d+$/.test(id) && id.length > 1 && id.startsWith('0')) return null
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease
  }
}

/** SemVer 2.0.0 section 11 ordering for one pair of prerelease identifiers. */
function compareIdentifier(a: string, b: string): number {
  const aNumeric = /^\d+$/.test(a)
  const bNumeric = /^\d+$/.test(b)
  // "Numeric identifiers always have lower precedence than alphanumeric ones."
  if (aNumeric && !bNumeric) return -1
  if (!aNumeric && bNumeric) return 1
  if (aNumeric && bNumeric) return Number(a) - Number(b) || 0
  return a < b ? -1 : a > b ? 1 : 0
}

function comparePrerelease(a: string[], b: string[]): number {
  // "A pre-release version has lower precedence than a normal version."
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i]
    const right = b[i]
    // "A larger set of fields has a higher precedence" when all preceding
    // identifiers are equal.
    if (left === undefined) return -1
    if (right === undefined) return 1
    const result = compareIdentifier(left, right)
    if (result !== 0) return result < 0 ? -1 : 1
  }
  return 0
}

/**
 * -1, 0 or 1. Throws for unparseable input - callers that must not throw use
 * `isNewer`, which is total.
 */
export function compareSemver(a: string, b: string): number {
  const left = parseSemver(a)
  const right = parseSemver(b)
  if (!left || !right) throw new TypeError(`Not a semantic version: ${!left ? a : b}`)

  for (const key of ['major', 'minor', 'patch'] as const) {
    // Numeric, not lexicographic. This is the comparison that actually bites:
    // as strings, "0.10.0" sorts below "0.9.0".
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1
  }
  return comparePrerelease(left.prerelease, right.prerelease)
}

/**
 * Whether `candidate` supersedes `current`. Total, and fails closed.
 *
 * The candidate arrives from the network. Anything unparseable - a truncated
 * response, a manifest someone hand-edited, an HTML error page - must never be
 * announced to the user as an available update, so it returns false rather
 * than throwing or guessing.
 */
export function isNewer(candidate: string, current: string): boolean {
  const a = parseSemver(candidate)
  const b = parseSemver(current)
  if (!a || !b) return false
  return compareSemver(candidate, current) > 0
}
