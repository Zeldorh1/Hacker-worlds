# Hacker Worlds

Mobile-first educational game that teaches game-hacking concepts through
simulated targets and Cheat-Engine-style tools. Inspired by
[Game Hacking Academy](https://gamehacking.academy/) and the narrative feel of
*Hacknet*.

This is a **personal learning project**, not for app-store distribution.
Everything is simulated — no real process memory is touched.

The same code runs as:
- a **PWA** in any browser (great for fast iteration on a laptop)
- a **native Android app** via Capacitor (`.apk` you sideload onto your phone)

---

## Run as a PWA (fastest)

```sh
npm install        # one-time, installs Capacitor
npm run serve      # serves www/ on http://localhost:8765
```

Open `http://localhost:8765` in any browser. On a phone on the same Wi-Fi,
open `http://<your-laptop-ip>:8765` and tap the browser's **Add to Home
Screen** option — it'll work offline after the first load.

---

## Build the Android APK

You need this on your **own machine** (the sandbox where the project was
scaffolded blocks Google's CDN, so SDK downloads must happen elsewhere).

### One-time setup

1. Install [Android Studio](https://developer.android.com/studio) — easiest
   way to get the JDK + SDK + build-tools wired together. Open it once and
   let it install the default SDK.
2. Set `ANDROID_HOME` (Studio shows it in *Settings → Appearance & Behavior →
   System Settings → Android SDK*). On macOS/Linux:
   ```sh
   export ANDROID_HOME=$HOME/Android/Sdk     # or wherever Studio put it
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   ```
3. Clone this repo and `npm install`.

### Build a debug APK

```sh
npm run android:debug
```

This runs `cap sync android` (copies `www/` into the Android project) and
then `./gradlew assembleDebug`. The APK lands at:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

### Install it on your phone

**USB:**
1. On your phone, enable *Developer Options → USB Debugging*.
2. Plug it in, accept the trust prompt.
3. `adb install android/app/build/outputs/apk/debug/app-debug.apk`

**Sideload without USB:**
1. Email/Drive/AirDrop the `.apk` to yourself.
2. Open it on the phone — you'll get an "install unknown apps" prompt the
   first time. Approve, then tap install.

### Edit-rebuild loop

Whenever you change anything in `www/`, run:

```sh
npm run android:debug
```

That re-syncs and rebuilds. Plug the phone in and `adb install -r` to
overwrite the existing install, or use Android Studio's run button after
`npm run cap:open`.

---

## Layout

```
www/                     ← PWA source (lives in the APK + served in browser)
  index.html
  styles/main.css
  manifest.webmanifest
  sw.js
  js/
    app.js               boot + tab routing
    sim-memory.js        fake address space, scan/filter/freeze
    scanner.js           Cheat-Engine-style UI
    dialog.js            mentor dialog system
    target-assaultzone.js Mission 1 target mini-game
    missions/
      mission-01.js      find & freeze X coord
  icons/                 PWA icons

android/                 ← Capacitor-generated Android project
capacitor.config.json    Capacitor config (webDir → www)
package.json             Capacitor + scripts
```

---

## Current state — vertical slice

- **Mission 1: Find & Freeze X Coordinate** — the GHA "External Memory Hack"
  loop applied to the AssaultZone target.
- **AssaultZone** — top-down 2D mini-target with a player whose
  `x`, `y`, `hp`, `ammo` are bound to simulated memory addresses.
- **Memory Scanner** — first scan, narrow scan (exact / changed / unchanged),
  watchlist with edit + freeze.
- **VEX mentor dialog** at the top of the screen.
- **Service worker** for PWA offline mode.
- **Capacitor Android wrapper** for installable APK.

## Roadmap

| #  | GHA topic            | Mission                                            |
|----|----------------------|----------------------------------------------------|
| 2  | External Memory Hack | Freeze HP to godmode through a simulated trap room |
| 3  | Pointer scanning     | Find HP via a pointer chain after a "respawn"      |
| 4  | 3D Fundamentals      | Read enemy world coords, render on a 2D radar      |
| 5  | Triggerbot           | Auto-fire when crosshair-target ID matches         |
| 6  | Aimbot               | Project enemy world pos to screen, snap aim        |
| 7  | No Recoil            | NOP the recoil-applying instruction                |
| 8  | ESP                  | Render name/HP/weapon overlays                     |
| 9  | Multihack            | Combine the above into a single cheat menu         |
| 10 | Packet Analysis      | Sniff login traffic, identify username field       |
| 11 | Reversing Packets    | Decode chat packet structure                       |
| 12 | External Client      | Bot login + chat without the real client           |
| 13 | Proxying TCP         | MITM your own client, modify combat packets        |
