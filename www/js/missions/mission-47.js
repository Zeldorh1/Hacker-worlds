// Mission 47 — DLL ANATOMY
//
// User feedback: M24 was great but pasting templates without
// understanding each line leaves a gap. By M25 the player has
// shipped DLLs but can't write one from scratch. This mission
// slows down and breaks the C++ skeleton apart, line by line.
//
// Every line of the template has a // C++: comment showing the
// real Windows equivalent. Player reads through, understands what
// each piece does, then completes a small fill-in to demonstrate
// understanding. The lesson is structural, not feature-y.
//
// What this mission answers:
//   - What's DllMain and why does Windows require it?
//   - What's the cheat-thread pattern (_beginthread + while loop)?
//   - How do you get the game's module base (GetModuleHandle)?
//   - How does pointer arithmetic + cast work in C++?
//   - What's Sleep(16) for?
//   - When the template targets a DIFFERENT game like AssaultCube,
//     what changes vs what stays?

import { memory } from "../sim-memory.js";

const TEMPLATE = `// =============================================================
//  M47 — DLL ANATOMY
//
//  Every line below pairs the SIMULATOR call with the REAL C++
//  it would be in a Windows DLL. Read top to bottom. The
//  fill-in is at the bottom — write the simulator-API equivalent
//  of one line of C++. Compile + Inject when done.
// =============================================================

// onInject() runs once when the DLL loads. Real Windows DLLs:
//
//   BOOL WINAPI DllMain(HINSTANCE hInst, DWORD reason, LPVOID) {
//       if (reason == DLL_PROCESS_ATTACH) {
//           DisableThreadLibraryCalls(hInst);   // micro-optimization
//           _beginthreadex(nullptr, 0,
//                          cheat_thread, nullptr, 0, nullptr);
//       }
//       return TRUE;
//   }
//
// reason can be DLL_PROCESS_ATTACH (1), DLL_PROCESS_DETACH (0),
// DLL_THREAD_ATTACH (2), DLL_THREAD_DETACH (3). We only act on
// PROCESS_ATTACH. The simulator doesn't expose the reason — it
// just calls onInject() once on load, equivalent to ATTACH.
//
// _beginthreadex spawns a new OS thread that runs cheat_thread.
// The simulator skips this — its onTick() runs every frame
// automatically, so we don't need our own thread.

void onInject() {
  // C++: OutputDebugStringA("DLL loaded into ac_client.exe");
  log("DLL loaded into game process");

  // C++ would resolve the game's module base ONCE here:
  //   HMODULE hMod = GetModuleHandleA("ac_client.exe");
  //   if (!hMod) return;
  //   uintptr_t base = (uintptr_t)hMod;
  // Then the cheat_thread would use 'base' for its writes.
  //
  // The simulator has no per-mission module base — labels resolve
  // directly. So we skip the GetModuleHandle dance.
}

// onTick() is called every frame (~60Hz). Real Windows DLL would
// be a separate thread with this as its loop body:
//
//   DWORD WINAPI cheat_thread(LPVOID) {
//       HMODULE hMod = GetModuleHandleA("ac_client.exe");
//       uintptr_t base = (uintptr_t)hMod;
//       while (true) {                      // forever
//           // ... per-frame work ...
//           Sleep(16);                       // ~60Hz throttle
//       }
//       return 0;
//   }
//
// Sleep(16) yields the CPU for 16ms, giving you ~60 ticks/sec.
// Lower = more CPU, more responsive cheat. Higher = less CPU,
// less reactive. 16ms is the standard.

void onTick() {
  // ----------------------------------------------------------
  // The actual work: hold HP at 100. Real C++ for AssaultCube:
  //
  //   uintptr_t hMod   = (uintptr_t)GetModuleHandleA("ac_client.exe");
  //   uintptr_t player = *(uintptr_t*)(hMod + 0x10F4F4);
  //   if (player) {
  //       *(int*)(player + 0xEC) = 100;
  //   }
  //
  // Breaking that down:
  //   GetModuleHandleA → returns the base address of ac_client.exe
  //   hMod + 0x10F4F4 → address of the static pointer to player
  //   *(uintptr_t*)... → dereferences that pointer (read 8 bytes
  //                       on 64-bit, 4 bytes on 32-bit)
  //   if (player)      → guard: pointer might be null between
  //                       map loads
  //   player + 0xEC    → address of the HP int inside the struct
  //   *(int*)... = 100 → cast to int* and write 100 (4 bytes)
  //
  // In the simulator we have a label shortcut. FILL IN BELOW:
  // write 100 to "player.hp" using the simulator's label API.
  // (Hint: write_label takes 2 args.)
  // ----------------------------------------------------------

  /* FILL IN HERE: */
  write_label("player.hp", 100);
}

// =============================================================
//  Will this carry over to AssaultCube?
//
//  YES — the structure is universal. Every Windows DLL targeting
//  any game has the SAME skeleton:
//      DllMain → spawn thread → while-loop → Sleep
//
//  What CHANGES per game:
//    1. Module name        ("ac_client.exe", "Game.exe", etc)
//    2. Static offset      (0x10F4F4 for AC's player base ptr)
//    3. Struct offsets     (0xEC for HP in AC's player struct)
//    4. Anti-cheat layers  (AC has none; commercial games have
//                            kernel AC, signature scans, etc)
//
//  What STAYS THE SAME:
//    1. DllMain signature + reason switch
//    2. _beginthread pattern for the cheat thread
//    3. while (true) { ... Sleep(16); } loop
//    4. Pointer arithmetic + cast pattern
//    5. NULL guards on resolved pointers
//
//  Master this one skeleton — you can write a trainer for ANY
//  Win32 game by swapping in the per-game offsets.
// =============================================================
`;

