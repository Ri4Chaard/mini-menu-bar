# Contract: IPC channels added by feature 004

Supersedes the `app:check-updates` "Not added" row in
[002's channel contract](../../002-panel-ui-v2/contracts/ipc-channels.md), per
[R-401](../research.md).

The constitution requires this list to match `src/shared/channels.ts` exactly. A channel absent from
here MUST NOT be registered.

## Invoke channels

| Channel | Payload | Returns | Notes |
|---|---|---|---|
| `app:get-version` | none | `string` | `app.getVersion()`. Separate from the check on purpose: the version must render before, during and after a failed check, and when the user never checks at all. Folding it into the check result would put the version behind a network request. |
| `app:check-updates` | none | `UpdateCheckResult` | Performs the one declared outbound request ([FR-126](../spec.md)). Rejects with `NETWORK_UNAVAILABLE` when unreachable, `UNKNOWN` when the manifest is malformed. |
| `app:open-releases` | none | `void` | `shell.openExternal` to the releases page. |

No new event channels. All three payloads are empty.

## Why `app:open-releases` takes no argument

The renderer must not hold the address. This is the rule FR-087 established for album art and it
applies unchanged here: the interface receives a version string, the main process owns the URL.

It is also the concrete fix for the drift that produced this feature. The URL was previously a
constant in `settings-section.tsx`, and it named a repository that did not exist — precisely the
failure mode that keeping addresses out of the renderer prevents.

## Error codes

One code is added to `BridgeErrorCode`:

| Code | Raised when |
|---|---|
| `NETWORK_UNAVAILABLE` | Offline, DNS failure, timeout or abort, or a non-2xx response. |

A malformed or oversized manifest normalises to the existing `UNKNOWN`. One new code, because the
interface has exactly one failure state; a second would buy nothing testable.

## Channel count after this feature

| Kind | Before | Added | After |
|---|---|---|---|
| Invoke | 15 | 3 | 18 |
| Event | 3 | 0 | 3 |
