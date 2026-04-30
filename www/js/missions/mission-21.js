// Mission 21 — INTERNAL CHEAT
//
// First DLL. Up till now every cheat ran via the Scanner — an external
// tool poking memory from outside the game's process. M21 flips that:
// the player writes a small piece of code (a 'DLL'), 'compiles' it,
// and 'injects' it into the game process. From inside, that code has
// the same memory access the game itself does, only faster (no IPC
// roundtrip per read/write) and harder to detect.
//
// What the simulator gives them:
//   - A new DLL tab with a textarea pre-populated with template C-style
//     code (functions onInject, onTick).
//   - A compile button that JS-evaluates the body.
//   - An inject button that runs onInject() once then schedules onTick()
//     on requestAnimationFrame (~60Hz, same as the game loop).
//   - An API: write_label("player.hp", 100), freeze_label, log, etc.
//
// Mission flow:
//   1. Bleed is on. HP drains 2 per ~1.1s. Player would die in ~55s.
//   2. Tab to DLL. Code is pre-filled with a simple HP-lock template.
//   3. Hit Compile, then Inject. onTick re-writes player.hp every frame.
//   4. Bleed continues to fire but HP never drops.
//   5. Win = DLL injected continuously for 30s with deaths == 0.
//
// Caveat the dialog flags: this is single-player. In multiplayer, the
// DLL would still hit the M18 server-authority wall — but it gains
// ABILITIES external scanners can't have (function hooks, packet
// interception). Future DLL missions will teach those.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M21 — INTERNAL CHEAT
// This code runs INSIDE the game process via DLL injection.
// onInject() fires once when the DLL loads.
// onTick() fires every frame (~60Hz) — full read/write to memory.

void onInject() {
  log("HP-lock DLL loaded into game process");
}

void onTick() {
  // Re-write HP every frame. Bleed can decrement all it wants;
  // your DLL re-applies 100 the same frame.
  write_label("player.hp", 100);
}
`;

export const mission21 = {
  id: "m21",
  title: "INTERNAL CHEAT",
  brief: "Write a DLL. Compile. Inject. Survive bleed via in-process HP lock.",
  prerequisites: ["m20"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,

  hints: [
    {
      id: "open-dll-tab",
      min: 8,
      when: ({ activeTab, dllState }) => activeTab !== "dll" && !dllState.compiled,
      say: "New tab at the bottom: DLL. Tap it. The editor is pre-loaded with template code that re-writes HP every tick.",
    },
    {
      id: "compile-and-inject",
      min: 4,
      when: ({ dllState }) => !dllState.compiled,
      say: "Read the code — onTick is what runs every frame. Hit Compile (green status if it parses), then Inject. Console will log 'HP-lock DLL loaded.'",
    },
    {
      id: "watch-it-work",
      min: 4,
      when: ({ dllState }) => dllState.compiled && !dllState.running,
      say: "Code's compiled. Tap Inject — the DLL starts running. Tab back to ac_anomaly and watch the HUD: bleed should fire but HP never drops.",
    },
    {
      id: "hold-it",
      when: ({ dllState, target }) =>
        dllState.running && target.deaths === 0 && dllState.injectedFor < 30000,
      say: "Injected. Hold for 30s — DLL just keeps re-applying HP each frame. This is the M2 cheat written from inside the process instead of outside.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableBleed(2, 1100);
    target.enableESP();

    dialog.script("VEX", [
      "First DLL. Every cheat you've shipped so far ran via Scanner — an EXTERNAL tool poking memory from outside the game.",
      "DLLs flip that. Your code gets loaded INTO the game process, runs at the same speed as the game itself, sees the same memory the game does. Faster, harder to detect.",
      "Tap the new DLL tab. Template's pre-loaded — onTick() runs every frame and re-writes HP to 100. That's the entire cheat.",
      "Compile, then Inject. Bleed will keep ticking but HP won't drop. Hold 30 seconds with the DLL running and no deaths.",
      "Heads up: this is the same M2 lesson, just from inside the process. Multiplayer's server-authority limits (M18) still apply. Real DLLs get stronger when they HOOK functions — packets, render calls — which we'll teach next.",
    ]);

    let done = false;
    const startDeaths = target.deaths;
    const dllRuntime = window.__hw && window.__hw.dll;

    const interval = setInterval(() => {
      if (done) return;
      if (!dllRuntime) return;
      if (target.deaths > startDeaths) {
        // Player let bleed kill them — restart the count so they have
        // a chance to recover by injecting the DLL.
        return;
      }
      if (dllRuntime.running && dllRuntime.injectedFor() >= 30000 &&
          target.deaths === startDeaths) {
        done = true;
        complete("DLL held HP for 30s through bleed. You shipped your first internal cheat.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
