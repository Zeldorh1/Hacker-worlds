// Mission 8 — POINTER SCAN
//
// The lesson the player asked for: "the surface address vs the real one
// that survives a restart." A direct freeze on enemy.hp dies the moment
// the entity array gets reallocated. The fix is a chain that resolves
// through a static pointer cell — find it once, and your freeze lands
// on the right address every time.
//
// Mission flow:
//   1. Player finds enemy[0].x the M4-style way and watches it.
//   2. Player taps RESTART — the entity array moves; the watched cell
//      goes to noise.
//   3. Player taps "Find Pointers" on a known enemy address. The
//      simulator surfaces a chain like [entity_arr_ptr] + 0x04.
//   4. Player adds the chain to watchlist, freezes it.
//   5. Player taps RESTART again. The chain re-resolves to the new
//      enemy[0].x, and the freeze still applies. Mission complete.

import { memory } from "../sim-memory.js";

export const mission08 = {
  id: "m08",
  title: "POINTER SCAN",
  brief: "Find a chain that survives a session restart, then freeze through it.",
  prerequisites: ["m07"],
  timeLimit: 240,
  rebase: true,    // shows the RESTART button + lets player call triggerRebase

  hints: [
    {
      id: "find-enemy-first",
      min: 8,
      when: ({ scannerState, watchSize }) =>
        watchSize === 0 && scannerState.lastResults === null,
      say: "Start the M4 way: scan an enemy.x. Watch one. We need a known target before we can find a pointer to it.",
    },
    {
      id: "trigger-restart",
      min: 4,
      when: ({ target, watchSize }) => watchSize > 0 && target.rebaseCount === 0,
      say: "Got an address watched? Tap RESTART (top-right of ac_anomaly). Watch what happens to the value — that address is now garbage. Welcome to real game hacking.",
    },
    {
      id: "find-pointers",
      min: 2,
      when: ({ target, scannerState }) =>
        target.rebaseCount >= 1 && (!scannerState.lastPointerResults || scannerState.lastPointerResults.length === 0),
      say: "Tab to Scanner. Scroll down to POINTER SCAN. Tap 'Find Pointers' (target defaults to your first watch). Look for a hit — that's the static cell that holds the entity array base.",
    },
    {
      id: "watch-chain",
      min: 2,
      when: ({ target, hasChain }) => target.rebaseCount >= 1 && !hasChain,
      say: "Tap '+ chain' on the pointer scan result. A new chain entry shows up in the watchlist (purple stripe). Tick freeze on it.",
    },
    {
      id: "restart-again",
      min: 2,
      when: ({ target, hasChain, anyChainFrozen }) =>
        hasChain && anyChainFrozen && target.rebaseCount === 1,
      say: "Now hit RESTART one more time. If the chain is doing its job, the value stays locked through the relocation. That's mission.",
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();

    dialog.script("VEX", [
      "Big concept this one. Everything you've watched so far has been a 'surface' address — correct for this run, garbage after restart.",
      "Find an enemy.x first, like M4. Watch it. Tap RESTART (top-right) — the array gets reallocated. Watch the value go to trash.",
      "Now: tab to Scanner, scroll to POINTER SCAN. Tap 'Find Pointers' — target defaults to your first watch. The simulator finds a static cell that always points at the entity array.",
      "Add that chain to your watchlist. Freeze it. Hit RESTART again. The chain re-resolves to the new array. Your freeze sticks.",
      "When that lands you've shipped a real cheat. Codex has the full theory if you want it later.",
    ]);

    let done = false;
    let frozenAtRebaseCount = -1;

    const interval = setInterval(() => {
      if (done) return;
      // Look for a frozen chain entry on the scanner's watchlist.
      const scanner = window.__hw?.scanner;
      if (!scanner) return;
      let anyChainFrozen = false;
      for (const [, e] of scanner.watch) {
        if (e.type === "chain" && e.frozen) { anyChainFrozen = true; break; }
      }
      if (anyChainFrozen && frozenAtRebaseCount < 0) {
        frozenAtRebaseCount = target.rebaseCount;
      }
      // Win when a chain is frozen AND the player has triggered a rebase
      // since freezing — proving the chain re-resolved.
      if (anyChainFrozen && frozenAtRebaseCount >= 0 && target.rebaseCount > frozenAtRebaseCount) {
        done = true;
        complete("Chain held through a relocation. That's a real-world game cheat.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
