# Contract: IPC Channels (delta)

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

A **delta** against [feature 001's channel enumeration](../001-menu-bar-hub/contracts/ipc-channels.md).
Every channel there stays. This file adds six and changes one payload.

The constitution requires IPC channels to be *"explicitly enumerated in a checked-in contract and
matched exactly in code; wildcard or dynamically-named channels are forbidden"*. Both files together
are that enumeration; `src/shared/channels.ts` MUST match their union exactly, and a channel absent
from both MUST NOT be registered.

Naming follows the existing rule: `<domain>:<action>` for request/response, `<domain>:<event>` for
main→renderer pushes. Lower-case, colon-separated, no interpolation.

## New: Renderer → Main (`ipcRenderer.invoke` / `ipcMain.handle`)

| Channel | Payload | Returns |
|---|---|---|
| `screenshots:copy` | `{ ids: string[] }` | `void` |
| `screenshots:delete` | `{ ids: string[] }` | `void` |
| `spotify:set-volume` | `{ volume: number }` | `void` |
| `spotify:set-shuffle` | `{ shuffling: boolean }` | `void` |
| `spotify:set-repeat` | `{ repeating: boolean }` | `void` |
| `app:quit` | — | `void` (never returns) |

## Changed payload: `spotify:changed`

The `PlaybackState` pushed on this existing event gains four fields — `volume`, `shuffling`,
`repeating`, `artworkDataUrl`. See [data-model.md](../data-model.md). No new event channel is needed:
volume, shuffle, and repeat are read in the same single-round-trip poll script that already produces
this event ([R-109](../research.md)), so they arrive on the existing push with no extra `osascript`
spawn and no change to the idle-CPU profile.

## Validation

Every handler validates before use, in `src/main/ipc/validate.ts`. The constitution's Security clause
requires it, and adds: *"filesystem paths MUST NOT be accepted from the renderer — the renderer
passes identifiers that the main process resolves against its own state."*

| Channel | Rule | On violation |
|---|---|---|
| `screenshots:copy` | `ids` is a string array, length 1…`MAX_SCREENSHOTS`. Each id is resolved **against the store**, never treated as a path | `BridgeError`. Unresolvable ids are skipped; zero resolutions throws |
| `screenshots:delete` | Same as copy | Same as copy |
| `spotify:set-volume` | `Number.isInteger(volume) && volume >= 0 && volume <= 100` | `BridgeError` |
| `spotify:set-shuffle` | `typeof shuffling === 'boolean'` — strict, no coercion | `BridgeError` |
| `spotify:set-repeat` | `typeof repeating === 'boolean'` — strict, no coercion | `BridgeError` |
| `app:quit` | No payload; any payload is ignored | — |

`{ ids }` is the single most security-relevant addition in this feature. An id is an opaque key into
main's own screenshot store. A renderer that sends `../../../etc/passwd` gets a lookup miss, not a
file — which is the whole point of the identifier rule, and why `copyScreenshots` and
`deleteScreenshots` do not take paths even though it would be shorter.

## `app:quit` and the accessory lifecycle

`app:quit` terminates the process. It exists because the app runs as an accessory (`LSUIElement`):
no Dock icon, no application menu, no system-provided Quit ([R-113](../research.md)). The handler
calls `app.quit()` directly — no confirmation, matching every other menu bar utility.

It is the only channel in either contract that does not return. The preload binding is
`invoke`-shaped for interface consistency; callers must not await it expecting resolution.

## Not added

| Considered | Why not |
|---|---|
| `spotify:like` | No scriptable liked property; the Web API route breaks the Privacy clause ([R-110](../research.md)) |
| `app:check-updates` | Would be an in-app network call. "Updates" uses `shell.openExternal` — which the existing external-link path already covers, so it needs no channel of its own ([R-113](../research.md)) |
| `prefs:set-presets` | `timerPresets` is a `Preferences` field; `prefs:update` already carries it ([R-112](../research.md)) |
| `prefs:set-preview` | The footer toggle writes `previews.<section>` through `prefs:update` ([R-114](../research.md)) |
| `spotify:artwork` | Artwork rides `spotify:changed` as a data URL, so the request never leaves main ([R-111](../research.md)) |

## Full channel count after this feature

| | Feature 001 | Added here | Total |
|---|---|---|---|
| Invoke channels | 25 | 6 | 31 |
| Event channels | 4 | 0 | 4 |

`ALL_INVOKE_CHANNELS` and `ALL_EVENT_CHANNELS` in `src/shared/channels.ts` are asserted against these
counts in the contract suite, so a channel registered without a contract entry fails a test.
