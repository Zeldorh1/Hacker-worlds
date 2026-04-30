// Mission 10 — INFINITE AMMO
//
// First of the World/Item track. The weapon now actually consumes ammo
// (M07 had unlimited because the lesson was crosshair lock — now ammo
// drops from 30 to 0 and the FIRE button stops working). The player
// has 30 rounds; the lesson is to find the ammo cell, freeze it, and
// burn through 8 shots without running dry.
//
// Real game equivalent: every FPS ever. Ammo's a plain int in the
// player struct. Freeze it and you never reload.

import { memory } from "../sim-memory.js";

export const mission10 = {
  id: "m10",
  title: "INFINITE AMMO",
  brief: "Lock the ammo counter, then put 8 shots downrange without reloading.",
  prerequisites: ["m08"],
  timeLimit: 150,

  hints: [
    {
      id: "find-ammo",
      min: 12,
      when: ({ scannerState }) => scannerState.lastResults === null,
      say: "Check your AMMO line in the HUD — that number is just an int in memory. Tap SCANNER, type 30 (or whatever you've got), First Scan.",
    },
    {
      id: "fire-to-narrow",
      min: 5,
      when: ({ scannerState }) =>
        scannerState.lastResults && scannerState.lastResults.length > 1,
      say: "Tab back, hit FIRE once. Ammo drops by 1. Type the new value, Next Scan. A few rounds and you'll narrow to one.",
    },
    {
      id: "watch-ammo",
      when: ({ scannerState, watchSize }) =>
        scannerState.lastResults && scannerState.lastResults.length === 1 && watchSize === 0,
      say: "One match — that's ammo. '+ watch' it.",
    },
    {
      id: "freeze-ammo",
      when: ({ watchSize, anyFrozen }) => watchSize > 0 && !anyFrozen,
      say: "Tick freeze on the ammo entry. Type a healthy number into its value field first if you want — say 99. Then go shoot.",
    },
    {
      id: "fire-eight",
      when: ({ anyFrozen, target }) => anyFrozen && target.shotsFired < 8,
      say: "Frozen. Now spam FIRE — 8 shots and we're done. The counter shouldn't move.",
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();

    dialog.script("VEX", [
      "Resource lock 101. The weapon now eats ammo — 30 rounds, then click click click.",
      "Find the ammo counter in memory the M1/M4 way: scan current value, fire a shot, scan the new value, repeat.",
      "Watch the survivor, freeze it. Optional: edit the value to something silly first. Then put 8 shots downrange without the counter dropping.",
      "Every loot grind, every FPS ammo cap, every 'limited use' item works the same way. Find the int, lock it, done.",
    ]);

    let done = false;
    let shotsAtLock = -1;
    const ammoAddr = memory.addressOfLabel("player.ammo");

    const interval = setInterval(() => {
      if (done) return;
      const locked = memory.isFrozen(ammoAddr);
      if (locked && shotsAtLock < 0) shotsAtLock = target.shotsFired;
      if (!locked && shotsAtLock >= 0) shotsAtLock = -1;   // unfroze, restart count
      if (locked && shotsAtLock >= 0 && target.shotsFired - shotsAtLock >= 8) {
        done = true;
        complete("Eight rounds, zero reloads. Welcome to infinite ammo.");
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  },
};
