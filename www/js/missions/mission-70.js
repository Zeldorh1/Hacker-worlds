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

const TEMPLATE = `// MINI TRAINER 1 — Single-address HP freeze.
// Real injectable-DLL skeleton: DllMain spawns a thread, the thread
// resolves the chain once, then the while-loop writes every tick.
// Compile this with MSVC as a 32-bit DLL and inject — same code,
// real AssaultCube.

#include <windows.h>

const int TARGET_HP = 9999;
uintptr_t HP_ADDR = 0;

DWORD WINAPI MainThread(LPVOID lpParam) {
  HMODULE hMod = GetModuleHandleA("ac_client.exe");
  uintptr_t client_base = (uintptr_t)hMod;
  uintptr_t player_ptr = *(uintptr_t*)(client_base + 0x10F4F4);
  HP_ADDR = player_ptr + 0xEC;
  log("MINI TRAINER 1 online — HP_ADDR = " + HP_ADDR);

  while (true) {
    *(int*)(HP_ADDR) = TARGET_HP;
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
    body: `Track 4 starts here. Up to now each mission has
focused on ONE technique. From M70 onward, you're
building a single growing trainer that becomes your
capstone project.

Stage 1 is the smallest possible cheat:

  void onTick() {
      write_label("player.hp", 9999);
  }

One line in the tick loop. Every frame, write 9999.
The hazard zone tries to damage you; your loop
overwrites faster. Net effect: invincible.

Real C++ equivalent (external trainer):
  while (running) {
      WriteProcessMemory(hGame, hp_addr,
                         &target, sizeof(int), NULL);
      Sleep(50);
  }

This is the foundation. M71 adds a toggle (so you
can turn the cheat off). M72 adds multiple features
in one menu. M73 builds your own GUI with render
hooks. By M74 you have a full mini-Cheat-Engine
inside the simulator — same architecture as a real
trainer.`,
  },

  hints: [
    {
      id: "compile",
      min: 5,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template is 5 lines — onInject logs, onTick writes 9999 to player.hp every frame. Compile + Inject.",
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
      "Welcome to the trainer-building track. From here on, every mission grows YOUR trainer. By the end you'll have a full GUI menu trainer running inside the simulator.",
      "Stage 1 is the smallest possible cheat: one address, one loop. Template freezes HP at 9999 by writing it every tick. Hazard zone normally drains HP fast — with the trainer running, HP stays pinned.",
      "Real C++ equivalent: the external trainer skeleton from the Windows API codex article. WriteProcessMemory in a loop. Same pattern.",
      "Compile + inject. Walk into the hazard zone. Stand 8 seconds. Win.",
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
