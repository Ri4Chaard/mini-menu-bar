# Contract Delta: IPC Channels

**Feature**: `003-mvp-screenshots-timer` | Supersedes the Spotify/Notes/Copy portions of
[`002-panel-ui-v2/contracts/ipc-channels.md`](../../002-panel-ui-v2/contracts/ipc-channels.md)

The constitution forbids wildcard or dynamically-named channels and requires `src/shared/channels.ts`
to match this document **exactly**. A channel absent here must not be registered.

---

## Removed from `INVOKE_CHANNELS`

| Key | Channel |
|---|---|
| `screenshotsCopy` | `screenshots:copy` |
| `screenshotsMarkSeen` | `screenshots:mark-seen` |
| `spotifyGet` | `spotify:get` |
| `spotifyToggle` | `spotify:toggle` |
| `spotifyNext` | `spotify:next` |
| `spotifyPrevious` | `spotify:previous` |
| `spotifySeek` | `spotify:seek` |
| `spotifySubscribe` | `spotify:subscribe` |
| `spotifySetVolume` | `spotify:set-volume` |
| `spotifySetShuffle` | `spotify:set-shuffle` |
| `spotifySetRepeat` | `spotify:set-repeat` |
| `notesList` | `notes:list` |
| `notesCreate` | `notes:create` |
| `notesUpdate` | `notes:update` |
| `notesDelete` | `notes:delete` |
| `notesFlush` | `notes:flush` |

## Removed from `EVENT_CHANNELS`

| Key | Channel |
|---|---|
| `spotifyChanged` | `spotify:changed` |

## Surviving channels

```text
INVOKE: screenshots:list, screenshots:open, screenshots:reveal, screenshots:source-error,
        screenshots:delete, screenshots:start-drag,
        timer:get, timer:start, timer:pause, timer:resume, timer:reset, timer:dismiss-alarm,
        prefs:get, prefs:update, prefs:set-shortcut,
        panel:close, app:quit

EVENT:  screenshots:changed, timer:changed, panel:shown
```

**No channels are added by this feature.** The count badge is derived and composited entirely within
the main process, so it crosses no boundary.

## Handler obligations

`src/main/ipc/register.ts` drops the corresponding handlers. Argument validation for survivors is
unchanged, and screenshots continue to be addressed by **id** — the renderer never sends or receives
a filesystem path.

## Packaging obligations

With the Spotify channels gone, the app no longer sends Apple Events:

- Remove `com.apple.security.automation.apple-events` from `build/entitlements.mac.plist`.
- Remove `NSAppleEventsUsageDescription` from `electron-builder.yml`'s `mac.extendInfo`.
- Leave `NSDesktopFolderUsageDescription` — screenshots still read the Desktop.
- `com.apple.security.cs.allow-jit` is left in place and flagged for separate review
  ([R-211](../research.md#r-211)).
