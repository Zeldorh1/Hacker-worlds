// Mission 11 — SUPER BULLETS
//
// The weapon's damage is just an int. Default 25 — four shots to drop
// an enemy. Find the cell, jack it to 100+, drop all four contacts in
// four shots. Real game equivalent: weapon damage table, monster damage
// stat, melee multiplier — same pattern, same fix.
//
// To make scanning interesting, the player has to actually FIRE to
// change the displayed-value-context (HP bars on enemies move). The
// damage cell itself doesn't move on its own — so we use the standard
// "Unknown Initial Value" trick or scan for 25.

import { memory } from "../sim-memory.js";

export const mission11 = {
  id: "m11",
  title: "SUPER BULLETS",
  brief: "Push the weapon damage so high four shots clears the room.",
  prerequisites: ["m10"],
  timeLimit: 180,

  hints: [
    {
      id: "find-damage",
      min: 14,
      when: ({ scannerState }) => scannerState.lastResults === null,
      say: "Your DMG line shows 25. That's the int we want. SCANNER tab → First Scan 25. The list will be huge — narrow it.",
    },
    {
      id: "narrow-damage",
      min: 6,
      when: ({ scannerState }) =>
        scannerState.lastResults && scannerState.lastResults.length > 1,
      say: "25's a common number. Hop back to ac_anomaly, fire one shot at an enemy, watch HP drop by 25 in their ESP bar. The damage cell stays at 25 — Next Scan with mode 'unchanged' to drop volatile addresses.",
    },
    {
      id: "edit-damage",
      when: ({ scannerState, watchSize }) =>
        scannerState.lastResults && scannerState.lastResults.length <= 5 && watchSize === 0,
      say: "Few candidates left — '+ watch' the most stable-looking one. Edit its value to 200. Watch the DMG line. If it jumped, that's the cell. Otherwise try the next.",
    },
    {
      id: "kill-four",
      when: ({ target }) => target.weapon.damage > 25 && target.killCount < 4,
      say: "Damage is buffed. Now drop all four enemies. M07-style: aim, fire, repeat. Move so each enemy comes within range.",
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    // Bigger ammo pool — this isn't a resource mission, we want them
    // burning rounds searching for the right cell.
    target.player.ammo = 80;

    dialog.script("VEX", [
      "Damage stat. Default 25, so you need 4 shots per kill.",
      "Find the damage cell — it's an int. Scan 25, narrow with 'unchanged' while the world ticks around it.",
      "Edit the survivor up to 100 or 200. Watch the DMG line in the HUD. When it changes, you've got the right cell.",
      "Drop all four contacts. One-shot if you cranked it high enough. That's a damage hack.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.weapon.damage > 25 && target.killCount >= 4) {
        done = true;
        complete("Four contacts down. Damage tables are just ints; you just learned to write them.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
