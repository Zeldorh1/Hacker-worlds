// Mission 70 — MINI TRAINER 1: Single-address freeze
//
// This is the start of the BUILD-YOUR-OWN-TRAINER track. Up to now
// every mission has had a teaching focus on ONE technique. From M70
// onward, the missions chain into a single growing trainer that
// becomes the player's capstone project.
//
// Mission 1 is the simplest possible cheat: freeze HP at a hardcoded
// address. Five lines:
//
//   void onTick() {
//       const HP_ADDR = "0x...";
//       const TARGET_HP = 9999;
//       write(HP_ADDR, TARGET_HP);
//   }
//
// That's it. Every frame, write 9999 to the HP cell. Game's damage
// code keeps subtracting; your loop keeps overwriting. Net effect:
// HP never goes down.
//
// Lesson: this is the smallest possible "cheat" — one address, one
// loop. Every more sophisticated trainer is built on this primitive.
// You've already seen its equivalent (memory.setFrozen) in M02; this
// mission proves you can do it without any helpers, just by writing
// the address every tick.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// ═══════════════════════════════════════════════════════════════════
// MINI TRAINER 1 — Single-address HP freeze
// ═══════════════════════════════════════════════════════════════════
// This IS the bare-minimum injectable DLL. Compile with MSVC or
// MinGW as a 32-bit DLL, inject with any loader (Process Hacker,
// Xenos, manual LoadLibrary), and HP is pinned to 9999 forever.
//
// Read top-down: globals → MainThread (the worker) → DllMain (the
// entry point Windows calls when the DLL loads). Once you understand
// every line here, every later trainer mission is just adding more
// of the same primitives.
// ───────────────────────────────────────────────────────────────────

// Pulls in Win32 type definitions (HMODULE, DWORD, BOOL, etc) and
// function prototypes (GetModuleHandleA, CreateThread, Sleep). Real
// MSVC needs this header; the simulator ignores it.
#include <windows.h>

// ─── Global state ─────────────────────────────────────────────────
//
// 'const int' = a value that never changes after compile time. Lives
// in the DLL's .rdata section. Real C++: read-only memory.
const int TARGET_HP = 9999;

// 'uintptr_t' = an unsigned integer wide enough to hold a pointer
// (32-bit on x86 builds, 64-bit on x64). Used everywhere we want
// to do pointer arithmetic without the compiler complaining about
// type mismatches. Initial value 0 — onInject fills it in once the
// DLL has resolved the player struct.
uintptr_t HP_ADDR = 0;


// ─── MainThread: the worker that does the actual cheating ────────
//
// 'DWORD WINAPI' = the function returns a 32-bit unsigned int and
// uses the __stdcall calling convention. CreateThread requires this
// exact signature — that's why every example uses these qualifiers.
//
// 'LPVOID lpParam' = a generic pointer Windows passes in. We don't
// use it, but the signature must accept it.
DWORD WINAPI MainThread(LPVOID lpParam) {

  // GetModuleHandleA returns the address Windows loaded ac_client.exe
  // at. ASLR randomizes this per launch, so we can't hardcode it —
  // we have to ask the OS. The 'A' suffix means ANSI strings (vs 'W'
  // for wide-char). HMODULE is the type for module handles; on
  // Windows it IS the load address, just typed differently.
  HMODULE hMod = GetModuleHandleA("ac_client.exe");

  // Cast HMODULE → uintptr_t so we can do arithmetic on it. C++
  // won't let you add an integer to HMODULE directly. The cast
  // strips the type — same bytes, different label.
  uintptr_t client_base = (uintptr_t)hMod;

  // POINTER CHAIN STEP 1: dereference the static pointer cell that
  // sits at +0x10F4F4 inside the module. This is the AC offset
  // every CE tutorial uses — pointer-scanning surfaces it as the
  // anchor that doesn't move between game launches. *(uintptr_t*)
  // means: treat that address as a uintptr_t pointer, then read
  // through it. The result is the current address of the player
  // struct (which CAN move — it's allocated on the heap).
  uintptr_t player_ptr = *(uintptr_t*)(client_base + 0x10F4F4);

  // POINTER CHAIN STEP 2: HP lives at offset +0xEC inside the
  // player struct. Add the offset to the struct base — done. We
  // now have the absolute address of the HP integer cell. Cache
  // it in the global so the loop below can write to it cheaply.
  HP_ADDR = player_ptr + 0xEC;

  // Diagnostic output. Real DLL: replace with printf, OutputDebugString,
  // or a console window. The simulator pipes 'log' to its own console pane.
  log("MINI TRAINER 1 online — HP_ADDR = " + HP_ADDR);


  // ─── The freeze loop ────────────────────────────────────────────
  //
  // 'while (true)' = run forever. Real DLL: this thread runs until
  // the process exits or the DLL is unloaded. Each iteration:
  //   1. Write 9999 into the HP cell
  //   2. Sleep 16ms (~60 frames per second)
  //
  // The game's damage code keeps subtracting from HP; our loop
  // keeps overwriting it back to 9999. As long as our loop runs
  // faster than the game can kill the player, HP stays pinned.
  while (true) {

    // *(int*)(HP_ADDR) = TARGET_HP;
    //
    // Treat HP_ADDR as a pointer to an int, then write through it.
    // Equivalent to: int* p = (int*)HP_ADDR; *p = TARGET_HP;
    // This is the fundamental "memory write" primitive — the entire
    // game-hacking field is variations on this one line.
    *(int*)(HP_ADDR) = TARGET_HP;

    // Yield 16ms back to the OS. Without this the thread would burn
    // 100% CPU spinning, the game would lag horribly, and the AC
    // would flag the abnormal CPU pattern. 16ms ≈ one frame at 60fps,
    // so we overwrite HP roughly once per game frame — fast enough
    // to win every damage tick race.
    Sleep(16);
  }
  // (Never reached — the loop is infinite.)
}


