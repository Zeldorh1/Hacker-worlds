// Mission 73 — MINI TRAINER 4: DIY CANVAS MENU
//
// Stage 4 of the trainer track. M71/M72 used register_cheat — the
// simulator's BUILT-IN cheat menu hosts the UI. M73 throws that away
// and builds the menu from scratch using only render hooks + input
// hooks.
//
// Why this matters: real cheats don't use a host menu, they ship
// their OWN. The Combat Arms cheats you've seen use:
//
//   menu->Gradient(...);             // draw the box
//   menu->PrintText(...);            // draw the label
//   menu->CheckBox(...);             // draw the checkbox + handle clicks
//
// All hooked into the game's render loop. Same primitives as our
// simulator: register_render_hook to draw, register_input_hook to
// receive clicks. Plus internal state for "is this box checked?"
//
// Architecture in one mission:
//   1. State table:   features = [{label, x, y, w, h, on, tickFn}]
//   2. Render hook:   for each feature, draw box + checkbox + label
//   3. Input hook:    on click, hit-test against feature boxes,
//                     toggle the matching one's `on` flag
//   4. Tick:          for each feature with on=true, run its tickFn
//
// That's a complete custom GUI cheat menu in ~50 lines. Same shape
// as ImGui's checkbox handling — visualization + interaction +
// state, all owned by the cheat.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// MINI TRAINER 4 — Custom canvas menu (no register_cheat).
//
// Builds the menu UI from scratch using register_render_hook
// (drawing) + register_input_hook (clicks). The simulator's built-in
// cheat menu is NOT used. This mirrors real DLL cheats that draw
// their own menus on the game's canvas.
//
// State + UI + handlers all owned by your code. Full DLL skeleton —
// MainThread does the setup, the while-loop runs the per-frame writes
// for whichever boxes are checked.

#include <windows.h>

const MENU_X = 20;
const MENU_Y = 20;
const ROW_H  = 22;
const BOX_SZ = 14;

// Resolved addresses. Real C++ pointer-deref writes below.
uintptr_t HP_ADDR     = 0;
uintptr_t AMMO_ADDR   = 0;
uintptr_t RECOIL_ADDR = 0;
uintptr_t ESP_ADDR    = 0;

// State for each feature: label, on/off, what to do each tick.
const features = [
  { label: "HP Freeze",     on: false, tick: () => { *(int*)(HP_ADDR)     = 9999; } },
  { label: "Infinite Ammo", on: false, tick: () => { *(int*)(AMMO_ADDR)   = 999;  } },
  { label: "No Recoil",     on: false, tick: () => { *(int*)(RECOIL_ADDR) = 0;    } },
  { label: "ESP",           on: false, tick: () => { *(int*)(ESP_ADDR)    = 1;    } },
];

// Compute each feature's hit-rect for click handling.
function rectFor(i) {
  const y = MENU_Y + 30 + i * ROW_H;
  return { x: MENU_X + 8, y, w: BOX_SZ, h: BOX_SZ };
}

DWORD WINAPI MainThread(LPVOID lpParam) {
  HMODULE hMod = GetModuleHandleA("ac_client.exe");
  uintptr_t client_base = (uintptr_t)hMod;
  uintptr_t player_ptr  = *(uintptr_t*)(client_base + 0x10F4F4);
  HP_ADDR     = player_ptr + 0xEC;
  AMMO_ADDR   = player_ptr + 0x140;
  RECOIL_ADDR = addr_of("weapon.recoilPerShot");
  ESP_ADDR    = addr_of("render.espVisible");

  log("MINI TRAINER 4 — DIY canvas menu, real C++ pointer-deref writes");

  // Draw the menu every frame.
  register_render_hook(function(ctx, sim) {
    // Background panel
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(MENU_X, MENU_Y, 180, 30 + features.length * ROW_H + 8);
    ctx.strokeStyle = "#22d3ee";
    ctx.strokeRect(MENU_X + 0.5, MENU_Y + 0.5, 179, 29 + features.length * ROW_H + 7);

    // Title
    ctx.font = "12px ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#22d3ee";
    ctx.fillText("DIY TRAINER", MENU_X + 8, MENU_Y + 18);

    // Features
    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const r = rectFor(i);

      // Checkbox border
      ctx.strokeStyle = "#22d3ee";
      ctx.strokeRect(r.x, r.y, r.w, r.h);

      // Filled if on
      if (f.on) {
        ctx.fillStyle = "#22d3ee";
        ctx.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
      }

      // Label
      ctx.fillStyle = f.on ? "#22d3ee" : "#9ca3af";
      ctx.fillText(f.label, r.x + r.w + 8, r.y + r.h - 3);
    }
  });

  // Handle clicks — toggle the feature whose box was hit.
  register_input_hook(function(evt) {
    if (evt.type !== "click") return false;
    for (let i = 0; i < features.length; i++) {
      const r = rectFor(i);
      if (evt.x >= r.x && evt.x <= r.x + r.w &&
          evt.y >= r.y && evt.y <= r.y + r.h) {
        features[i].on = !features[i].on;
        log("Toggled " + features[i].label + " -> " + (features[i].on ? "ON" : "OFF"));
        return true;   // consumed
      }
    }
    return false;
  });

  // Apply each enabled feature's effect every frame.
  while (true) {
    for (const f of features) {
      if (f.on) f.tick();
    }
    Sleep(16);
  }
}

