// Mission 46 — ANTI-DEBUG BYPASS
//
// Builds on: M32 (signature scan), M41 (process hiding), M45
// (module hiding). Final layer of the anti-cheat stack: AC checks
// whether a debugger is attached to its process. Real Windows
// has at least four detection vectors (IsDebuggerPresent, PEB
// BeingDebugged byte, NtQueryInformationProcess(ProcessDebugPort),
// hardware breakpoint detection). All can be hooked to lie back.
//
// Mission flow:
//   1. Sim's debugger.detected = true (pretends a debugger is
//      attached). Shield calls a fake IsDebuggerPresent every ~1.2s.
//   2. Naive: detection counter climbs every check, fails in ~5s.
//   3. DLL hooks register_isdebugger_hook to return false.
//   4. Shield's check returns false → no detection → game stays.
//   5. Survive 30s.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M46 — ANTI-DEBUG BYPASS
//
// AC asks: 'is a debugger attached to me?' The OS returns true.
// Hook the answer, return false. Game thinks it's running clean.
//
// Real Windows has four detection vectors — patching one isn't
// always enough. Pro cheats hook ALL of them:
//   1. IsDebuggerPresent      — kernel32 export, simple
//   2. PEB.BeingDebugged       — write 0 to the PEB byte directly
//   3. NtQueryInformationProcess(ProcessDebugPort) — return 0
//   4. Hardware breakpoints   — clear DR0-DR7 registers each tick
//
// Sim covers #1. The pattern transfers to all four.

void onInject() {
  log("anti-debug bypass loaded — IsDebuggerPresent will lie");

  register_isdebugger_hook(function(detected) {
    // Always say no, regardless of what the OS reports.
    return false;
  });
}

void onTick() { }
`;

export const mission46 = {
  id: "m46",
  title: "ANTI-DEBUG BYPASS",
  alert: {
    icon: "🐛",
    title: "ANTI-CHEAT NOW CHECKS FOR DEBUGGERS",
    body: `Patch 3.2 — final AC layer:
> Game now refuses to run if any debugger is attached.
> Calls IsDebuggerPresent every 1.2s. Three positive
> checks in a row = forced disconnect.

This is the last common AC technique. Real Windows has
four detection vectors:
  1. IsDebuggerPresent (kernel32 export)
  2. PEB.BeingDebugged (single byte)
  3. NtQueryInformationProcess(ProcessDebugPort)
  4. Hardware breakpoint registers (DR0-DR7)

Pro cheats hook all four. Sim covers #1 — same pattern.

Combined with everything from M32, M33, M41, M45, you've
covered the full surface area of common anti-cheat. No
single layer is the answer; defending against modern AC
is stacking ALL of these.`,
  },
  brief: "AC checks for debuggers. Hook the call to lie. 30s clean = win.",
  prerequisites: ["m45"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,

  hints: [
    {
      id: "compile-fast",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Detection's already climbing — sim claims a debugger is attached. Compile + Inject. The hook returns false, AC believes it.",
    },
    {
      id: "watch-detections",
      when: ({ dllState, target }) =>
        dllState.running && target.debugger.detections === 0,
      say: "Hook live. Detections stay at 0. Hold 30s to clear the contract.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableESP();
    target.enableDebuggerCheck();

    dialog.script("VEX", [
      "Last layer of the AC stack. Anti-cheat asks the OS 'is a debugger attached?' OS says yes (sim pretends so for the lesson). Three positive checks in a row → mission fails.",
      "Bypass: hook the IsDebuggerPresent call, return false regardless. Real Windows has 4+ detection vectors — IsDebuggerPresent, PEB BeingDebugged, NtQueryInformationProcess, hardware breakpoint registers. Pro cheats patch all of them.",
      "Sim covers vector #1. Hook returns false. Compile + Inject before detections cross 3. Hold 30s clean = mission complete.",
      "Combined with M32 (string sig), M33 (behavior), M41 (process hide), M45 (module hide), and M46 (anti-debug), you've covered the full surface area of common AC.",
    ]);

    let done = false;
    let cleanRunSinceMs = 0;

    const interval = setInterval(() => {
      if (done) return;
      if (target.debugger.detections >= target.debugger.threshold) {
        done = true;
        clearInterval(interval);
        fail("anti-debug check tripped · hook IsDebuggerPresent first");
        return;
      }
      if (target.debugger.detections === 0) {
        if (cleanRunSinceMs === 0) cleanRunSinceMs = performance.now();
      } else {
        cleanRunSinceMs = 0;
      }
      if (cleanRunSinceMs > 0 && performance.now() - cleanRunSinceMs >= 30000) {
        done = true;
        complete("Anti-debug bypassed. Full anti-cheat surface covered: signature, behavior, process, module, debugger.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
