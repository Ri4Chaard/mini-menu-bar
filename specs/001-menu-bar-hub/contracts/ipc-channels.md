# Contract: IPC Channels

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

Constitution (Technology & Platform Constraints, Security) requires: *"IPC channels MUST be explicitly
enumerated in the preload script; wildcard or dynamically-named channels are forbidden."*

This file is that enumeration. It is the authoritative list; `src/main/ipc/channels.ts` MUST match it
exactly, and a channel absent from this list MUST NOT be registered.

## Naming

`<domain>:<action>` for request/response, `<domain>:<event>` for main→renderer pushes. Lower-case,
colon-separated, no interpolation anywhere in the name.

## Renderer → Main (`ipcRenderer.invoke` / `ipcMain.handle`)

| Channel | Payload | Returns |
|---|---|---|
| `screenshots:list` | — | `ScreenshotEntry[]` |
| `screenshots:open` | `{ id: string }` | `void` |
| `screenshots:reveal` | `{ id: string }` | `void` |
| `screenshots:mark-seen` | — | `void` |
| `screenshots:source-error` | — | `SourceError \| null` |
| `timer:get` | — | `TimerState` |
| `timer:start` | `{ durationMs: number }` | `TimerState` |
| `timer:pause` | — | `TimerState` |
| `timer:resume` | — | `TimerState` |
| `timer:reset` | — | `TimerState` |
| `spotify:get` | — | `PlaybackState` |
| `spotify:toggle` | — | `void` |
| `spotify:next` | — | `void` |
| `spotify:previous` | — | `void` |
| `spotify:seek` | `{ positionMs: number }` | `void` |
| `spotify:subscribe` | `{ active: boolean }` | `void` |
| `notes:list` | — | `Note[]` |
| `notes:create` | — | `Note` |
| `notes:update` | `{ id: string, content: string }` | `Note` |
| `notes:delete` | `{ id: string }` | `void` |
| `notes:flush` | — | `void` |
| `prefs:get` | — | `Preferences` |
| `prefs:update` | `Partial<Preferences>` | `Preferences` |
| `prefs:set-shortcut` | `{ accelerator: string \| null }` | `boolean` |
| `panel:close` | — | `void` |

`spotify:subscribe` exists so the main process knows when to start and stop polling (R-007). Without
it, the renderer's subscription lifecycle would be invisible to main and polling would either run
forever — breaking the idle-CPU budget — or never start.

## Main → Renderer (`webContents.send` / `ipcRenderer.on`)

| Channel | Payload | Emitted when |
|---|---|---|
| `screenshots:changed` | `ScreenshotEntry[]` | Entry added or removed; screenshot location changed |
| `timer:changed` | `TimerState` | ≤ 1 Hz while the Timer section is open or its preview is on; on every transition |
| `spotify:changed` | `PlaybackState` | While subscribed, on poll producing a different state |
| `panel:shown` | — | Panel becomes visible |

## Validation rules

- Every `ipcMain.handle` argument MUST be validated for type and range before use. A sandboxed
  renderer is still the least-trusted process in the app, and treating its input as well-formed is
  how an IPC surface becomes an attack surface.
- Handlers MUST NOT accept a file path from the renderer. `screenshots:open` and `screenshots:reveal`
  take an `id` that main resolves against its own collection — a renderer-supplied path would let
  arbitrary files be opened.
- `spotify:seek` MUST clamp `positionMs` to `[0, durationMs]`.
- `prefs:update` MUST merge, never replace, so a partial patch cannot blank unrelated settings.
- Errors thrown in handlers MUST be converted to the `{ code, message }` shape defined in
  [host-bridge.md](./host-bridge.md) before crossing the boundary; raw Node errors leak paths and
  stack traces into the renderer.
