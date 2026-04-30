// Mission 43 — NOCLIP
//
// Builds on: M16 STRUCT DISCOVERY (browse the player struct), M02
// (freeze a cell). Tile-collision is gated by a single bool in the
// player struct: player.noClip. Default 0. Set to 1, freeze. The
// game's wall check now sees noClip=1 and skips the collision rule.
// Walk through walls.
//
// This is THE classic FPS cheat that wasn't on the curriculum yet.
// Same structural lesson as M19 (alive flag) — one boolean changes
// the game's behavior dramatically.

import { memory } from "../sim-memory.js";

// Pick a tile that's normally unreachable — somewhere blocked by walls.
// Map walls are at x % 7 === 3 (for x > some range), so a tile at
// x=10, y=14 is reachable but x=10, y=14 may be behind walls. Let's
// pick a clearly-walled tile.
const TARGET_TILE = { x: 14, y: 14 };

export const mission43 = {
  id: "m43",
  title: "NOCLIP",
  brief: `Find player.noClip. Freeze it at 1. Walk through walls to (${TARGET_TILE.x}, ${TARGET_TILE.y}).`,
  prerequisites: ["m42"],
  timeLimit: 180,

  hints: [
    {
      id: "browse-struct",
      min: 8,
      when: ({ scannerState }) => !scannerState.browseBase,
      say: "M16 lesson — find your HP via scan or label, BROWSE MEMORY on it. The player struct now has a noClip cell at +0x28. It's currently 0.",
    },
    {
      id: "freeze-at-1",
      when: ({ target }) => target.player.noClip !== 1,
      say: "Watch the +0x28 row. Edit value to 1, THEN tick freeze. (M17 gotcha — set value first.) Try walking into a wall — you should pass through.",
    },
    {
      id: "walk-to-target",
      when: ({ target }) =>
        target.player.noClip === 1 &&
        (target.player.x !== TARGET_TILE.x || target.player.y !== TARGET_TILE.y),
      say: `noClip on. Walk to (${TARGET_TILE.x}, ${TARGET_TILE.y}) — straight line, walls don't matter anymore.`,
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableESP();

    dialog.script("VEX", [
      "Different cell, same lesson as M19. There's a player.noClip bool at player_struct + 0x28. Default 0. Walk = blocked by walls.",
      "Find it (M16 browse from HP, look at +0x28). Edit to 1. Freeze.",
      `Now walk through walls to (${TARGET_TILE.x}, ${TARGET_TILE.y}). Win when you arrive.`,
      "Real FPS games same shape — single bool gates collision, freeze it and you're a ghost. Sometimes called 'wall-pass' or 'phasing' in MMOs.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.player.x === TARGET_TILE.x && target.player.y === TARGET_TILE.y) {
        done = true;
        complete("Walked through walls to the target. NoClip = one bool away from any FPS.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
