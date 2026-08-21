/**
 * Errors crossing the host boundary are normalised to { code, message }.
 * Raw Node errors leak absolute paths and stack traces into the renderer, so
 * they must never cross (contracts/host-bridge.md).
 */

export type BridgeErrorCode =
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'SPOTIFY_UNAVAILABLE'
  | 'SHORTCUT_TAKEN'
  | 'PERSISTENCE_FAILED'
  | 'INVALID_ARGUMENT'
  | 'UNKNOWN'

export interface BridgeErrorShape {
  code: BridgeErrorCode
  message: string
}

export class BridgeError extends Error implements BridgeErrorShape {
  readonly code: BridgeErrorCode

  constructor(code: BridgeErrorCode, message: string) {
    super(message)
    this.name = 'BridgeError'
    this.code = code
  }

  toJSON(): BridgeErrorShape {
    return { code: this.code, message: this.message }
  }
}

export function isBridgeErrorShape(value: unknown): value is BridgeErrorShape {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as BridgeErrorShape).code === 'string' &&
    typeof (value as BridgeErrorShape).message === 'string'
  )
}

/** Wire format: handlers serialise errors into the message so preload can rehydrate. */
const WIRE_PREFIX = 'BRIDGE_ERROR:'

export function serializeError(error: unknown): string {
  const shape: BridgeErrorShape =
    error instanceof BridgeError
      ? error.toJSON()
      : { code: 'UNKNOWN', message: error instanceof Error ? error.message : String(error) }
  return `${WIRE_PREFIX}${JSON.stringify(shape)}`
}

export function deserializeError(raw: unknown): BridgeErrorShape {
  const text = raw instanceof Error ? raw.message : String(raw)
  const start = text.indexOf(WIRE_PREFIX)
  if (start !== -1) {
    try {
      const parsed: unknown = JSON.parse(text.slice(start + WIRE_PREFIX.length))
      if (isBridgeErrorShape(parsed)) return parsed
    } catch {
      // fall through to UNKNOWN
    }
  }
  return { code: 'UNKNOWN', message: text }
}
