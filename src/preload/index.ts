/**
 * The adapter's host binding. Its ONLY job is to expose the Principle II
 * interface over contextBridge.
 *
 * Business logic MUST NOT live here (constitution, Process model). With
 * `sandbox: true` this script has no general Node access anyway — which makes
 * that rule mechanically enforced rather than merely agreed (research.md R-002).
 */
import { contextBridge, ipcRenderer } from 'electron'
import { ALL_EVENT_CHANNELS, ALL_INVOKE_CHANNELS, type EventChannel, type InvokeChannel } from '@shared/channels'
import { deserializeError } from '@shared/errors'

const invokeAllowed = new Set<string>(ALL_INVOKE_CHANNELS)
const eventAllowed = new Set<string>(ALL_EVENT_CHANNELS)

async function invoke(channel: InvokeChannel, payload?: unknown): Promise<unknown> {
  if (!invokeAllowed.has(channel)) {
    throw new Error(`Refused: ${channel} is not an enumerated channel`)
  }
  try {
    return await ipcRenderer.invoke(channel, payload)
  } catch (raw) {
    // Normalise before it reaches the renderer — raw Electron errors carry
    // absolute paths and stack traces (contracts/host-bridge.md).
    const { code, message } = deserializeError(raw)
    const error = new Error(message) as Error & { code: string }
    error.code = code
    throw error
  }
}

function subscribe(channel: EventChannel, cb: (payload: unknown) => void): () => void {
  if (!eventAllowed.has(channel)) {
    throw new Error(`Refused: ${channel} is not an enumerated event channel`)
  }
  const handler = (_event: unknown, payload: unknown): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('__hostBridge', { invoke, subscribe })
