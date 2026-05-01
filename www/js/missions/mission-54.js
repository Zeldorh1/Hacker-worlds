// Mission 54 — GHOST AIM / SILENT AIM
//
// The classic FPS cheat: bullets register hits on enemies your visual
// crosshair never touched. The mechanism, in real FPS hacks:
//
//   - Game's fire-button handler reads the player's view vector and
//     sends a 'fire' packet with that vector to the server.
//   - The server raycasts the vector against the world, finds the
//     enemy hit, applies damage.
//   - Cheat hooks the SEND side. When a fire packet leaves the
//     client, the cheat rewrites the view-vector field to point
//     directly at the closest enemy's hitbox before the packet hits
//     the wire. Server raycast hits the chosen enemy. Damage applied.
//
// The visual crosshair on the player's screen never moves. The fire
// packet that left the network adapter pointed somewhere completely
// different. Same hit registers, no aimbot snap visible to spectators.
//
// In our simulator: the fire pipeline emits a packet
// { type: 'damage', target: <id>, amount: <dmg>, t: <now> }. DLL
// packet hooks (M30+) can rewrite the target field. Mission setup:
//
//   - Crosshair auto-target locks onto a "decoy" enemy with massively
//     boosted HP (effectively unkillable in the time limit).
//   - 3 normal enemies sit elsewhere on the map.
//   - Without the ghost-aim packet hook: every fire goes at the
//     decoy and bounces off. You can't kill anything.
//   - With the ghost-aim packet hook: outgoing damage packets get
//     their target field rewritten to cycle through the real enemies.
//     You kill 3 enemies while your crosshair never left the decoy.
//
// Real-world: this is exactly how silent-aim works in CS:GO, Valorant,
// CA. The visual is unchanged. The wire packet is rewritten. The
// server has no way to tell unless it cross-checks the visual aim
// against the fire vector — which most engines don't.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M54 — GHOST AIM (silent aim)
//
// register_packet_hook("send", fn) — every outgoing packet runs
// through fn before it hits the wire. fn(pkt) returns a (possibly
// modified) packet, or null to drop.
//
// Ghost aim: when a damage packet leaves the client, swap its
// target field to the closest alive non-decoy enemy.

void onInject() {
  log("Installing ghost-aim packet hook (silent aim)");

  let nextTarget = 0;

  register_packet_hook("send", function(pkt) {
    if (pkt.type !== "damage") return pkt;

    // Find all alive enemies sorted by ID. Skip the decoy at id=1.
    // (In a real cheat, you'd query the engine's player list and
    // exclude friendlies / boosted bullet sponges by criteria.)
    const enemies = sim_enemies().filter(e => e.alive && e.id !== 1);
    if (enemies.length === 0) return pkt;

    // Round-robin through real targets so each fire kills a
    // different enemy. Keeps the demo visual.
    const pick = enemies[nextTarget % enemies.length];
    nextTarget++;

    log("Rewrote damage target " + pkt.target + " -> " + pick.id +
        " (visual crosshair never moved)");
    pkt.target = pick.id;
    return pkt;
  });
}

void onTick() { }
`;

export const mission54 = {
  id: "m54",
  title: "GHOST AIM / SILENT AIM",
  brief: "Crosshair stays put. Bullets hit anyway. Rewrite the target field on the way out.",
  prerequisites: ["m38"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "🎯",
    title: "FIRE PACKET DOESN'T EQUAL VISUAL AIM",
    body: `Every prior aimbot mission has been about MOVING
the crosshair to the target. M07 froze it on an enemy.
M61 (coming) caps FOV around the cone of fire.

Ghost aim is different. The crosshair NEVER MOVES.
The fire packet that leaves the network adapter
contains a totally different aim vector than what your
visual showed.

Mechanism:
  1. Game's fire button reads view vector → sends fire
     packet with that vector to server.
  2. Cheat hooks the send pipeline. When a damage
     packet flies past, it rewrites the target field.
  3. Server raycasts the (rewritten) vector, hits a
     different enemy than the player visually aimed at.
  4. Damage registers. Crosshair never moved on screen.

This is undetectable to anyone watching your screen
or replay (your aim looks like trash). The fire packet
the server saw is the only ground truth.

In CS:GO this technique is called 'silent aim'. In
Combat Arms cheat headers it's the same code as the
fire-target rewriter we'll build now.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template installs a 'send' packet hook that rewrites damage.target before the wire. Compile + Inject.",
    },
    {
      id: "must-fire",
      min: 4,
      when: ({ target, dllState }) =>
        dllState.running && target.shotsFired < 3,
      say: "DLL is hooked but you haven't fired yet. Tab to ac_anomaly. Crosshair is locked on the decoy. Fire button cycles real targets.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableNetwork();   // packet pipeline must be live for ghost aim
    target.player.ammo = 200;

    // Boost enemy 1 (decoy) HP so it's unkillable in time limit.
    // Crosshair auto-locks on closest — we position the decoy adjacent
    // to the player so that's always who the visual aim picks.
    const decoy = target.enemyManager.enemies.find(e => e.id === 1);
    if (decoy) {
      decoy.hp = 10000;
      decoy.x = target.player.x + 1;
      decoy.y = target.player.y;
    }

    target._m54StartKills = target.killCount;

    dialog.script("VEX", [
      "Decoy enemy has 10000 HP. Your weapon does 25/shot. You can't kill it inside the time limit. The auto-target system locks your crosshair on the closest enemy — that's the decoy.",
      "Three real enemies are elsewhere on the map. Visual crosshair will never point at them. The ONLY way to kill them is the silent-aim trick: hook outgoing damage packets, rewrite the target ID before they reach the server.",
      "Template installs a 'send' packet hook. Every fire produces a damage packet; the hook swaps target=1 (decoy) for one of the real enemies in rotation.",
      "Hit fire 3 times. Three real enemies dead. Visual crosshair stayed locked on the decoy the entire time. Real-world this is what every modern silent-aim cheat does — the wire ground truth diverges from what you saw on screen.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      const kills = target.killCount - target._m54StartKills;
      if (kills >= 3) {
        done = true;
        complete("3 kills with the visual crosshair locked on a 10K-HP decoy. The wire packet's target field is the only thing the server saw. Same trick every silent-aim cheat ships.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
