// Mission 75 — ANTI-AIM / FAKE ANGLES
//
// The technique that powers the entire modern competitive cheat scene
// (CS:GO/CS2 Onetap, Apex AimJunkies, Valorant cheats). Your client
// sends a fake position to the server. Other clients (and their
// aimbots) target the fake. Server-side hit detection uses the
// fake. Result: aimbots lock onto where you're "visible" but your
// real hitbox is somewhere else entirely.
//
// In our 2D simulator the equivalent of "fake angle" is a fake (x,y)
// in the outgoing position packet. The simulator's snipers fire at
// server.canonicalPos (which is whatever your last position-packet
// reported). Hit detection compares canonicalPos to your REAL
// position. With anti-aim active they diverge — every shot misses.
//
// Mission flow:
//   1. Snipers turn on, fire every 0.8s. Without anti-aim, they hit.
//   2. Player installs a packet hook on outgoing "position" packets,
//      rewriting x/y to fake values offset from real.
//   3. Server's canonicalPos updates to the fake values.
//   4. Snipers fire at canonicalPos = fake; player real pos elsewhere
//      = miss.
//   5. Win: 10 sniper misses with HP > 50.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M75 — ANTI-AIM / FAKE ANGLES
//
// register_packet_hook("send", fn) intercepts outgoing packets.
// For "position" packets, rewrite x/y to fake values offset from
// real. Server's last-known pos diverges from your real pos.
// Snipers fire at the fake; you survive.
//
// Real CS:GO/CS2 equivalent: rewrite the rotation field of the
// movement packet (m_angEyeAngles or similar) to fake yaw/pitch.
// Same idea — server believes the rotation, hitbox calc uses it,
// aimbots lock onto a position your hitbox isn't actually at.

const FAKE_OFFSET_X = 6;
const FAKE_OFFSET_Y = 6;

void onInject() {
  log("Installing anti-aim packet hook");

  let rewrites = 0;
  register_packet_hook("send", function(pkt) {
    if (pkt.type === "position" && typeof pkt.x === "number") {
      pkt.x = pkt.x + FAKE_OFFSET_X;
      pkt.y = pkt.y + FAKE_OFFSET_Y;
      rewrites++;
      if (rewrites % 10 === 0) {
        log("Rewrote " + rewrites + " position packets — server tracking fake pos");
      }
    }
    return pkt;
  });
}

void onTick() { }
`;

export const mission75 = {
  id: "m75",
  title: "ANTI-AIM / FAKE ANGLES",
  brief: "Lie to the server about where you are. Their aimbots fire at the fake. You survive.",
  prerequisites: ["m54"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "🌀",
    title: "ANTI-AIM — THE COMPETITIVE-CHEAT FOUNDATION",
    body: `Modern competitive shooter cheats are 80% anti-aim
and 20% aimbot. Why? Because aim BOTS are caught by
behavior heuristics — but a player who 'mysteriously
gets missed' is hard to detect.

Mechanism:
  Your client sends position+rotation each frame.
  Cheat hooks the OUTGOING packet, rewrites rotation
  to fake values. Server broadcasts the fake to other
  clients. Their aimbots target the fake. Server-side
  hit detection uses the fake. Result: shots miss
  because the actual hitbox isn't where it's reported
  to be.

In our 2D sim: same idea, just X/Y instead of yaw/pitch.
Snipers will fire at server.canonicalPos. Hook
position packets, offset x/y by 6 each, snipers miss.

Variants in real cheats:
  - Static (180° back)
  - Spinbot (cycling yaw)
  - Lower-body desync (Source-engine quirk)
  - Jitter (rapid flicker between two angles)`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template installs a 'send' hook that rewrites position.x/y to fake values. Compile + Inject.",
    },
    {
      id: "move-to-trigger",
      min: 4,
      when: ({ target, dllState }) =>
        dllState.running && target.snipers.hitCount + target.snipers.missCount < 3,
      say: "Hook is live. Tab to ac_anomaly and walk around — every move emits a position packet, your hook rewrites it, server tracks fake pos, snipers miss. Take a few steps to get the cycle going.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableNetwork();
    target.enableSnipers();
    target._m75StartHits = target.snipers.hitCount;
    target._m75StartMisses = target.snipers.missCount;

    // Auto-walk the player so position packets fire even if the
    // player is idle — keeps canonicalPos updating.
    let nudgeI = 0;
    const nudgeInterval = setInterval(() => {
      if (target.paused || target.player.alive !== 1) return;
      const dx = (nudgeI % 4 < 2) ? 1 : -1;
      const dy = ((nudgeI / 2) | 0) % 2 ? 1 : -1;
      try { target._tryMove && target._tryMove(dx, 0); } catch {}
      try { target._tryMove && target._tryMove(0, dy); } catch {}
      nudgeI++;
    }, 350);

    dialog.script("VEX", [
      "Snipers are live. Without intervention they'll drop your HP fast — they fire every ~0.8s and they don't miss.",
      "Anti-aim says: don't move out of the way, lie about WHERE you are. Hook outgoing position packets, rewrite x/y to fake values. Server still gets a position, just the WRONG one.",
      "Snipers aim at the server's last-known pos = fake. Your real position is elsewhere = miss. They keep firing forever; nothing lands.",
      "Win: 10 misses with HP > 50. Walk around (or stand still — auto-walk fires packets for you) and watch the miss counter climb.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      const misses = target.snipers.missCount - target._m75StartMisses;
      if (misses >= 10 && target.player.hp >= 50) {
        done = true;
        complete("10 sniper misses with HP intact. Server tracked fake position; their hit detection used the fake; nothing landed. Same primitive every modern competitive cheat ships as the foundation of its 'invisibility'.");
        clearInterval(interval);
        clearInterval(nudgeInterval);
      }
    }, 250);

    return () => {
      clearInterval(interval);
      clearInterval(nudgeInterval);
    };
  },
};
