// Mission 13 — WALLHACK ESP
//
// The render flag for the ESP overlay is just an int (0 or 1) in the
// game's render-config struct. M5 unlocked ESP through gameplay; this
// mission says: even if the dev didn't give you the unlock, you can
// flip the cell directly. That's a wallhack.
//
// Enemy sprites are drawn near-invisible (camouflage mode) while
// render.espVisible is 0. Flip the cell to 1 → ESP turns on → enemies
// pop into view with name + HP labels → player can drop them.
//
// Real game equivalent: a render boolean buried in a config struct
// (Show_Enemies, ESP_Enabled, draw_player_box, etc.). Toggling these
// is the simplest visual wallhack you can ship.

import { memory } from "../sim-memory.js";

export const mission13 = {
  id: "m13",
  title: "WALLHACK ESP",
  brief: "Flip the render flag. Drop the camouflaged contacts.",
  prerequisites: ["m12"],
  timeLimit: 200,

  hints: [
    {
      id: "find-zero-cell",
      min: 14,
      when: ({ scannerState }) => scannerState.lastResults === null,
      say: "Enemies are nearby — radar shows them. The ESP-visible flag is currently 0. SCANNER → set Scan to 'Unknown Initial Value' OR type 0 → First Scan. Either gets us a starting set.",
    },
    {
      id: "narrow-stable",
      min: 6,
      when: ({ scannerState }) =>
        scannerState.lastResults && scannerState.lastResults.length > 6,
      say: "Walk around, fire a shot, let the world tick. Then Next Scan with filter 'unchanged'. The ESP flag stays at 0 — noise drifts. A few passes drops thousands of cells.",
    },
    {
      id: "trial-and-error",
      min: 4,
      when: ({ scannerState }) =>
        scannerState.lastResults && scannerState.lastResults.length <= 6 &&
        scannerState.lastResults.length > 0,
      say: "Down to a handful of stable zeros. '+ watch' a couple. Edit each value to 1. The right one paints ESP labels onto the enemies — wrong ones do nothing.",
    },
    {
      id: "kill-with-esp",
      when: ({ target }) => target.espActive && target.killCount < 4,
      say: "ESP's live — enemies are visible now. Hunt them down. All four contacts.",
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableCamouflage();   // ESP off, enemies near-invisible

    dialog.script("VEX", [
      "Camouflage protocol's hot — you can barely see the contacts. Radar shows them but the canvas is washed out.",
      "The dev's render config has an ESP-visible boolean. It's a 4-byte int set to 0. Find it. Flip it to 1.",
      "Best path: First Scan unknown initial value, walk a step, Next Scan 'unchanged'. A few rounds and you'll have a small list of stable cells. Trial-and-error: edit candidates to 1, watch the canvas.",
      "When ESP fires up, drop all four. Same render trick is how every visual wallhack ever has worked.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.espActive && target.killCount >= 4) {
        done = true;
        complete("Wallhack live, contacts cleared. You just shipped a render-flag flip.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
