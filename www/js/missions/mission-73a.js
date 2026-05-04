// Mission 73a — ADVANCED: DIY MENU IN D3D9 + IMGUI FORM
//
// Optional companion to M73 DIY CANVAS MENU. Real cheat menus use
// ImGui hooked into the game's D3D9 EndScene. Same architecture as
// M26a's render hook, plus ImGui state + checkboxes + menu visibility
// toggle on a hotkey.
//
// Hybrid template: memory-side ops in real C++; the menu rendering
// uses register_render_hook + canvas (sim equivalent) with comments
// showing the full ImGui_ImplDX9 boilerplate every commercial cheat
// menu ships.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M73a ADVANCED — DIY menu the way real DLL cheats build it.
//
// Real C++ for the menu side (this is what actual cheat dev looks
// like) is shown in comments. The simulator's JS-flavored render
// hook below does the EQUIVALENT drawing because JS can't link
// against ImGui or call IDirect3DDevice9 methods.

// ─── Cheat state booleans (real C++ globals) ──────────────────
bool g_HpFreeze    = false;
bool g_InfiniteAmmo = false;
bool g_NoRecoil    = false;
bool g_ESP         = false;
bool g_MenuVisible = true;

// ─── Real C++ menu setup (commented — non-executable in sim) ──
//
//   // Hook EndScene to render the menu every frame:
//   typedef HRESULT(__stdcall* EndScene_t)(IDirect3DDevice9*);
//   EndScene_t oEndScene = nullptr;
//
//   HRESULT __stdcall HookedEndScene(IDirect3DDevice9* pDevice) {
//       if (!g_ImGuiInit) {
//           ImGui_ImplDX9_Init(pDevice);
//           ImGui_ImplWin32_Init(g_HWND);
//           g_ImGuiInit = true;
//       }
//       ImGui_ImplDX9_NewFrame();
//       ImGui_ImplWin32_NewFrame();
//       ImGui::NewFrame();
//
//       // Toggle menu visibility on INSERT key (WndProc hook fires
//       // SetVisible elsewhere)
//       if (g_MenuVisible) {
//           ImGui::Begin("Trainer", &g_MenuVisible);
//           ImGui::Checkbox("HP Freeze",     &g_HpFreeze);
//           ImGui::Checkbox("Infinite Ammo", &g_InfiniteAmmo);
//           ImGui::Checkbox("No Recoil",     &g_NoRecoil);
//           ImGui::Checkbox("ESP",           &g_ESP);
//           ImGui::End();
//       }
//
//       ImGui::Render();
//       ImGui_ImplDX9_RenderDrawData(ImGui::GetDrawData());
//       return oEndScene(pDevice);
//   }
//
//   // WndProc hook for menu input — keyboard/mouse to ImGui
//   LRESULT WINAPI HookedWndProc(HWND hWnd, UINT msg,
//                                WPARAM wParam, LPARAM lParam) {
//       if (msg == WM_KEYDOWN && wParam == VK_INSERT) {
//           g_MenuVisible = !g_MenuVisible;
//       }
//       ImGui_ImplWin32_WndProcHandler(hWnd, msg, wParam, lParam);
//       return CallWindowProc(oWndProc, hWnd, msg, wParam, lParam);
//   }
//
//   // In DllMain: install both hooks
//   void OnAttach() {
//       void** vtable = *(void***)g_pDevice;
//       MH_CreateHook(vtable[42], &HookedEndScene, (LPVOID*)&oEndScene);
//       MH_EnableHook(vtable[42]);
//       oWndProc = (WNDPROC)SetWindowLongPtr(g_HWND, GWLP_WNDPROC,
//                                            (LONG_PTR)&HookedWndProc);
//   }
//
// ─── Memory-side cheat application (REAL C++ executes) ────────

uintptr_t HP_ADDR    = 0;
uintptr_t AMMO_ADDR  = 0;
uintptr_t RECOIL_ADDR = 0;
uintptr_t ESP_ADDR   = 0;

void onInject() {
  // Resolve all four cheat addresses once via the M22a/M48a chain.
  HMODULE hMod = GetModuleHandleA("ac_client.exe");
  uintptr_t client_base = (uintptr_t)hMod;
  uintptr_t player_ptr = *(uintptr_t*)(client_base + 0x10F4F4);

  HP_ADDR    = player_ptr + 0xEC;
  AMMO_ADDR  = player_ptr + 0x140;
  RECOIL_ADDR = addr_of("weapon.recoilPerShot");
  ESP_ADDR   = addr_of("render.espVisible");

  log("Resolved 4 cheat addresses via real C++ chain");
  log("HP_ADDR=" + HP_ADDR + ", AMMO_ADDR=" + AMMO_ADDR);

  // Sim equivalent of the ImGui menu: render hook draws checkbox
  // panel, input hook handles clicks. Same architecture as the
  // ImGui code in the comment block above.
  const features = [
    { label: "HP Freeze",     get: () => g_HpFreeze,     set: v => g_HpFreeze = v },
    { label: "Infinite Ammo", get: () => g_InfiniteAmmo, set: v => g_InfiniteAmmo = v },
    { label: "No Recoil",     get: () => g_NoRecoil,     set: v => g_NoRecoil = v },
    { label: "ESP",           get: () => g_ESP,          set: v => g_ESP = v },
  ];

  register_render_hook(function(ctx, sim) {
    if (!g_MenuVisible) return;
    // Real C++: ImGui::Begin("Trainer", &g_MenuVisible);
    const X = 20, Y = 20, ROW_H = 22, BOX = 14;
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(X, Y, 180, 30 + features.length * ROW_H);
    ctx.strokeStyle = "#22d3ee";
    ctx.strokeRect(X, Y, 180, 30 + features.length * ROW_H);
    ctx.font = "12px ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#22d3ee";
    ctx.fillText("Trainer", X + 8, Y + 18);
    for (let i = 0; i < features.length; i++) {
      // Real C++: ImGui::Checkbox(features[i].label, &(features[i].state));
      const f = features[i];
      const cy = Y + 30 + i * ROW_H;
      const cx = X + 8;
      ctx.strokeStyle = "#22d3ee";
      ctx.strokeRect(cx, cy, BOX, BOX);
      if (f.get()) { ctx.fillStyle = "#22d3ee"; ctx.fillRect(cx + 3, cy + 3, BOX - 6, BOX - 6); }
      ctx.fillStyle = f.get() ? "#22d3ee" : "#9ca3af";
      ctx.fillText(f.label, cx + BOX + 8, cy + BOX - 3);
    }
  });

  register_input_hook(function(evt) {
    if (evt.type !== "click") return false;
    const X = 20, Y = 20, ROW_H = 22, BOX = 14;
    for (let i = 0; i < features.length; i++) {
      const cy = Y + 30 + i * ROW_H, cx = X + 8;
      if (evt.x >= cx && evt.x <= cx + BOX && evt.y >= cy && evt.y <= cy + BOX) {
        features[i].set(!features[i].get());
        log("Toggled " + features[i].label);
        return true;
      }
    }
    return false;
  });
}

