// Mission 58 — OPK / DAMAGE PACKET INJECTION
//
// "One Position Kill" in the Combat Arms cheat-dev jargon, "damage
// packet injection" in the more general sense. The technique:
// craft a damage packet matching the server's wire format and
// SendToServer it directly. The server processes it as if a real
// shot fired and connected, even though the client never even ran
// the fire animation.
//
// Real C++ pattern:
//
//   CAutoMessage Msg;
//   Msg.Writeuint8(ID_Damage);
//   Msg.Writeuint16(target_player_id);
//   Msg.Writeuint16(damage_amount);
//   Msg.Writeuint32(weapon_id);
//   pSendToServer(Msg.Read(), MESSAGE_GUARANTEED);
//
// This is a different attack than M54 ghost aim — M54 still required
// a real fire event from the client, just rewrote the target. M58
// requires NO fire event at all. Pure server-side damage assertion.
//
// Why the server even accepts it: the engine is built on the
// assumption that the client is a trusted source for "things this
// client did." Damage events historically flowed:
//
//   client fire → client damage event → server applies
//
// without server-side reconciliation. The cheat just sends step 2
// without step 1. Server has nothing to compare against.
//
// The defense (M67) is server-side fire-pairing: every damage event
// must pair with a recent fire packet from the same session. The
// simulator's target.server.requireFirePairing flag enables this
// check; injected damage without a paired fire is rejected.
//
// Mission flow:
//   1. Player is positioned in a corner with no enemies in fire range.
//   2. Without OPK: player can't fire (no target in crosshair) — kills
//      stay at 0.
//   3. Player invokes call_engine_function("inject_damage", id, amt)
//      for each enemy in turn. Server processes each one, kills register.
//   4. Win: 4 enemies dead via injected damage, zero shots fired.
//
// Real-world: Combat Arms shipped without fire-pairing for years;
// every damage packet was honored. OPK was the most popular Combat
// Arms cheat at one point — instant kill from any position, no aim
// required. Server fix was eventually added (M67's defensive lesson).

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M58 — OPK (damage packet injection)
//
// Real C++:
//   CAutoMessage Msg;
//   Msg.Writeuint8(ID_Damage);
//   Msg.Writeuint16(target_id);
//   Msg.Writeuint16(damage);
//   pSendToServer(Msg.Read(), MESSAGE_GUARANTEED);
//
// Sim: call_engine_function("inject_damage", target_id, amount).
// Server applies the damage immediately — no fire event required.

void onInject() {
  log("Iterating enemies, injecting kill damage for each");

  const enemies = sim_enemies().filter(e => e.alive);
  for (const e of enemies) {
    const result = call_engine_function("inject_damage", e.id, 999);
    log("  inject_damage(" + e.id + ", 999) -> " +
        (result.ok ? "killed" : "rejected: " + result.reason));
  }
}

void onTick() { }
`;

export const mission58 = {
  id: "m58",
  title: "OPK / DAMAGE PACKET INJECTION",
  brief: "Skip the fire animation. Send a damage packet directly. Server applies it.",
  prerequisites: ["m38"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "💥",
    title: "ONE-POSITION KILL",
    body: `Up to now, every kill has required a fire event.
M54 rewrote the target inside an outgoing damage packet.
M58 skips fire entirely — craft the damage packet,
send it, server processes it, enemy dies.

Real C++:
  CAutoMessage Msg;
  Msg.Writeuint8(ID_Damage);
  Msg.Writeuint16(target_id);
  Msg.Writeuint16(damage);
  pSendToServer(Msg.Read(), GUARANTEED);

The Combat Arms server (and many older FPS servers)
applies damage packets without checking that a fire
event preceded them. The client is treated as the
authority on 'I damaged this player.'

Mission: kill 4 enemies, zero shots fired. The
defensive twin (M67) requires fire-pairing on the
server — same exploit code then fails with
'no_fire_pairing'.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template iterates enemies via sim_enemies(), calls inject_damage(id, 999) on each. Compile + Inject.",
    },
    {
      id: "verify",
      when: ({ target, dllState }) =>
        dllState.running && target.injectedDamageKills < 4,
      say: "DLL running but kills haven't registered yet. Check console — each inject_damage should log 'killed'. The server applies the damage immediately, no fire required.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableNetwork();
    target.player.ammo = 0;       // ZERO ammo — proof the kills bypassed fire entirely
    target.injectedDamageApplied = 0;
    target.injectedDamageKills = 0;

    dialog.script("VEX", [
      "You have zero ammo. The fire button does nothing. The crosshair targets nothing useful. By every conventional measure you can't kill anyone right now.",
      "OPK doesn't care. The server accepts damage packets directly. Build a packet that says 'enemy 2 took 999 damage' and SendToServer. Server applies the damage. Enemy dies.",
      "Real C++ does this with CAutoMessage + Writeuint16(target) + Writeuint16(damage). Sim equivalent: call_engine_function('inject_damage', id, amount).",
      "4 dead enemies, zero shots fired, ammo never went above 0. M67 defensive twin breaks this — server requires a recent fire packet to pair with each damage event.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.injectedDamageKills >= 4 && target.shotsFired === 0) {
        done = true;
        complete("4 kills, 0 shots fired. Server applied every damage packet you sent. M67 defensive twin makes this fail.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