// ─── DllMain: Windows' entry point ───────────────────────────────
//
// When something LoadLibrary's our DLL, Windows calls DllMain FOUR
// times across the DLL's lifetime — on attach/detach to the process
// and on attach/detach for each thread. We only care about the
// FIRST call (DLL_PROCESS_ATTACH) — that's our chance to spawn the
// worker thread and get out.
//
// 'BOOL WINAPI' = returns BOOL (32-bit int, 0 or 1) with __stdcall.
// 'HINSTANCE hMod' = our own DLL's load address.
// 'DWORD reason' = which of the 4 events is firing (we check this).
// 'LPVOID lpReserved' = unused.
BOOL WINAPI DllMain(HINSTANCE hMod, DWORD reason, LPVOID lpReserved) {

  // DLL_PROCESS_ATTACH = constant value 1. Fires exactly once when
  // the DLL is first mapped into the process. The other reasons
  // (DETACH, THREAD_ATTACH, THREAD_DETACH) we don't care about.
  if (reason == DLL_PROCESS_ATTACH) {

    // Tell Windows: don't bother calling DllMain for every thread
    // the game spawns later. We don't need the notifications, and
    // skipping them is a small performance + stealth win.
    DisableThreadLibraryCalls(hMod);

    // Spawn MainThread on a brand-new OS thread. We must NOT do the
    // cheat work in DllMain itself — DllMain runs under the loader
    // lock, and calling the wrong API there can deadlock the entire
    // process. Always: DllMain → CreateThread → return.
    //
    // Args: (security attrs, stack size, function, parameter, flags, out_thread_id)
    // NULL/0 for everything we don't care about.
    CreateThread(NULL, 0, MainThread, NULL, 0, NULL);
  }

  // Return TRUE = "DLL loaded successfully, keep me in the process."
  // Returning FALSE here would cause Windows to unload us immediately.
  return TRUE;
}
`;

export const mission70 = {
  id: "m70",
  title: "MINI TRAINER 1: SINGLE-ADDRESS FREEZE",
  brief: "5 lines. Hardcode the address, write the value every tick. Your first trainer.",
  prerequisites: ["m24"],
  timeLimit: 180,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "🛠",
    title: "BUILD YOUR OWN TRAINER — STAGE 1",
    body: `Track 4 starts here. From M70 onward you're
building a single growing trainer — by M74 it's a
full mini-Cheat-Engine.

Stage 1 is the bare-minimum injectable DLL. No
menu, no toggle — inject and HP is pinned forever
until you eject. Same shape every commercial
trainer started as.

📖 READ THE TEMPLATE TOP-TO-BOTTOM FIRST.
Every line is annotated — what each Win32 type
means, why GetModuleHandleA exists, what the
pointer chain does, why DllMain spawns a thread
instead of running the cheat directly. If you
can't recite what each piece does, M71-M74 will
feel like magic. Take 5 minutes, read the comments.

Once you understand it, the 👓 hide-comments
toggle above the editor strips everything down to
the ~25 lines of actual code. That's what you'd
ship.

Architecture you're memorizing:
  globals    → state the worker reads/writes
  MainThread → the worker function (loops forever)
  DllMain    → entry point Windows calls; spawns
               MainThread and returns

This pattern is reused in every later trainer
mission. Get it solid here.`,
  },

  hints: [
    {
      id: "compile",
      min: 5,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Read the comments first — every line explains itself. MainThread loops every 16ms writing 9999 to HP_ADDR. DllMain spawns it. Compile + Inject.",
    },
    {
      id: "stand-still",
      when: ({ target, dllState }) =>
        dllState.running && target.player.hp < 9000,
      say: "DLL is running but HP isn't pinned at 9999 yet. Did you uncomment the write_label line? Check the template — onTick should fire every frame.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableHazards();

    dialog.script("VEX", [
      "Welcome to the trainer-building track. By M74 you'll have a full GUI menu trainer. M70 is the foundation — the bare-minimum injectable DLL.",
      "Open the DLL tab and read the template top-to-bottom BEFORE compiling. Every line is annotated: what HMODULE / uintptr_t / DllMain / MainThread mean, why the pointer chain works, why we spawn a thread instead of running the cheat in DllMain. If you skip the comments now, M71-M74 are going to feel like magic.",
      "The architecture: globals hold cached state, MainThread is the worker that loops forever writing HP=9999 every 16ms, DllMain is the entry point Windows calls when the DLL loads — its only job is to spawn MainThread and return. Memorize that shape. Every real trainer ships this skeleton.",
      "Once you've read the annotations, hit Compile + Inject. Walk into the hazard zone. Stand 8 seconds with HP pinned. Win.",
    ]);

    let done = false;
    target._m70StartedAt = performance.now();

    const interval = setInterval(() => {
      if (done) return;
      const elapsed = performance.now() - target._m70StartedAt;
      // Win: 8 seconds elapsed AND HP > 9000 (proving the freeze
      // is keeping it pinned).
      if (elapsed >= 8000 && target.player.hp > 9000) {
        done = true;
        complete("HP pinned for 8 seconds straight. You just wrote your first trainer — same loop pattern as a real-world WriteProcessMemory freeze. M71 adds a toggle next.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
