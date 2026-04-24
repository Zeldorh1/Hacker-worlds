// Mission 1 — Find & Freeze Your X Coordinate
//
// Teaches the GHA "External Memory Hack" loop applied to a player coordinate:
//   1. Read the value from the game's HUD.
//   2. Scan memory for that value.
//   3. Walk to make the value change, then narrow with "changed" filter.
//   4. Add the surviving address to the watchlist and freeze it.
//   5. Try to walk along that axis — if you can't, you've pinned the right cell.

import { memory } from "../sim-memory.js";

export function startMission01({ dialog, scanner, target, switchTo, toast }) {
  dialog.script("VEX", [
    "Welcome to Anomaly Labs, recruit. First job: a freeze on the X coord of the dummy in AssaultZone.",
    "Step 1 — open the AssaultZone tab and look at HUD. Note your current X.",
    "Step 2 — open Scanner. Type that number, tap First Scan. You'll get a wall of matches because tons of memory holds small ints.",
    "Step 3 — go back, walk left or right, the X changes. In Scanner, set 'changed' and tap Next Scan to drop everything that didn't move.",
    "Step 4 — repeat: walk, scan with the new X, narrow until one or two addresses remain.",
    "Step 5 — tap '+ watch' on the survivor, then tick 'freeze'. Try walking. If X locks, you nailed it.",
  ]);

  // Completion check: a watched address that, when frozen, equals the player's X
  // and refuses to budge as the player tries to move along the X axis.
  let completed = false;
  const xAddr = memory.addressOfLabel("player.x");

  const checker = setInterval(() => {
    if (completed) return;
    if (memory.isFrozen(xAddr)) {
      completed = true;
      toast("Mission Complete · X coord frozen");
      dialog.say("VEX", "Clean work. That's the entire external memory hack loop. Tomorrow we go for HP.");
      clearInterval(checker);
    }
  }, 250);
}
