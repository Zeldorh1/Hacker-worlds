// Mission 45 — MODULE HIDING
//
// Builds on: M41 PROCESS HIDING (same idea, different layer).
// M41 hid your TOOL from the OS-level process list. M45 hides
// your DLL from the GAME PROCESS's loaded-module list.
//
// Why both layers exist: anti-cheat doesn't only ask the OS
// "what processes are running?" — it ALSO asks "what DLLs are
// loaded inside my own process?" via EnumProcessModules /
// Module32First. An injected cheat DLL shows up there. Filter
// it out at the module-enum layer with the same hook pattern.
//
// Mission flow:
//   1. Module shield enabled. "Hacker Worlds Cheat.dll" is in the
//      module list with suspicious=true.
//   2. Naive run: shield finds it within ~5s, mission fails.
//   3. DLL template registers a module-enum hook that filters
//      anything matching "cheat-dll" fingerprint.
//   4. Shield gets filtered list, no detection, game stays open.
//   5. Survive 30s = win.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M45 — MODULE HIDING
//
// Different layer from M41's process hiding.
//   M41: hide YOUR TOOL from OS-level enumeration.
//   M45: hide YOUR DLL from in-process module enumeration.
//
// Real-world: detour on K32EnumProcessModules / Module32First.
// Same architecture as M41 — just a different list to filter.

void onInject() {
  log("hiding cheat DLL from module enumeration");

  register_module_enum_hook(function(modules) {
    return modules.filter(function(m) {
      const name = (m.name || "").toLowerCase();
      const fp   = (m.fingerprint || "").toLowerCase();
      return !name.includes("cheat") && fp !== "cheat-dll";
    });
  });
}

void onTick() { }
`;

export const mission45 = {
  id: "m45",
  title: "MODULE HIDING",
  brief: "AC walks the in-process module list. Hide your DLL there too.",
  prerequisites: ["m44"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,

  hints: [
    {
      id: "compile-fast",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "M41 muscle memory — same hook pattern, different list. Compile + Inject ASAP, before module shield's detection counter crosses threshold.",
    },
    {
      id: "survive",
      when: ({ dllState, target }) =>
        dllState.running && target.moduleShield.detections === 0,
      say: "Hook installed, DLL invisible to EnumProcessModules. Hold 30 seconds.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableESP();
    target.enableModuleShield();

    dialog.script("VEX", [
      "Different layer from M41. M41 hid the tool from the OS process list. M45 hides your DLL from the GAME's own module list — what EnumProcessModules / Module32First returns when called from inside the game's process.",
      "Same hook pattern (register_*_enum_hook), different list to filter. Real anti-cheat queries BOTH layers, so a complete cheat needs both hooks.",
      "Template hooks the module enumeration, filters out anything matching the 'cheat-dll' fingerprint. Compile + Inject before detections cross 3.",
      "Hold 30s clean. Combined with M41 (process hiding), this is full enumeration-layer stealth.",
    ]);

    let done = false;
    let cleanRunSinceMs = 0;

    const interval = setInterval(() => {
      if (done) return;
      if (target.moduleShield.detections >= target.moduleShield.threshold) {
        done = true;
        clearInterval(interval);
        fail("module shield tripped · hook EnumProcessModules first");
        return;
      }
      if (target.moduleShield.detections === 0) {
        if (cleanRunSinceMs === 0) cleanRunSinceMs = performance.now();
      } else {
        cleanRunSinceMs = 0;
      }
      if (cleanRunSinceMs > 0 && performance.now() - cleanRunSinceMs >= 30000) {
        done = true;
        complete("DLL invisible to module enumeration. Both layers covered (M41 + M45) = full enumeration-layer stealth.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
