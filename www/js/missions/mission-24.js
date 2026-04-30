// Mission 24 — OFFSET TO DLL
//
// The pipeline mission. Up till now you either used SCANNER (external)
// or wrote a DLL that called write_label("player.hp", ...) — which
// hides the address behind a friendly name. Real game hacking doesn't
// have label lookups; you scan, get a hex address, and HARDCODE it
// in your C++ source. This mission walks that exact pipeline:
//
//   1. SCANNER → scan for current HP value → narrow → watch.
//   2. Copy the surviving address (long-press in mobile, or read it
//      off the watchlist).
//   3. DLL tab — template has a const TARGET_ADDR placeholder.
//      Paste the address there.
//   4. Compile + Inject. The DLL writes 100 to that exact address
//      every frame, no label lookup.
//   5. Bleed continues to fire but HP never drops.
//
// Real game equivalent: your CE pointer scan tells you 'HP lives at
// game.exe + 0x14B240'. You hardcode that in your trainer source:
//   uintptr_t hp_addr = base + 0x14B240;
//   *(int*)hp_addr = 100;
// Same hack, real Windows. Codex 'Real-World Bridge' walks the
// AssaultCube version.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M24 — OFFSET TO DLL
// Real game-hacking pipeline. NO LABELS — just an address you scanned.
//
// 1. Tab to SCANNER. Scan your HP (read from HUD), narrow it.
// 2. '+ watch' the survivor. Copy its address (it's the value in
//    the addr column of your watchlist entry).
// 3. Paste it below where TARGET_ADDR says.
// 4. Compile + Inject. The DLL writes 100 to that address every tick.

const TARGET_ADDR = "0x____________";   // <- paste HP address here

void onInject() {
  log("HP patcher armed for: " + TARGET_ADDR);
  if (TARGET_ADDR.indexOf("_") >= 0) {
    log("WARNING: address still has placeholders — paste a real address");
  }
}

void onTick() {
  // Direct write to a hardcoded address. No label lookup.
  // Real C++ equivalent: *(int*)TARGET_ADDR = 100;
  write(TARGET_ADDR, 100);
}
`;

export const mission24 = {
  id: "m24",
  title: "OFFSET TO DLL",
  brief: "Scan an address. Paste it into a DLL. Watch your code use it.",
  prerequisites: ["m23"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,

  hints: [
    {
      id: "scan-hp",
      min: 8,
      when: ({ scannerState, watchSize }) =>
        scannerState.lastResults === null && watchSize === 0,
      say: "Standard play: SCANNER tab, scan your HP (HUD shows it). Take a hazard hit or wait for bleed, narrow with 'decreased'. Watch the survivor.",
    },
    {
      id: "copy-address",
      min: 4,
      when: ({ watchSize, dllState }) =>
        watchSize >= 1 && !dllState.compiled,
      say: "Got HP watched? The address is the long hex string in your watchlist entry. Long-press to select-copy on mobile. Then DLL tab → paste over the underscores in TARGET_ADDR.",
    },
    {
      id: "compile-inject",
      min: 4,
      when: ({ dllState }) => !dllState.running,
      say: "Address pasted? Compile, then Inject. Console should log 'HP patcher armed for: 0x...' If you see 'WARNING placeholders', you forgot to paste the real address.",
    },
    {
      id: "watch-it-hold",
      when: ({ dllState, target }) =>
        dllState.running && target.player.hp < 95,
      say: "DLL's running but HP dropped — that means the address you pasted ISN'T the HP cell. Eject, scan again more carefully, paste the right address, re-inject.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableBleed(2, 1100);
    target.enableESP();

    dialog.script("VEX", [
      "Pipeline mission. Real game hacking doesn't have label lookups — your scanner gives you a HEX ADDRESS, you hardcode that exact number in your C++.",
      "Scan HP the M2 way: take damage, narrow with 'decreased'. Watch the survivor.",
      "Copy the address from your watchlist (long-press to select-copy). DLL tab → paste over the underscores in TARGET_ADDR.",
      "Compile + Inject. If the address is right, bleed fires but HP holds at 100. If wrong, HP drops — eject and try again with a different candidate.",
      "Hold 25 seconds with HP > 95. This is exactly the workflow for AssaultCube: scan in CE, paste address into your trainer source, compile.",
    ]);

    let done = false;
    let healthHoldStart = 0;
    const dllRuntime = window.__hw && window.__hw.dll;

    const interval = setInterval(() => {
      if (done) return;
      if (!dllRuntime) return;
      // Win: DLL running + HP held at 100 for 25s through bleed.
      if (dllRuntime.running && target.player.hp >= 100) {
        if (healthHoldStart === 0) healthHoldStart = performance.now();
      } else {
        healthHoldStart = 0;
      }
      if (healthHoldStart > 0 && performance.now() - healthHoldStart >= 25000) {
        done = true;
        complete("Address pasted, DLL injected, HP held. That's the entire real-world pipeline in five steps.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
