// Mission 59 — LAG WALK / DESYNC
//
// The technique: drop or delay outgoing position updates. The
// server's last-known position for you stays stale. Anti-cheat
// systems and other players see you "where you used to be" — but
// damage you receive is calculated against the (stale) server
// position, not your real one. Result: you can stand inside a
// damage zone the server thinks you're not in, or vice versa.
//
// Real C++:
//
//   register_packet_hook("send", function(pkt) {
//       if (pkt.type === "position_update") return null;   // drop it
//       return pkt;
//   });
//
// Or with selective drops based on conditions (e.g., when entering
// a damage zone). Some implementations queue and re-send later in
// a burst, creating the classic "rubber band" appearance to other
// players.
//
// Why this works: client-authoritative movement. The server trusts
// the client to report its position. M37 added server-side
// validation that rejects impossible jumps — but a STALE position
// (no update at all) doesn't trigger that check. The server just
// keeps the last value.
//
// In our simulator:
//   - target.server.canonicalPos tracks the last position the server
//     saw (set by recv'd position_update packets).
//   - hazard ticks check session.solidFlag (M65) AND now also
//     check whether server.canonicalPos is in the hazard zone.
//   - When position updates are dropped, server.canonicalPos stays
//     at the entry point while the player physically walks through.
//   - Hazard damage applies based on server-tracked position.
//
// Mission flow:
//   1. Player needs to cross a hazard zone (5 tiles wide).
//   2. Without intervention: hazard ticks based on real position,
//      player loses HP per second crossing.
//   3. With lag walk packet hook: outgoing position packets are
//      dropped while in the zone. Server thinks player is still
//      at the entry point. Hazard damage check (using server pos)
//      sees player as "outside the zone" → no damage.
//   4. Win: cross the zone with HP > 90.
//
// Lesson: server-authoritative state requires server-RECEIVED
// updates. Stale data is silently dangerous unless the server
// times out missing updates and disconnects.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M59 — LAG WALK (drop outgoing position packets)
//
// Real cheat:
//   register_packet_hook("send", function(pkt) {
//       if (pkt.type === "position") return null;
//       return pkt;
//   });
//
// Server's last-known position stays at where you were when you
// installed the hook. Hazard / damage checks that key off
// server-tracked position miss you while you walk.

void onInject() {
  log("Installing position-packet drop hook");

  let dropped = 0;
  register_packet_hook("send", function(pkt) {
    if (pkt.type === "position") {
      dropped++;
      if (dropped % 5 === 0) log("Dropped " + dropped + " position updates");
      return null;   // drop
    }
    return pkt;
  });
}

void onTick() { }
`;

export const mission59 = {
  id: "m59",
  title: "LAG WALK / DESYNC",
  brief: "Drop outgoing position updates. Server's last-known position stays put while you walk.",
  prerequisites: ["m37"],
  timeLimit: 180,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "📡",
    title: "DESYNC THE SERVER'S POSITION TRACK",
    body: `M37 taught server-side position validation. The
server checks that your reported position changes
are physically possible (no teleporting).

But what if you stop reporting at all? The validation
fires on EACH update. No update means no check. Your
last-known position stays frozen on the server.

Cheat: drop outgoing position packets via send-hook.
Damage zones, AI targeting, and other-player view
calculations all key off server-tracked position.
Server thinks you're still at the entry point. You
walk through the hazard zone unscathed.

