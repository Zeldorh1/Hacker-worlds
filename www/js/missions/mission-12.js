// Mission 12 — SPEED HACK
//
// The player's movement cooldown is an int (ms between tiles). Default
// 110ms — about 9 tiles/sec. Find it, freeze it low (40 or less), feel
// the speed difference, traverse 30 tiles to confirm.
//
// Real game equivalent: speed multiplier or move-cooldown in player
// struct. Often a float, often guarded — but the core technique
// (scan-narrow-freeze) is identical.

import { memory } from "../sim-memory.js";

export const mission12 = {
  id: "m12",
  title: "SPEED HACK",
  brief: "Slash the movement cooldown. Cover 30 tiles like nothing.",
  prerequisites: ["m11"],
  timeLimit: 180,

  hints: [
    {
      id: "scan-cooldown",
      min: 14,
      when: ({ scannerState }) => scannerState.lastResults === null,
      say: "The move cooldown is 110ms — a plain int. SCANNER → First Scan 110. There'll be a few hundred matches; ints in that range are noisy.",
    },
    {
      id: "narrow-by-walking",
      min: 5,
      when: ({ scannerState }) =>
        scannerState.lastResults && scannerState.lastResults.length > 5,
      say: "Walk around. The cooldown cell is 'unchanged' — mode unchanged + Next Scan strips out the fluctuating noise. Repeat 2-3 times.",
    },
    {
      id: "watch-and-edit",
      when: ({ scannerState, watchSize }) =>
        scannerState.lastResults && scannerState.lastResults.length <= 6 && watchSize < 4,
      say: "Down to a handful. '+ watch' the survivors. Edit each to 30. Whichever one makes you feel like the Flash is your cell. Unfreeze the wrong ones.",
    },
    {
      id: "speedrun",
      when: ({ target }) => target.moveCooldownMs < 80 && target.tilesMoved < 30,
      say: "Cooldown's down. Now run — 30 tiles to close it out. Hold a direction.",
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    // No enemies here — pure movement drill, the room becomes a track.
    target.enableEnemies();   // give them targets to dodge but no weapon
    target.tilesMoved = 0;

    dialog.script("VEX", [
      "Speed stat. Move cooldown is 110ms per tile. Bring it under 80 and the world feels different.",
      "Scan 110. Narrow by walking + filter 'unchanged'. Watch the survivors, edit each to 30 — only the right one will actually speed you up.",
      "Once it's frozen low, traverse 30 tiles to commit. Speed hacks live in the same place as ammo and damage — just another int.",
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
        complete("Thirty tiles flat-out. Speed stats are just ints in a player struct.");
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  },
};
