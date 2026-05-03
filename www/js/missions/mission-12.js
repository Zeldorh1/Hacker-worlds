// Mission 12 — SPEED HACK
//
// The player's movement cooldown is an int (ms between tiles). The
// game does NOT display this number anywhere — that's the lesson.
// In real Cheat Engine, hidden stats like move speed, accel, rotation
// rate are found via 'Unknown Initial Value' first scan + filter
// cycles, not by typing a magic number you somehow already know.
//
// Real game equivalent: speed multiplier or move-cooldown in player
// struct. Often a float, often guarded — but the core technique
// (scan unknown, narrow with unchanged, trial-and-error) is identical.

import { memory } from "../sim-memory.js";

export const mission12 = {
  id: "m12",
  title: "SPEED HACK",
  brief: "Find a stat the HUD won't show you. Crank movement, cover 30 tiles.",
  prerequisites: ["m11"],
  timeLimit: 200,

  hints: [
    {
      id: "unknown-first",
      min: 14,
      when: ({ scannerState }) => scannerState.lastResults === null,
      say: "Move speed isn't on the HUD — you don't know the number. Scanner → set Scan to 'Unknown Initial Value' → First Scan. That snapshots every cell. We'll narrow with filters from here.",
    },
    {
      id: "filter-unchanged",
      min: 6,
      when: ({ scannerState }) =>
        scannerState.lastResults && scannerState.lastResults.length > 50,
      say: "Walk around for a few seconds. Lots of cells are noise that drift. Set filter to 'unchanged' → Next Scan. The speed cell stays put while noise gets dropped. Repeat 3-4 times.",
    },
    {
      id: "trial-and-error",
      min: 4,
      when: ({ scannerState, watchSize }) =>
        scannerState.lastResults && scannerState.lastResults.length <= 8 && watchSize < 4,
      say: "Down to a handful. '+ watch' the candidates. Edit each value to 30 — watch the LIVE SPEED indicator at the top of the scanner panel. Wrong cells = no change. Right cell = number jumps. Freeze the one that worked.",
    },
    {
      id: "speedrun",
      when: ({ target }) => target.moveCooldownMs < 80 && target.tilesMoved < 30,
      say: "Cooldown's down. Now run — 30 tiles to close it out. Hold a direction.",
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();   // give them targets to dodge
    target.tilesMoved = 0;

    dialog.script("VEX", [
      "Different beast this one. Movement speed isn't displayed — no HUD readout, no obvious starting number.",
      "Workflow: Scanner → Scan dropdown → 'Unknown Initial Value' → First Scan. That captures every cell as-is.",
      "Walk around. Filter 'unchanged' + Next Scan, a few times over. Stable cells survive (the speed stat is one); noise gets shaken out.",
      "Trial-and-error the survivors: edit each to a low number, see if 'LIVE SPEED' goes up. Freeze the right one. Then traverse 30 tiles.",
      "This is the workflow for every hidden stat in real games — speed, recoil, jump height, rotation rate.",
    ]);

    // Add a live speed indicator at the top of the scanner panel.
    // Doesn't reveal the cell VALUE — shows the EFFECT (tiles/sec).
    // Same as a real game's player FEELING faster vs. seeing a raw number.
    // Trial-and-error becomes: edit a candidate, glance at indicator,
    // see if speed jumped — without leaving the scanner tab.
    const speedIndicatorHtml = `
      <div id="m12-speed-indicator" style="
        margin: 8px 0; padding: 6px 10px;
        background: rgba(34, 211, 238, 0.08);
        border: 1px solid rgba(34, 211, 238, 0.3);
        border-radius: 4px;
        font-family: ui-monospace, Menlo, monospace;
        font-size: 12px;
        color: var(--accent-2);
      ">
        LIVE SPEED: <span id="m12-speed-val">— t/s</span>
        <span style="opacity:0.6; margin-left: 8px;">(edit candidates, watch this number jump)</span>
      </div>`;
    const scannerPanel = document.getElementById("view-scanner");
    if (scannerPanel && !document.getElementById("m12-speed-indicator")) {
      scannerPanel.insertAdjacentHTML("afterbegin", speedIndicatorHtml);
    }

    let done = false;
    let tilesAtLowCooldown = -1;

    const interval = setInterval(() => {
      if (done) return;

      // Update live speed indicator. Show PREDICTED speed derived from
      // current moveCooldownMs (tiles per second = 1000/cooldown). Updates
      // instantly when the player edits the right candidate cell — no
      // movement required to see the effect.
      const $val = document.getElementById("m12-speed-val");
      if ($val) {
        const cd = Math.max(1, target.moveCooldownMs | 0);
        const tps = (1000 / cd).toFixed(1);
        $val.textContent = tps + " t/s";
      }

      // Track tiles only while the cooldown is actually low. If they
      // unfreeze and it pops back, we restart the count — real cheats
      // need the freeze to stay applied.
      if (target.moveCooldownMs < 80) {
        if (tilesAtLowCooldown < 0) tilesAtLowCooldown = target.tilesMoved;
      } else {
        tilesAtLowCooldown = -1;
      }
      if (tilesAtLowCooldown >= 0 && target.tilesMoved - tilesAtLowCooldown >= 30) {
        done = true;
        complete("Thirty tiles flat-out. Hidden stats fall to Unknown Initial Value + a few filter passes.");
        clearInterval(interval);
      }
    }, 200);

    return () => {
      clearInterval(interval);
      const el = document.getElementById("m12-speed-indicator");
      if (el) el.remove();
    };
  },
};
