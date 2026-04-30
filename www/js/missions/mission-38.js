// Mission 38 — HMAC PACKETS
//
// Server upgrade. Every outgoing packet now gets HMAC-signed from
// a session key. Server-side validator drops packets whose hmac
// doesn't match. M31's craft-amount=999 modifies the packet AFTER
// it was signed → hmac stale → packet rejected → no damage.
//
// Bypass: find the session key in memory (it's a bound cell —
// session.hmac_key — same workflow as any other cell). After
// mutating, call compute_hmac(pkt, key) to re-sign. Now the
// modified packet validates and the damage applies.
//
// Real-world equivalent: many competitive games sign packets with
// a per-session key derived during handshake. To craft, you have
// to either (a) find the key in memory and re-sign, or (b) hook
// the function that signs and craft BEFORE it runs. M38 covers (a)
// since the simulator's signing is automatic.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M38 — HMAC PACKETS
//
// Server signs every outgoing packet with a session key, then
// validates on receive. Modify a field → hmac stale → rejected.
//
// Bypass:
//   1. Read the session key from memory (label "session.hmac_key").
//   2. Mutate the packet (M31 craft-style).
//   3. Re-compute hmac with the key.
//   4. Attach the new hmac before returning.

void onInject() {
  log("hmac-aware packet craft DLL loaded");

  register_packet_hook("send", function(pkt) {
    if (pkt.type !== "damage") return pkt;
    // Mutate the damage value.
    pkt.amount = 999;
    // Re-sign so the server's validator accepts.
    const key = read_label("session.hmac_key");
    pkt.hmac = compute_hmac(pkt, key);
    return pkt;
  });
}

void onTick() { }
`;

export const mission38 = {
  id: "m38",
  title: "HMAC PACKETS",
  brief: "Server signs every packet. Find the key, re-sign your craft.",
  prerequisites: ["m37"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  network: true,

  hints: [
    {
      id: "try-naive-craft",
      min: 6,
      when: ({ dllState, target }) =>
        !dllState.running ||
        (dllState.running && target.network.hmac.rejected === 0),
      say: "Read the template — it craft-mutates damage AND re-signs. Compile + Inject. Each shot's craft survives the hmac check because compute_hmac() recomputes after the mutation.",
    },
    {
      id: "fire",
      when: ({ target }) => target.killCount < 4,
      say: "Re-signed packets one-shot enemies (amount=999). Fire 4 times. Mission complete.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableESP();
    target.enableNetwork();
    target.enableHmac(0xCAFE1234);
    target.player.ammo = 30;

    dialog.script("VEX", [
      "Server upgrade #2: every outgoing packet now signed with a session key. Modified packets fail the hmac check and are dropped.",
      "M31's naive craft (just bump amount) gets rejected: mutated → hmac stale → server drops → no damage.",
      "Bypass: read the key from memory (label session.hmac_key), mutate the packet, then re-sign with compute_hmac(pkt, key). Server validator now accepts the new sig.",
      "Template does it all in 6 lines. Compile + Inject, fire 4 times, drop the room. Same workflow as finding session keys in real games and re-signing manually.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.killCount >= 4) {
        done = true;
        complete("4 kills past the hmac validator. Re-signed packets are how craft survives signed-packet defenses in real games.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
