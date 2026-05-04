// Mission 27 — STAGER
//
// Architecture lesson: a small bootstrap DLL whose only job is to
// load + run a larger payload. Real-world this comes up because:
//
//   - You can iterate on the payload without re-injecting the
//     bootstrap each time (great for development).
//   - The payload can be encrypted / encoded / downloaded at
//     runtime (anti-detection, but also anti-piracy of paid
//     trainers).
//   - Manual mapping is harder than LoadLibrary; doing it once
//     for a tiny stager and then having the stager mmap the real
//     payload is pragmatic.
//
// API: load_payload(sourceString) compiles + runs the source as if
// it were a separate DLL. The payload sees the same API surface
// (register_cheat, register_render_hook, etc), so it can register
// features the same way.
//
// Mission flow:
//   1. Stager template is small — onInject calls load_payload()
//      with an embedded HP-lock payload string.
//   2. Compile + Inject the stager.
//   3. The stager's onInject fires → load_payload() runs the
//      inner payload's onInject AND schedules its onTick.
//   4. Bleed runs for 25s but HP holds at 100 because the
//      payload is doing its job.
//   5. Win = stager injected + payload tick running + HP held.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M27 — STAGER
// A 'loader DLL' whose job is to set up + run a bigger payload.
// Real games would decrypt or download the payload; we embed it
// inline as a string for simplicity.

const PAYLOAD = \`
  // This is the actual cheat — compiled and run by load_payload().
  void onInject() {
    log("payload running inside stager");
  }
  void onTick() {
    write_label("player.hp", 100);
  }
\`;

void onInject() {
  log("stager loaded — bootstrapping payload");
  load_payload(PAYLOAD);
}

void onTick() { /* stager has no per-frame work; payload does */ }
`;

export const mission27 = {
  id: "m27",
  title: "STAGER",
  brief: "Small loader DLL bootstraps a bigger payload. Architecture lesson.",
  prerequisites: ["m26"],
  timeLimit: 240,
  dll: true,
  cheatMenu: true,
  dllTemplate: TEMPLATE,

  hints: [
    {
      id: "compile-and-inject",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Read the template — onInject calls load_payload(PAYLOAD). The PAYLOAD string is itself a DLL with its own onInject + onTick. Compile + Inject the stager; load_payload runs the inner code.",
    },
    {
      id: "watch-it-hold",
      when: ({ dllState, target }) =>
        dllState.running && target.player.hp < 95,
      say: "HP dropping means the payload didn't load. Check the DLL console — load_payload should log 'payload loaded'. If it errored, the inner string has a syntax issue.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableBleed(2, 1100);
    target.enableESP();

    dialog.script("VEX", [
      "Different shape this one. The DLL you're injecting is a STAGER — small, just enough to bootstrap a bigger payload.",
      "Real-world this lets you ship a tiny loader and update the heavy code (the actual cheat) independently. Loader stays the same; payload changes daily.",
      "Template's pre-loaded. onInject calls load_payload() with the inner cheat string. Compile + Inject the stager. The payload's onTick keeps HP locked.",
      "Hold 25 seconds with HP > 95. Lesson: stager + payload is two-DLL architecture done in one process.",
    ]);

    let done = false;
    let healthHoldStart = 0;
    const dllRuntime = window.__hw && window.__hw.dll;

    const interval = setInterval(() => {
      if (done) return;
      if (!dllRuntime) return;
      // Win: stager running + payload tick scheduled + HP held 25s.
      const payloadRunning = dllRuntime._payloadTicks && dllRuntime._payloadTicks.length > 0;
      if (dllRuntime.running && payloadRunning && target.player.hp >= 100) {
        if (healthHoldStart === 0) healthHoldStart = performance.now();
      } else {
        healthHoldStart = 0;
      }
      if (healthHoldStart > 0 && performance.now() - healthHoldStart >= 25000) {
        done = true;
        complete("Stager injected, payload bootstrapped, HP held. Two-stage architecture lands.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
