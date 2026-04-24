# Hacker Worlds

Mobile-first educational game that teaches game-hacking concepts through
simulated targets and Cheat-Engine-style tools. Inspired by
[Game Hacking Academy](https://gamehacking.academy/) and the narrative feel of
*Hacknet*.

This is a **personal learning project**, not for app-store distribution.
Everything is simulated — no real process memory is touched.

## Run it

It's a static PWA. Serve the directory and open in any browser:

```sh
python3 -m http.server 8765
# open http://127.0.0.1:8765
```

On a phone, open the URL in Chrome/Safari and choose **Add to Home Screen** —
once cached it works offline.

## Current state — vertical slice

- **Mission 1: Find & Freeze X Coordinate** — the GHA "External Memory Hack"
  loop applied to the AssaultZone target.
- **AssaultZone** — top-down 2D mini-target with a player whose
  `x`, `y`, `hp`, `ammo` are bound to simulated memory addresses.
- **Memory Scanner** — first scan, narrow scan (exact / changed / unchanged),
  watchlist with edit + freeze.
- **VEX mentor dialog** at the top of the screen.
- **Service worker** for offline caching.

## Roadmap

The full FPS + Multiplayer curriculum is planned. Next missions:

| # | GHA topic           | Mission                                        |
|---|---------------------|------------------------------------------------|
| 2 | External Memory Hack | Freeze HP to godmode through a simulated trap room |
| 3 | Pointer scanning     | Find HP via a pointer chain after a "respawn"  |
| 4 | 3D Fundamentals      | Read enemy world coords, render on a 2D radar  |
| 5 | Triggerbot           | Auto-fire when crosshair-target ID matches     |
| 6 | Aimbot               | Project enemy world pos to screen, snap aim    |
| 7 | No Recoil            | NOP the recoil-applying instruction            |
| 8 | ESP                  | Render name/HP/weapon overlays                 |
| 9 | Multihack            | Combine the above into a single cheat menu     |
|10 | Packet Analysis      | Sniff login traffic, identify username field   |
|11 | Reversing Packets    | Decode chat packet structure                   |
|12 | External Client      | Bot login + chat without the real client       |
|13 | Proxying TCP         | MITM your own client, modify combat packets    |

## Layout

```
index.html               app shell
styles/main.css          dark hacker theme, mobile-first
manifest.webmanifest     PWA manifest
sw.js                    offline cache
js/
  app.js                 boot + tab routing
  sim-memory.js          fake address space, scan/filter/freeze
  scanner.js             Cheat-Engine-style UI
  dialog.js              mentor dialog system
  target-assaultzone.js  Mission 1 target mini-game
  missions/
    mission-01.js        find & freeze X coord
icons/                   PWA icons
```