Real-world fix: server-side timeout-and-disconnect.
If a client doesn't send a position update for N
seconds, kick them. Most older FPS engines didn't
implement this — Combat Arms didn't until very late.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template installs a 'send' hook that drops every 'position' packet (returns null). Compile + Inject.",
    },
    {
      id: "walk",
      when: ({ target, dllState }) =>
        dllState.running && (target._m59CrossedAt || 0) === 0,
      say: "Hook is live. Walk into the hazard zone (red tiles). Without the hook your HP would drain fast — with it, the server thinks you never entered, no damage applies.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableHazards();
    target.enableNetwork();

    // Track server-side position separately from client-side. Server
    // position only updates when a 'position' packet is received.
    target.server.canonicalPos = { x: target.player.x, y: target.player.y };

    // Install a recv-side hook on position packets so the server
    // tracks them. This is the simulator's analogue of the server-
    // side packet handler updating its position state.
    target._m59RecvHandler = (pkt) => {
      if (pkt && pkt.type === "position") {
        target.server.canonicalPos.x = pkt.x;
        target.server.canonicalPos.y = pkt.y;
      }
    };

    // Hook into _sendPacket: route a copy of every position packet
    // through the server-handler IF it survived the DLL hooks. We
    // achieve this by patching _sendPacket to call our handler with
    // the (possibly-dropped) result.
    if (!target._m59OrigSendPacket) {
      target._m59OrigSendPacket = target._sendPacket.bind(target);
      target._sendPacket = function(pkt) {
        const result = target._m59OrigSendPacket(pkt);
        if (result && target._m59RecvHandler) target._m59RecvHandler(result);
        return result;
      };
    }

    // Hazard damage gating: while server.canonicalPos is OUTSIDE the
    // hazard zone, hazard ticks skip the player. We track this via a
    // simple distance check: if the canonical position is more than 2
    // tiles from any hazard tile, treat the player as "not in zone."
    target._m59OrigHazardCheck = target._inHazardZone || null;
    // We hook into the hazard system more directly: override the
    // condition that triggers hazard_apply. Cleanest approach: the
    // hazard zone is identified by `hazardsActive`. Add a per-tick
    // gate based on canonical position.
    target._m59HazardGate = () => {
      // Hazards apply ONLY if server thinks player is in the zone.
      // Map's hazard tiles are at y >= MAP_H/2 - 1 in the existing
      // sim. We'll model that as: server.canonicalPos.y is in
      // [hazardYStart, hazardYEnd].
      const cy = target.server.canonicalPos.y;
      const inZone = cy >= 8 && cy <= 12;
      return inZone;
    };

    target._m59StartedAt = performance.now();
    target._m59CrossedAt = 0;

    dialog.script("VEX", [
      "Hazard zone runs across the middle of the map. Crossing it normally costs HP per second. We'll prove the server-tracked position is what damage actually keys off.",
      "Template drops every outgoing 'position' packet. Server's last-known position freezes at your starting tile. Damage system (which reads server position) thinks you're still at the spawn — outside the zone.",
      "Walk all the way across. HP doesn't move. Real-world: this is the lag-walk / desync class of bug. Combat Arms shipped this for years — fix is server-side timeout on stale clients.",
      "Get to y >= 12 with HP intact to close.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      // Apply our hazard gate by overriding the codeSegment behavior.
      // Original hazard_apply unconditionally damages the player while
      // hazardsActive. We add a session-style flag check here: if the
      // server doesn't think we're in the zone, restore HP if it
      // dropped (the damage that did get applied was 'on the wire'
      // but server reconciliation rejected it).
      const inZoneServer = target._m59HazardGate ? target._m59HazardGate() : true;
      if (!inZoneServer && target.player.hp < 100) {
        target.player.hp = Math.min(100, target.player.hp + 1);
      }
      // Win: client-side player walked across (y >= 12) with high HP.
      if (target.player.y >= 12 && target.player.hp >= 90) {
        if (target._m59CrossedAt === 0) target._m59CrossedAt = performance.now();
        if (performance.now() - target._m59CrossedAt > 800) {
          done = true;
          complete("Crossed the hazard zone with HP intact. Server's last-known position never updated — every damage check thought you were still at spawn. Lag-walk / desync class.");
          clearInterval(interval);
        }
      }
    }, 100);

    return () => {
      clearInterval(interval);
      // Restore the original _sendPacket if we patched it.
      if (target._m59OrigSendPacket) {
        target._sendPacket = target._m59OrigSendPacket;
        target._m59OrigSendPacket = null;
      }
    };
  },
};
