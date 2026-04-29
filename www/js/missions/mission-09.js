// Mission 9 — MANUAL ADDRESS DRILL
//
// Pure practice. The user already knows enemies live in a contiguous
// struct array (16-byte stride, x at +4, hp at +12). This mission says:
// find one enemy.x via the regular scan, then add the OTHER three by
// typing the offsets directly into the manual address field.
//
// In real Cheat Engine this maps to either "Browse this memory region"
// or right-click → "Add Address Manually" with the computed sibling
// addresses. The point is to internalise the layout, not to keep
// scanning.

import { memory } from "../sim-memory.js";

export const mission09 = {
  id: "m09",
  title: "MANUAL ADDRESS",
  brief: "Find one enemy via scan, type the offsets to lock all four.",
  prerequisites: ["m08"],
  timeLimit: 200,

  hints: [
    {
      id: "find-one",
      min: 6,
      when: ({ watchSize }) => watchSize === 0,
      say: "Standard play first: scan an enemy.x and watch it. Doesn't matter which enemy — pick whichever's easiest.",
    },
    {
      id: "compute-offsets",
      min: 3,
      when: ({ watchSize }) => watchSize === 1,
      say: "You've got enemy[0].x. The other three are at the same address +0x10, +0x20, +0x30 (16-byte stride). Look at the WATCHLIST 'manually add' field — type each address and tap '+ add'.",
    },
    {
      id: "all-four",
      min: 2,
      when: ({ watchSize }) => watchSize === 2 || watchSize === 3,
      say: "Keep going — we want all four. Same trick: bump the last digit of your watched address by 0x10 each time.",
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();
    target.enableRadar();   // already unlocked from M4

    dialog.script("VEX", [
      "Quick drill — practice the layout. Find enemy[0].x with a normal scan.",
      "Then look at your watchlist's 'manually add 0x…' field. Add the other three by hand: same address, +0x10, +0x20, +0x30.",
      "All four enemy.x cells in your watchlist completes it. This is the muscle memory: when you find ONE struct field, the rest of the struct is just arithmetic.",
    ]);

    let done = false;
    const enemyXAddrs = target.enemyManager.enemies.map((_, i) =>
      memory.addressOfLabel(`enemy[${i}].x`)
    );

    const interval = setInterval(() => {
      if (done) return;
      const watchEls = document.querySelectorAll(".watchlist li[data-addr]");
      const watched = new Set();
      for (const el of watchEls) watched.add(el.dataset.addr);
      const found = enemyXAddrs.filter(a => watched.has(a)).length;
      if (found >= 4) {
        done = true;
        complete("All four enemies pinned. Struct arithmetic is its own superpower.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
