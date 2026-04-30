// Mission 6 — MEMORY SEAL
//
// First *deep* anti-cheat lesson. The target is running an integrity
// watchdog: every 1.5s a tick cell increments, and on each tick the
// game scans your stat cells for tampering. If anything's frozen when
// the watchdog ticks, your VIOLATION bar climbs. Cap it at 100% and
// the game force-closes — the freeze you just laid down doesn't help
// you because the process is gone.
//
// The lesson: you cannot solve this with the bare M1 freeze. The
// watchdog itself is a memory cell — find it, freeze it BEFORE you
// freeze your X. With the tick frozen the integrity check never
// re-runs, and you can hack at will.
//
// Real-world parallel: VAC, EAC, and BattlEye all run periodic CRC
// checks of game code/data. The defender's move is to find the
// integrity routine and patch it (NOP, hook, or — like here — pin
// its tick).

import { memory } from "../sim-memory.js";

export const mission06 = {
  id: "m06",
  title: "MEMORY SEAL",
  brief: "Target runs a CRC watchdog. Pin it before you touch anything else.",
  alert: {
    icon: "⚠",
    title: "ANTI-TAMPER PATCH SHIPPED",
    body: `Patch notes — 1.0.4:
> Added an integrity watchdog that scans player stat
> cells every 1.5 seconds. Frozen cells now trigger
> violations. Three accumulated = forced disconnect.

Translation: the easy M01-M05 freeze workflow stops working.
You can't outrun the scan. You have to find the watchdog
itself in memory and freeze IT first — pin the tick cell so
the scan never advances.

This is the first real anti-cheat fight in the curriculum.
VAC, EAC, BattlEye all ship some version of this scan.`,
  },
  prerequisites: ["m05"],
  timeLimit: 130,
  watchdog: true,

  hints: [
    {
      id: "find-watchdog",
      min: 14,
      when: ({ scannerState }) => scannerState.lastResults === null,
      say: "Don't touch your stats yet. The VIOLATE bar fills if you do. Find the watchdog itself first — it's a counter cell that keeps incrementing. First Scan 0, wait, scan with 'increased', narrow until 1 result.",
    },
    {
      id: "freeze-watchdog",
      when: ({ scannerState, watchSize }) =>
        scannerState.lastResults && scannerState.lastResults.length === 1 && watchSize === 0,
      say: "That's the watchdog tick. '+ watch' it, then freeze. The counter stops, integrity scans stop with it.",
    },
    {
      id: "now-freeze-x",
      when: ({ target, anyFrozen }) =>
        anyFrozen && memory.isFrozen(memory.addressOfLabel("watchdog.tick")) &&
        !memory.isFrozen(memory.addressOfLabel("player.x")),
      say: "Watchdog's pinned. Now you're safe. Run the M1 X-freeze — note your X, scan, walk, narrow, watch, freeze.",
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableWatchdog();

    dialog.script("VEX", [
      "Heads up — this target's running a memory integrity watchdog. Nasty piece of work. Real anti-cheats run it like clockwork.",
      "Every tick, it scans your cells for tampering. If anything's frozen when it ticks, your VIOLATE bar climbs. 100% and you're out.",
      "The watchdog itself is a tick counter — incrementing in memory once a second and a half. Find that cell. Freeze it. The scan dies with it.",
      "Then you can do the M1 freeze on X without consequences. Order matters: watchdog first, target second.",
    ]);

    const xAddr = memory.addressOfLabel("player.x");
    const wdAddr = memory.addressOfLabel("watchdog.tick");
    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (memory.isFrozen(wdAddr) && memory.isFrozen(xAddr)) {
        done = true;
        complete("Watchdog blinded, target locked. That's how you beat real anti-cheat.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
