// Mission 29 — EXPORT TO C++
//
// The bridge mission. Everything you've built in the simulator is JS
// running against fake memory. This mission flips that: the editor
// gets an "Export → C++" button that translates your sim DLL into
// a real AssaultCube-targeting .cpp file with hardcoded AC offsets.
//
// The .cpp it emits is buildable in Visual Studio 2017+ as a 32-bit
// DLL. Output: AC_Trainer.dll, ready to inject into ac_client.exe.
//
// Mission flow:
//   1. Template's pre-loaded with a stack of cheats: HP, ammo,
//      damage, aimbot, render hook. Same DLL you'd actually want to
//      ship for AC.
//   2. Compile + Inject — verify it works in the sim.
//   3. Tap "Export → C++". The DLL console fills with the
//      generated .cpp file.
//   4. Mission completes when the export is generated AND it
//      contains the required pieces (AC offsets, DllMain, cheat
//      thread).
//
// What the player walks away with: a real .cpp source file they
// can drop into a VS DLL project, build, inject. Their sim DLL
// becomes their AC trainer with one click.

import { memory } from "../sim-memory.js";
import { exportToCpp } from "../cpp-export.js";

const TEMPLATE = `// M29 — EXPORT TO C++
// Build a feature-complete trainer in the simulator. Hit the
// "Export → C++" button to translate it into AssaultCube-targeting
// C++ with the AC offsets baked in.
//
// You can edit, compile + inject in the sim to verify behavior,
// THEN export. The exported .cpp is buildable in Visual Studio.

void onInject() {
  log("trainer DLL loaded — multi-feature stack");

  register_cheat("Infinite HP", function() {
    write_label("player.hp", 100);
  });

  register_cheat("Infinite Ammo", function() {
    write_label("player.ammo", 99);
  });

  register_cheat("Super Damage", function() {
    write_label("weapon.damage", 200);
  });

  register_cheat("Aimbot", function() {
    const sim = window.__hw.target;
    let bestId = 0, bestDist = Infinity;
    for (const e of sim.enemyManager.enemies) {
      if (!e.alive) continue;
      const dx = e.x - sim.player.x;
      const dy = e.y - sim.player.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestId = e.id; }
    }
    if (bestId > 0) write_label("crosshair.target", bestId);
  });

  register_render_hook(function(ctx, sim) {
    const T = sim.tile_size();
    for (const e of sim.enemies()) {
      if (!e.alive) continue;
      const [px, py] = sim.tile_to_screen(e.x, e.y);
      ctx.strokeStyle = "#22d3ee";
      ctx.strokeRect(px, py, T, T);
    }
  });
}

void onTick() { }
`;

export const mission29 = {
  id: "m29",
  title: "EXPORT TO C++",
  brief: "Build the sim DLL, hit Export, get an AC-ready .cpp file.",
  prerequisites: ["m28"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  cheatMenu: true,
  cppExport: true,

  hints: [
    {
      id: "compile-first",
      min: 6,
      when: ({ dllState }) => !dllState.compiled,
      say: "Read the template — it stacks HP / ammo / damage / aimbot / ESP. Compile first to verify it parses cleanly. Don't even need to Inject yet.",
    },
    {
      id: "hit-export",
      min: 4,
      when: ({ dllState }) => dllState.compiled,
      say: "Compiled cleanly? Hit the 'Export → C++' button. The console panel fills with a real .cpp file targeting ac_client.exe — AC offsets baked in, DllMain wired, MinHook scaffolding for the render hook.",
    },
    {
      id: "look-at-output",
      min: 2,
      when: ({ dllState }) => dllState.compiled,
      say: "Scroll the console. You'll see #include <windows.h>, OFF_PLAYER_BASE_PTR = 0x10F4F4, the cheat_thread loop with HP write, the DllMain entry point. That's a real Visual Studio source file. Drop it in a VS DLL project, build, inject.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableESP();

    dialog.script("VEX", [
      "Bridge mission. Everything in the sim has been JS against fake memory. This converts your work into a real AssaultCube DLL.",
      "Template's pre-loaded with a feature-complete trainer: HP / ammo / damage / aimbot / ESP. Compile to verify it parses.",
      "Hit 'Export → C++'. The console panel fills with a buildable .cpp file. Real Win32 includes, real AC offsets (0x10F4F4 for the player base pointer, 0xEC for HP, etc.), real DllMain, real cheat thread.",
      "What you do with that file: VS 2017+ → New Project → DLL → drop the .cpp in → /MT runtime → Build → AC_Trainer.dll. Inject. Cheat applies to ac_client.exe.",
      "This is the mission that closes the loop between simulator and reality. Your work transfers.",
    ]);

    let done = false;
    let exportedAt = 0;
    const $console = document.getElementById("dll-console");

    const interval = setInterval(() => {
      if (done) return;
      if (!$console) return;
      const txt = $console.textContent || "";
      // Win when the generated C++ shows up (detected by AC-specific
      // identifier strings) AND has been visible for at least 2s
      // (gives the player time to read it).
      const looksLikeExport =
        txt.includes("OFF_PLAYER_BASE_PTR") &&
        txt.includes("ac_client.exe") &&
        txt.includes("cheat_thread");
      if (looksLikeExport && exportedAt === 0) {
        exportedAt = performance.now();
      }
      if (exportedAt > 0 && performance.now() - exportedAt >= 2000) {
        done = true;
        complete("Exported — that's a real AssaultCube trainer source. Drop it in Visual Studio, build, inject. Curriculum closes the loop.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
