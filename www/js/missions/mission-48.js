// Mission 48 — STATIC BASE DISCOVERY
//
// User feedback: 'how to find the base address for our game or a
// given game wasn't in our lesson plan.' Right — M24/M29/M47 all
// hardcoded 0x10F4F4 like it was magic. This mission shows where
// that number actually comes from, AND it derives the pointer to
// the PLAYER specifically, because that's what 0x10F4F4 means in
// real AC.
//
// What "base address" means in real game hacking:
//
//   1. MODULE BASE — the virtual address where ac_client.exe is
//      loaded in your process. Windows picks it at launch via
//      ASLR; could be 0x00400000, 0x6A4F0000, anywhere.
//      Recovered with GetModuleHandleA("ac_client.exe").
//
//   2. STATIC OFFSET — the byte offset INSIDE that module to a
//      pointer cell that always points at your dynamic struct.
//      Stable across launches because it's part of the module's
//      compiled .data section. THIS is what you hardcode.
//      For AC: 0x10F4F4, and its VALUE is the LOCAL PLAYER struct.
//
// Real C++ resolves it as:
//   uintptr_t base = (uintptr_t)GetModuleHandleA("ac_client.exe");
//   uintptr_t player = *(uintptr_t*)(base + 0x10F4F4);
//   int* hp = (int*)(player + 0xEC);
//
// Mission flow:
//   1. Find a known player address (player.hp via M2-style scan).
//   2. Pointer scan it. The hit is a static cell whose VALUE
//      is the player struct base. THAT is the simulator's
//      'ac_client.exe + 0x10F4F4'.
//   3. Add the chain to the watchlist. Mission completes.
//   4. Optional RESTART proves the static cell's address never moves.

import { memory } from "../sim-memory.js";

export const mission48 = {
  id: "m48",
  title: "STATIC BASE DISCOVERY",
  brief: "How does anyone find ac_client.exe + 0x10F4F4? Walk through it here — for the player struct.",
  prerequisites: ["m08"],
  timeLimit: 240,
  rebase: true,
  alert: {
    icon: "📍",
    title: "WHERE DID 0x10F4F4 COME FROM?",
    body: `M24, M29, and M47 hand you a hardcoded
'0x10F4F4' like it's gospel. It's not magic — it's the
result of a workflow you've already seen pieces of.

In real AssaultCube, that offset's VALUE is a pointer
to the LOCAL PLAYER struct. So the workflow is:
  1. Find a known player value (player.hp = 100)
  2. Pointer-scan it
  3. The hit's static cell is what 0x10F4F4 points at
  4. Add the chain — that's your trainer's anchor

In real Windows the static cell lives inside ac_client.exe's
.data section, so its address is always
'GetModuleHandleA("ac_client.exe") + 0x10F4F4'.

By the end of this mission you'll know how to derive that
number for any game.`,
  },

  hints: [
    {
      id: "find-player",
      min: 8,
      when: ({ scannerState, watchSize }) =>
        scannerState.lastResults === null && watchSize === 0,
      say: "Step 1: SCANNER → scan player.hp (current value 100). Narrow to one match. '+ watch' it. We're going to pointer-scan it next — the hit reveals where the static pointer to YOUR player lives.",
    },
    {
      id: "pointer-scan",
      min: 4,
      when: ({ watchSize, scannerState }) =>
        watchSize > 0 && (!scannerState.lastPointerResults || scannerState.lastPointerResults.length === 0),
      say: "Step 2: scroll to POINTER SCAN. Target defaults to your first watch. Tap 'Find Pointers'. The result row's ptr address ([0xABC123…]) is the simulator's 'ac_client.exe + 0x10F4F4' — a static cell whose VALUE is the player struct base.",
    },
    {
      id: "add-chain",
      min: 3,
      when: ({ hasChain }) => !hasChain,
      say: "Step 3: tap '+ chain' on the pointer scan result. Now you've got a watchlist entry of the form [STATIC_PTR]+offset. THAT static address is what your C++ trainer would hardcode as 0x10F4F4.",
    },
    {
      id: "prove-survives",
      when: ({ target, hasChain }) =>
        hasChain && target.rebaseCount === 0,
      say: "Step 4 (optional but illuminating): tap RESTART. The entity array relocates. Your player chain stays valid — the static cell's ADDRESS doesn't move, which is exactly why 0x10F4F4 is hardcodable in real AC.",
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();
    target.enableESP();

    dialog.script("VEX", [
      "Foundational lesson nobody told you. M24 had you paste 0x10F4F4 into a DLL template. That number isn't from thin air — it's a static offset INSIDE ac_client.exe pointing at the LOCAL PLAYER struct.",
      "In Windows, every loaded module (.exe, .dll) has TWO address pieces:",
      "  • MODULE BASE — where Windows loaded the module. Random per launch (ASLR). GetModuleHandleA('ac_client.exe') returns this.",
      "  • STATIC OFFSET — bytes from that base to a known pointer in the module's .data section. Stable across launches.",
      "Together: BASE + OFFSET = the absolute address of a pointer that survives restarts. C++ hardcodes the OFFSET; the BASE comes from the API.",
      "This mission walks the workflow for the PLAYER pointer specifically. Scan player.hp (still 100). Pointer-scan the result. The static hit is your simulator's '0x10F4F4'. Add the chain — done.",
    ]);

    let done = false;
    const playerBaseStr = formatAddrCompare(target.playerStructBase);
    const interval = setInterval(() => {
      if (done) return;
      const scanner = window.__hw && window.__hw.scanner;
      if (!scanner) return;
      // Win when player has any chain entry on the watchlist. We don't
      // require it to specifically resolve to the player struct (the
      // pointer-scan step itself can only return a chain whose VALUE
      // matches a watched address, so any chain here implies they did
      // the workflow). We DO want to ensure they finished step 3.
      const hasChain = [...scanner.watch.values()].some(e => e.type === "chain");
      if (hasChain) {
        done = true;
        complete("Static offset derived. That cell's address — converted to module-relative form — is your C++ trainer's hardcoded offset. For real AC, that offset is 0x10F4F4.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};

function formatAddrCompare(n) {
  return "0x" + n.toString(16).toUpperCase().padStart(12, "0");
}
