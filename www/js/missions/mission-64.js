// Mission 64 — BYTE PATCHING (NORECOIL / NORELOAD pattern)
//
// Real Combat Arms cheat reference (from leaked headers):
//
//   #define ADDR_NORECOIL    0x374B9EBC
//   #define ADDR_RAPIDFIRE1  0x37508967
//   #define ADDR_RAPIDFIRE2  0x3751251E
//   #define ADDR_NORELOAD    0x375117A1
//
// And the cheat that uses them:
//
//   MemCopy((void*)ADDR_NORECOIL,   "\x90", 1);  // NOP
//   MemCopy((void*)ADDR_NORELOAD,   "\xC3", 1);  // RET (early-out)
//   MemCopy((void*)ADR_CameraUpdate, "\xC3", 1); // ghost mode hint
//
// One-byte memcpy at a known function address. \x90 is x86 NOP — the
// CPU sees this byte and does nothing, advancing past the instruction
// it overwrote. \xC3 is x86 RET — the function returns immediately,
// skipping its entire body.
//
// Why this technique exists: not every game state is stored in a
// freezable data cell. Some logic lives only in INSTRUCTIONS:
//
//   if (target_distance > MAX_RANGE) damage = 0;   // range cap
//   if (frames_since_fire < cooldown) return;      // rapid-fire block
//   recoil += per_shot;                            // recoil increment
//
// You can't 'freeze' the result of a multiplication or comparison —
// it gets recomputed every shot. But you CAN patch the byte at the
// instruction's address so the comparison never fires.
//
// In our simulator, codeSegment exposes named instructions with
// pseudo-code-addresses (the C suffix marks them as code, not data).
// patch_code(id, "nop") flips the instruction to skip-on-execute.
// list_code_addresses() returns the dump — your equivalent of an
// address-finder reverse-engineering session.
//
// Mission flow:
//   1. Mission enables a 4-tile weapon range cap. Enemies are placed
//      8 tiles away. Without patching, every fire is rejected.
//   2. Player calls list_code_addresses() in their DLL — sees the
//      WEAPON_RANGE_CHECK instruction with its fake code address.
//   3. Player calls patch_code('weapon_range_check', 'nop').
//   4. Subsequent fires bypass the range check. Damage applies.
//   5. Win: 3 long-range kills.
//
// Real-world: this is exactly the pattern in every commercial cheat's
// "init" function. List the addresses, walk down them, MemCopy a NOP
// or RET into each. Done before the first frame renders.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M64 — BYTE PATCHING (\\x90 NOP / \\xC3 RET)
//
// Real C++:
//   MemCopy((void*)ADDR_NORECOIL,        "\\x90", 1);
//   MemCopy((void*)ADDR_WEAPON_RANGE,    "\\x90", 1);
//   MemCopy((void*)ADR_CameraUpdate,     "\\xC3", 1);
//
// list_code_addresses() returns:
//   [{id, name, addr, nopped}, ...]
// patch_code(id, "nop") writes a simulated \\x90 to that address.
// patch_code(id, null) restores.

void onInject() {
  log("=== Code address dump ===");
  const dump = list_code_addresses();
  for (const inst of dump) {
    log("  " + inst.addr + "   " + inst.name + (inst.nopped ? "  [NOPed]" : ""));
  }

  log("=== Patching weapon_range_check with NOP ===");
  patch_code("weapon_range_check", "nop");

  log("Range check is now a no-op. Long-range fire will register.");
}

void onTick() { }
`;

export const mission64 = {
  id: "m64",
  title: "BYTE PATCHING",
  brief: "Some checks aren't in data — they're in code. Patch the byte at the instruction's address.",
  prerequisites: ["m17"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "⚙",
    title: "RANGE CAP IS HARDCODED IN AN INSTRUCTION",
    body: `Memory freezes can't help you here. The weapon
range check is:

  if (target_distance > 4) damage = 0;

There's no 'damage' cell to freeze — damage is RECOMPUTED
every shot from this comparison. The check is the
INSTRUCTION itself, not a value.

Real C++ cheats handle this by patching the instruction
byte directly:

  MemCopy((void*)ADDR_WEAPON_RANGE, "\\x90", 1);

\\x90 is x86 NOP. The CPU executes the byte as 'do
nothing,' advances past the comparison. Damage is no
longer zeroed.

list_code_addresses() returns the simulator's equivalent
of a reverse-engineering session's address dump. Find
the right id, NOP it.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template lists code addresses, then patches weapon_range_check with NOP. Compile + Inject.",
    },
    {
      id: "kills",
      when: ({ target, dllState }) => dllState.running && target.killCount < 3,
      say: "NOP applied — fire button now lands shots beyond 4 tiles. Tab to ac_anomaly. Enemies are placed at long range. Kill 3 to close.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableRangeLimit(4);   // 4 tiles — enemies are placed at 8+
    target.player.ammo = 200;

    // Move all enemies far from the player so range check fires.
    setTimeout(() => {
      let i = 0;
      for (const e of target.enemyManager.enemies) {
        e.x = target.player.x + 8;
        e.y = target.player.y + (i - 2);
        i++;
      }
    }, 50);

    target._m64StartKills = target.killCount;

    dialog.script("VEX", [
      "Range cap mission. Enemies are 8+ tiles away. Weapon range is capped at 4. Without intervention, fire produces zero damage at this distance — every shot is wasted.",
      "The cap isn't a freezable cell. It's an instruction: 'if dist > 4, damage = 0.' You can't freeze a comparison, you can't write past a jump. You patch the BYTE at the instruction's address.",
      "Template's onInject calls list_code_addresses() to dump the simulator's instruction table (mirroring a real RE address dump), then patch_code('weapon_range_check', 'nop') overwrites the instruction's byte with x86 NOP.",
      "Drop 3 enemies at long range to close. The 'cooldown' isn't a value — it's instructions, and you can patch every one Nexon ships.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      const kills = target.killCount - target._m64StartKills;
      if (kills >= 3) {
        done = true;
        complete("3 long-range kills with the range check NOPed. The instruction is dead — the byte you wrote made the CPU skip the comparison entirely. Same trick that powers NORECOIL, NORELOAD, RAPIDFIRE, and every 'no-' cheat.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