BOOL WINAPI DllMain(HINSTANCE hMod, DWORD reason, LPVOID lpReserved) {
  if (reason == DLL_PROCESS_ATTACH) {
    DisableThreadLibraryCalls(hMod);
    CreateThread(NULL, 0, MainThread, NULL, 0, NULL);
  }
  return TRUE;
}
`;

export const mission73 = {
  id: "m73",
  title: "MINI TRAINER 4: DIY CANVAS MENU",
  brief: "Drop the built-in menu. Render hook draws checkboxes. Input hook handles clicks. Your menu, your code.",
  prerequisites: ["m72", "m26", "m36"],
  timeLimit: 240,
  dll: true,
  cheatMenu: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "🛠",
    title: "STAGE 4 — BUILD THE MENU UI YOURSELF",
    body: `M71/M72 used register_cheat — the simulator's
built-in menu hosted your toggles. Real cheats don't
use a host menu; they ship their own.

The Combat Arms cheat headers you've seen do this:

  menu->Gradient(...);        // draw the box
  menu->PrintText(...);       // draw the label
  menu->CheckBox(...);        // draw + handle clicks

All hooked into the game's render loop.

Same primitives in our simulator:
  • register_render_hook  — draw the menu every frame
  • register_input_hook   — receive canvas clicks
  • internal state         — track which boxes are checked

Architecture (≤50 lines):
  1. features = [{label, on, tickFn}, ...]
  2. render hook: draw box + checkbox + label per feature
  3. input hook: hit-test clicks, toggle matching feature
  4. onTick: for each feature.on === true, run tickFn

Your menu, your code. Same shape every commercial
DLL cheat ships.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template builds the whole DIY menu (~50 lines): render hook draws 4 checkboxes, input hook toggles them. Compile + Inject.",
    },
    {
      id: "tick-all",
      when: ({ dllState }) => {
        if (!dllState.running) return false;
        return true;
      },
      say: "Custom menu drawn at top-left of the game canvas. Click each checkbox — they should fill cyan and the corresponding cheat fires. 4 toggles all ON for 4 seconds wins.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableHazards();
    target.enableEnemies();
    target.enableWeapon();
    target.enableRecoil(8);
    target.enableCamouflage();
    target._m73AllOnSince = 0;

    dialog.script("VEX", [
      "Stage 4: ditch the host menu. M71/M72 leaned on the simulator's built-in cheat menu via register_cheat. Real cheats SHIP their own UI — drawn straight onto the game's render target.",
      "Template uses two primitives: register_render_hook (drawing) and register_input_hook (clicks). State lives in your code as a features array. Each feature has a label, on/off, and a tick function.",
      "Click → hit-test against each checkbox rect → toggle. Render hook redraws every frame with the new state. onTick fires the tickFn of every enabled feature.",
      "Win: 4 features simultaneously enabled for 4s, all running through your DIY menu (not the built-in one). Same shape every commercial cheat ships.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      const dll = window.__hw && window.__hw.dll;
      if (!dll) return;

      // Verify both required hooks are installed (not relying on
      // register_cheat — this mission is about DIY UI).
      const hasRender = dll.renderHooks.length > 0;
      const hasInput = dll.inputHooks.length > 0;

      // Win check: HP pinned, ammo > 100, recoilPerShot zero,
      // espActive on. All 4 features active simultaneously.
      const hpFrozen   = target.player.hp >= 9000;
      const ammoOk     = target.player.ammo > 100;
      const noRecoil   = target.weapon.recoilPerShot === 0;
      const espOn      = target.espActive;

      const allOn = hasRender && hasInput && hpFrozen && ammoOk && noRecoil && espOn;
      if (allOn) {
        if (target._m73AllOnSince === 0) target._m73AllOnSince = performance.now();
        if (performance.now() - target._m73AllOnSince >= 4000) {
          done = true;
          complete("DIY menu shipped. Render hook drew it, input hook handled clicks, 4 features all firing through code YOU wrote — no register_cheat. Same shape every commercial DLL cheat ships its UI in.");
          clearInterval(interval);
        }
      } else {
        target._m73AllOnSince = 0;
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
