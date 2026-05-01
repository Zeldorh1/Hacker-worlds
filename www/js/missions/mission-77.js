// Mission 77 — SERVER-SIDE GOD MODE
//
// The other half of the OWNER-TIER package. M51's god mode flipped a
// CLIENT-side flag — the cheater's HP cell got pinned. M77 is the
// SERVER-SIDE version: damage events targeting the privileged session
// are dropped on receipt at the server. Hits register, but the server
// never decrements HP.
//
// Why this is more powerful than M51: M51 only protects against
// damage your own client computes locally. M77 protects against
// damage OTHER PLAYERS deal you — including OPK packets (M58),
// damage from snipers, even legitimate hits from real players.
// The server simply refuses to apply it.
//
// Real-world historical context (per the AS/GA brief): "highly
// aggressive localized God Modes that ignored damage packets from
// other players" — this is that mechanism. Configured server-side
// via a magic-packet command flip, no auth check.
//
// Mission flow:
//   1. Snipers active. Bullets hit. HP drops.
//   2. Player sends magic packet to ID 175 → damageImmune = true.
//   3. Snipers keep firing AND hitting. But each hit registers
//      "hitCount++" without applying damage.
//   4. Win: 15+ sniper hits accumulated AND HP still 100.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M77 — SERVER-SIDE GOD MODE
//
// Real LithTech / Combat Arms:
//   CAutoMessage Msg;
//   Msg.Writeuint8(175);          // ID_DamageImmune (or similar)
//   pSendToServer(Msg.Read(), GUARANTEED);
//
// Server flips session.damageImmune. From that moment, damage events
// targeting this session are dropped at the server. Even legit hits
// from real players don't decrement HP.
//
// More powerful than client-side godmode (M51): protects against
// every source of damage including OPK injection (M58), real
// player fire, environmental hazards on server tick — anything
// that flows through the server's damage pipeline.

void onInject() {
  log("Sending ID_DamageImmune (175) to enable server-side god mode");

  const result = call_engine_function("send_to_server", 175);
  if (result && result.ok) {
    log("Server honored damage-immune — hits register but no damage applies");
  } else {
    log("Rejected: " + (result ? result.reason : "unknown"));
  }
}

void onTick() { }
`;

export const mission77 = {
  id: "m77",
  title: "SERVER-SIDE GOD MODE",
  brief: "Server drops damage events targeting your session. Hits register, HP doesn't move.",
  prerequisites: ["m51", "m76"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "🛡",
    title: "SERVER-SIDE GOD MODE — THE STRONGEST IMMUNITY TIER",
    body: `M51 flipped a CLIENT flag — your local HP didn't
decrement. But the server still tracked HP normally,
and any server-side damage logic could still kill you.

M77 is the server-side version: damage events
TARGETING you get dropped at the SERVER on receipt.
The server's damage pipeline never reaches your HP
state. Hits register at the visual layer (you see
the muzzle flash, the hit-flash on you), but no
damage actually applies.

This is the strongest tier. Protects against:
  - Snipers / NPC fire
  - Real player fire
  - OPK packet injection (M58 attack against you)
  - Environmental hazards on server tick

The historical AS/GA brief described this as
"highly aggressive localized God Modes that ignored
damage packets from other players." Same mechanism:
session.damageImmune = true via magic-packet flip.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template sends ID 175 via call_engine_function. Compile + Inject.",
    },
    {
      id: "verify-immune",
      min: 4,
      when: ({ target, dllState }) =>
        dllState.running && !target.session.damageImmune,
      say: "DLL running but damageImmune still false. Check console — the engine call should show 'ok'. The mission registered ID 175 as the handler.",
    },
    {
      id: "wait-for-hits",
      when: ({ target }) =>
        target.session.damageImmune && target.snipers.hitCount < 15,
      say: "Immunity active. Snipers ARE hitting you (you'll see the counter climb), but HP doesn't drop. Stand still and let them work — 15 hits to close.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableNetwork();
    target.enableSnipers();

    // Server handler at ID 175 — flips damageImmune.
    target.serverHandlers.set(175, {
      auth: false,
      handler: (session) => { session.damageImmune = true; },
    });

    target._m77StartHits = target.snipers.hitCount;
    // Bring snipers closer in by setting a larger hit radius — make
    // sure they can actually land hits without anti-aim.
    target.snipers.hitRadius = 999;   // always within range
    target.snipers.fireIntervalMs = 350;  // fire fast

    dialog.script("VEX", [
      "Snipers are at point-blank range and firing fast — without intervention you die in seconds.",
      "M51 client-side godmode would only protect from damage your client computed locally. M77 is server-side: damage events targeting you get dropped at the server on receipt.",
      "Send ID 175. Snipers keep firing AND hitting (you'll see hitCount climb, hit flashes if not damageImmune). But the SERVER refuses to apply damage. HP stays at 100 forever.",
      "Win: 15 hits accumulated, HP still 100. Same primitive that made AS/GA owners untouchable.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      const hits = target.snipers.hitCount - target._m77StartHits;
      if (hits >= 15 && target.session.damageImmune && target.player.hp >= 100) {
        done = true;
        complete("15 hits taken, HP still 100. Server dropped every damage event before applying it. Strongest immunity tier in the cheat scene.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
