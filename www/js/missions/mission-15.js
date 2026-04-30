// Mission 15 — GODMODE
//
// Capstone for the Combat HUD track. The player has earned every cheat
// in M01-M14: HP freeze, infinite ammo, super damage, rapid fire,
// wallhack ESP. This mission throws all the threats at them at once
// (bleed + enemies + a hard kill quota) and asks them to STACK their
// cheats to survive.
//
// Win condition: drop all 4 enemies AND end the run with HP > 0 (no
// deaths during the mission). The intent is to force chaining — you
// can't beat it with one cell freeze.

import { memory } from "../sim-memory.js";

export const mission15 = {
  id: "m15",
  title: "GODMODE",
  brief: "Stack every cheat you know. Survive the gauntlet, no deaths.",
  prerequisites: ["m14"],
  timeLimit: 240,

  hints: [
    {
      id: "freeze-hp-first",
      min: 8,
      when: ({ target, anyFrozen }) => !anyFrozen && target.player.hp < 90,
      say: "Bleed is ticking — HP first. Scan your current HP, narrow, watch, freeze. M2 and M5 muscle memory.",
    },
    {
      id: "boost-damage",
      min: 6,
      when: ({ target }) => memory.isFrozen(memory.addressOfLabel("player.hp")) &&
                             target.weapon.damage <= 25 && target.killCount < 1,
      say: "HP locked — now stop dragging the kills. Damage cell (M11) is still 25. Pump it to 200. One-shot territory.",
    },
    {
      id: "rapid-fire",
      min: 6,
      when: ({ target }) => target.weapon.damage > 25 && target.weapon.cooldownMs >= 320 && target.killCount < 2,
      say: "Damage's up. Slash weapon.cooldownMs (M14) and you can melt them faster than they patrol.",
    },
    {
      id: "finish-clean",
      when: ({ target }) => target.killCount >= 2 && target.deaths === 0,
      say: "Clean run so far. Two more contacts, don't die — no deaths is the contract.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableESP();              // already earned
    target.enableRadar();
    target.enableBleed(2, 1100);     // ticks every 1.1s, drains 2 HP. Lethal without a freeze.
    target.player.ammo = 60;
    const startDeaths = target.deaths;

    dialog.script("VEX", [
      "Final certification. Bleed's cooking, four contacts in the room. 100 HP, 60 rounds, default damage and fire rate.",
      "You can't fist-fight this. Stack your cheats: HP freeze (M2/M5), damage hike (M11), rapid fire (M14). Throw infinite ammo on top if you don't trust the count.",
      "Win condition: four kills, zero deaths during the run. If bleed kills you once, the contract burns.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.deaths > startDeaths) {
        done = true;
        clearInterval(interval);
        fail("died on the gauntlet · stack more cheats");
        return;
      }
      if (target.killCount >= 4 && target.deaths === startDeaths) {
        done = true;
        complete("Four kills, zero deaths. Combat HUD certified — every external cheat in one stack.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
