// Mission 7 — AIMBOT
//
// You've earned a weapon. The FIRE button damages whichever enemy is
// in your crosshair — and the game auto-snaps the crosshair to the
// closest alive enemy. The lesson: that "closest enemy id" is just
// another memory cell. Find it, freeze it on a specific enemy, and
// every shot you fire hits THAT enemy regardless of distance, walls,
// or aim. That's an aimbot.
//
// The crosshair cell label is "crosshair.target" and its value is the
// enemy id (1..4 for the four patrols, 0 if none in range).

import { memory } from "../sim-memory.js";

export const mission07 = {
  id: "m07",
  title: "AIMBOT",
  brief: "Lock the crosshair on one target. Every shot hits, no matter where.",
  prerequisites: ["m06"],
  timeLimit: 120,

  hints: [
    {
      id: "find-target-cell",
      min: 14,
      when: ({ scannerState }) => scannerState.lastResults === null,
      say: "Look at your HUD: TGT shows the enemy id you're auto-aimed at. It changes as enemies move. First Scan that current id.",
    },
    {
      id: "narrow-target",
      min: 5,
      when: ({ scannerState }) =>
        scannerState.lastResults && scannerState.lastResults.length > 1,
      say: "Walk a few steps. The closest enemy changes; the TGT id changes with it. Next Scan the new id, repeat until 1 result.",
    },
    {
      id: "freeze-target",
      when: ({ scannerState, watchSize }) =>
        scannerState.lastResults && scannerState.lastResults.length === 1 && watchSize === 0,
      say: "'+ watch' the survivor. Set its value to the id of whichever enemy you want dead, then freeze. The crosshair locks on them.",
    },
    {
      id: "fire",
      when: ({ target }) =>
        memory.isFrozen(memory.addressOfLabel("crosshair.target")) &&
        target.aimbotKills === 0,
      say: "Now spam FIRE. Every shot hits your locked target. 4 shots will drop them.",
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();

    dialog.script("VEX", [
      "New toy. The FIRE button bottom-right damages whoever your crosshair's pointed at.",
      "The catch: the game decides who 'whoever' is — auto-aim picks the closest enemy. Watch the TGT line in the HUD — it'll flip between names as you move.",
      "But TGT is just a number in memory. Find it, freeze it on the id you actually want dead, fire away. That's an aimbot.",
      "Drop one contact this way and you're done. M01-M07 — full external memory hack curriculum.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      const locked = memory.isFrozen(memory.addressOfLabel("crosshair.target"));
      if (locked && target.aimbotKills >= 1) {
        done = true;
        complete("Confirmed kill on a locked target. You just shipped your first aimbot.");
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  },
};