void onTick() {
  // Real C++ pointer-deref writes for each enabled feature.
  if (g_HpFreeze)     *(int*)(HP_ADDR)    = 9999;
  if (g_InfiniteAmmo) *(int*)(AMMO_ADDR)  = 999;
  if (g_NoRecoil)     *(int*)(RECOIL_ADDR) = 0;
  if (g_ESP)          *(int*)(ESP_ADDR)   = 1;
}
`;

export const mission73a = {
  id: "m73a",
  title: "ADVANCED: D3D9 + IMGUI MENU",
  brief: "Same DIY menu as M73 — but the cheat application is real C++ pointer-deref writes, plus full ImGui hook documented.",
  prerequisites: ["m73"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  optional: true,
  alert: {
    icon: "🪟",
    title: "REAL D3D9 + IMGUI CHEAT MENU",
    body: `M73 built a DIY canvas menu in sim form. M73a
shows the same architecture written the way every
commercial cheat menu actually ships:

  - Hook IDirect3DDevice9::EndScene at vtable[42]
  - In the hook, init ImGui_ImplDX9 once
  - Begin/Checkbox/End for each feature
  - WndProc hook captures keyboard/mouse to ImGui
  - INSERT key toggles menu visibility

Memory-side code IS real C++ (the parser handles it):
  HMODULE hMod = GetModuleHandleA("ac_client.exe");
  uintptr_t player_ptr = *(uintptr_t*)
    (client_base + 0x10F4F4);
  HP_ADDR = player_ptr + 0xEC;
  ...
  if (g_HpFreeze) *(int*)(HP_ADDR) = 9999;

Render side (canvas drawing in the sim) maps to
ImGui::Checkbox in real C++. Comments above the
render hook show the full ImGui_ImplDX9 boilerplate.

Same multi-feature menu as M73 — toggle all 4
checkboxes ON.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.compiled,
      say: "Open DLL tab. Top of template: full ImGui_ImplDX9 hook code in comments. Memory ops in real C++ syntax. Render hook builds the menu UI. Compile + Inject.",
    },
    {
      id: "tick-all",
      when: ({ dllState }) => dllState.running,
      say: "DIY menu drawn at top-left. Click each checkbox. Real C++ pointer-deref writes fire each frame the box is on. All 4 ON to close.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableHazards();
    target.enableEnemies();
    target.enableWeapon();
    target.enableRecoil(8);
    target.enableCamouflage();
    target._m73aAllOnSince = 0;

    dialog.script("VEX", [
      "M73a is the real-cheat-menu blueprint. Memory-side code IS real C++ (parser handles types, casts, *(int*) deref). Menu rendering uses register_render_hook + register_input_hook (sim equivalent of the ImGui::Checkbox calls in real C++).",
      "Top of template: complete ImGui_ImplDX9 hook code in comments — exactly what every commercial cheat menu ships. WndProc hook for input, EndScene hook for rendering, INSERT key for visibility toggle.",
      "Each feature checkbox toggles a global bool. Real C++ in onTick: 'if (g_HpFreeze) *(int*)(HP_ADDR) = 9999;' for each feature.",
      "Win: 4 features simultaneously ON for 4 seconds.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      const dll = window.__hw && window.__hw.dll;
      if (!dll) return;
      const hpFrozen   = target.player.hp >= 9000;
      const ammoOk     = target.player.ammo > 100;
      const noRecoil   = target.weapon.recoilPerShot === 0;
      const espOn      = target.espActive;
      const allOn = dll.renderHooks.length > 0 && dll.inputHooks.length > 0 &&
                    hpFrozen && ammoOk && noRecoil && espOn;
      if (allOn) {
        if (target._m73aAllOnSince === 0) target._m73aAllOnSince = performance.now();
        if (performance.now() - target._m73aAllOnSince >= 4000) {
          done = true;
          complete("All 4 features running through the real-C++-form trainer. Same architecture every commercial DLL cheat ships its menu in.");
          clearInterval(interval);
        }
      } else {
        target._m73aAllOnSince = 0;
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
