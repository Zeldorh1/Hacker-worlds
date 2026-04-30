// Mission 31 — PACKET CRAFT
//
// Reading packets is half the lesson — the real exploit is REWRITING
// them on the way out. Your DLL's send-hook returns a modified
// packet object; the simulator applies the modified version, not
// the original. fire() emits {type:"damage", target, amount=25, t}.
// If your hook bumps amount to 999 before returning, the enemy
// takes 999 damage. Real-world: edit the bytes in the WSAS send()
// buffer before the syscall hits the wire.
//
// Real games defend with HMAC signatures on each packet so a
// modified packet fails the server's MAC check. Naive games
// (and AssaultCube specifically) don't, so packet-craft works
// directly.
//
// Mission flow:
//   1. Template's pre-loaded with a send-hook that intercepts
//      damage packets and rewrites amount.
//   2. Compile + Inject.
//   3. Fire once. Each shot now deals 999. One-shot any enemy.
//   4. Drop 4 contacts.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M31 — PACKET CRAFT
//
// Hook send. Watch for damage packets. Rewrite their 'amount' field
// before they reach the server. Return the modified packet.
//
// In real C++ on a Windows game this would be a MinHook detour on
// ws2_32!send: read the buffer, check the packet header to identify
// damage packets, edit the relevant bytes, let send() proceed with
// the modified buffer.

void onInject() {
  log("packet-craft DLL loaded — damage packets will be rewritten");

  register_packet_hook("send", function(pkt) {
    if (pkt.type === "damage") {
      log("crafting damage packet: " + pkt.amount + " → 999");
      pkt.amount = 999;
    }
    return pkt;   // forward (possibly modified)
  });
}

void onTick() { }
`;

export const mission31 = {
  id: "m31",
  title: "PACKET CRAFT",
  brief: "Hook send. Rewrite damage packets to 999. One-shot the room.",
  prerequisites: ["m30"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  network: true,

  hints: [
    {
      id: "compile-inject",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Template hooks send. When a damage packet flies past, the hook rewrites amount=999. Compile + Inject.",
    },
    {
      id: "fire",
      when: ({ dllState, target }) =>
        dllState.running && target.killCount < 4,
      say: "Hook is live. Fire at any enemy — they die in one shot regardless of HP. Drop all 4.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableESP();
    target.enableNetwork();
    target.player.ammo = 50;

    dialog.script("VEX", [
      "Step up from inspection. Now you REWRITE packets in flight.",
      "fire() emits {type:'damage', target, amount, t}. Default amount = 25 (M11 territory). Your send-hook can swap it to 999 before the simulator applies it.",
      "Real games defend with HMAC signatures — modified packets fail the server's MAC check. Naive games (AssaultCube included) don't sign packets, so this exploit works as-is.",
      "Compile + Inject. Fire once at any enemy. 999 damage = one-shot. Drop all 4 contacts.",
    ]);

    let done = false;
    const dllRuntime = window.__hw && window.__hw.dll;

    const interval = setInterval(() => {
      if (done) return;
      if (!dllRuntime) return;
      // Win: DLL running with at least one send-hook + 4 kills.
      const hasSendHook = dllRuntime.packetHooks &&
        dllRuntime.packetHooks.some(h => h.direction === "send");
      if (dllRuntime.running && hasSendHook && target.killCount >= 4) {
        done = true;
        complete("Crafted packets dropped 4 contacts. Same exploit class as 'I sent the server a 999-damage packet and they believed me.'");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
