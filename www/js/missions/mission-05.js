// Mission 5 — ESP (Extra-Sensory Perception)
//
// You've got radar from M4. Now you want labels — name and HP floating
// over every enemy, even through walls. The lesson: enemy structs are
// laid out consecutively in memory. You found enemy[i].x last time;
// enemy[i].hp is just +0xC bytes away from that. Once any enemy.hp is
// in your watchlist, ESP lights up across the board.

import { memory } from "../sim-memory.js";

export const mission05 = {
  id: "m05",
  title: "ESP",
  brief: "Pull HP and identity off the enemy struct — labels on every patrol.",
  prerequisites: ["m04"],
  timeLimit: 100,

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();
    target.enableRadar();   // M4's reward stays on so you can pick targets

    dialog.script("VEX", [
      "Hostile structs are laid out as an array. You found enemy.x last time — enemy.hp is just twelve bytes further along the same struct.",
      "Two paths in: scan for HP=100 (every enemy spawns at full health), or scan small ints, then drain a target by walking near them and re-narrow with 'decreased' as their HP ticks.",
      "Either way: enemy.hp into the watchlist lights up ESP — name + HP bar over every contact.",
      "Once you can read it, you can write it. Freeze HP to zero on a watched cell? You just dropped that contact.",
    ]);

    let done = false;
    const enemyHpAddrs = target.enemyManager.enemies.map((_, i) =>
      memory.addressOfLabel(`enemy[${i}].hp`)
    );

    // Drain all enemies HP slightly over time so 'decreased' narrowing
    // is a viable path even though enemies aren't actively combat.
    let lastDrain = performance.now();
    const drainTick = setInterval(() => {
      const now = performance.now();
      if (now - lastDrain < 1100) return;
      lastDrain = now;
      // Each enemy loses 1 HP every ~1.1s (cosmetic — narrative is
      // "they're under fire from a coordinated assault"). Frozen cells
      // ignore this naturally because of the bound setter.
      for (const e of target.enemyManager.enemies) {
        if (e.hp > 1 && !memory.isFrozen(memory.addressOfLabel(`enemy[${target.enemyManager.enemies.indexOf(e)}].hp`))) {
          e.hp = Math.max(1, e.hp - 1);
        }
      }
    }, 200);

    const interval = setInterval(() => {
      if (done) return;
      const watchEls = document.querySelectorAll(".watchlist li[data-addr]");
      const watchedAddrs = new Set();
      for (const el of watchEls) watchedAddrs.add(el.dataset.addr);
      const lit = enemyHpAddrs.some(a => watchedAddrs.has(a));
      if (lit) {
        target.enableESP();
        done = true;
        complete("ESP up. Names and HP visible through walls, on every contact.");
        clearInterval(interval);
      }
    }, 250);

    return () => {
      clearInterval(interval);
      clearInterval(drainTick);
    };
  },
};
