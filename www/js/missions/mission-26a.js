// Mission 26a — ADVANCED: RENDER HOOK IN RAW D3D9 FORM
//
// Optional transparency sibling to M26 RENDER HOOK. M26 used the
// simulator's friendly register_render_hook() which abstracts away
// the entire D3D9 vtable hook + MinHook detour + EndScene plumbing.
// This mission shows what the REAL C++ DirectX 9 render hook looks
// like, the way every commercial wallhack actually works.
//
// Same effect as M26 (cyan ESP boxes through camouflage, kill 4
// enemies). Optional, doesn't gate any later mission. Just shows
// the production-tier hook code for transparency.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M26a — ADVANCED: render hook the way real C++ does it.
//
// Real C++ for hooking IDirect3DDevice9::EndScene with MinHook:
//
//   #include <d3d9.h>
//   #include <MinHook.h>
//
//   typedef HRESULT(__stdcall* EndScene_t)(IDirect3DDevice9*);
//   EndScene_t oEndScene = nullptr;          // pointer to original
//
//   // 1. Find the device's vtable. Two ways:
//   //    a) Hook D3DCreateDevice9 to capture the device on creation
//   //    b) Use a 'tester' device to dump the vtable, then hook by
//   //       index 42 (EndScene's slot in the D3D9 vtable)
//   IDirect3DDevice9* pDevice = ...;     // captured during init
//   void** vtable = *(void***)pDevice;
//   void* originalEndScene = vtable[42]; // EndScene index in D3D9
//
//   // 2. Install the MinHook detour
//   MH_Initialize();
//   MH_CreateHook(originalEndScene, &HookedEndScene,
//                 (LPVOID*)&oEndScene);
//   MH_EnableHook(originalEndScene);
//
//   // 3. The hook function itself — runs every frame after the
//   //    game's last draw call, before Present.
//   HRESULT __stdcall HookedEndScene(IDirect3DDevice9* pDevice) {
//       // World-to-screen project each enemy via the view matrix
//       Matrix4x4 viewMat = ReadViewMatrix();
//       for (auto& enemy : EnumerateEntities()) {
//           if (!enemy.alive) continue;
//           Vector2 screenPos;
//           if (WorldToScreen(viewMat, enemy.worldPos, screenPos)) {
//               DrawBoxD3D(pDevice, screenPos, BOX_SIZE, COLOR_CYAN);
//               DrawTextD3D(pDevice, screenPos.x, screenPos.y - 12,
//                           enemy.name, COLOR_CYAN);
//           }
//       }
//       return oEndScene(pDevice);   // call original
//   }
//
// In the simulator, register_render_hook(fn) is the friendly
// equivalent. Below we use the same friendly call but with the
// drawing logic written in the same shape as the real C++ hook
// would have — separate world-to-screen transform, then draw, then
// implicit 'return original' (the simulator does that for us).

void onInject() {
  log("Installing D3D9-style render hook (same shape as MinHook EndScene detour)");

  register_render_hook(function(ctx, sim) {
    // This function body runs every frame, between the game's last
    // draw call and Present — exactly like the EndScene detour above.
    const T = sim.tile_size();

    // Sim equivalent of the real C++ ReadViewMatrix + WorldToScreen.
    // In real D3D9 you'd extract the view-projection matrix from the
    // device or game memory (M48 base discovery to find it), then
    // do the matrix-vector projection per enemy. Sim collapses this
    // to tile_to_screen() since our 2D world IS the screen.
    const enemies = sim.enemies();
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive) continue;

      // Real C++: Vector2 screenPos = WorldToScreen(viewMat, e.worldPos);
      const [px, py] = sim.tile_to_screen(e.x, e.y);

      // Real C++: DrawBoxD3D(pDevice, screenPos, BOX_SIZE, COLOR_CYAN);
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, T, T);

      // Real C++: DrawTextD3D(pDevice, x, y, name, COLOR_CYAN);
      ctx.font = "10px ui-monospace, Menlo, monospace";
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      const label = e.name + " " + e.hp;
      const w = ctx.measureText(label).width;
      ctx.fillRect(px - 2, py - 12, w + 6, 12);
      ctx.fillStyle = "#22d3ee";
      ctx.fillText(label, px + 1, py - 3);
    }
    // Real C++: return oEndScene(pDevice);  (sim does this implicitly)
  });
}

