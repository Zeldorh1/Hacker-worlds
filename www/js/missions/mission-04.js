// Mission 4 — RADAR ECHO
//
// First mission against enemies. Patrolling NPCs are now in the room;
// each has its own X / Y / HP / id cells in memory laid out as a struct
// array. The lesson: pick any one enemy, find their X, watch it, and
// the moment your watchlist contains an enemy.x address, the radar
// HUD lights up — your tool now plots all enemies' positions live.
//
// Pedagogically this is the same scan-narrow-watch loop as M1, but
// the target value moves on its own (enemy patrols), so "decreased"
// and "increased" filters become the dominant strategy.

import { memory } from "../sim-memory.js";

export const mission04 = {
  id: "m04",
  title: "RADAR ECHO",
  brief: "Find an enemy on patrol — radar lights up the moment you do.",
  prerequisites: ["m03"],
  timeLimit: 110,

  hints: [
    {
      id: "pause-tip",
      min: 6,
      when: ({ target, scannerState }) => !target.paused && scannerState.lastResults === null,
      say: "Hard to read enemy coords on a phone? Tap the ⏸ pause button (top-right of ac_anomaly) — enemies freeze, trace stops, you can scan in peace.",
    },
    {
      id: "pick-enemy-or-unknown",
      min: 4,
      when: ({ scannerState }) => scannerState.lastResults === null,
      say: "Two paths: (1) Read an enemy's X off the radar dot and First Scan it. (2) Cleaner: switch the Scan dropdown to 'Unknown Initial Value' and First Scan — that snapshots all 12k cells, no value needed.",
    },
    {
      id: "use-changed-or-direction",
      min: 4,
      when: ({ scannerState }) =>
        scannerState.lastResults && scannerState.lastResults.length > 1,
      say: "Now unpause and let an enemy walk a few steps. Pause again, set the filter radio to 'changed' (or 'increased'/'decreased' if you tracked direction), tap Next Scan. Repeat — each round drops cells that didn't move with the patrol.",
    },
    {
      id: "watch-enemy-x",
      when: ({ scannerState, watchSize }) =>
        scannerState.lastResults && scannerState.lastResults.length <= 2 && watchSize === 0,
      say: "Looks narrowed. '+ watch' the survivor. The radar minimap appears in the canvas corner the moment any enemy.x is in your watchlist.",
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();

    dialog.script("VEX", [
      "Targets are live. Four hostiles patrolling the room — see the red squares?",
      "They each have their own X coord in memory. Pick one. Watch it walk left-right between two waypoints.",
      "First Scan when it's at one waypoint, then Next Scan with 'decreased' or 'increased' as it moves. Two-three rounds, you'll have it.",
      "Add it to the watchlist — that's your radar lock. The HUD lights up with a minimap showing every patrol. That's a real radar hack, recruit.",
    ]);

    let done = false;
    const enemyXLabels = target.enemyManager.enemies.map((_, i) => `enemy[${i}].x`);
    const enemyXAddrs = enemyXLabels.map(l => memory.addressOfLabel(l));

    const interval = setInterval(() => {
      if (done) return;
      // Win when ANY enemy.x address is in the watchlist (and therefore
      // being read live).
      const hit = enemyXAddrs.some(a => target._scanner_watch?.has?.(a));
      // We don't have direct access to the scanner here; rely on a side
      // effect: the player adds the address to the watchlist via the
      // scanner UI, which calls memory.read on it constantly. We can
      // detect that by checking whether the address is currently bound
      // and present in the live watchlist DOM.
      const watchEls = document.querySelectorAll(".watchlist li[data-addr]");
      const watchedAddrs = new Set();
      for (const el of watchEls) watchedAddrs.add(el.dataset.addr);
      const lit = enemyXAddrs.some(a => watchedAddrs.has(a));
      if (lit) {
        target.enableRadar();
        done = true;
        complete("Radar live. Every patrol on this floor is on your minimap now.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
