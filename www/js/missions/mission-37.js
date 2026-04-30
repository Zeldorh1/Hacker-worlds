// Mission 37 — MOVEMENT VALIDATION
//
// Server-side check on position updates. M12's speed hack (freeze
// player.moveCooldownMs at 30) generates rapid position packets the
// server's anti-speed-hack rejects: each accepted move can't exceed
// maxDeltaPerMs. Going too fast → snap back to last valid position.
//
// Bypass: don't max-speed. Run JUST under the validator's threshold.
// 'Legal speed hack' — fast enough to feel cheating, slow enough
// the server tolerates it. M12 freeze at moveCooldownMs ~ 90 sits
// right under the threshold (~83ms = 1 tile per ~80ms).
//
// Mission flow:
//   1. M12 freeze at 30ms cooldown — server snap-backs constantly.
//      Track tilesMoved → barely climbs because each move undoes.
//   2. Player switches to a legal speed (cooldown ~ 90ms).
//   3. Walks 30 tiles without snapbacks.
//   4. Win = tilesMoved >= 30 AND snapbacks < 3 in the last X tiles.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M37 — MOVEMENT VALIDATION
//
// Server checks position deltas: max ~1 tile per 80ms.
// M12's max-out (cooldown=30) trips the validator → snap back.
// Set cooldown to ~90 = 'legal speed hack' that flies under
// the radar.

void onInject() {
  log("legal-speed cheat loaded — keeping under the validator threshold");

  register_cheat("Legal Speed", function() {
    write_label("player.moveCooldownMs", 90);
  });
}

void onTick() { }
`;

export const mission37 = {
  id: "m37",
  title: "MOVEMENT VALIDATION",
  alert: {
    icon: "🏃",
    title: "SERVER NOW VALIDATES POSITION",
    body: `Hotfix 2.1.3:
> Server checks every position-update packet against
> the maximum velocity your character can produce.
> Speed-hack moves above the threshold get snapped back
> to the last valid position.

M12's max-out cooldown=30 generates moves the validator
rejects instantly. tilesMoved barely climbs because each
move undoes itself.

Fix: don't max-out. Run UNDER the threshold. 'Legal speed
hack' — fast enough to feel cheating, slow enough the
validator tolerates. Same pattern as bunny-hop / strafe-
jump in real shooters.`,
  },
  brief: "Server snaps back impossible moves. Set speed UNDER the threshold.",
  prerequisites: ["m36"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  cheatMenu: true,
  network: true,

  hints: [
    {
      id: "compile-and-tick",
      min: 6,
      when: ({ dllState, target }) =>
        !dllState.running || target.tilesMoved < 5,
      say: "Compile + Inject. Open ≡ CHEATS, tick 'Legal Speed' (cooldown=90 — just under the validator's tolerance). Walk a few tiles to confirm no snapbacks.",
    },
    {
      id: "walk-far",
      when: ({ target }) => target.tilesMoved < 30,
      say: "Cooldown=90 keeps each move under the server's max delta. Hold a direction and traverse 30 tiles. Snapbacks should stay near zero.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableESP();
    target.enableNetwork();
    target.enableMovementValidation();
    target.tilesMoved = 0;

    dialog.script("VEX", [
      "Server checks every position packet. Move too fast (cooldown < ~80ms) and it snap-backs you to the last valid position. M12's max-speed cheat trips it constantly.",
      "Bypass: run UNDER the threshold. Cheat sets cooldown=90 — fast enough to feel like a hack, slow enough the validator tolerates.",
      "Compile + Inject. Tick 'Legal Speed' in ≡ CHEATS. Hold a direction, walk 30 tiles. Snapbacks stay below 3 → win.",
      "Same lesson as real-world bunny-hop / strafe-jump exploits: gain advantage via legal mechanics, not by tripping speed validation.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.tilesMoved >= 30 && target.network.movementValidation.snapbacks < 3) {
        done = true;
        complete("30 tiles traveled, validator quiet. Speed within tolerance is the legal-hack pattern in every shooter.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
