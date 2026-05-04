// Mission 26a — ADVANCED: D3D9 RENDER HOOK
//
// Optional companion to M26 RENDER HOOK. The simulator's parser
// handles real C++ for memory operations (types, casts, deref,
// arithmetic). It does NOT handle real D3D9 rendering primitives
// (you'd need an actual GPU + vtable + COM interface to call
// IDirect3DDevice9 methods). So this mission's template is hybrid:
//
//   - The pointer-chain resolution to find the entity list IS real
//     C++ syntax that the parser executes natively
//   - The render hook itself uses register_render_hook with comments
//     showing the equivalent MinHook+EndScene+DrawBoxD3D pattern

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M26a ADVANCED — Real C++ for memory ops + render hook for the
// drawing layer. Comments show the full MinHook+EndScene+DrawBoxD3D
// pattern that real wallhacks ship.

uintptr_t entity_list_base = 0;

void onInject() {
  // Resolve the entity-list base in real C++ syntax. Real cheats
  // cache this once after the level loads (M48a-style re-resolution
  // would also work but costs cycles).
  HMODULE hMod = GetModuleHandleA("ac_client.exe");
  uintptr_t client_base = (uintptr_t)hMod;
  // For AC the entity-array static cell is at a different offset
  // than the player static — real cheats reverse-engineer both.
  // Here we use the simulator's entity_arr_ptr label since the sim
  // doesn't bind it at a hardcoded module offset like player.
  entity_list_base = addr_of("entity_arr_ptr");
  uintptr_t entities = *(uintptr_t*)(entity_list_base);
  log("entity array @ " + entities);

  // ────────────────────────────────────────────────────────────
  // Real C++ render hook (this part can't execute in the sim — JS
  // can't actually call IDirect3DDevice9 methods. Comments only.)
  //
  //   typedef HRESULT(__stdcall* EndScene_t)(IDirect3DDevice9*);
  //   EndScene_t oEndScene;
  //
  //   void** vtable = *(void***)pDevice;
  //   void* originalEndScene = vtable[42];
  //   MH_CreateHook(originalEndScene, &HookedEndScene, &oEndScene);
  //   MH_EnableHook(originalEndScene);
  //
  //   HRESULT __stdcall HookedEndScene(IDirect3DDevice9* pDevice) {
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
  //       return oEndScene(pDevice);
  //   }
  //
  // Below is the SIMULATOR equivalent — register_render_hook does
  // what the EndScene detour would do in real C++. The drawing logic
  // is structured the same way (WorldToScreen → DrawBox → DrawText).
  // ────────────────────────────────────────────────────────────

  register_render_hook(function(ctx, sim) {
    const T = sim.tile_size();
    for (const e of sim.enemies()) {
      if (!e.alive) continue;
      // Real C++: WorldToScreen(viewMat, e.worldPos, screenPos);
      const [px, py] = sim.tile_to_screen(e.x, e.y);
      // Real C++: DrawBoxD3D(pDevice, screenPos, T, COLOR_CYAN);
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, T, T);
      // Real C++: DrawTextD3D(pDevice, ..., enemy.name, COLOR_CYAN);
      ctx.font = "10px ui-monospace, Menlo, monospace";
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      const label = e.name + " " + e.hp;
      const w = ctx.measureText(label).width;
      ctx.fillRect(px - 2, py - 12, w + 6, 12);
      ctx.fillStyle = "#22d3ee";
      ctx.fillText(label, px + 1, py - 3);
    }
  });
}

void onTick() { }
`;

export const mission26a = {
  id: "m26a",
  title: "ADVANCED: D3D9 RENDER HOOK",
  brief: "Real C++ pointer chain + comments showing the MinHook + EndScene + WorldToScreen pattern. Same kill-count win.",
  prerequisites: ["m26"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  optional: true,
  alert: {
    icon: "🎬",
    title: "RAW D3D9 HOOK + REAL C++ POINTER CHAIN",
    body: `Hybrid mission: the memory-side code is REAL C++
syntax that the parser executes (HMODULE,
uintptr_t, *(uintptr_t*) deref). The render hook
side stays sim-form because JS can't actually call
IDirect3DDevice9 methods — comments show the
equivalent MinHook + EndScene + DrawBoxD3D code
that real wallhacks ship.

What you can write in real C++ that the sim runs:
  HMODULE hMod = GetModuleHandleA("ac_client.exe");
  uintptr_t client_base = (uintptr_t)hMod;
  uintptr_t entities = *(uintptr_t*)(...);

What stays as comments (non-executable in JS):
  void** vtable = *(void***)pDevice;
  void* originalEndScene = vtable[42];
  MH_CreateHook(originalEndScene, &HookedEndScene,
                &oEndScene);

Same 4-kill win as M26.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.compiled,
      say: "Open DLL tab. Top half is real C++ for the memory chain. Bottom half is the render hook (sim form) with comments showing the real D3D9 detour. Compile + Inject.",
    },
    {
      id: "kill-with-hook",
      when: ({ target, dllState }) =>
        dllState.running && target.killCount < 4,
      say: "Hook installed (the EndScene-detour equivalent). Cyan boxes mark every enemy through camouflage. 4 kills closes.",
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
      "Same fight as M26 — camouflage on, ESP cell pinned by watchdog. Render hook is the only path through.",
      "Difference: the memory-side code is REAL C++ syntax now. HMODULE, uintptr_t, *(uintptr_t*) deref — all executes natively in the sim.",
      "The render hook itself stays in sim form (register_render_hook + canvas ctx) because JS can't call real D3D9 methods. Comments above and inline show the MinHook + EndScene + DrawBoxD3D pattern that real wallhacks ship.",
      "4 kills with the hook drawing.",
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
        complete("Render hook + 4 kills. Memory chain in real C++; render side documented as the MinHook + EndScene pattern. Closest the sim can get to real wallhack code.");
        clearInterval(interval);
        clearInterval(espWatchdog);
      }
    }, 250);

    return () => { clearInterval(interval); clearInterval(espWatchdog); };
  },
};
