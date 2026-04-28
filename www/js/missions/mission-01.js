// Mission 1 — Find & Freeze Your X Coordinate
//
// Teaches the GHA "External Memory Hack" loop applied to a player coordinate:
//   1. Read the value from the game's HUD.
//   2. Scan memory for that value.
//   3. Walk to make the value change, then narrow.
//   4. Add the surviving address to the watchlist and freeze it.
//   5. Try to walk along that axis — if you can't, you've pinned the right cell.

import { memory } from "../sim-memory.js";

export const mission01 = {
  id: "m01",
  title: "KINETIC LOCK",
  brief: "Freeze your X coordinate so you can't move along that axis.",
  prerequisites: [],

  start({ dialog, target, complete }) {
    target.reset();

    dialog.script("VEX", [
      "Welcome to Anomaly Labs, recruit. First job: a freeze on the X coord of the dummy in AssaultZone.",
      "Step 1 — open AssaultZone, look at HUD. Note your current X.",
      "Step 2 — open Scanner. Type that number, tap First Scan. You'll get a wall of matches because tons of memory holds small ints.",
      "Step 3 — go back, walk left or right, X changes. In Scanner, set 'exact' to the new X and tap Next Scan to drop everything that didn't move.",
      "Step 4 — repeat: walk, scan, narrow until one or two addresses remain.",
      "Step 5 — tap '+ watch' on the survivor, then tick 'freeze'. Try walking. If X locks, you nailed it.",
    ]);

    const xAddr = memory.addressOfLabel("player.x");
    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (memory.isFrozen(xAddr)) {
        done = true;
        complete("Clean work. That's the entire external memory hack loop.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
