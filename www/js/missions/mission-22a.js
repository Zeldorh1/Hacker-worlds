// Mission 22a — ADVANCED: RAW C++ FORM (optional companion to M21 INTERNAL CHEAT)
//
// Real C++ syntax now executes against the simulator. The DLL parser
// translates type declarations, type casts, and *(TYPE*)(addr) deref
// expressions into the simulator's underlying API calls. What you
// type into the editor is exactly what your real DLL would look like.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M22a ADVANCED — Real C++ syntax. The simulator parses C++ types,
// casts, and *(int*) pointer-deref expressions. What you see is what
// your real DLL would actually look like.

uintptr_t HP_ADDR = 0;

void onInject() {
  // 1. Get module base (the address Windows loaded ac_client.exe at).
  HMODULE hMod = GetModuleHandleA("ac_client.exe");
  uintptr_t client_base = (uintptr_t)hMod;

  // 2. Dereference the static pointer cell at +0x10F4F4 to get the
  //    player struct's base address. This is the M48 lesson —
  //    pointer-scanning surfaces this static cell.
  uintptr_t player_ptr = *(uintptr_t*)(client_base + 0x10F4F4);

  // 3. HP lives at +0xEC inside the player struct.
  HP_ADDR = player_ptr + 0xEC;

  log("Resolved HP_ADDR = " + HP_ADDR);
}

void onTick() {
  // Real C++ pointer-deref write — pin HP at 100 every frame.
  // Same primitive as *(int*)hp_addr = 100; in real DLL code.
  *(int*)(HP_ADDR) = 100;
}
`;

export const mission22a = {
  id: "m22a",
  title: "ADVANCED: RAW C++ FORM",
  brief: "Same as M22 but the editor accepts real C++ syntax — types, casts, *(int*) deref. Optional, for transparency.",
  prerequisites: ["m21"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  optional: true,
  alert: {
    icon: "🔬",
    title: "REAL C++ SYNTAX EXECUTES NOW",
    body: `M22 used the simulator's friendly write_label. M22a
is the same effect written in REAL C++ syntax — and
the parser translates it into something the sim can
execute.

What you can write now (and have it actually run):

  HMODULE hMod = GetModuleHandleA("ac_client.exe");
  uintptr_t client_base = (uintptr_t)hMod;
  uintptr_t player_ptr = *(uintptr_t*)
    (client_base + 0x10F4F4);
  *(int*)(player_ptr + 0xEC) = 100;

The simulator handles:
  - Type declarations (HMODULE/uintptr_t/int/etc.)
  - Type casts ((uintptr_t)/(int)/etc.)
  - Pointer-deref reads:  *(uintptr_t*)(addr)
  - Pointer-deref writes: *(int*)(addr) = val
  - Win32 aliases (GetModuleHandleA)
  - Pointer arithmetic (client_base + 0x10F4F4)

Same HP-hold-30s win as M22.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.compiled,
      say: "Open DLL tab. Template uses real C++ syntax (HMODULE, uintptr_t, *(int*) deref). The parser translates it into sim ops automatically. Compile + Inject.",
    },
    {
      id: "watch-hp",
      when: ({ dllState, target }) =>
        dllState.running && target.deaths === 0,
      say: "DLL Console logged the resolved HP_ADDR — that integer is what the pointer chain produced. *(int*)(HP_ADDR) = 100 fires every tick. Hold 30s, no deaths.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableBleed(2, 1100);
    target.enableESP();

    dialog.script("VEX", [
      "M22a now accepts REAL C++ syntax. The DLL parser translates types, casts, and pointer-deref expressions into the simulator's underlying API calls.",
      "Template walks the full chain in real C++: GetModuleHandleA, (uintptr_t) cast, *(uintptr_t*) deref of static pointer, +0xEC for HP offset, *(int*)(addr) = 100 for the write.",
      "Read it carefully — every line is what your real C++ DLL on AssaultCube would say. Compile + Inject; the parser turns it into sim-runnable JS under the hood.",
      "Same win as M22: hold HP for 30s with no deaths. The integer arithmetic ACTUALLY resolves to the right cell because we placed the static pointer at the realistic address (module_base + 0x10F4F4).",
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
        complete("HP held 30s using real C++ syntax. The parser translated *(int*)(addr) = 100; into the sim's underlying write op. Same code structure your real DLL would have on AssaultCube.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
