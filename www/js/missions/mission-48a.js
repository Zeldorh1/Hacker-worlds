// Mission 48a — ADVANCED: GETMODULEHANDLE + POINTER CHAIN
//
// Optional. Real C++ executable form. Walks the full module-base
// resolution chain step by step with intermediate variables, so
// each link in the chain is visible.
//
// Same effect as M22a (HP-lock vs bleed for 30s). The difference:
// M22a stashes HP_ADDR in onInject and writes in onTick. M48a
// resolves the chain EVERY tick from scratch — exactly what a real
// cheat does when it suspects the player struct might rebase between
// frames (Counter-Strike, Apex, and many other games rebase the
// player struct on every map change or even every respawn).

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M48a ADVANCED — Full pointer-chain resolution every tick.
//
// Re-resolving the chain on every tick is what real cheats do when
// the player struct can rebase. Slower than caching HP_ADDR (M22a)
// but survives any pointer relocation the game might do.
// Full DLL skeleton — DllMain spawns the worker, the loop re-walks
// the chain every iteration.

#include <windows.h>

const uintptr_t STATIC_OFFSET = 0x10F4F4;   // M48 lesson: where the
                                            // static pointer cell lives
const uintptr_t HP_OFFSET     = 0xEC;       // HP field inside player struct

DWORD WINAPI MainThread(LPVOID lpParam) {
  log("M48a: chain resolves every tick — survives player-struct rebase");

  while (true) {
    // Step 1: Get module base. Real Windows: ASLR-randomized per launch,
    //         GetModuleHandleA returns the current load address.
    HMODULE hMod = GetModuleHandleA("ac_client.exe");
    uintptr_t client_base = (uintptr_t)hMod;

    // Step 2: Address of the static pointer cell (lives in .data section).
    uintptr_t static_ptr = client_base + STATIC_OFFSET;

    // Step 3: Dereference to get the player struct's current base.
    //         If the game rebased the struct, this returns the NEW base.
    uintptr_t player_base = *(uintptr_t*)(static_ptr);

    // Step 4: Add HP offset, write 100. Real C++ pointer-deref write.
    *(int*)(player_base + HP_OFFSET) = 100;

    Sleep(16);
  }
}

BOOL WINAPI DllMain(HINSTANCE hMod, DWORD reason, LPVOID lpReserved) {
  if (reason == DLL_PROCESS_ATTACH) {
    DisableThreadLibraryCalls(hMod);
    CreateThread(NULL, 0, MainThread, NULL, 0, NULL);
  }
  return TRUE;
}
`;

export const mission48a = {
  id: "m48a",
  title: "ADVANCED: MODULE BASE + CHAIN",
  brief: "Re-resolve the full chain every tick — survives player-struct rebases. Real C++ syntax executes natively.",
  prerequisites: ["m22a"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  optional: true,
  alert: {
    icon: "🧬",
    title: "FULL CHAIN, RE-RESOLVED EVERY TICK",
    body: `M22a stashed HP_ADDR once at inject time. M48a
re-resolves the full chain on EVERY tick — the way
real cheats handle games where the player struct
can rebase mid-match (CS, Apex, many others).

Five steps per tick:
  1. GetModuleHandleA("ac_client.exe") → module base
  2. + 0x10F4F4 → static pointer cell address
  3. *(uintptr_t*)(...) → player struct base (might
     have moved since last tick — this is how it
     survives rebases)
  4. + 0xEC → HP address
  5. *(int*)(...) = 100 → write

Slower than M22a (multiple memory reads per frame
instead of one) but bulletproof against any pointer
relocation the game might do. Real cheats often
choose this over caching, depending on the game.

Real C++ syntax — the parser handles types, casts,
deref expressions, and Win32 aliases natively.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.compiled,
      say: "Open DLL tab. Template uses real C++ syntax — HMODULE, uintptr_t, *(int*) deref. Compile + Inject.",
    },
    {
      id: "watch",
      when: ({ dllState }) => dllState.running,
      say: "DLL injected, chain re-resolves every tick. HP pinned at 100. Hold 30s.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableBleed(2, 1100);
    target.enableESP();

    dialog.script("VEX", [
      "M48a re-resolves the full pointer chain every single tick. M22a cached HP_ADDR — fast but breaks if the player struct rebases. M48a never caches — bulletproof but slower.",
      "Real cheats choose between the two based on the game. CS:GO and Apex use full re-resolution because the entity list rebases on every round / drop. AssaultCube doesn't rebase, so caching works.",
      "Template walks the chain in real C++ on every onTick call: GetModuleHandleA, +offset, deref, +offset, write. The parser handles every line natively.",
      "Same 30s HP-hold win as M22a.",
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
        complete("Full chain re-resolved every tick for 30s. HP held at 100. Real cheats use this pattern when player structs rebase mid-match.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
