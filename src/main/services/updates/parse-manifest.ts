/**
 * Parsing for the release manifest.
 *
 * This is untrusted network input and is held to the same standard as an IPC
 * argument (see src/main/ipc/validate.ts): read by explicit field access, never
 * by spreading. A `__proto__` key in JSON becomes an own property of the parsed
 * object, and spreading it would carry that straight into the result.
 */

export interface ReleaseManifest {
  version: string
  /** Epoch ms, or null when absent or unparseable. */
  publishedAt: number | null
}

/** Generous for a 150-byte document, small enough that nothing can flood memory. */
export const MAX_MANIFEST_BYTES = 64 * 1024

export function parseManifest(text: string): ReleaseManifest | null {
  if (text.length > MAX_MANIFEST_BYTES) return null

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }

  // An array is an object too, and is not a manifest.
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null

  const version: unknown = (raw as Record<string, unknown>).version
  if (typeof version !== 'string' || version.length === 0 || version.length > 64) return null

  const published: unknown = (raw as Record<string, unknown>).publishedAt
  let publishedAt: number | null = null
  if (typeof published === 'string') {
    const parsed = Date.parse(published)
    if (Number.isFinite(parsed)) publishedAt = parsed
  } else if (typeof published === 'number' && Number.isFinite(published)) {
    publishedAt = published
  }

  return { version, publishedAt }
}
