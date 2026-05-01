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

  hints: [
    {
      id: "scan-100",
      min: 10,
      when: ({ scannerState }) => scannerState.lastResults === null,
      say: "Every enemy spawns at HP=100 — and a coordinated assault is dropping their HP every tick. Type 100 in the Scanner, tap First Scan. (You won't SEE HP yet — that's what ESP unlocks.)",
    },
    {
      id: "too-fast",
      min: 1,
      when: ({ scannerState }) =>
        scannerState.lastResults && scannerState.lastResults.length === 0,
      say: "0 matches? You clicked Next Scan before the drain ticked. Wait ~1 second between scans so a fresh 'decrease' has time to land. Tap First Scan again with 100 to reset, then wait before narrowing.",
    },
    {
      id: "decreased-after-drain",
      min: 5,
      when: ({ scannerState }) =>
        scannerState.lastResults && scannerState.lastResults.length > 2,
      say: "Wait ~1 second for the drain to land, then switch the filter radio to 'decreased' and tap Next Scan. Repeat 2-3 times — only the actual HP cells will keep dropping every round.",
    },
    {
      id: "watch-hp",
      when: ({ scannerState, watchSize }) =>
        scannerState.lastResults && scannerState.lastResults.length <= 4 && watchSize === 0,
      say: "Tap '+ watch' on a few survivors. The moment one is a real enemy.hp, ESP lights up — names and HP bars on every contact.",
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();
    target.enableRadar();   // M4's reward stays on so you can pick targets

    dialog.script("VEX", [
      "Hostile structs are laid out as an array. You found enemy.x last time — enemy.hp is just twelve bytes further along the same struct.",
      "Heads up: every contact is taking fire and bleeds 4 HP every ~0.5s. You won't SEE it on screen — ESP isn't up yet — but the cells are dropping. That's the lever.",
      "First Scan 100. Wait ONE second. Switch the filter to 'decreased' and Next Scan. Two-three rounds of that gets you to the HP cells.",
      "Watch one — the moment it's a real enemy.hp, ESP pops on every patrol: names, HP bars, the lot.",
    ]);

    let done = false;
    const enemyHpAddrs = target.enemyManager.enemies.map((_, i) =>
      memory.addressOfLabel(`enemy[${i}].hp`)
    );
    const enemyHpLabels = target.enemyManager.enemies.map((_, i) => `enemy[${i}].hp`);

    // Visibly drain enemy HP so 'decreased' narrowing has clear deltas
    // every couple of ticks. 4 HP per ~0.5s gives the player faster
    // feedback after First Scan — a 1-second pause is enough for two
    // decrement rounds to land.
    let lastDrain = performance.now();
    const drainTick = setInterval(() => {
      if (target.paused) return;
      const now = performance.now();
      if (now - lastDrain < 500) return;
      lastDrain = now;
      target.enemyManager.enemies.forEach((e, i) => {
        if (!memory.isFrozen(enemyHpAddrs[i]) && e.hp > 1) {
          e.hp = Math.max(1, e.hp - 4);
        }
      });
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
