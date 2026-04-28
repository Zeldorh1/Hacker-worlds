// Mission 2 — VITAL SIGNS (HP godmode)
//
// Same loop as M1, but the value-changing trigger is taking damage. Teaches
// the "decreased" filter mode: when you don't know the exact new value but
// you know it's lower than before, narrowing by direction is enough.
//
// Win when: HP cell is frozen AND the player has stood on a hazard tile
// while godmode was active (so we know the freeze actually protected them).

import { memory } from "../sim-memory.js";

export const mission02 = {
  id: "m02",
  title: "VITAL SIGNS",
  brief: "Freeze your HP for godmode and walk through the spike trap room.",
  prerequisites: ["m01"],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableHazards();

    dialog.script("VEX", [
      "Trap room's hot today. The dev wired spike tiles all over the lower floor.",
      "Same drill as before, different value. Note your HP — should be 100 — then First Scan for it.",
      "Now walk onto a red X. You'll lose HP. In Scanner, switch to 'decreased' and Next Scan.",
      "'Decreased' is gold when you don't know the exact new number — it just keeps cells that went down.",
      "Repeat: take a hit, narrow by 'decreased'. Two or three rounds nails the HP cell.",
      "Watch it, freeze it. Then walk the trap room. If your HP doesn't move, you're invincible. Mission ends.",
    ]);

    const hpAddr = memory.addressOfLabel("player.hp");
    let done = false;
    let hitsWhileFrozen = 0;
    let prevDamageEvents = target.damageEvents;

    const interval = setInterval(() => {
      if (done) return;
      // Count damage events that happened with the HP cell already frozen.
      if (memory.isFrozen(hpAddr) && target.damageEvents > prevDamageEvents) {
        hitsWhileFrozen += target.damageEvents - prevDamageEvents;
      }
      prevDamageEvents = target.damageEvents;

      if (memory.isFrozen(hpAddr) && hitsWhileFrozen >= 1) {
        done = true;
        complete("Godmode confirmed. That's two missions down.");
        clearInterval(interval);
      }
    }, 250);

    return () => {
      clearInterval(interval);
      target.disableHazards();
    };
  },
};
