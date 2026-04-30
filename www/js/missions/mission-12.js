// Mission 12 — SPEED HACK
//
// The player's movement cooldown is an int (ms between tiles). The
// game does NOT display this number anywhere — that's the lesson.
// In real Cheat Engine, hidden stats like move speed, accel, rotation
// rate are found via 'Unknown Initial Value' first scan + filter
// cycles, not by typing a magic number you somehow already know.
//
// Real game equivalent: speed multiplier or move-cooldown in player
// struct. Often a float, often guarded — but the core technique
// (scan unknown, narrow with unchanged, trial-and-error) is identical.

import { memory } from "../sim-memory.js";

export const mission12 = {
  id: "m12",
  title: "SPEED HACK",
  brief: "Find a stat the HUD won't show you. Crank movement, cover 30 tiles.",
  prerequisites: ["m11"],
  timeLimit: 200,

  hints: [
    {
      id: "unknown-first",
      min: 14,
      when: ({ scannerState }) => scannerState.lastResults === null,
      say: "Move speed isn't on the HUD — you don't know the number. Scanner → set Scan to 'Unknown Initial Value' → First Scan. That snapshots every cell. We'll narrow with filters from here.",
    },
    {
      id: "filter-unchanged",
      min: 6,
      when: ({ scannerState }) =>
        scannerState.lastResults && scannerState.lastResults.length > 50,
      say: "Walk around for a few seconds. Lots of cells are noise that drift. Set filter to 'unchanged' → Next Scan. The speed cell stays put while noise gets dropped. Repeat 3-4 times.",
    },
    {
      id: "trial-and-error",
      min: 4,
      when: ({ scannerState, watchSize }) =>
        scannerState.lastResults && scannerState.lastResults.length <= 8 && watchSize < 4,
      say: "Down to a handful. '+ watch' the candidates. Edit each value to 30 — only the speed cell will actually make you faster. Wrong cells do nothing. Freeze the right one.",
    },
    {
      id: "speedrun",
      when: ({ target }) => target.moveCooldownMs < 80 && target.tilesMoved < 30,
      say: "Cooldown's down. Now run — 30 tiles to close it out. Hold a direction.",
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();   // give them targets to dodge
    target.tilesMoved = 0;

    dialog.script("VEX", [
      "Different beast this one. Movement speed isn't displayed — no HUD readout, no obvious starting number.",
      "Workflow: Scanner → Scan dropdown → 'Unknown Initial Value' → First Scan. That captures every cell as-is.",
      "Walk around. Filter 'unchanged' + Next Scan, a few times over. Stable cells survive (the speed stat is one); noise gets shaken out.",
      "Trial-and-error the survivors: edit each to a low number, see which one makes you visibly faster. Freeze it. Then traverse 30 tiles.",
      "This is the workflow for every hidden stat in real games — speed, recoil, jump height, rotation rate.",
    ]);

    let done = false;
    let tilesAtLowCooldown = -1;

    const interval = setInterval(() => {
      if (done) return;
      // Track tiles only while the cooldown is actually low. If they
      // unfreeze and it pops back, we restart the count — real cheats
      // need the freeze to stay applied.
      if (target.moveCooldownMs < 80) {
        if (tilesAtLowCooldown < 0) tilesAtLowCooldown = target.tilesMoved;
      } else {
        tilesAtLowCooldown = -1;
      }
      if (tilesAtLowCooldown >= 0 && target.tilesMoved - tilesAtLowCooldown >= 30) {
        done = true;
        complete("Thirty tiles flat-out. Hidden stats fall to Unknown Initial Value + a few filter passes.");
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  },
};
