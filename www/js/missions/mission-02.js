// Mission 2 — VITAL SIGNS (HP godmode under bleeding pressure)
//
// HP scan + freeze, but the player has a slow bleed wound that ticks down
// HP every 1.5s. They WILL die if they don't freeze HP fast enough — and a
// 100s trace clock is also running. Decreased filter is the right tool.

import { memory } from "../sim-memory.js";

export const mission02 = {
  id: "m02",
  title: "VITAL SIGNS",
  brief: "Bleed-out in progress. Freeze HP through traps before you flatline.",
  prerequisites: ["m01"],
  timeLimit: 100,

  start({ dialog, target, complete }) {
    target.reset();
    target.enableHazards();
    target.enableBleed(1, 1500);   // -1 HP every 1.5s

    dialog.script("VEX", [
      "Bad news, recruit — that wound's hemorrhaging. HP drains every second and a half.",
      "Worse: trap floor's live. Stand on a red X and you'll lose a chunk extra.",
      "Note your HP, First Scan it. Then take a hit OR just wait — HP will drop on its own.",
      "Switch the filter to 'decreased' and Next Scan. That's the magic — keeps cells that went DOWN, no matter where.",
      "Two or three rounds and you'll have it. Watch it, freeze it. Walk the room. Don't flatline.",
    ]);

    const hpAddr = memory.addressOfLabel("player.hp");
    let done = false;
    let prevDamageEvents = target.damageEvents;
    let hitsWhileFrozen = 0;
    const interval = setInterval(() => {
      if (done) return;
      if (memory.isFrozen(hpAddr) && target.damageEvents > prevDamageEvents) {
        hitsWhileFrozen += target.damageEvents - prevDamageEvents;
      }
      prevDamageEvents = target.damageEvents;
      if (memory.isFrozen(hpAddr) && hitsWhileFrozen >= 1) {
        done = true;
        complete("Godmode confirmed. The bleed can't touch you anymore.");
        clearInterval(interval);
      }
    }, 200);

    return () => {
      clearInterval(interval);
      target.disableHazards();
      target.disableBleed();
    };
  },
};
