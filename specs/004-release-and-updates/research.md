# Research: Releasable Build

Decisions taken while planning feature 004. Numbering continues the 002 (R-1xx) and 003 (R-2xx)
ranges in a new R-4xx block.

---

## R-401: An in-app update check, superseding R-113

**Decision**: The app checks for updates itself, from the main process, against a JSON manifest
published as a GitHub release asset. The download remains a hand-off to the user's browser.

**Supersedes**: [R-113](../002-panel-ui-v2/research.md) and the `app:check-updates` row in
[002's channel contract](../002-panel-ui-v2/contracts/ipc-channels.md).

**Rationale**: R-113 rejected an in-app check because it would have been an undeclared outbound
request in an app that made none. That reasoning was correct for an application with no releases: the
"Updates" link cost nothing because there was nothing on the other end of it.

Feature 004 ships binaries. A user who installs a DMG and never thinks to visit a releases page stays
on that version forever, and an app distributed outside the App Store has no other mechanism to tell
them otherwise. The privacy rule the original decision was protecting is not being waived — it is
being satisfied by the route it provides for exactly this case: an explicit declaration in the
feature spec ([FR-126](./spec.md)) before implementation.

**What is preserved from R-113**: the renderer still never holds the releases URL, and the download
is still `shell.openExternal` into the user's browser rather than an in-app fetch of a binary. What
changes is only that a 150-byte version manifest is read first.

**Rejected alternatives**:

| Option | Why not |
|---|---|
| `electron-updater`, silent install | Squirrel.Mac refuses to install over an app whose signature it cannot verify. An un-notarized build cannot auto-update even in principle, so this would add a runtime dependency to the main process — the widest part of the security boundary — to deliver nothing. |
| Keep the link only | Leaves every installed copy stranded. The link already pointed at a repository that did not exist, which is how the drift was found. |
| Notify via a menu bar badge | A background check needs a timer. Principle V forbids periodic work outright. |

---

## R-402: The endpoint is a release asset, not the GitHub API

**Decision**: Read `https://github.com/Ri4Chaard/mini-menu-bar/releases/latest/download/latest.json`.

**Rationale**:

| Option | Verdict |
|---|---|
| `api.github.com/repos/.../releases/latest` | Rejected. 60 requests per hour per IP unauthenticated, **shared with every other GitHub API consumer on that address** — one developer machine or one office NAT exhausts it. Returns 2–8 KB where 150 bytes will do, and couples the app to GitHub's API versioning. |
| The `releases/latest` HTML redirect | Rejected. Yields a tag and nothing else, and depends on the redirect shape staying put. |
| A release asset we publish | **Chosen.** Served by the release CDN rather than the API, so no rate limit that matters. Roughly 150 bytes. The schema is ours, so a field can be added without a new endpoint or a new declared host. |

A missing asset is reported as a clean failure rather than falling back to the API: one declared
host, and no silent second request.

`net.fetch` is used rather than Node's global `fetch`. Both exist in Electron 43, but `net.fetch`
goes through Chromium's network stack and therefore honours the macOS system proxy configuration and
the system trust store, which undici does not. For a utility that may run behind a corporate proxy
that is the difference between working and not, and it costs no dependency either way.

---

## R-403: Ad-hoc signing is mandatory, and is not the same as no signing

**Decision**: `mac.identity: '-'` in `electron-builder.yml`, with
`com.apple.security.cs.disable-library-validation` added to the entitlements.

**Rationale**: This was established empirically, not from documentation. electron-builder 26.15.3
behaves as follows (`app-builder-lib/out/mac/MacTargetHelper.js`):

| `mac.identity` | Result |
|---|---|
| `null` | "skipped macOS code signing". No signature. |
| unset, no certificate in the keychain | Signing identity not found. No signature. |
| `'-'` | Constructs an ad-hoc identity and signs. |

Leaving it unset — the state this project was in — produced a bundle that still carried the Electron
prebuilt binary's own linker signature, with `Identifier=Electron` and `Info.plist=not bound`.
`codesign --verify --deep --strict` rejected it outright:

```
code has no resources but signature indicates they must be present
```

It launched locally only because a locally built app carries no quarantine attribute. A downloaded
copy would have been refused. With `identity: '-'` the same command reports *valid on disk* and
*satisfies its Designated Requirement*, and the identifier is the app's own.

`hardenedRuntime` stays `true` so that the ad-hoc build exercises the same signing path a notarized
build will, rather than leaving that path untested until release day. electron-builder warns that
this combination requires `disable-library-validation`: an ad-hoc signature has no team identifier,
and library validation refuses to load a framework whose team identifier does not match the app's.
That entitlement is scoped to the ad-hoc era and is to be removed when a Developer ID is configured.

---

## R-404: The `allow-jit` entitlement, reviewed

**Decision**: Keep `com.apple.security.cs.allow-jit`. Correct the comment.

**Rationale**: This resolves the review that
[003's packaging contract](../003-mvp-screenshots-timer/contracts/ipc-channels.md) deferred. The
entitlement is right; the justification recorded beside it was not. It read that `mdfind` runs as a
child process — spawning a child process needs no entitlement at all. The actual reason is that V8
allocates writable-executable memory for its JIT, which the hardened runtime forbids by default.

`allow-unsigned-executable-memory` and `allow-dyld-environment-variables` are deliberately **not**
added. Electron 22 and later use `MAP_JIT`, which `allow-jit` covers. They should be added only if a
signed hardened build actually fails, not speculatively.

---

## R-405: What is not persisted

**Decision**: One new preference, `updateCheckOnLaunch`, defaulting to off. Neither
`lastUpdateCheckAt` nor `skippedVersion` is stored.

**Rationale**:

- `skippedVersion` only earns its keep if the app nags. It does not — there is no banner, no badge
  and no repeat prompt. It would add a preference, a payload field and a "you skipped 0.3.0, here is
  0.4.0" edge case in order to suppress a notice that appears only when the user presses a button.
- `lastUpdateCheckAt` exists to throttle. The only automatic check is at launch, so an in-memory flag
  is sufficient. Persisting it would imply a periodic re-check, which needs a timer, which
  **Principle V forbids outright**. It would also write to `preferences.json` from the main process
  on every check, and that write fans out to `preferences.onChange → tray.refresh()`, repainting the
  menu bar for nothing.

The launch check therefore runs at most once per launch, fire-and-forget, after the tray is up. Its
rejection is swallowed deliberately: a launch check has no interface to report into, and Settings
reports properly when the user asks.