void onTick() { }
`;

export const mission26a = {
  id: "m26a",
  title: "ADVANCED: D3D9 RENDER HOOK",
  brief: "Same as M26 but with the real MinHook + EndScene + WorldToScreen + DrawBox C++ shown step by step.",
  prerequisites: ["m26"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  optional: true,
  alert: {
    icon: "🎬",
    title: "RAW D3D9 HOOK — VTABLE + MINHOOK + ENDSCENE",
    body: `M26's register_render_hook() abstracted the entire
D3D9 vtable hook + MinHook detour pipeline. This
optional sibling shows what the real C++ looks like.

Five-step real-world pipeline:
  1. Get IDirect3DDevice9* (captured during D3D init)
  2. Read its vtable: *(void***)pDevice
  3. Hook EndScene at vtable[42] via MinHook
  4. In the hook: read view matrix, WorldToScreen each
     enemy, draw boxes via DrawBoxD3D, draw text via
     DrawTextD3D
  5. Return oEndScene(pDevice) to call original

Every commercial wallhack ships exactly this code.
Some swap MinHook for Microsoft Detours, some use
inline byte-patches instead of vtable swaps. The
shape is universal.

This template uses the simulator's friendly
register_render_hook BUT writes the drawing logic in
the same shape as real C++ — separate WorldToScreen
step, then draw, then implicit 'call original'. Read
the comments alongside the code to see the mapping.

Same kill-count win as M26.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.compiled,
      say: "Open DLL tab. Read the comments — they walk through the real C++ MinHook + EndScene + WorldToScreen pattern. Then Compile + Inject.",
    },
    {
      id: "kill-with-hook",
      when: ({ target, dllState }) =>
        dllState.running && target.killCount < 4,
      say: "Hook installed (just like the real EndScene detour). Cyan boxes mark every enemy through camouflage. Walk + fire. 4 kills closes.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableCamouflage();

    const espAddr = memory.addressOfLabel("render.espVisible");
    const espWatchdog = setInterval(() => {
      memory.write(espAddr, 0);
      memory.setFrozen(espAddr, true);
    }, 100);

    target.player.ammo = 200;

    dialog.script("VEX", [
      "Same fight as M26 — camouflage on, ESP flag pinned at 0 by the watchdog. The only path through is the render-hook approach.",
      "Difference: this template's comments show the FULL real C++ — MinHook detour, vtable[42] for EndScene, WorldToScreen via the view matrix, DrawBoxD3D / DrawTextD3D primitives.",
      "The simulator's register_render_hook() is the friendly equivalent. Below the comments the drawing logic is written in the SAME SHAPE as the real C++ hook would have. Read both side-by-side.",
      "4 kills with the render hook drawing — same win as M26.",
    ]);

    let done = false;
    const dllRuntime = window.__hw && window.__hw.dll;
    const startKills = target.killCount;

    const interval = setInterval(() => {
      if (done) return;
      if (!dllRuntime) return;
      if (dllRuntime.renderHooks.length > 0 &&
          memory.read(espAddr) === 0 &&
          target.killCount - startKills >= 4) {
        done = true;
        complete("Render hook + 4 kills, the M26 way but written in the shape your real C++ DLL would take. MinHook + vtable[42] + EndScene + WorldToScreen + DrawBoxD3D — every commercial wallhack ships exactly this stack.");
        clearInterval(interval);
        clearInterval(espWatchdog);
      }
    }, 250);

    return () => { clearInterval(interval); clearInterval(espWatchdog); };
  },
};
