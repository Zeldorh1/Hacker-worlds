// Mission 67 — DEFENSIVE: SERVER-SIDE FIRE-PAIRING
//
// The defensive twin of M58 OPK. M58 demonstrated the attack:
// inject a damage packet directly without firing, server applies
// damage based on the client's word.
//
// The fix is server-side: every damage event must pair with a
// recent fire packet from the same client. The server keeps a
// short rolling log of fire packets per session. When a damage
// event arrives, the server checks: did this session emit a fire
// packet within the last 1-2 seconds? If not, reject.
//
// In our simulator the flag is target.server.requireFirePairing.
// When true, target.engine.inject_damage() rejects with
// reason='no_fire_pairing' unless a recent fire packet was sent.
//
// Mission flow:
//   1. M58 OPK demonstrated. Player injects damage, NPCs die.
//   2. Server admin (mission setup) flips requireFirePairing on.
//   3. Player tries the SAME inject_damage code — it now fails.
//      Server reports "no_fire_pairing" and target keeps full HP.
//   4. To make damage register, player must send a fire packet
//      first (or just fire normally), then inject. The pairing
//      check is satisfied.
//   5. Win: 4+ damage attempts rejected (proving fix works) AND
//      at least 1 successful damage when paired with a fire.
//
// This is the M51/M52/M53 lesson applied to M58. Single-line
// server-side check closes a whole exploit class.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M67 — Verifying server-side fire-pairing defends against M58 OPK.
//
// First: confirm the OPK exploit is BLOCKED now.
// Then: prove that legitimate fire+damage still works.

void onInject() {
  log("=== Phase 1: OPK without a fire packet (should be REJECTED) ===");
  for (let i = 1; i <= 4; i++) {
    const r = call_engine_function("inject_damage", i, 999);
    log("  inject_damage(" + i + ", 999) -> " +
        (r.ok ? "ACCEPTED (oh no)" : "rejected: " + r.reason));
  }

  log("=== Phase 2: legitimate fire + damage (should ACCEPT) ===");
  // Send a fire packet to satisfy the server's pairing window
  inject_packet("send", { type: "fire", t: Date.now() });

  // Now inject damage — paired with a recent fire, should land
  const r2 = call_engine_function("inject_damage", 1, 999);
  log("  paired inject_damage -> " +
      (r2.ok ? "ACCEPTED (correct)" : "rejected: " + r2.reason));
}

void onTick() { }
`;

export const mission67 = {
  id: "m67",
  title: "DEFENSIVE: FIRE-PAIRING",
  brief: "M58's twin. Server requires every damage event to pair with a recent fire from the same session. OPK dies.",
  prerequisites: ["m58"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "🛡",
    title: "DEFENSIVE PATCH: FIRE-PAIRING",
    body: `M58 OPK worked because the server applied any
damage event the client sent — no fire required.

The fix: server-side pairing check. Every damage
event must match a recent fire packet from the same
session. Simple rolling-window log on the server:

  // Server-side, per-session:
  recent_fires.push(now)
  recent_fires.evict(older than 1.5s)

  on damage_event(target, amount):
    if recent_fires.empty(): reject('no_fire_pairing')
    else: apply

Two lines. Closes the whole OPK exploit class.

Mission proves both halves:
  1. OPK without fire → REJECTED
  2. Fire + damage → ACCEPTED (legitimate gameplay
     still works)`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template runs both phases — first 4 unpaired OPK attempts (should reject), then a fire+damage pair (should accept). Compile + Inject.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableNetwork();
    target.enableEnemies();

    // Flip the defensive flag on.
    target.server.requireFirePairing = true;
    target.injectedDamageRejected = 0;
    target.injectedDamageApplied = 0;

    dialog.script("VEX", [
      "M58 demonstrated the attack: send a crafted damage packet, server applies, enemy dies. No fire required, no aim required. The cheat worked because the server trusted the client.",
      "M67 is the fix. server.requireFirePairing = true. Now every damage event must pair with a recent fire packet (1.5s window) from the same session.",
      "Template runs both phases: 4 unpaired OPK attempts (server rejects with 'no_fire_pairing'), then a single fire-then-damage pair (server accepts because the fire was within the pairing window).",
      "Win: 4 rejections AND 1 acceptance. Proves the fix closes the exploit while letting legitimate gameplay still work.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.injectedDamageRejected >= 4 && target.injectedDamageApplied >= 1) {
        done = true;
        complete("4 unpaired OPK attempts rejected, 1 paired damage accepted. Server-side fire-pairing closes M58 attack at the source. Same single-line-fix pattern as M53 auth on privileged handlers.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
