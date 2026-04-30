// Mission 30 — PACKET INSPECTION
//
// First mission of the network track. The simulator now has a
// 'network layer': fire(), movement, kill events all emit packets
// through _sendPacket() / _recvPacket(). Your DLL hooks them via
// register_packet_hook("send"|"recv", fn). The hook function gets
// each packet object; return it as-is (inspect-only), modify it,
// or return null to drop it.
//
// Real-world equivalent: a MinHook detour on ws2_32!send and
// ws2_32!recv that intercepts every UDP/TCP packet the game sends
// or receives. From there you log, modify, drop, replay.
//
// Mission setup:
//   - network: true. fire() routes damage through packets.
//     position emits on every move. kill events arrive as recv.
//   - DLL template registers send + recv hooks that log each
//     packet to the console with log().
//   - Player runs around, fires a few shots, watches packets
//     stream through the console.
//   - Win = DLL has logged 20+ packets via its own log() calls.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M30 — PACKET INSPECTION
//
// register_packet_hook(direction, fn) — direction is "send" or "recv".
// fn(packet) is called for every matching packet.
// Return packet as-is (inspect), modified packet, or null to drop.
//
// Common packet types in this sim:
//   {type:"damage",      target, amount, t}    — fire() emits these
//   {type:"position",    x, y, t}              — emitted on each move
//   {type:"kill_credit", target, t}            — when an enemy dies
//   {type:"you_died",    t}                    — when server kills you

let pktCount = 0;

void onInject() {
  log("packet inspector loaded — hooks attached to send + recv");

  register_packet_hook("send", function(pkt) {
    pktCount++;
    log("SEND #" + pktCount + " " + JSON.stringify(pkt));
    return pkt;   // inspect-only, don't modify
  });

  register_packet_hook("recv", function(pkt) {
    pktCount++;
    log("RECV #" + pktCount + " " + JSON.stringify(pkt));
    return pkt;
  });
}

void onTick() { }
`;

export const mission30 = {
  id: "m30",
  title: "PACKET INSPECTION",
  brief: "Hook send + recv. Log every packet flowing to and from the server.",
  prerequisites: ["m29"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  network: true,

  hints: [
    {
      id: "compile-and-inject",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Read the template — it registers send + recv hooks that log each packet. Compile + Inject. Console will start filling with packets the moment you do anything.",
    },
    {
      id: "generate-traffic",
      min: 4,
      when: ({ dllState, target }) =>
        dllState.running && target.network && target.network.log.length < 20,
      say: "Walk around to emit position packets. Fire to emit damage packets. Each one prints to the DLL console. We need 20+ packets logged.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableESP();
    target.enableNetwork();
    target.player.ammo = 100;

    dialog.script("VEX", [
      "Network layer's online. Every fire(), every move, every kill credit goes through a packet pipeline now.",
      "Template attaches inspector hooks to both send AND recv. Each packet logs to the DLL console with type + payload — same shape you'd see decoded in Wireshark on a real game.",
      "Compile + Inject. Walk around, fire a few shots, watch the console fill. We need 20 packets logged before the contract closes.",
      "Real-world this exact pattern is how every multiplayer-game cheat starts: hook ws2_32!send, log, understand the protocol, THEN start crafting. M31 jumps to crafting next.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.network.log.length >= 20) {
        done = true;
        complete("Hooks logged 20+ packets. You've got the protocol — next mission crafts them.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
