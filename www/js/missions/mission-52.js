// Mission 52 — THE PATCH-RENAME ANTI-PATTERN
//
// The actual story Nexon's response to ID_Server_Crash etc. tells:
//
//   #define ID_Server_Crash 153//404//200
//
// That dev-comment notation means "Nexon patched ID 153 → 404 → 200,
// in three patch cycles." Each time, the cheat developer just searched
// for the new number and updated the #define. The exploit kept working
// because the underlying bug — handler accepts requests without auth —
// was never fixed.
//
// This mission demonstrates that anti-pattern. The server starts with
// ID 135 = ID_God_Mode. Player completes M51 by sending 135. Then
// the simulator "patches" — 135 stops working. Player tries 200, then
// 404, finds the new number through trial. Each rename is one line of
// dev work and one line of cheat work. Player understands: this fix
// approach NEVER ends. Only auth (M53) ends it.
//
// Mission flow:
//   1. Server only honors ID 404 currently. Player tries 135 → fails.
//   2. Player iterates through plausible IDs (200, 404 in the rotation).
//   3. Once they find 404, godMode flips, hazard zone is survivable.
//   4. Win: 4 distinct IDs attempted (proving the brute search) AND
//      godMode active.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M52 — THE PATCH-RENAME ANTI-PATTERN
//
// Nexon's response to leaked debug-handler IDs was to RENAME the
// numbers. From a leaked CA cheat header:
//   #define ID_Server_Crash 153//404//200
// Three patch cycles. Each time the cheat dev just found the new ID
// and updated their #define. The exploit kept working because the
// SERVER never added auth to the handler.
//
// This template tries the candidate IDs in order. The first one the
// server still honors flips godMode.

const CANDIDATES = [135, 200, 404, 150, 153, 206, 174];

void onInject() {
  log("Brute-searching post-patch ID space");

  for (let i = 0; i < CANDIDATES.length; i++) {
    const id = CANDIDATES[i];
    const result = call_engine_function("send_to_server", id);
    log("  ID " + id + " -> " + (result.ok ? "ACCEPTED" : "rejected (" + result.reason + ")"));
    if (result.ok) {
      log("Found new ID after patch — exploit lives");
      break;
    }
  }
}

void onTick() { }
`;

export const mission52 = {
  id: "m52",
  title: "THE PATCH-RENAME ANTI-PATTERN",
  brief: "Nexon patched ID 135. Now you find the new number. Spoiler: this never ends.",
  prerequisites: ["m51"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "🔁",
    title: "ID_GOD_MODE PATCHED — NEW NUMBER PUSHED",
    body: `Nexon shipped a hotfix. ID 135 no longer flips
godMode. Server returns 'unknown_id'.

Their fix: rename the byte. The handler still has no
auth check — they just changed which integer triggers
it. The cheat-dev community will reverse-engineer the
new number within hours, update their #define, and
ship a new build.

That's the ENTIRE Nexon response cycle, repeated
across years of patches:

  #define ID_Server_Crash 153//404//200

Three patches, three new numbers. Same exploit working
every time. The bug was never fixed — only obfuscated.

This mission: brute-search the candidate ID space
until you find the new one. Then watch the next mission
explain why this approach was a strategic mistake.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template iterates a list of plausible IDs (135, 200, 404, ...) and stops at the first one the server still honors. Compile + Inject.",
    },
    {
      id: "wait-for-flip",
      min: 4,
      when: ({ target, dllState }) =>
        dllState.running && !target.session.godMode && target.serverDeniedCount === 0,
      say: "DLL is running but the search hasn't fired yet. Check the DLL console — each ID is logged with ACCEPTED or rejected. The simulator currently rotates the active ID periodically.",
    },
    {
      id: "stand-in-hazard",
      when: ({ target }) =>
        target.session.godMode && target.player.hp >= 90,
      say: "Found the active ID — godMode is set. Walk into the hazard zone, stand 10 seconds, mission closes. Real-world: Nexon will rename the ID again next patch, and the cycle repeats.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableHazards();

    // Pick a random "new" ID from the post-patch rotation. The cheat
    // template's candidate list contains the right answer plus decoys.
    const POST_PATCH_IDS = [200, 404, 150, 206];
    const activeId = POST_PATCH_IDS[Math.floor(Math.random() * POST_PATCH_IDS.length)];

    target.serverHandlers.set(activeId, {
      auth: false,
      handler: (session) => { session.godMode = true; },
    });
    target._m52ActiveId = activeId;
    target._m52StartedAt = performance.now();

    dialog.script("VEX", [
      "Nexon shipped a hotfix. ID 135 doesn't work anymore. They renamed the handler — still no auth check, just a different byte triggers it now.",
      "This was the actual response pattern for years. Cheat devs leaked the original ID, Nexon renamed it, cheat devs reversed the new ID, ship a new build, repeat.",
      `Server is currently honoring ID ${activeId} (out of ${POST_PATCH_IDS.join(', ')} as plausible candidates). Your template brute-searches the candidate list — when it finds the active one, godMode flips.`,
      "Once godMode is set, stand in the hazard zone for 10 seconds to close. Next mission shows what Nexon should have done instead.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      const elapsed = performance.now() - target._m52StartedAt;
      if (target.session.godMode && elapsed >= 10000 && target.player.hp >= 90) {
        done = true;
        complete(`Found the post-patch ID (${target._m52ActiveId}) and survived the hazard zone. The exploit lives because Nexon renamed instead of authed. Next mission: the actual fix.`);
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
