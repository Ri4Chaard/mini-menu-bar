# Contract: host bridge additions for feature 004

Three methods, added under a new Updates group in `src/renderer/host/host-contract.ts`. Both
implementations — `host-bridge.ts` and `host-mock.ts` — satisfy them, and
`tests/contract/host-bridge.spec.ts` runs one suite against both.

```ts
getAppVersion(): Promise<string>
checkForUpdates(): Promise<UpdateCheckResult>
openReleasesPage(): Promise<void>
```

## `UpdateCheckResult`

Plain JSON, epoch-millisecond timestamps, no URL. Structured-cloneable, per Principle II.

```ts
interface UpdateCheckResult {
  status: 'up-to-date' | 'update-available'
  currentVersion: string
  latestVersion: string
  publishedAt: number | null
  checkedAt: number
}
```

## Mock obligations

A mock that only succeeds proves nothing, so the mock exposes all three outcomes through
`MockControls`:

| Control | Effect |
|---|---|
| `setUpdateOutcome({ kind: 'up-to-date' })` | Default. Resolves with `latestVersion === currentVersion`. |
| `setUpdateOutcome({ kind: 'available', latestVersion })` | Resolves with `status: 'update-available'`. |
| `setUpdateOutcome({ kind: 'offline' })` | **Rejects** with `NETWORK_UNAVAILABLE`. |
| `didOpenReleases()` | Whether `openReleasesPage()` was called. |

The mock computes `status` through the same `isNewer` the main process uses, so browser mode and the
host cannot silently disagree about what "newer" means. `getAppVersion()` returns `'0.0.0-mock'`,
which is also what makes the browser-mode check visibly distinct from a packaged build.
