// Mission 14 — RAPID FIRE
//
// The weapon's fire-rate cooldown is a plain int (ms between shots).
// Default 320ms — about 3 shots/sec. Find it, freeze it under 80ms,
// the FIRE button effectively becomes a hold-to-spray.
//
// Same pattern as M12 SPEED HACK but applied to the weapon. Real game
// equivalent: rate-of-fire stat in a weapon descriptor. Often a float
// in commercial games; the technique is the same.
//
// Win condition is a 4-enemy kill in under 12 seconds — only doable
// with the cooldown actually slashed.

import { memory } from "../sim-memory.js";

export const mission14 = {
  id: "m14",
  title: "RAPID FIRE",
  brief: "Slash the fire-rate cooldown. Clear the room in 12 seconds.",
  prerequisites: ["m13"],
  timeLimit: 180,

  hints: [
    {
      id: "scan-cooldown",
      min: 14,
      when: ({ scannerState }) => scannerState.lastResults === null,
      say: "FIRE feels slow — that's a 320ms cooldown. Plain int. SCANNER → First Scan 320.",
    },
    {
      id: "narrow-cooldown",
      min: 6,
      when: ({ scannerState }) =>
        scannerState.lastResults && scannerState.lastResults.length > 5,
      say: "320 is a common-ish int. Fire a shot, walk a tile, then Next Scan filter 'unchanged'. The fire-rate doesn't drift; noise does.",
    },
    {
      id: "edit-and-freeze",
      when: ({ scannerState, watchSize }) =>
        scannerState.lastResults && scannerState.lastResults.length <= 5 && watchSize < 3,
      say: "Few candidates. '+ watch' them, edit each to 50. Fire to test — the right one makes FIRE hammer like an SMG. Freeze it.",
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
      "Different rhythm this time. The fire button's gated by a 320ms cooldown — three shots a second. Real fights need more.",
      "Find weapon.cooldownMs the M12 way: scan 320, narrow with 'unchanged' while you move and fire.",
      "Edit the survivor to 50 and freeze it. The gun starts spitting like an SMG. Drop all four contacts to close.",
      "Plain pattern, plain win. M10/M11/M12/M14 are all the same find-int-freeze trick on different cells.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.weapon.cooldownMs < 80 && target.killCount >= 4) {
        done = true;
        complete("Spray-cleared. Rate-of-fire stats live in weapon descriptors — same hack across every shooter.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
