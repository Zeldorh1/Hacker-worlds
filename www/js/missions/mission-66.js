// Mission 66 — MULTI-FIELD PACKET CONSTRUCTION (CAutoMessage pattern)
//
// M51 sent a single byte. Real exploits often need richer packets:
// target IDs, sub-commands, reasons, payload structures. The
// LithTech / Source / Unreal engines all expose a "message builder"
// class for this — CAutoMessage in LithTech, bf_write in Source,
// FArchive in UE. You write typed fields in sequence, then
// SendToServer the resulting buffer.
//
// Real LithTech reference (from leaked Combat Arms cheat code,
// vote-disconnect variant, sanitized for educational use against
// the simulator's NPC list):
//
//   CAutoMessage Msg;
//   Msg.Writeuint8(206);                    // packet ID
//   Msg.Writeuint8(1);                      // sub-command
//   Msg.Writeuint8(1);
//   Msg.Writeuint16(target_id);             // target index
//   Msg.Writeuint16(1);                     // reason ID
//   pSendToServer(Msg.Read(), MESSAGE_GUARANTEED);
//
// Five typed writes. The server reads them back in the SAME ORDER
// with the SAME TYPES — uint8 then uint8 then uint8 then uint16 then
// uint16. If you mismatch even one field's width, the server reads
// garbage and either rejects the packet or interprets a wrong target.
//
// In our simulator we don't ship a real game's binary protocol —
// we abstract it. The DLL API provides new_message() which returns
// a builder with write_uint8/uint16/uint32/string and read(). The
// resulting message goes to send_to_server, which dispatches based
// on the first field (the ID) into the simulator's handler table.
//
// Mission setup:
//   - 4 sim NPCs in the simulator's enemy list (no real players ever).
//   - Server registers ID 206 as a "vote_disconnect" handler that
//     reads target_id from field 4 and removes that NPC.
//   - Player builds the multi-field packet step-by-step using
//     new_message(), iterates the enemy list via sim_enemies(),
//     and disconnects each NPC.
//   - Win: 4 NPCs removed via multi-field packets.
//
// What the curriculum gains: the typed-field-write pattern is the
// foundation for every binary protocol exploit. Once you can build
// a CAutoMessage, you can speak any LithTech / Source / UE wire
// format. M68 (suicide packet) reuses this; M58 OPK could too.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M66 — MULTI-FIELD PACKET CONSTRUCTION
//
// Real LithTech:
//   CAutoMessage Msg;
//   Msg.Writeuint8(206);          // packet ID
//   Msg.Writeuint8(1);            // sub-command
//   Msg.Writeuint8(1);
//   Msg.Writeuint16(target_id);   // target NPC index
//   Msg.Writeuint16(1);           // reason ID
//   pSendToServer(Msg.Read(), MESSAGE_GUARANTEED);
//
// Sim equivalent: new_message() returns a builder with the same
// typed write API. Field types and order MUST match the server's
// expectation byte-for-byte.

void onInject() {
  log("Iterating enemies, sending multi-field disconnect packet for each");

  const enemies = sim_enemies().filter(e => e.alive);
  for (const e of enemies) {
    const msg = new_message();
    msg.write_uint8(206);          // packet ID — vote_disconnect
    msg.write_uint8(1);            // sub-command
    msg.write_uint8(1);
    msg.write_uint16(e.id);        // target NPC index
    msg.write_uint16(1);           // reason

    const result = call_engine_function("send_to_server", msg.read());
    log("  disconnect NPC " + e.id + " -> " +
        (result.ok ? "ok" : "rejected: " + result.reason));
  }
}

void onTick() { }
`;

export const mission66 = {
  id: "m66",
  title: "MULTI-FIELD PACKET CONSTRUCTION",
  brief: "CAutoMessage. Five typed writes in sequence. Server reads them back exact-order, exact-width.",
  prerequisites: ["m51"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "📦",
    title: "TYPED-FIELD PACKET BUILDER",
    body: `M51 sent ONE byte. Real exploits often need
several typed fields:

  CAutoMessage Msg;
  Msg.Writeuint8(206);
  Msg.Writeuint8(1);
  Msg.Writeuint8(1);
  Msg.Writeuint16(target_id);
  Msg.Writeuint16(1);

The server reads them back IN ORDER with EXACT TYPES.
Mismatch one width and the server reads garbage —
maybe rejects, maybe acts on the wrong target.

DLL API: new_message() returns a builder with
write_uint8/uint16/uint32/string + read(). Pattern
mirrors LithTech CAutoMessage, Source bf_write, UE
FArchive — every engine ships the same shape.

Mission targets the simulator's NPC list. Server
removes NPCs whose ID matches the multi-field
packet's target field. 4 NPCs to disconnect.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template uses new_message() to build a 5-field packet for each NPC. Compile + Inject — watch the DLL console.",
    },
    {
      id: "verify",
      when: ({ target, dllState }) =>
        dllState.running && target._m66Disconnected < 4,
      say: "DLL running but disconnects haven't all registered. Check console for any 'rejected' results — if a field width is wrong, the server returns 'unknown_id' or 'malformed'.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target._m66Disconnected = 0;

    // Server handler at ID 206 — reads target_id from field 4 (the
    // first uint16 after the 3 uint8 prefix bytes) and removes that
    // NPC from the active enemy list.
    target.serverHandlers.set(206, {
      auth: false,
      handler: (session, payload) => {
        if (!payload || !payload.fields || payload.fields.length < 4) {
          throw new Error("malformed_packet");
        }
        // Expected fields after the ID byte (which was already consumed):
        //   [0] uint8  sub_command
        //   [1] uint8  flag
        //   [2] uint16 target_id
        //   [3] uint16 reason
        const targetField = payload.fields[2];
        if (!targetField || targetField.t !== "u16") {
          throw new Error("expected uint16 at field index 2");
        }
        const tid = targetField.v;
        const e = target.enemyManager.enemies.find(x => x.id === tid && x.alive);
        if (!e) return { disconnected: false };
        // Remove the NPC from active state.
        e.alive = 0;
        e.hp = 0;
        target._m66Disconnected = (target._m66Disconnected | 0) + 1;
        return { disconnected: true, target: tid };
      },
    });

    dialog.script("VEX", [
      "Multi-field packets are how every real engine ships its protocol. CAutoMessage in LithTech, bf_write in Source, FArchive in UE. Same shape: typed writes in sequence.",
      "The server reads them back in the same order with the same widths. uint8 then uint8 then uint8 then uint16 then uint16. Get one wrong and you read garbage — server rejects or acts on the wrong target.",
      "Template iterates sim_enemies() and builds a 5-field disconnect packet for each NPC. The first byte (206) is the handler ID. The 4th field (uint16) carries the target NPC index.",
      "4 NPCs disconnected via multi-field packets to close. The technique generalizes to any binary protocol exploit — it's the foundational pattern for richer packet crafting.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if ((target._m66Disconnected | 0) >= 4) {
        done = true;
        complete("4 NPCs removed via multi-field packets. CAutoMessage Writeuint8/Writeuint16 mapped to the simulator's typed-field builder. Same wire-format technique works against any LithTech/Source/UE binary protocol.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
