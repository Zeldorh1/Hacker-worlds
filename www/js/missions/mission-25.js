// Mission 25 — AUTO INJECT
//
// DLL persistence. M21-M24 all required Compile + Inject every mission.
// In real game hacking that's not how anyone ships — the DLL is on
// disk and either auto-loads at game start (DLL hijacking pattern),
// or a loader EXE injects automatically when it sees the game running.
//
// The simulator's persistence: every successful compile saves the
// source to localStorage. Missions with autoInject: true read from
// that store and pre-compile + inject BEFORE the mission's logic
// starts. Player walks into the mission with their DLL already
// running.
//
// Mission flow:
//   1. Player completed M24 with a working HP-patcher DLL.
//      That source is now in localStorage.
//   2. Mission start: app.js sees autoInject + saved source →
//      compiles + injects automatically.
//   3. Status bar: 'auto-injected — running' before the player
//      touches anything.
//   4. Bleed gauntlet starts. HP patcher already running. Player
//      survives without manual intervention.
//   5. Win = DLL was auto-injected + HP > 95 throughout 30s.
//
// Real game equivalent: rename your cheat.dll to SDL.dll, drop it
// in AC's folder. Game starts → loads SDL.dll → DllMain fires →
// _beginthread spawns your cheat thread. You're in before the menu
// even renders.

import { memory } from "../sim-memory.js";

// Fallback template — used if the player has no saved DLL source
// (e.g., they jumped straight to M25 in dev / testing).
const FALLBACK_TEMPLATE = `// M25 — AUTO INJECT (fallback template)
// You don't have a saved DLL from M24, so this is a default HP-lock.
// The address-of-label shortcut is here for the fallback case;
// your real M24 DLL hardcoded the address directly.

void onInject() {
  log("auto-inject fallback DLL loaded");
}

void onTick() {
  write_label("player.hp", 100);
}
`;

export const mission25 = {
  id: "m25",
  title: "AUTO INJECT",
  brief: "Your DLL persists. Walk in with cheats already running.",
  prerequisites: ["m24"],
  timeLimit: 240,
  dll: true,
  dllTemplate: FALLBACK_TEMPLATE,
  autoInject: true,

  hints: [
    {
      id: "look-at-status",
      min: 6,
      when: ({ dllState }) => dllState.running,
      say: "Check the DLL tab — status says 'auto-injected — running' and the console shows your DLL loaded BEFORE you did anything. That's the persistence pattern.",
    },
    {
      id: "watch-hp",
      min: 4,
      when: ({ dllState, target }) =>
        dllState.running && target.player.hp >= 95,
      say: "HP is holding at 100 even with bleed firing — your saved DLL from M24 is doing its job. Hold 30 seconds.",
    },
    {
      id: "fix-it",
      when: ({ dllState, target }) =>
        target.player.hp < 90,
      say: "HP is dropping — your saved DLL didn't restore. Tab to DLL, fix the source (re-paste the address if it's wrong, or hit Compile + Inject manually).",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableBleed(2, 1100);
    target.enableESP();
    target.enableHazards();

    const dllRuntime = window.__hw && window.__hw.dll;
    const wasAutoInjected = dllRuntime && dllRuntime.running;

    dialog.script("VEX", [
      "Final piece of the pipeline. Your DLL from M24 is still on 'disk' (localStorage, in our case).",
      wasAutoInjected
        ? "I can see it — status bar says 'auto-injected — running.' You walked in with cheats already live."
        : "Heads up: I don't see a running DLL. Either you skipped M24 or your saved source didn't compile. Tab to DLL and either Compile + Inject manually, or rebuild it.",
      "Real-world this is what shipping looks like. Rename your cheat.dll to SDL.dll, drop it in the game folder. Game launches, loads your DLL, your cheat thread spawns before the main menu renders.",
      "Hold 30 seconds with HP > 95. Bleed AND hazards are firing — auto-loaded DLL has to do real work.",
    ]);

    let done = false;
    let healthHoldStart = 0;

    const interval = setInterval(() => {
      if (done) return;
      // Track sustained HP for 30s.
      if (target.player.hp >= 95) {
        if (healthHoldStart === 0) healthHoldStart = performance.now();
      } else {
        healthHoldStart = 0;
      }
      if (healthHoldStart > 0 && performance.now() - healthHoldStart >= 30000) {
        done = true;
        complete("DLL persisted, auto-injected, held the gauntlet. That's a shipped trainer.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
