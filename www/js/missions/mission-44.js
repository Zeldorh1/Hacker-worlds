// Mission 44 — AOB PATTERN SCAN
//
// Builds on: M16 STRUCT DISCOVERY (you know what the player
// struct LOOKS LIKE), M21 INTERNAL CHEAT (DLL workflow), M24
// OFFSET TO DLL (hardcoded address). Problem: hardcoded
// addresses go stale on game updates / restarts. Fix: have the
// DLL find the player struct ITSELF at startup by searching
// memory for a known unique byte pattern.
//
// "AOB" = Array of Bytes scan. Real Cheat Engine has it built-in.
// Real cheats use it so the trainer survives game patches that
// move offsets around.
//
// In this sim: the player struct's first 5 fields are
// {hp:100, ammo:30, x:5, y:5, moveCooldownMs:110}. That sequence
// is unique in memory. find_pattern([100, 30, 5, 5, 110]) returns
// the address of the first cell — i.e., the player struct base.
// From there you can apply known offsets (+0x00 = hp, etc).

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M44 — AOB PATTERN SCAN
//
// Hardcoding addresses (M24 lesson) breaks when the game's memory
// layout changes. Fix: scan memory for a unique byte pattern that
// identifies the struct, then derive everything else from there.
//
// The simulator's player struct starts with
//   +0x00 hp=100, +0x04 ammo=30, +0x08 x=5, +0x0C y=5, +0x10 cooldown=110
// at fresh-mission start. That 5-cell sequence is unique enough
// to identify the struct base via find_pattern.
//
// Real-world equivalent: scan for a unique sequence of x86
// instructions or known float constants near the function that
// reads HP. Trainer rebuilds offsets at startup, no recompile
// needed for game updates.

let playerBase = null;

void onInject() {
  // Scan for the player struct's unique starting pattern.
  playerBase = find_pattern([100, 30, 5, 5, 110]);
  if (!playerBase) {
    log("AOB scan FAILED — pattern not found");
    return;
  }
  log("AOB found player struct at " + playerBase);

  // Now patch HP using the discovered base + known offset (+0x00).
  // Real C++: *(int*)((uintptr_t)playerBase + OFF_HP) = 100;
  // We'll keep HP at 100 every tick.
  register_cheat("Self-Located Lock", function() {
    write(playerBase, 100);   // playerBase IS the HP cell (+0x00 of struct)
  });
}

void onTick() { }
`;

export const mission44 = {
  id: "m44",
  title: "AOB PATTERN SCAN",
  brief: "Self-resolve the player struct via byte-pattern. No hardcoded address.",
  prerequisites: ["m43"],
  timeLimit: 200,
  dll: true,
  dllTemplate: TEMPLATE,
  cheatMenu: true,

  hints: [
    {
      id: "compile-and-inject",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Read the template — find_pattern([100, 30, 5, 5, 110]) scans memory for the player struct's signature. Compile + Inject. Console logs the discovered address.",
    },
    {
      id: "tick-cheat",
      when: ({ dllState, target }) =>
        dllState.running && target.player.hp < 95,
      say: "DLL found the struct. Open ≡ CHEATS, tick 'Self-Located Lock'. Bleed fires but HP stays at 100 — DLL didn't need a hardcoded address.",
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();
    target.enableBleed(2, 1100);
    target.enableESP();

    dialog.script("VEX", [
      "Trainer-survives-game-updates lesson. M24 hardcoded the HP address into the DLL — works for ONE session, breaks if the game reshuffles memory.",
      "Real cheats use AOB (array-of-bytes) scans: search memory for a unique byte sequence that identifies the struct, derive offsets from there. Pattern doesn't change across game versions.",
      "Template scans for [100, 30, 5, 5, 110] — your starting hp/ammo/x/y/cooldown. Sequence is unique enough to find the struct anywhere.",
      "Compile + Inject. Tick 'Self-Located Lock'. Survive 25s of bleed without dying — DLL found and patched its own offsets.",
    ]);

    let done = false;
    let healthHoldStart = 0;
    const dllRuntime = window.__hw && window.__hw.dll;

    const interval = setInterval(() => {
      if (done) return;
      if (!dllRuntime) return;
      const cheatOn = dllRuntime.cheats.find(c => c.label === "Self-Located Lock" && c.enabled);
      if (cheatOn && target.player.hp >= 100) {
        if (healthHoldStart === 0) healthHoldStart = performance.now();
      } else {
        healthHoldStart = 0;
      }
      if (healthHoldStart > 0 && performance.now() - healthHoldStart >= 25000) {
        done = true;
        complete("AOB scan found the struct, lock applied via discovered base. Same trainer ships across game versions without rebuilding.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
