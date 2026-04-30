// Mission 22 — NOP THE BLEED
//
// Code patching, the M6 way out. Bleed is on, draining HP. Watchdog
// is also on — if the player just freezes player.hp like they
// learned in M2, the watchdog catches the frozen cell within a few
// seconds and the contract fails.
//
// The new option: don't touch the cell. Find the CODE that writes to
// it (the bleed_tick handler) and NOP it. The instruction never
// runs, so HP never decrements, so HP doesn't need to be frozen.
// Watchdog has nothing to detect.
//
// Workflow taught:
//   1. Player tries the M2 freeze. Watchdog trips inside 4 seconds.
//   2. VEX hint: 'don't freeze the cell. NOP the writer.'
//   3. Player watches HP, lets bleed fire once (so the instruction
//      registers as 'recently fired').
//   4. Tab to Scanner, scroll to FIND WHAT WRITES, target HP, hit Find.
//   5. BLEED_TICK_HANDLER appears. Tap NOP.
//   6. Bleed continues to attempt to fire — but no damage applied.
//      Watchdog stays passive (no frozen cells). Mission completes.
//
// Real CE workflow: 'Find what writes to this address' →
// 'Replace with code that does nothing' (NOPs the bytes in memory).

import { memory } from "../sim-memory.js";
import { codeSegment } from "../code-segment.js";

export const mission22 = {
  id: "m22",
  title: "NOP THE BLEED",
  brief: "Watchdog catches freezes. Patch the bleed code itself instead.",
  prerequisites: ["m21"],
  timeLimit: 240,
  watchdog: true,

  hints: [
    {
      id: "freeze-fails",
      min: 6,
      when: ({ target }) => target.watchdog.violations >= 25,
      say: "Watchdog spotted the freeze — that's the M6 fight you already won, but here it locks you out of the easy answer. Different tactic needed.",
    },
    {
      id: "find-what-writes",
      min: 4,
      when: ({ scannerState, target }) =>
        target.watchdog.violations >= 25 && !codeSegment.noppedIds().includes("bleed_tick"),
      say: "Don't FREEZE the cell — KILL the code that writes to it. Watch HP, let bleed fire once. Then Scanner → FIND WHAT WRITES → target HP → Find. The bleed instruction shows up.",
    },
    {
      id: "tap-nop",
      when: ({ target }) =>
        !codeSegment.noppedIds().includes("bleed_tick"),
      say: "BLEED_TICK_HANDLER in the results. Tap NOP. The instruction stays registered — it'll keep getting called every 1.1s — but its body doesn't run. HP stays at 100 with no freeze, no watchdog hit.",
    },
    {
      id: "almost-there",
      when: ({ target }) =>
        codeSegment.noppedIds().includes("bleed_tick"),
      say: "NOP'd. Just unfreeze the HP cell if you froze it earlier (so watchdog drops back to 0), then ride out 25 seconds. Code patch survives where freeze couldn't.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableBleed(2, 1100);
    target.enableESP();
    target.enableWatchdog();   // app.js also enables it from m.watchdog,
                               // but reset() above wiped it; re-enable.

    const bleedInst = codeSegment.get("bleed_tick");
    let firstNopAt = 0;

    dialog.script("VEX", [
      "Bleed's on. Watchdog's on. M2 strategy of freezing HP works for about four seconds before violations climb to 100 and trip you.",
      "New angle: don't touch the cell. Watch HP, wait for bleed to fire once (you'll see HP drop). Then Scanner → FIND WHAT WRITES → target HP → Find.",
      "BLEED_TICK_HANDLER will show up. Tap NOP. The instruction's still scheduled — it just stops doing anything. No freeze, no watchdog detection, no damage.",
      "Hold for 25 seconds after the NOP. Same hack tier as 'Replace with code that does nothing' in real Cheat Engine.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      // Track when the bleed instruction first becomes NOPed.
      if (bleedInst && bleedInst.nopped && firstNopAt === 0) {
        firstNopAt = performance.now();
      }
      if (bleedInst && !bleedInst.nopped) firstNopAt = 0;
      // Watchdog trip → failure (same threshold as M6).
      if (target.watchdog.violations >= 100) {
        done = true;
        clearInterval(interval);
        fail("watchdog tripped · freeze got caught · NOP the code instead");
        return;
      }
      // Win: bleed NOPed for 25s, watchdog passive (≤10), HP intact.
      if (firstNopAt > 0 &&
          performance.now() - firstNopAt >= 25000 &&
          target.watchdog.violations <= 10 &&
          target.player.hp > 95) {
        done = true;
        complete("Code patch held 25s. Watchdog never saw a frozen cell because there wasn't one — the writer just stopped writing.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
