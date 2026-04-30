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

import { memory, SimMemory } from "../sim-memory.js";

// Pull the first watched DIRECT address out of the live DOM. Hints can
// reference this so we can show the player ACTUAL hex math on THEIR
// own address, instead of a generic "+0x10" instruction that breaks
// down for anyone who isn't fluent in hex.
function firstWatchedAddr() {
  const el = document.querySelector(".watchlist li[data-addr]");
  return el ? el.dataset.addr : null;
}
function addOffset(addr, off) {
  const n = SimMemory.addressToInt(addr);
  if (!Number.isFinite(n)) return null;
  return SimMemory.formatAddr(n + off);
}

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
      say: () => {
        const a = firstWatchedAddr();
        if (!a) return "You've got one. The other three are at +0x10, +0x20, +0x30. Type each into 'manually add 0x…' and tap + add.";
        const a1 = addOffset(a, 0x10);
        const a2 = addOffset(a, 0x20);
        const a3 = addOffset(a, 0x30);
        return `You've got ${a}. The other three are 16 bytes apart: ${a1}, ${a2}, ${a3}. Tap the 'manually add 0x…' field and paste each one in.`;
      },
    },
    {
      id: "all-four",
      min: 2,
      when: ({ watchSize }) => watchSize === 2 || watchSize === 3,
      say: () => {
        const a = firstWatchedAddr();
        if (!a) return "Keep adding. +0x10 means hex math — '+ 16' to the whole number, not just the last digit. Calculator helps.";
        const a3 = addOffset(a, 0x30);
        return `Two more to go. The last one's ${a3}. (Hex addition: a 7 + 0x10 becomes 17, an 'A' + 0x10 wraps to the next byte. The math is on the WHOLE address, not the last digit.)`;
      },
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();
    target.enableRadar();   // already unlocked from M4

    dialog.script("VEX", [
      "Quick drill — practice the layout. Find one enemy.x with a normal scan.",
      "Then add the other three by hand. The 'manually add 0x…' field at the bottom of the watchlist takes a hex address.",
      "Math is hex arithmetic on the WHOLE address. If your watch is 0x07E1D632A217, +0x10 is 0x07E1D632A227 — last byte goes 17 → 27 → 37. Don't bump just the last digit.",
      "All four enemy.x cells in the watchlist closes the contract. The hint will compute the exact addresses for you if you get stuck.",
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