export const mission47 = {
  id: "m47",
  title: "DLL ANATOMY",
  brief: "Slow down. Read each line of the C++ skeleton. Understand the whole structure.",
  prerequisites: ["m24"],   // Anytime after the offset → DLL bridge
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,

  hints: [
    {
      id: "read-it",
      min: 12,
      when: ({ dllState }) => !dllState.compiled,
      say: "Read the template top to bottom — every line has a // C++: comment showing the Windows equivalent. The fill-in spot is in onTick. Hint: write_label('player.hp', 100).",
    },
    {
      id: "compile-and-inject",
      min: 6,
      when: ({ dllState }) => dllState.compiled && !dllState.running,
      say: "Compiled. Now Inject. The DLL's onTick will hold HP at 100 every frame, even with bleed firing.",
    },
    {
      id: "hold-hp",
      when: ({ dllState, target }) =>
        dllState.running && target.player.hp < 95,
      say: "HP dropped — your write_label might be missing or wrong. Eject, check the fill-in line, re-Inject.",
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();
    target.enableBleed(2, 1100);
    target.enableESP();

    dialog.script("VEX", [
      "Slowdown mission. By now you've shipped 5 DLLs but pasted templates without breaking down each line. Today: read every line, understand what each piece does in real C++.",
      "Template's heavy with comments. Every simulator call has a '// C++: ...' comment showing the Windows equivalent. DllMain, _beginthread, GetModuleHandle, pointer arithmetic, Sleep — all explained.",
      "There's one fill-in line in onTick. The comment tells you what the C++ equivalent does; you write the simulator-API version. (Hint: it's a single write_label call.)",
      "Bottom of the template answers your question: would this template carry over to AssaultCube? Read the 'Will this carry over' section. Spoiler: yes, the skeleton is universal — only the offsets change.",
      "Codex 'DLL Anatomy — Reading the C++ Line by Line' has the deep version.",
    ]);

    let done = false;
    let healthHoldStart = 0;
    const dllRuntime = window.__hw && window.__hw.dll;

    const interval = setInterval(() => {
      if (done) return;
      if (!dllRuntime) return;
      // Win = DLL running + HP held at 100 for 20s.
      if (dllRuntime.running && target.player.hp >= 100) {
        if (healthHoldStart === 0) healthHoldStart = performance.now();
      } else {
        healthHoldStart = 0;
      }
      if (healthHoldStart > 0 && performance.now() - healthHoldStart >= 20000) {
        done = true;
        complete("Skeleton's clear. Same structure works for any Win32 game — only the per-game offsets change.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
