// Mission 22a — ADVANCED: RAW C++ FORM (optional companion to M21 INTERNAL CHEAT)
//
// User feedback: 'I would add a 22 1/2 advanced same as the other just
// gives transparency and have it optional to advance forward but would
// change the language saying that compared to m22 this is how it would
// formally be written later on what writing in c++'.
//
// Pattern: every DLL mission can have an optional 'raw C++ form'
// sibling that does the EXACT same thing using raw integer addresses
// instead of the simulator's friendly write_label() shortcut.
//
// Why both forms exist:
//   - The friendly form (M21) keeps lessons teachable. You don't have
//     to type out 12-character hex addresses while learning the
//     workflow.
//   - The raw form (this mission) shows what the actual C++ in a real
//     game cheat looks like. No labels, no shortcuts, just integer
//     arithmetic on memory addresses — exactly what you'd write when
//     hacking AssaultCube or any other real game.
//
// Same setup as M21: bleed drains HP, you write a DLL that re-applies
// HP every tick. Win condition is identical: 30s with the DLL running
// and zero deaths. The ONLY difference is the template uses
// addr_of() + raw write() instead of write_label() — mirroring the
// real C++ pointer-arithmetic approach.
//
// This mission is OPTIONAL — not in any other mission's prereq list.
// Players can take it for transparency or skip and move on.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M22.5 ADVANCED — Same HP lock as M22, written in raw-address form
// (the way real C++ cheat code actually looks).
//
// In real C++ on AssaultCube the resolution chain is:
//
//   // 1. Get the module base (where Windows loaded ac_client.exe):
//   HMODULE hMod = GetModuleHandleA("ac_client.exe");
//   uintptr_t client_base = (uintptr_t)hMod;       // e.g. 0x00400000
//
//   // 2. Dereference the static pointer at +0x10F4F4 to get the
//   //    player struct's base address:
//   uintptr_t player_ptr = *(uintptr_t*)(client_base + 0x10F4F4);
//
//   // 3. HP lives at offset +0xEC inside the player struct.
//   //    Write 100 to it:
//   const uintptr_t HP_OFFSET = 0xEC;
//   *(int*)(player_ptr + HP_OFFSET) = 100;
//
// The simulator's addr_of() returns the same final address you'd
// compute from that pointer-arithmetic chain. So we resolve once at
// inject time and stash the integer address — exactly the structure
// a real DLL would have.

let HP_ADDR = null;

void onInject() {
  // Resolve the address once. In real C++ this would be:
  //   uintptr_t player_ptr = *(uintptr_t*)(client_base + 0x10F4F4);
  //   HP_ADDR = player_ptr + 0xEC;
  HP_ADDR = addr_of("player.hp");
  log("Resolved HP address: " + HP_ADDR);
  log("Equivalent C++: HP_ADDR = *(uintptr_t*)(client_base + 0x10F4F4) + 0xEC");
}

void onTick() {
  // RAW write — no friendly label, just an address and a value.
  // Real C++ equivalent (literally):
  //   *(int*)HP_ADDR = 100;
  write(HP_ADDR, 100);
}
`;

export const mission22a = {
  id: "m22a",
  title: "ADVANCED: RAW C++ FORM",
  brief: "Same as M22 but written like real C++ — raw addresses, not friendly labels. Optional, for transparency.",
  prerequisites: ["m21"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  optional: true,   // not gating any later mission
  alert: {
    icon: "🔬",
    title: "TRANSPARENCY: WHAT THE REAL C++ LOOKS LIKE",
    body: `M22 used write_label("player.hp", 100) — the
simulator's friendly shortcut. It works, but it
HIDES the integer math that real C++ DLL code
actually does.

In a real game cheat (e.g., on AssaultCube) the
same operation looks like:

  uintptr_t client_base = (uintptr_t)
    GetModuleHandleA("ac_client.exe");
  uintptr_t player_ptr = *(uintptr_t*)
    (client_base + 0x10F4F4);
  *(int*)(player_ptr + 0xEC) = 100;

Three lines of pointer arithmetic. No labels. The
'0x10F4F4' is the static-pointer offset (M48 lesson).
The '0xEC' is the HP field offset inside the player
struct.

This optional mission shows the same HP-lock effect
as M22, but written using the simulator's RAW-form
APIs (addr_of + write) instead of the friendly form.
Closer to what your actual C++ DLL would look like
when you sit down to write one for AssaultCube.

OPTIONAL — skip if you've got the concept; revisit
when you want the transparency layer.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.compiled,
      say: "Open the DLL tab. Read the comments — this template uses RAW addresses (addr_of + write) instead of friendly labels (write_label). Compile + Inject.",
    },
    {
      id: "watch-hp",
      when: ({ dllState, target }) =>
        dllState.running && target.deaths === 0,
      say: "DLL running. The DLL Console logged the resolved HP address — that's the integer your real C++ would compute via *(uintptr_t*)(client_base + 0x10F4F4) + 0xEC. Hold 30s, no deaths.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableBleed(2, 1100);
    target.enableESP();

    dialog.script("VEX", [
      "Optional transparency mission. M22's friendly write_label is great for learning, but real C++ cheat code looks different — raw integer addresses, pointer arithmetic, no shortcuts.",
      "Template here does the SAME HP-lock as M22, but uses addr_of() to resolve the address once, then write(addr, value) to do the raw write each tick.",
      "Read the comments carefully — they show the equivalent real C++ (the GetModuleHandleA + dereference + offset arithmetic). When you sit down to write a real DLL for AssaultCube, THIS is the form your code will take.",
      "Same win condition as M22: hold HP for 30s with no deaths. Skip if redundant; complete it if you want to see the abstraction stripped away.",
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
        complete("HP held 30s using raw-form addr_of + write. Same effect as M22, written in the form your real C++ DLL would take. The friendly write_label is now visible as a shortcut over the same underlying pointer arithmetic.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
