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

    // Add a live speed indicator FIXED at the bottom of the viewport,
    // just above the tab bar, so it's always visible regardless of
    // where the player has scrolled in the scanner panel. Reading the
    // indicator while editing the watchlist is the whole UX point.
    const speedIndicatorHtml = `
      <div id="m12-speed-indicator" style="
        position: fixed;
        right: 8px; top: 8px;
        z-index: 9000;
        padding: 4px 10px;
        background: rgba(2, 6, 12, 0.92);
        border: 1px solid var(--accent-2);
        border-radius: 4px;
        font-family: ui-monospace, Menlo, monospace;
        font-size: 11px;
        color: var(--accent-2);
        box-shadow: 0 0 8px rgba(34, 211, 238, 0.3);
        transition: background 200ms;
        pointer-events: none;
        white-space: nowrap;
      ">
        SPEED <span id="m12-speed-val">— t/s</span>
        &nbsp;|&nbsp; <span id="m12-tile-progress">0 / 30</span>
      </div>`;
    if (!document.getElementById("m12-speed-indicator")) {
      document.body.insertAdjacentHTML("beforeend", speedIndicatorHtml);
    }

    let done = false;
    let tilesAtLowCooldown = -1;
    let lastDisplayedTps = 0;

    const interval = setInterval(() => {
      if (done) return;

      // Update live speed indicator. Show PREDICTED speed derived from
      // current moveCooldownMs (tiles per second = 1000/cooldown). Updates
      // instantly when the player edits the right candidate cell — no
      // movement required to see the effect.
      const $val = document.getElementById("m12-speed-val");
      const $box = document.getElementById("m12-speed-indicator");
      if ($val) {
        const cd = Math.max(1, target.moveCooldownMs | 0);
        const tps = parseFloat((1000 / cd).toFixed(1));
        $val.textContent = tps + " t/s";
        // Flash green when the speed jumps significantly — visual cue that
        // the player just edited the RIGHT cell.
        if ($box && tps > lastDisplayedTps * 1.5 && lastDisplayedTps > 0) {
          $box.style.background = "rgba(34, 197, 94, 0.4)";
          $box.style.borderColor = "#22c55e";
          $val.style.color = "#22c55e";
          setTimeout(() => {
            if ($box) {
              $box.style.background = "rgba(2, 6, 12, 0.95)";
              $box.style.borderColor = "var(--accent-2)";
              if ($val) $val.style.color = "var(--accent-2)";
            }
          }, 1200);
        }
        lastDisplayedTps = tps;
      }

      // Track tiles only while the cooldown is actually low. If they
      // unfreeze and it pops back, we restart the count — real cheats
      // need the freeze to stay applied.
      if (target.moveCooldownMs < 80) {
        if (tilesAtLowCooldown < 0) tilesAtLowCooldown = target.tilesMoved;
      } else {
        tilesAtLowCooldown = -1;
      }
      // Update tile progress in the banner.
      const $prog = document.getElementById("m12-tile-progress");
      if ($prog) {
        const progress = tilesAtLowCooldown >= 0
          ? Math.min(30, target.tilesMoved - tilesAtLowCooldown)
          : 0;
        $prog.textContent = progress + " / 30";
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
