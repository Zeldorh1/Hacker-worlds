// Mission 48a — ADVANCED: GETMODULEHANDLE + POINTER CHAIN
//
// Optional transparency sibling. Same outcome as M21/M22a (HP-lock
// against bleed) but the template demonstrates the FULL real-C++
// pointer-resolution chain step by step:
//
//   1. GetModuleHandleA("ac_client.exe")  → module base
//   2. *(uintptr_t*)(module_base + 0x10F4F4)  → player struct base
//   3. player_struct + 0xEC  → HP address
//   4. *(int*)hp_addr = 100  → write
//
// Why this mission exists: the user was right to ask 'how do I find
// the module base in real code?' M48 mission shows you how to FIND
// the static offset (the 0x10F4F4 part). The Windows API codex
// article shows you the full GetModuleHandleA call. This mission
// puts BOTH together in a sim-runnable form, with comments mapping
// each line to its real C++ equivalent.
//
// Slotted in the M22 area (display) where raw-form learning lives.
// Optional — does not gate any later mission.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M48a — ADVANCED: full module-base + pointer-chain in raw form
//
// Real C++ (the version you'd actually ship):
//
//   // Step 1: Get module base (the new randomized address ASLR
//   //         picked for ac_client.exe this session)
//   HMODULE hMod = GetModuleHandleA("ac_client.exe");
//   uintptr_t client_base = (uintptr_t)hMod;
//
//   // Step 2: Add the static offset to find the pointer cell that
//   //         holds the player struct's address. The 0x10F4F4 is
//   //         the static offset baked into ac_client.exe's .data
//   //         section (M48 lesson — discovered via pointer scan).
//   const uintptr_t STATIC_OFFSET = 0x10F4F4;
//   uintptr_t static_ptr_addr = client_base + STATIC_OFFSET;
//
//   // Step 3: Dereference the static cell to get the current
//   //         player struct base (this is what survives ASLR /
//   //         restarts because the static cell is at a fixed
//   //         offset and the game keeps it pointing at the live
//   //         player struct).
//   uintptr_t player_base = *(uintptr_t*)static_ptr_addr;
//
//   // Step 4: HP is at offset +0xEC inside the player struct.
//   const uintptr_t HP_OFFSET = 0xEC;
//   uintptr_t hp_addr = player_base + HP_OFFSET;
//
//   // Step 5: Write 100 every tick to defeat bleed.
//   *(int*)hp_addr = 100;

const STATIC_OFFSET = 0x10F4F4;
const HP_OFFSET     = 0xEC;
let HP_ADDR = null;

void onInject() {
  // 1. Get module base (sim equivalent of GetModuleHandleA)
  const client_base = call_engine_function("get_module_base", "ac_client.exe");
  log("client_base = " + client_base.toString(16));

  // 2. Sim shortcut: addr_of("local_player_ptr") returns the resolved
  //    static-cell address. In real C++ that's:
  //       (client_base + STATIC_OFFSET)
  //    We log both so you can see they're conceptually the same step.
  const static_ptr_addr = addr_of("local_player_ptr");
  log("static cell at: " + static_ptr_addr +
      "  (real C++: client_base + 0x" + STATIC_OFFSET.toString(16) + ")");

  // 3. Dereference: read the value AT the static cell to get
  //    player_struct base. Real C++: *(uintptr_t*)static_ptr_addr.
  //    Sim: read(static_ptr_addr).
  const player_base = read(static_ptr_addr);
  log("player struct base: " + player_base);

  // 4. Compute HP address. Real C++: player_base + HP_OFFSET.
  //    Sim shortcut for the bound field:
  HP_ADDR = addr_of("player.hp");
  log("HP at: " + HP_ADDR + "  (real C++: player_base + 0x" +
      HP_OFFSET.toString(16) + ")");

  log("Full chain resolved — onTick will pin HP at 100");
}

void onTick() {
  // Real C++: *(int*)HP_ADDR = 100;
  write(HP_ADDR, 100);
}
`;

export const mission48a = {
  id: "m48a",
  title: "ADVANCED: MODULE BASE + CHAIN",
  brief: "GetModuleHandleA + static offset + dereference + field offset. The full real-C++ resolution chain.",
  prerequisites: ["m22a"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  optional: true,
  alert: {
    icon: "🧬",
    title: "FULL RESOLUTION CHAIN — MODULE BASE TO HP",
    body: `M22a showed how to use a resolved address. M48a
shows how to RESOLVE the address from scratch — the
full chain real C++ DLL code uses to reach any
field in the player struct.

  Step 1: GetModuleHandleA("ac_client.exe")
          -> module base (ASLR-randomized per launch)

  Step 2: client_base + 0x10F4F4
          -> address of the static pointer cell

  Step 3: *(uintptr_t*)(static_cell_addr)
          -> player struct base

  Step 4: player_base + 0xEC
          -> HP address

  Step 5: *(int*)hp_addr = 100
          -> write

Five steps. Every real C++ cheat for a real game does
exactly this dance. Once you do it once for HP, you do
it for ammo (player_base + 0x140), recoil
(weapon_ptr + 0x08), every other field.

This optional mission walks the chain in the simulator.
Comments map each line to the real C++ equivalent.
Same HP-hold win condition as M22a.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.compiled,
      say: "Open the DLL tab. Read the comments — the template walks the full chain (module base -> static offset -> dereference -> field offset). Compile + Inject.",
    },
    {
      id: "watch-console",
      when: ({ dllState }) => dllState.running,
      say: "DLL Console shows each step of the chain resolved (client_base, static cell, player struct base, HP address). That's exactly what your real C++ DLL would log if you put printf statements between each step. Hold 30s to close.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableBleed(2, 1100);
    target.enableESP();

    dialog.script("VEX", [
      "M22a showed you the raw write. M48a shows the FULL chain — how you'd compute the HP address from scratch in real C++ DLL code.",
      "Five steps: GetModuleHandleA returns the module base; add the static offset (0x10F4F4) to find the pointer cell; dereference it to get the player struct base; add the HP offset (0xEC); write 100.",
      "The template walks every step with both real C++ syntax in comments AND the sim's equivalent inline. Read top to bottom — you'll see the chain resolve in the DLL Console line by line.",
      "Same effect as M22a: HP-lock against bleed for 30s. Optional but recommended if you want to see the full pointer chain real cheat code uses.",
    ]);

    let done = false;
    const startDeaths = target.deaths;
    const dllRuntime = window.__hw && window.__hw.dll;

    const interval = setInterval(() => {
      if (done) return;
      if (!dllRuntime) return;
      if (target.deaths > startDeaths) return;
      if (dllRuntime.running && dllRuntime.injectedFor() >= 30000 &&
          target.deaths === startDeaths) {
        done = true;
        complete("Full chain held HP for 30s. GetModuleHandleA -> static offset -> dereference -> field offset -> write. That's the C++ pattern every real game cheat uses to reach every field in the player struct.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
