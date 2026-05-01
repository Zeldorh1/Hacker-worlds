// Mission 76 — SERVER-SIDE STEALTH (the GameAnarchy/AS owner trick)
//
// The exclusive feature only the cheat-shop owners had: appear in the
// game as a regular player but be COMPLETELY INVISIBLE to other
// clients' ESP / aimbots / chams. Their model rendered for them but
// the server didn't broadcast their position to anyone else. Other
// cheaters' wallhacks had nothing to draw a box around because the
// data simply didn't exist on those clients.
//
// Mechanism (per the historical record): a server-trusted command
// packet flipped a "stealth" flag on the session. From that moment,
// the server's position-broadcast routine excluded that session.
//
// In the simulator: send a magic packet to ID 250 (stealth), the
// session.broadcastDisabled flag flips true, and the snipers system
// stops firing entirely — they have no canonicalPos to track because
// the server never updated it for them. Even if the player walks
// around, snipers can't see where to aim.
//
// Mission flow:
//   1. Snipers active, firing at player position.
//   2. Player's HP drops fast.
//   3. Player sends magic packet to ID 250 → broadcastDisabled = true.
//   4. Snipers go silent. Player walks around freely, no damage.
//   5. Win: survive 12s with HP > 50 after enabling stealth.
//
// Different from M75 anti-aim: M75 sends FAKE positions; the server
// still broadcasts SOMETHING. M76 sends NOTHING — the server doesn't
// even know where the player is. Different attack surface, different
// detection profile.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M76 — SERVER-SIDE STEALTH
//
// Real LithTech / Combat Arms (per leaked history):
//   CAutoMessage Msg;
//   Msg.Writeuint8(250);          // ID_Stealth (or similar)
//   pSendToServer(Msg.Read(), GUARANTEED);
//
// Server flips session.broadcastDisabled. Position never goes out
// to other clients. Their ESP / aimbots / wallhacks see nothing.
//
// This is the feature only the AS/GA OWNERS had — never sold to
// customers. No client-side AC layer can detect this because the
// cheat doesn't write memory or hook anything controversial. It
// just sends one byte.

void onInject() {
  log("Sending ID_Stealth (250) to flip session.broadcastDisabled");

  const result = call_engine_function("send_to_server", 250);
  if (result && result.ok) {
    log("Server honored stealth — snipers can't see you anymore");
  } else {
    log("Server rejected: " + (result ? result.reason : "unknown"));
  }
}

void onTick() { }
`;

export const mission76 = {
  id: "m76",
  title: "SERVER-SIDE STEALTH",
  brief: "Single-byte packet → server stops broadcasting your position. ESP, aimbots, wallhacks all blind.",
  prerequisites: ["m51", "m75"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "👻",
    title: "STEALTH — THE OWNER-TIER FEATURE",
    body: `The exclusive feature AugmentedSkills and
GameAnarchy owners had — never sold to customers.

In a lobby they appeared as regular low-rank players,
but other cheaters' ESP couldn't see them. Aimbots
couldn't lock. Chams had nothing to draw on.

Why: server-trusted command flipped a stealth flag
on their session. From that moment, the server
excluded them from position broadcasts to other
clients. Without server-broadcast data, no client-
side cheat can render or target them.

The whole exploit is one byte. No memory writes, no
render hooks, nothing for client-side AC to detect.
Only the server could have stopped it — by adding
auth on the handler (M53 territory). Nexon never did.

Mission: send ID 250 magic packet. Snipers go silent.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template sends one byte (ID 250) via call_engine_function('send_to_server', 250). Compile + Inject.",
    },
    {
      id: "verify",
      min: 4,
      when: ({ target, dllState }) =>
        dllState.running && !target.session.broadcastDisabled,
      say: "DLL running but broadcastDisabled is still false. Check the DLL console — the engine call should show 'ok'. If it shows 'unknown_id' the mission's server handler isn't registered yet.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableNetwork();
    target.enableSnipers();

    // Server handler at ID 250 — flips broadcastDisabled.
    target.serverHandlers.set(250, {
      auth: false,
      handler: (session) => { session.broadcastDisabled = true; },
    });

    target._m76StartedAt = performance.now();

    dialog.script("VEX", [
      "Snipers are firing at you. Without anti-aim or stealth, your HP drops fast.",
      "M75 lied about your position — server broadcasts FAKE values. M76 says NOTHING — server stops broadcasting your position entirely. Snipers / ESP / aimbots have no data to work with.",
      "Send ID 250 magic packet. Server flips session.broadcastDisabled = true. From that moment forward, your position never leaves the server. Snipers go silent because they have nothing to aim at.",
      "Survive 12s after enabling stealth with HP > 50 to close. Real-world: this was the AS/GA OWNER-TIER exclusive feature. Customers never got it.",
    ]);

    let done = false;
    let stealthSinceMs = 0;
    const interval = setInterval(() => {
      if (done) return;
      const elapsed = performance.now() - target._m76StartedAt;
      if (target.session.broadcastDisabled) {
        if (stealthSinceMs === 0) stealthSinceMs = performance.now();
        const stealthFor = performance.now() - stealthSinceMs;
        if (stealthFor >= 12000 && target.player.hp >= 50) {
          done = true;
          complete("12 seconds in stealth, HP intact. Snipers couldn't see you. Same primitive AS/GA owners reserved as their exclusive — single byte to the server, complete invisibility to every client-side detection.");
          clearInterval(interval);
        }
      } else {
        stealthSinceMs = 0;
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
