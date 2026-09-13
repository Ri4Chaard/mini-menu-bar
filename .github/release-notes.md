## Installing

Download the `.dmg` for your Mac — **arm64** for Apple Silicon, **x64** for Intel — open it, and drag
Mini Menu Bar to Applications.

The app is code-signed but **not notarized by Apple**, so macOS blocks it the first time:

1. Double-click the app. macOS refuses to open it.
2. Open **System Settings → Privacy & Security** and scroll down. An **"Open Anyway"** button appears
   there, naming the app.
3. Click it and authenticate.

> Control-click → Open no longer works. Apple removed that bypass for un-notarized apps in macOS
> Sequoia, so the widely repeated "right-click and choose Open" advice is a dead end on current macOS.

Prefer the terminal? `xattr -dr com.apple.quarantine "/Applications/Mini Menu Bar.app"`

**After updating, macOS asks for Desktop access and notification permission again.** An ad-hoc
signature's code hash changes with every build, so the system treats each release as a different
application. That is the cost of shipping without a paid Apple Developer ID, not a bug.

## What it is

A macOS menu bar app with two things in it — recent **Screenshots** and a countdown **Timer** — each
with an optional preview composited into the menu bar icon itself. No account, no telemetry, and one
outbound request: the version check in Settings, which you have to press.
