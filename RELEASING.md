# Releasing

The app is distributed as an unsigned-by-Apple DMG from GitHub Releases. This is what that costs,
how to cut a release, and what changes the day a Developer ID exists.

## Prerequisites

- Push access to `Ri4Chaard/mini-menu-bar`, and the repository must be **public** — the update check
  reads a release asset unauthenticated, and a private repository would require shipping a
  credential.
- Nothing else. There is no certificate, no notarization secret, and no `CSC_*` environment
  variable. CI uses the automatic `GITHUB_TOKEN`.

## Cutting a release

```bash
npm run clean
npm run typecheck && npm run lint && npm test && npm run build
npm run test:e2e          # not in CI; see the note below

npm version minor -m "chore(release): v%s"
git push --follow-tags
```

`npm version` updates `package.json` **and** `package-lock.json`, commits, and creates the tag in one
step. That matters: `package.json` is the only source of the version, and
`scripts/check-release-version.mjs` fails the release if the tag disagrees with it.

The tag push triggers `.github/workflows/release.yml`, which runs the gates, builds `dmg` and `zip`
for `arm64` and `x64`, and creates a **draft** release with `latest.json` attached.

The workflow creates the draft **before** running electron-builder, and that ordering matters.
electron-builder spawns one publisher per architecture, each of which asks independently whether the
release exists; run concurrently they both answer no and both create one, and the tag ends up with
two drafts holding a split of the artifacts. The first v0.2.0 attempt did exactly that — one draft
had the DMGs, the other had `latest.json`, and neither was both installable and updatable. A final
step now fails the job if any expected asset is missing or if more than one release exists for the
tag.

## Publishing the draft

Review the draft, then publish it. This step is load-bearing rather than ceremonial: the app reads

```
https://github.com/Ri4Chaard/mini-menu-bar/releases/latest/download/latest.json
```

and `releases/latest/` resolves only to a **published** release. While the release is a draft, every
installed copy keeps seeing the previous version — which is the desired behaviour, and the reason
drafts are the default.

Paste the Gatekeeper instructions below into the release notes.

## Verifying the artifacts

```bash
codesign -dv --verbose=4 "release/mac-arm64/Mini Menu Bar.app"
#   expect: Identifier=com.ri4chard.minimenubar
#           flags=0x10002(adhoc,runtime)      <- runtime confirms hardenedRuntime
#           Signature=adhoc, TeamIdentifier=not set

codesign --verify --deep --strict --verbose=2 "release/mac-arm64/Mini Menu Bar.app"
#   expect: valid on disk / satisfies its Designated Requirement

spctl -a -vvv -t exec "release/mac-arm64/Mini Menu Bar.app"
#   expect: REJECTED. Correct for an un-notarized app - it is what the Gatekeeper
#           steps below exist to get past.
```

Then the test that a local launch does **not** give you. A locally built app carries no quarantine
attribute, so it opens happily and tells you nothing about what a downloader sees:

```bash
xattr -w com.apple.quarantine "0081;00000000;Safari;" "release/Mini Menu Bar-0.2.0-arm64.dmg"
open "release/Mini Menu Bar-0.2.0-arm64.dmg"
# drag to /Applications, then try to launch
```

## Installing (paste into release notes)

Mini Menu Bar is signed but not notarized by Apple, so macOS blocks it on first launch.

1. Drag the app to **Applications** and double-click it. macOS refuses.
2. Open **System Settings → Privacy & Security** and scroll down. An **"Open Anyway"** button appears,
   naming the app.
3. Click it and authenticate.

> **Control-click → Open no longer works.** Apple removed that bypass for un-notarized apps in macOS
> Sequoia, so the widely repeated "right-click and choose Open" advice is now a dead end.

Terminal equivalent: `xattr -dr com.apple.quarantine "/Applications/Mini Menu Bar.app"`

**One consequence worth knowing.** An ad-hoc signature's code hash changes on every build, so macOS
treats each release as a different application. The Desktop-folder access and notification
permissions are therefore requested again after every update. That is a cost of shipping without a
Developer ID, not a bug.

## Adding a Developer ID later

Three changes, all configuration:

1. `electron-builder.yml` — replace `identity: '-'` with the certificate's name, e.g.
   `identity: 'Developer ID Application: Your Name (TEAMID)'`.
2. `build/entitlements.mac.plist` — **remove** `com.apple.security.cs.disable-library-validation`.
   It exists only because an ad-hoc signature has no team identifier; with a real one, library
   validation should be left on.
3. `.github/workflows/release.yml` — add the signing and notarization secrets
   (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).

`hardenedRuntime` is already `true`, deliberately: the ad-hoc build exercises the same signing path a
notarized build will, so that path is not first tested on release day.

Then update the Installing section above, because none of it will apply any more.

## Rolling back

Delete or un-publish the release. `releases/latest` falls back to the previous published release, and
so does `latest.json` — installed copies stop being offered the bad version without any change on
their side. Then fix forward with a new patch version; do not re-tag a version that has been
published.

## Why the e2e suite is not in CI

`npm run test:e2e` launches a real Electron app that owns a `Tray`. Automating that on a hosted macOS
runner is the flakiest step in any Electron pipeline, and it must not be what stands between a fix
and a release. It runs locally and is part of the pre-release checklist above. Promote it to its own
non-blocking CI job once it has proven stable.
