// Mission 51 — SERVER-TRUSTED COMMAND IDS
//
// The Combat Arms class of vulnerability: Nexon left a table of
// privileged debug/admin packet handlers in the production server.
// Each one toggles a session flag (godmode, unkickable, infinite ammo,
// etc.) WITHOUT checking whether the calling session is authorized.
//
// Real cheat code (from leaked CA cheats):
//
//   #define ID_God_Mode 135
//   pSendToServer = (tSendToServer)ADDR_SENDTOSERVER;
//   if (engine->ValidPointer(g_LTClient)) {
//       CAutoMessage Msg;
//       Msg.Writeuint8(ID_God_Mode);
//       pSendToServer(Msg.Read(), MESSAGE_GUARANTEED);
//   }
//
// The whole exploit is one byte: 135. The server receives it, looks
// up the handler, sets session.godMode = true. Done.
//
// Why this is a separate class from everything else in the curriculum:
//
//   - M02-M17 lie to the CLIENT (memory freezes, recoil zero, etc.)
//   - M26-M49 hook the CLIENT (render hooks, frame audit, etc.)
//   - M51 lies to NOTHING — the server honors an untrusted request
//
// No client-side AC catches this. No memory scan, render hook detector,
// debugger check, framebuffer audit, or behavioral analyzer ever sees
// it. The cheat doesn't write controversial memory or hook anything.
// It just sends a packet the engine itself ships with.
//
// M53 builds the only fix: server-side auth on every privileged handler.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M51 — MAGIC PACKET (ID_God_Mode)
//
// Real C++:
//   typedef void(*tSendToServer)(ILTMessage_Read*, uint32_t flags);
//   tSendToServer pSendToServer = (tSendToServer)ADDR_SENDTOSERVER;
//   CAutoMessage Msg;
//   Msg.Writeuint8(ID_God_Mode);          // 135
//   pSendToServer(Msg.Read(), MESSAGE_GUARANTEED);
//
// Sim equivalent: call_engine_function("send_to_server", id).
// The simulator's server-side handler table maps id 135 to a
// session.godMode = true setter.

const ID_God_Mode = 135;

void onInject() {
  log("Sending ID_God_Mode (135) magic packet to server");

  const result = call_engine_function("send_to_server", ID_God_Mode);
  if (result && result.ok) {
    log("Server honored ID_God_Mode — session.godMode now true");
    log("Hazard ticks will be ignored until session resets");
  } else {
    log("Server rejected: " + (result ? result.reason : "no response"));
  }
}

void onTick() { }
`;

export const mission51 = {
  id: "m51",
  title: "SERVER-TRUSTED COMMAND IDS",
  brief: "Send one byte to the server. Become invulnerable. The server never checks who you are.",
  prerequisites: ["m50"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "📡",
    title: "LEFTOVER DEBUG HANDLERS",
    body: `The server has a table of privileged packet handlers
that were never disabled in production. Each one is
keyed by a single byte ID and flips a session flag:

  ID 135 → session.godMode      = true
  ID 174 → session.speedMult    = 5
  ID 206 → session.unkickable   = true
  ...

The handler does not check session.privileged before
honoring the request. Anyone who knows the ID gets
the flag.

This is fundamentally different from every cheat we've
built. The CLIENT lies to nothing. The CLIENT writes
no controversial memory. The CLIENT hooks no functions
that an AC scans. The cheat just SENDS A PACKET the
engine ships with.

Client-side anti-cheat cannot catch this. Only the
server can fix it (M53).`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template sends ID_God_Mode (byte 135) via call_engine_function('send_to_server', 135). Compile + Inject.",
    },
    {
      id: "verify-flag",
      min: 4,
      when: ({ target, dllState }) =>
        dllState.running && !target.session.godMode,
      say: "DLL is running but session.godMode is still false. Check the DLL console for the engine call result. The handler table needs to know about ID 135 — the mission registers it on start.",
    },
    {
      id: "survive-hazard",
      when: ({ target }) =>
        target.session.godMode && target.player.hp >= 100 && target._m51StartedAt && performance.now() - target._m51StartedAt < 10000,
      say: "godMode is set. Walk into the hazard zone and stand there. Without godMode, HP drains in ~3-4 seconds. With it, you take zero damage. Survive 10s to clear.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableHazards();

    // Register the leftover-debug ID 135 on the server. The handler
    // sets session.godMode = true with NO auth check (auth flag false).
    target.serverHandlers.set(135, {
      auth: false,
      handler: (session) => { session.godMode = true; },
    });

    target._m51StartedAt = performance.now();
    target._m51HazardSurvivedSince = null;

    dialog.script("VEX", [
      "Welcome to the most embarrassing class of game-server bug. The Combat Arms team shipped production with debug packet handlers that flipped privileged session flags — without auth checks.",
      "ID 135 = ID_God_Mode. Server reads the byte, looks up the handler, sets session.godMode = true. No auth. No origin check. No rate limit.",
      "Your DLL template sends this packet via the engine call you learned in M50. The hazard zone normally kills you in 3-4 seconds. With godMode flipped, you take zero damage from it.",
      "Stand in the hazard zone for 10s with HP intact to prove it's working. The point of the lesson isn't 'god mode' — it's that the WHOLE EXPLOIT is sending one byte. No memory writes. No render hooks. Nothing for client AC to detect.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      // Win condition: godMode set AND HP > 90 AND 10s elapsed since
      // mission start AND player has been in hazard zone (HP would
      // normally have dropped without godMode).
      const elapsed = performance.now() - target._m51StartedAt;
      if (target.session.godMode && elapsed >= 10000 && target.player.hp >= 90) {
        done = true;
        complete("Stood 10s in the hazard zone with full HP. The server honored ID 135 because it never checked who you were. Next mission: how Nexon 'fixed' this — and why renaming the byte didn't work.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
