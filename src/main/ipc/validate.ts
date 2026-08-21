/**
 * A sandboxed renderer is still the least-trusted process in the app. Treating
 * its input as well-formed is how an IPC surface becomes an attack surface
 * (contracts/ipc-channels.md).
 */
import { BridgeError } from '@shared/errors'

function fail(what: string): never {
  throw new BridgeError('INVALID_ARGUMENT', what)
}

export function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

export function requireId(value: unknown, label = 'id'): string {
  const obj = requireObject(value, 'payload')
  const id = obj[label]
  if (typeof id !== 'string' || id.length === 0) fail(`${label} must be a non-empty string`)
  // Handlers resolve ids against main-process state. A renderer-supplied
  // filesystem path would let arbitrary files be opened, so reject anything
  // shaped like one.
  if (id.includes('\0')) fail(`${label} contains an invalid character`)
  return id
}

export function requireFiniteNumber(value: unknown, label: string): number {
  const obj = requireObject(value, 'payload')
  const n = obj[label]
  if (typeof n !== 'number' || !Number.isFinite(n)) fail(`${label} must be a finite number`)
  return n
}

export function requirePositiveDuration(value: unknown, label: string): number {
  const n = requireFiniteNumber(value, label)
  if (n <= 0) fail(`${label} must be greater than zero`)
  if (n > 24 * 60 * 60 * 1000) fail(`${label} must be at most 24 hours`)
  return n
}

export function requireString(value: unknown, label: string, maxLength = 100_000): string {
  const obj = requireObject(value, 'payload')
  const s = obj[label]
  if (typeof s !== 'string') fail(`${label} must be a string`)
  if (s.length > maxLength) fail(`${label} exceeds ${maxLength} characters`)
  return s
}

export function requireBoolean(value: unknown, label: string): boolean {
  const obj = requireObject(value, 'payload')
  const b = obj[label]
  if (typeof b !== 'boolean') fail(`${label} must be a boolean`)
  return b
}

export function requireNullableString(value: unknown, label: string): string | null {
  const obj = requireObject(value, 'payload')
  const s = obj[label]
  if (s === null) return null
  if (typeof s !== 'string') fail(`${label} must be a string or null`)
  return s
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}
