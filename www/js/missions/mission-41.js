// Mission 41 — PROCESS HIDING (HackShield bypass)
//
// User scenario: a HackShield-class anti-cheat runs alongside the
// game, scans the OS process list every ~1.5s, and force-closes the
// game the moment it spots a known cheat tool ("Hacker Worlds
// Scanner" in our sim). Renaming the .exe doesn't help because
// real shields also check window titles, file hashes, loaded
// modules. The only working bypass is to actually HIDE the tool
// from the OS process enumeration.
//
// Real-world: this is what nProtect GameGuard, BattlEye user-mode
// shim, and Vanguard's process-walker all do. The bypass is to
// hook the OS's process-list call (NtQuerySystemInformation on
// Windows) and filter out your tool BEFORE the shield iterates.
//
// Mission flow:
//   1. Shield is on. Sim's process list contains "Hacker Worlds
//      Scanner" with suspicious=true.
//   2. Naive run: shield finds it within ~5s, mission fails.
//   3. DLL template registers a proc-enum hook that filters out
//      anything matching the scanner fingerprint.
//   4. Shield calls the hook chain → gets list without scanner →
//      no detection → game stays open.
//   5. Survive 30s = win.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M41 — PROCESS HIDING
//
// HackShield-style scanner walks the OS process list every ~1.5s.
// "Hacker Worlds Scanner" is in there. Renaming won't help (the
// shield also checks fingerprints/hashes). We have to hide it.
//
// register_proc_enum_hook(fn) is the simulator equivalent of
// hooking NtQuerySystemInformation. fn(processes) gets the current
// list; return a filtered list and that's what the AC walks.
//
// Real Windows C++ would be a MinHook detour on
// ntdll.NtQuerySystemInformation that filters the SystemProcess
// information class before returning to the caller.

void onInject() {
  log("installing process-enum hook — Scanner will be invisible to AC");

  register_proc_enum_hook(function(processes) {
    // Drop anything matching our tool's fingerprint.
    return processes.filter(function(p) {
      // Shield checks BOTH fingerprint AND name in real systems.
      // Drop on either match.
      const name = (p.name || "").toLowerCase();
      const fp   = (p.fingerprint || "").toLowerCase();
      return !name.includes("scanner") && !fp.includes("scanner");
    });
  });
}

void onTick() { }
`;

export const mission41 = {
  id: "m41",
  title: "PROCESS HIDING",
  alert: {
    icon: "🛡",
    title: "HACKSHIELD INTRODUCED — GAME WON'T LAUNCH",
    body: `🚨 EMERGENCY PATCH — 3.0:
> 'HackShield' anti-cheat now runs ALONGSIDE the game.
> The moment Cheat Engine is detected on the system,
> the game force-closes. Renaming the .exe doesn't help
> — HackShield checks file hashes, window titles, loaded
> modules, IAT signatures.

This is the wall every cheater eventually hits. You can't
just rename your tool — HackShield knows the bytes.

Fix: hide the tool from the OS process list entirely.
Hook NtQuerySystemInformation (Windows process-list call)
in your DLL, filter your tool out of the list before
HackShield walks it. AC asks the OS what's running, OS
sends a list MINUS your scanner, AC sees nothing
suspicious, game stays open.

Same arms race that produced stealth-CE forks, VMProtect
wrappers, and 'run CE in a VM' workflows. You're entering
the ring of the actual fight now.`,
  },
  brief: "AC scans the OS process list for your tool. Hook the enum to hide it.",
  prerequisites: ["m40"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,

  hints: [
    {
      id: "see-the-shield",
      min: 6,
      when: ({ target }) =>
        target.cheatShield.detections > 0 && target.cheatShield.detections < target.cheatShield.threshold,
      say: "Shield sees you — detections counter is climbing. If it crosses 3 the mission fails. Inject the DLL FAST: it filters the scanner out of the process list before the shield reads it.",
    },
    {
      id: "compile-and-inject",
      min: 4,
      when: ({ dllState }) => !dllState.running,
      say: "Read the template — register_proc_enum_hook intercepts the OS call, returns a list WITHOUT 'Hacker Worlds Scanner'. Compile + Inject. Shield gets the filtered list, no match, no fail.",
    },
    {
      id: "now-survive",
      when: ({ dllState, target }) =>
        dllState.running && target.cheatShield.detections === 0,
      say: "Hook installed, scanner invisible. Hold 30 seconds. Shield keeps scanning but always gets the filtered list — never detects.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableESP();
    target.enableCheatShield();

    dialog.script("VEX", [
      "Different anti-cheat layer. HackShield runs alongside the game and scans the OS process list every 1.5s. 'Hacker Worlds Scanner' is in there — labeled suspicious. Three detections = game closes (mission fail).",
      "Renaming the .exe doesn't work — real shields also check window titles, file hashes, loaded modules. You have to actually HIDE the tool from the OS process list.",
      "Real Windows: hook ntdll.NtQuerySystemInformation, filter the process list before returning. Sim equivalent: register_proc_enum_hook(fn). Template does it in 8 lines.",
      "Compile + Inject ASAP. Once the hook's installed, the shield gets the filtered list every scan. Hold 30 seconds = mission complete.",
    ]);

    let done = false;
    const startedAt = performance.now();
    let cleanRunSinceMs = 0;

    const interval = setInterval(() => {
      if (done) return;
      // Mission-fail: shield crossed detection threshold.
      if (target.cheatShield.detections >= target.cheatShield.threshold) {
        done = true;
        clearInterval(interval);
        fail("game closed by anti-cheat · hook the proc-enum to hide");
        return;
      }
      // Track 'clean run' — when detections is at 0.
      if (target.cheatShield.detections === 0) {
        if (cleanRunSinceMs === 0) cleanRunSinceMs = performance.now();
      } else {
        cleanRunSinceMs = 0;
      }
      // Win after 30s of clean (no detections accumulating).
      if (cleanRunSinceMs > 0 && performance.now() - cleanRunSinceMs >= 30000) {
        done = true;
        complete("30s undetected. Process hiding via API hook is exactly what every real cheat does to survive HackShield-class scanners.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
