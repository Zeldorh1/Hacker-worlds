// Mission 16 — STRUCT DISCOVERY
//
// THE meta lesson. Up to M15 the player has found each cell
// independently — HP separately, ammo separately, position
// separately. Real game hacking is way more efficient: every
// per-player stat lives in one struct in memory. Find ONE field,
// browse the surrounding bytes, and you discover the rest by
// recognising values.
//
// The simulator now lays player stats out at consecutive offsets
// (the AssaultZone constructor reserves a 64-byte block):
//   +0x00  hp                (default 100)
//   +0x04  ammo              (default 30)
//   +0x08  x                 (matches HUD POS)
//   +0x0C  y                 (matches HUD POS)
//   +0x10  moveCooldownMs    (the M12 'hidden' stat — discoverable here!)
//
// Workflow taught:
//   1. Find HP via normal scan (HUD shows the value).
//   2. Tab to Scanner, scroll to BROWSE MEMORY, target the HP address.
//   3. Read the value column. Recognise:
//        - 30 (ammo)
//        - 5 (x or y, matches HUD)
//        - 110 (the move cooldown that was hidden in M12)
//   4. + watch each one. Win = all 5 player stat addresses watched.
//
// Real game equivalent: Cheat Engine's "Browse this memory region"
// or x64dbg's dump view. Once you've found a struct base, you walk
// adjacent bytes by eye to map every field.

import { memory } from "../sim-memory.js";

const PLAYER_LABELS = [
  "player.hp", "player.ammo", "player.x", "player.y", "player.moveCooldownMs",
];

export const mission16 = {
  id: "m16",
  title: "STRUCT DISCOVERY",
  brief: "Find one player stat. Browse the struct. Watch all five.",
  prerequisites: ["m15"],
  timeLimit: 240,

  hints: [
    {
      id: "find-hp-first",
      min: 12,
      when: ({ scannerState, watchSize }) => scannerState.lastResults === null && watchSize === 0,
      say: "Standard play first: scan your HP (M2 muscle memory). Walk a tile to take a hazard or wait for bleed, narrow with 'decreased', '+ watch' the survivor. Don't worry about freezing yet.",
    },
    {
      id: "browse-it",
      min: 4,
      when: ({ watchSize, scannerState }) =>
        watchSize === 1 && (!scannerState.browseBase || scannerState.browseBase.length === 0),
      say: "You've got HP watched — that's a known address. Scroll down in Scanner to BROWSE MEMORY. Default target is your first watch. Tap Browse.",
    },
    {
      id: "recognise-values",
      min: 4,
      when: ({ watchSize, scannerState }) =>
        watchSize === 1 && scannerState.browseBase,
      say: "The +0x00 row (highlighted) is HP — value 100. Look at +0x04, +0x08, +0x0C, +0x10. You'll see 30 (ammo), two values that match your POS in the HUD (x and y), and a number you've never seen displayed (the move cooldown from M12 — it was here all along).",
    },
    {
      id: "watch-them-all",
      when: ({ watchSize }) => watchSize >= 1 && watchSize < 5,
      say: "Tap '+ watch' on each recognisable field. We need all 5: HP, ammo, x, y, and the cooldown. Same struct, just different offsets.",
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();
    target.enableHazards();   // gives HP a way to drop for 'decreased' filtering

    dialog.script("VEX", [
      "Big lesson. Up till now you've found each stat separately — HP one mission, ammo another. That's not how trainers actually work.",
      "Every per-player stat lives in ONE struct in memory. Find any field, walk adjacent bytes, you discover the rest.",
      "Find HP first. Standard scan, take some damage to narrow with 'decreased'. Watch it.",
      "Then: Scanner → BROWSE MEMORY → tap Browse on your HP address. The +0x00 row is HP. Read the values around it: 30 = ammo, your POS values = x and y, and an integer you never saw on the HUD = the move cooldown from M12.",
      "Watch all five. This is the workflow that lets one person ship a 30-stat trainer in an afternoon.",
    ]);

    let done = false;
    function watchedLabels() {
      const watched = new Set();
      for (const el of document.querySelectorAll(".watchlist li[data-addr]")) {
        watched.add(el.dataset.addr);
      }
      return PLAYER_LABELS.filter(l => watched.has(memory.addressOfLabel(l)));
    }

    const interval = setInterval(() => {
      if (done) return;
      const found = watchedLabels();
      if (found.length >= 5) {
        done = true;
        complete("Five stats, one struct. From here on you stop scanning fields — you scan structs.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
