// Mission 14 — RAPID FIRE
//
// The weapon's fire-rate cooldown is a plain int (ms between shots),
// but again — the game doesn't display it. Real fire-rate stats live
// inside weapon descriptor structs that the HUD never surfaces.
// Player has to find it via Unknown Initial Value + filter cycles,
// then test candidates by editing.
//
// Same pattern as M12 SPEED HACK but applied to the weapon. Real game
// equivalent: rate-of-fire stat in a weapon descriptor. Often a float
// in commercial games; the technique is the same.

import { memory } from "../sim-memory.js";

export const mission14 = {
  id: "m14",
  title: "RAPID FIRE",
  brief: "Find the gun's hidden fire-rate stat. Spray-clear the room.",
  prerequisites: ["m13"],
  timeLimit: 200,

  hints: [
    {
      id: "unknown-first",
      min: 14,
      when: ({ scannerState }) => scannerState.lastResults === null,
      say: "FIRE has a cooldown — you can feel the gap between shots, but the value isn't displayed. Scanner → 'Unknown Initial Value' → First Scan.",
    },
    {
      id: "narrow-stable",
      min: 6,
      when: ({ scannerState }) =>
        scannerState.lastResults && scannerState.lastResults.length > 50,
      say: "The cooldown stays the same until you write to it. Fire a couple of shots, walk a tile, then Next Scan with filter 'unchanged'. Drift gets stripped; the cooldown survives. Repeat.",
    },
    {
      id: "edit-and-test",
      when: ({ scannerState, watchSize }) =>
        scannerState.lastResults && scannerState.lastResults.length <= 8 && watchSize < 3,
      say: "Few candidates left. '+ watch' them, edit each value to 50. Fire — the right one makes FIRE hammer like an SMG. Wrong cells do nothing. Freeze the survivor.",
    },
    {
      id: "spray",
      when: ({ target }) => target.weapon.cooldownMs < 80 && target.killCount < 4,
      say: "Cooldown shredded. Now spray-clear all four. Hold an enemy in the crosshair and tap FIRE.",
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    // Generous ammo so the lesson isn't 'you ran out'.
    target.player.ammo = 200;

    dialog.script("VEX", [
      "Different rhythm this one. FIRE has a cooldown but no stat display — same situation as M12.",
      "Workflow's identical. Scanner → 'Unknown Initial Value' → First Scan. Walk, fire, Next Scan 'unchanged'. Repeat 3-4x.",
      "Trial-and-error the small list: edit each candidate to 50, fire, see which one turns the gun into an SMG. Freeze it.",
      "Drop all four contacts to close. The find-int-freeze trick is universal — only the search workflow shifts based on whether you can read the starting value.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.weapon.cooldownMs < 80 && target.killCount >= 4) {
        done = true;
        complete("Spray-cleared. Hidden stats fall to Unknown Initial Value — works on any cell whose number you can't read off the HUD.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
