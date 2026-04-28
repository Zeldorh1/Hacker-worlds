// Mission 1 — KINETIC LOCK (find & freeze the player X coord)
//
// External Memory Hack 101 with a 75s trace timer. VEX inserts urgency
// lines as the timer crosses thresholds (handled by app.js).

import { memory } from "../sim-memory.js";

export const mission01 = {
  id: "m01",
  title: "KINETIC LOCK",
  brief: "Freeze the X coord on a moving target before the trace lands.",
  prerequisites: [],
  timeLimit: 75,

  hints: [
    {
      id: "first-scan",
      min: 18,
      when: ({ scannerState }) => scannerState.lastResults === null,
      say: "Note your X in the HUD (top-left of ac_anomaly). Tap the SCANNER tab, type that number, tap First Scan.",
    },
    {
      id: "narrow-after-walk",
      min: 5,
      when: ({ scannerState }) =>
        scannerState.lastResults && scannerState.lastResults.length > 1,
      say: "Switch to ac_anomaly, walk one step left or right (X changes), come back, type the new X, tap Next Scan. Most matches will drop.",
    },
    {
      id: "watch-survivor",
      when: ({ scannerState, watchSize }) =>
        scannerState.lastResults && scannerState.lastResults.length === 1 && watchSize === 0,
      say: "One match left — that's your X. Tap '+ watch' on it.",
    },
    {
      id: "freeze",
      when: ({ watchSize, anyFrozen }) => watchSize > 0 && !anyFrozen,
      say: "Tick the 'freeze' checkbox on your watched address. Then walk on ac_anomaly — if X locks, you nailed it.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();

    dialog.script("VEX", [
      "Recruit. The trap room dev's running an active trace — you've got 75 seconds before they lock onto your handle.",
      "Step 1 — note your X in the HUD. Tab to Scanner. First Scan that number.",
      "Step 2 — walk one step on the X axis. Scan again with the new value.",
      "Step 3 — you'll narrow to one or two addresses. Tap '+ watch', tick freeze.",
      "If your X locks while you try to walk, you nailed it. Move.",
    ]);

    const xAddr = memory.addressOfLabel("player.x");
    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (memory.isFrozen(xAddr)) {
        done = true;
        complete("Clean exit. Trace dropped. Tomorrow we go for HP.");
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  },
};
