// Mission 78 — LOBBY CRASHER (sim NPCs only)
//
// User framing was clear: in the simulator this is just kicking the
// sim's NPCs from the simulated lobby. No real players ever, no
// commercial-game context. The technique class — sending a malformed
// packet that triggers an unhandled exception in the receiver's parser
// — IS educationally valuable, and it's the same skill class that
// security researchers use to fuzz network protocols and find DoS
// bugs in legitimate software.
//
// Mechanism:
//   Real-world lobby crashers send a packet whose declared field
//   widths or counts don't match the actual payload. The server (or
//   target client's) parser advances past valid memory while reading
//   the next "field" and either crashes or returns garbage. The
//   crashed client gets disconnected.
//
// In our simulator: register a server handler that detects malformed
// multi-field packets — specifically, a packet whose declared payload
// length doesn't match the field count it actually carries. When
// such a packet arrives targeting a sim NPC, the simulator simulates
// the parser exception and removes that NPC from the lobby.
//
// Mission flow:
//   1. 4 sim NPCs in the lobby.
//   2. Player builds a malformed CAutoMessage: declares it has 5
//      fields but only writes 3 (a length-mismatch attack).
//   3. Send to ID 254 (lobby_crash) targeting one NPC at a time.
//   4. Each NPC parser hits the size-mismatch, throws, NPC ejected.
//   5. Win: 4 NPCs crashed.
//
// What the curriculum gains: malformed-packet attack as a class.
// Pairs with the existing M58 OPK and M66 multi-field missions.
// In real-world security research this is exactly how DoS / parser-
// confusion bugs get found by fuzzing.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M78 — LOBBY CRASHER (malformed packet)
//
// Real-world: send a packet whose declared field widths/count don't
// match the actual payload. The receiver's parser advances past the
// real payload bytes, reads garbage, hits an exception, crashes.
//
// In our sim: build a CAutoMessage that DECLARES a payload size but
// writes fewer fields. The server's lobby_crash handler detects the
// mismatch (simulating the parser exception) and ejects the targeted
// NPC from the simulator.

const ID_LOBBY_CRASH = 254;
const DECLARED_FIELDS = 5;     // we'll declare 5 but only write 3

void onInject() {
  log("Building malformed packets to crash sim NPCs out of the lobby");

  const enemies = sim_enemies().filter(e => e.alive);
  for (const e of enemies) {
    const msg = new_message();
    // Field 0: declared field count (claims 5)
    msg.write_uint8(DECLARED_FIELDS);
    // Field 1: target NPC id
    msg.write_uint16(e.id);
    // Field 2: a magic byte expected by the handler
    msg.write_uint8(1);
    // We STOP here — only 3 fields written instead of declared 5.
    // The receiver expects 2 more uint16 fields. When it advances
    // past field 2 it reads invalid data and the parser throws.

    const result = call_engine_function("send_to_server", ID_LOBBY_CRASH, msg.read());
    log("  malformed -> NPC " + e.id + ": " +
        (result.ok ? "crashed (parser exception)" : "rejected: " + result.reason));
  }
}

void onTick() { }
`;

export const mission78 = {
  id: "m78",
  title: "LOBBY CRASHER",
  brief: "Malformed packet → NPC parser hits an exception → ejected from lobby. The fuzzer's classic move.",
  prerequisites: ["m66"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "💥",
    title: "MALFORMED-PACKET ATTACK CLASS",
    body: `Sim-NPCs only — no real players ever. The class
of technique IS educationally valuable: malformed
packets that exploit parser bugs are how security
researchers find DoS / RCE / parser-confusion bugs
in legitimate network software every day.

Mechanism:
  Build a packet whose declared field count or
  payload size doesn't match what's actually written.
  Receiver's parser advances past the real payload,
  reads garbage memory, hits an exception, crashes.

In our sim: declare a 5-field packet but write 3.
The lobby_crash handler detects the size mismatch
(simulating the parser exception) and ejects the
targeted NPC.

In real network protocols this is the bread-and-
butter of network fuzzing — Boofuzz, AFL-net, and
SymProbe all generate malformed packets like this
to find parser vulnerabilities.

Mission: crash 4 NPCs out of the simulated lobby.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template iterates sim_enemies and sends a length-mismatch packet for each. Compile + Inject.",
    },
    {
      id: "verify-crash",
      when: ({ target, dllState }) =>
        dllState.running && target._m78Crashed < 4,
      say: "DLL running but NPCs not all crashed yet. Check the console — each malformed packet should log 'crashed (parser exception)'. If they show 'rejected', the field-count mismatch isn't being detected — verify the template declares 5 but writes 3.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target._m78Crashed = 0;

    // Register lobby_crash handler at ID 254. Detects field-count
    // mismatch (simulated parser exception) and ejects the NPC.
    target.serverHandlers.set(254, {
      auth: false,
      handler: (session, payload) => {
        // Payload should have at least 1 field (declared count).
        if (!payload || !Array.isArray(payload.fields) || payload.fields.length === 0) {
          throw new Error("empty_payload");
        }
        // First field claims how many TOTAL fields the packet has
        // (including the declared count itself). Subsequent fields
        // are target_id (uint16) + sub-args.
        const declaredCount = payload.fields[0].v;
        const actualCount = payload.fields.length;
        // The "exploit" is that declaredCount > actualCount. Simulated
        // parser exception: detect the mismatch and treat as a crash
        // on the targeted NPC.
        if (declaredCount > actualCount + 1) {
          // Find target_id from field 1 (uint16).
          const targetField = payload.fields[1];
          if (!targetField || targetField.t !== "u16") {
            throw new Error("malformed_target");
          }
          const tid = targetField.v;
          const e = target.enemyManager.enemies.find(x => x.id === tid && x.alive);
          if (!e) return { crashed: false };
          e.alive = 0;
          e.hp = 0;
          target._m78Crashed = (target._m78Crashed | 0) + 1;
          return { crashed: true, target: tid, reason: "parser_exception" };
        }
        // Well-formed packet — no crash.
        return { crashed: false, reason: "well_formed" };
      },
    });

    dialog.script("VEX", [
      "Sim-NPCs only — no real players ever. This mission's about understanding how malformed-packet attacks work as a CLASS, not weaponizing the technique.",
      "Mechanism: build a packet whose declared field count doesn't match what you actually wrote. The receiver's parser hits the size mismatch, can't handle it gracefully, throws. The targeted entity gets disconnected.",
      "Template declares 5 fields, writes 3. The simulator's lobby_crash handler detects the mismatch (simulating the parser exception) and ejects the NPC.",
      "Same technique class is how Boofuzz, AFL-net, SymProbe find real DoS bugs in network software. Mission: 4 NPCs crashed.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if ((target._m78Crashed | 0) >= 4) {
        done = true;
        complete("4 NPCs crashed via malformed packets. Same technique class fuzzers use to find real DoS bugs in network software. Educational territory; no live-service relevance — sim NPCs only.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
