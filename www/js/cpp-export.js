// Export-to-C++ — emits a real Visual Studio-buildable .cpp file
// targeting AssaultCube based on the player's simulator DLL source.
//
// What this generates: a complete trainer source file with
//   - Win32 + D3D9 + ImGui includes
//   - AC offset constants
//   - One bool global per detected register_cheat()
//   - cheat_thread loop that gates each cheat behind its bool
//   - DLL-hijacking-style DllMain (or CreateRemoteThread compatible)
//   - D3D9 EndScene hook with ImGui menu rendering
//   - One ImGui::Checkbox per registered cheat
//   - DELETE-key toggle on the menu visibility
//
// The output is roughly the same shape as a CAEU-class published
// trainer: monolithic .dll, in-game ImGui menu, hardcoded offsets.

const AC_OFFSETS = {
  player_base_ptr: "0x10F4F4",
  player_hp:       "0xEC",
  player_armor:    "0xF0",
  player_ammo:     "0x140",
  player_x:        "0x4",
  player_y:        "0xC",
  player_z:        "0x8",
  player_team:     "0x32C",
  enemy_count:     "0x10F500",
  enemy_array:     "0x10F4F8",
  view_matrix:     "0x17DFD0",
};

// Convert a cheat label to a C++ identifier ("Infinite HP" → inf_hp).
function labelToIdent(label) {
  return "g_" + label.toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Map a label's intent to the C++ body that should run when the
// cheat is enabled. Falls back to a TODO comment for unrecognised
// labels.
function tickBodyForCheat(label) {
  const lower = label.toLowerCase();
  if (lower.includes("hp") || lower.includes("health") || lower.includes("god")) {
    return `*(int*)(player_base + OFF_HP) = 100;`;
  }
  if (lower.includes("ammo")) {
    return `*(int*)(player_base + OFF_AMMO) = 99;`;
  }
  if (lower.includes("damage") || lower.includes("dmg")) {
    return `// 'damage' lives in weapon descriptor — see Codex 'AC Offsets Cheat Sheet'\n            // *(int*)(weapon_ptr + 0x18) = 200;`;
  }
  if (lower.includes("aim") || lower.includes("target")) {
    return `aimbot_tick(base);   // see aimbot_tick() definition above`;
  }
  if (lower.includes("trigger")) {
    return `triggerbot_tick(base);`;
  }
  if (lower.includes("speed")) {
    return `// speed: write to player+0x?? (movement struct), see Codex`;
  }
  if (lower.includes("esp") || lower.includes("wallhack") || lower.includes("visual") || lower.includes("render")) {
    return `// ESP is drawn from the EndScene hook below — no per-tick code needed`;
  }
  return `// TODO: implement per-tick body for '${label}'`;
}

// Pull every register_cheat() label out of the source.
function extractCheatLabels(source) {
  const out = [];
  const re = /register_cheat\s*\(\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(source))) out.push(m[1]);
  return out;
}

function analyzeSource(source) {
  return {
    hasRenderHook: /register_render_hook\s*\(/.test(source),
    hasPacketHook: /register_packet_hook\s*\(/.test(source),
    hasStager: /load_payload\s*\(/.test(source),
    hasInjectPacket: /inject_packet\s*\(/.test(source),
    cheatLabels: extractCheatLabels(source),
  };
}

export function exportToCpp(source) {
  const a = analyzeSource(source);

  // Build per-cheat globals + menu checkboxes + tick bodies.
  const cheatGlobals = a.cheatLabels.map(label =>
    `bool ${labelToIdent(label)} = false;   // "${label}"`
  ).join("\n");

  const cheatTickBlocks = a.cheatLabels.map(label => {
    const ident = labelToIdent(label);
    const body = tickBodyForCheat(label);
    return `        if (${ident}) {\n            ${body}\n        }`;
  }).join("\n");

  const cheatCheckboxes = a.cheatLabels.map(label =>
    `        ImGui::Checkbox("${label}", &${labelToIdent(label)});`
  ).join("\n");

  const featureSummary = [];
  if (a.cheatLabels.length) featureSummary.push(`${a.cheatLabels.length} togglable cheat(s)`);
  if (a.hasRenderHook) featureSummary.push("render hook (ESP via EndScene)");
  if (a.hasPacketHook) featureSummary.push("packet hook(s)");
  if (a.hasStager) featureSummary.push("stager / payload pattern");
  if (a.hasInjectPacket) featureSummary.push("packet replay / injection");
  const featureComment = featureSummary.length
    ? "// Detected in your sim DLL:\n" + featureSummary.map(f => `//   - ${f}`).join("\n")
    : "// (no recognised features — emitting baseline trainer)";

  const aimbotFn = a.cheatLabels.some(l => /aim|target/i.test(l)) ? `
// ---- Aimbot ----
// Iterate the enemy array, pick the closest alive, and steer the
// crosshair toward them with mouse_event(). Real CAEU did this with
// _CIatan2 + _CIcos + _CIsin imports for angle math. Add reaction
// delay + jitter (M33 lessons) if you ever target a game with
// behavioral AC.
static DWORD g_last_aim_at = 0;
void aimbot_tick(uintptr_t base) {
    DWORD now = GetTickCount();
    if (now - g_last_aim_at < 200) return;   // M33 reaction delay
    g_last_aim_at = now;

    uintptr_t player_base = *(uintptr_t*)(base + OFF_PLAYER_BASE_PTR);
    if (!player_base) return;
    uint32_t numplayers = *(uint32_t*)(base + OFF_ENEMY_COUNT);
    void** enemies      = *(void***)(base + OFF_ENEMY_ARRAY);
    if (!enemies) return;

    float my_x = *(float*)(player_base + OFF_POS_X);
    float my_y = *(float*)(player_base + OFF_POS_Y);

    void* best = nullptr;
    float best_d = 1e9f;
    for (uint32_t i = 0; i < numplayers; i++) {
        void* e = enemies[i];
        if (!e) continue;
        int hp = *(int*)((uintptr_t)e + OFF_HP);
        if (hp <= 0) continue;
        float ex = *(float*)((uintptr_t)e + OFF_POS_X);
        float ey = *(float*)((uintptr_t)e + OFF_POS_Y);
        float d  = (ex - my_x) * (ex - my_x) + (ey - my_y) * (ey - my_y);
        if (d < best_d) { best_d = d; best = e; }
    }
    if (!best) return;

    // To actually steer the mouse, compute angle from yaw to enemy
    // and use mouse_event(MOUSEEVENTF_MOVE, dx, dy, ...) to nudge.
    // Skipped here for brevity — see the M28 Codex notes.
}

void triggerbot_tick(uintptr_t base) {
    // Auto-fire when crosshair sits on an alive enemy.
    // Implementation: re-read crosshair-target cell, send a click
    // with mouse_event(MOUSEEVENTF_LEFTDOWN|UP).
}` : "";

  const espBlock = a.hasRenderHook ? `
// ---- ESP (drawn inside EndScene hook below) ----
//
// For each alive enemy in the enemy array, project the world coord
// to screen via D3DXVec3Project, then draw a box and label.
void draw_esp(LPDIRECT3DDEVICE9 device, ID3DXFont* font) {
    HMODULE hMod = GetModuleHandleA("ac_client.exe");
    if (!hMod) return;
    uintptr_t base = (uintptr_t)hMod;
    uint32_t numplayers = *(uint32_t*)(base + OFF_ENEMY_COUNT);
    void** enemies      = *(void***)(base + OFF_ENEMY_ARRAY);
    float* viewProj     = (float*)(base + OFF_VIEW_MATRIX);
    if (!enemies || !viewProj) return;

    D3DVIEWPORT9 vp;
    device->GetViewport(&vp);

    for (uint32_t i = 0; i < numplayers; i++) {
        void* e = enemies[i];
        if (!e) continue;
        int hp = *(int*)((uintptr_t)e + OFF_HP);
        if (hp <= 0) continue;
        D3DXVECTOR3 world(
            *(float*)((uintptr_t)e + OFF_POS_X),
            *(float*)((uintptr_t)e + OFF_POS_Z),
            *(float*)((uintptr_t)e + OFF_POS_Y));
        D3DXVECTOR3 screen;
        D3DXVec3Project(&screen, &world, nullptr,
                        nullptr, nullptr, (D3DXMATRIX*)viewProj,
                        vp.Width, vp.Height);
        if (screen.z > 1.0f) continue;   // behind camera
        // Draw a 32x48 rect centered on the projected position.
        // In a real trainer use ID3DXLine or a vertex buffer.
        char buf[64];
        sprintf_s(buf, "HP %d", hp);
        RECT r = { (LONG)screen.x, (LONG)(screen.y - 36),
                   (LONG)screen.x + 200, (LONG)screen.y };
        font->DrawTextA(nullptr, buf, -1, &r, DT_LEFT,
                        D3DCOLOR_ARGB(255, 0, 255, 255));
    }
}` : "";

  return `// =============================================================
//  AssaultCube trainer — auto-generated from Hacker Worlds sim
// =============================================================
//
// Target: ac_client.exe (AssaultCube 1.2.0.2 — public open-source build).
// Build:  Visual Studio 2017+, 32-bit, Dynamic Library, /MT runtime.
// Inject: any loader (CreateRemoteThread + LoadLibraryA), or rename to
//         SDL.dll for auto-load via DLL hijacking (M25 lesson).
//
${featureComment}
//
// Required libraries (link against):
//   d3d9.lib  d3dx9.lib  MinHook.lib  imgui (drop ImGui sources in)
//
// Required ImGui setup:
//   - Add ImGui's source files: imgui.cpp, imgui_draw.cpp,
//     imgui_widgets.cpp, imgui_tables.cpp, imgui_impl_dx9.cpp,
//     imgui_impl_win32.cpp.
//   - MinHook (https://github.com/TsudaKageyu/minhook) for the
//     EndScene + WndProc detours.

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <process.h>
#include <stdint.h>
#include <stdio.h>
#include <d3d9.h>
#include <d3dx9.h>
#include "MinHook.h"
#include "imgui.h"
#include "imgui_impl_dx9.h"
#include "imgui_impl_win32.h"

// ---- AC offsets (public, AssaultCube 1.2.0.2) ----
constexpr uintptr_t OFF_PLAYER_BASE_PTR = ${AC_OFFSETS.player_base_ptr};
constexpr uintptr_t OFF_HP              = ${AC_OFFSETS.player_hp};
constexpr uintptr_t OFF_ARMOR           = ${AC_OFFSETS.player_armor};
constexpr uintptr_t OFF_AMMO            = ${AC_OFFSETS.player_ammo};
constexpr uintptr_t OFF_POS_X           = ${AC_OFFSETS.player_x};
constexpr uintptr_t OFF_POS_Y           = ${AC_OFFSETS.player_y};
constexpr uintptr_t OFF_POS_Z           = ${AC_OFFSETS.player_z};
constexpr uintptr_t OFF_TEAM            = ${AC_OFFSETS.player_team};
constexpr uintptr_t OFF_ENEMY_COUNT     = ${AC_OFFSETS.enemy_count};
constexpr uintptr_t OFF_ENEMY_ARRAY     = ${AC_OFFSETS.enemy_array};
constexpr uintptr_t OFF_VIEW_MATRIX     = ${AC_OFFSETS.view_matrix};

// ---- Per-cheat globals (one bool each, toggled by ImGui::Checkbox) ----
${cheatGlobals || "// (no cheats detected — populated when register_cheat() is used)"}
bool g_menu_visible = false;

${aimbotFn}

${espBlock}

// ---- Cheat thread (~60 Hz, applies the ticked cheats) ----
unsigned __stdcall cheat_thread(void*) {
    HMODULE hMod = GetModuleHandleA("ac_client.exe");
    if (!hMod) return 0;
    uintptr_t base = (uintptr_t)hMod;

    while (true) {
        uintptr_t player_base = *(uintptr_t*)(base + OFF_PLAYER_BASE_PTR);
        if (player_base) {
${cheatTickBlocks || "            // (no togglable cheats — body empty)"}
        }
        // DELETE toggles the menu — same hotkey as M23.
        if (GetAsyncKeyState(VK_DELETE) & 1) {
            g_menu_visible = !g_menu_visible;
        }
        Sleep(16);
    }
    return 0;
}

// ---- D3D9 EndScene hook (renders ImGui menu + ESP) ----
typedef HRESULT(__stdcall* EndScene_t)(IDirect3DDevice9*);
EndScene_t  oEndScene = nullptr;
ID3DXFont*  g_font    = nullptr;
bool        g_imgui_init = false;
HWND        g_game_hwnd  = nullptr;

extern IMGUI_IMPL_API LRESULT
ImGui_ImplWin32_WndProcHandler(HWND, UINT, WPARAM, LPARAM);
WNDPROC oWndProc = nullptr;

LRESULT CALLBACK hkWndProc(HWND h, UINT m, WPARAM w, LPARAM l) {
    if (g_menu_visible &&
        ImGui_ImplWin32_WndProcHandler(h, m, w, l)) return 1;
    return CallWindowProcA(oWndProc, h, m, w, l);
}

HRESULT __stdcall hkEndScene(IDirect3DDevice9* device) {
    if (!g_imgui_init) {
        D3DDEVICE_CREATION_PARAMETERS p;
        device->GetCreationParameters(&p);
        g_game_hwnd = p.hFocusWindow;
        oWndProc = (WNDPROC)SetWindowLongPtrA(g_game_hwnd, GWLP_WNDPROC,
                       (LONG_PTR)hkWndProc);

        ImGui::CreateContext();
        ImGui_ImplWin32_Init(g_game_hwnd);
        ImGui_ImplDX9_Init(device);
        D3DXCreateFontA(device, 14, 0, FW_NORMAL, 1, FALSE,
            DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, DEFAULT_QUALITY,
            DEFAULT_PITCH | FF_DONTCARE, "Arial", &g_font);
        g_imgui_init = true;
    }

    ${a.hasRenderHook ? "draw_esp(device, g_font);" : "// no render hook → no ESP draw"}

    if (g_menu_visible) {
        ImGui_ImplDX9_NewFrame();
        ImGui_ImplWin32_NewFrame();
        ImGui::NewFrame();

        ImGui::Begin("AC Trainer — DELETE to close",
                     &g_menu_visible,
                     ImGuiWindowFlags_AlwaysAutoResize);
${cheatCheckboxes || "        ImGui::Text(\"(no cheats registered)\");"}
        ImGui::End();

        ImGui::Render();
        ImGui_ImplDX9_RenderDrawData(ImGui::GetDrawData());
    }
    return oEndScene(device);
}

// Find EndScene's address via the dummy-device trick (Codex: 'Render
// Hooking — Drawing on the Game's Frame'):
void* get_endscene_addr() {
    HWND tmp = CreateWindowA("BUTTON", "", 0, 0, 0, 1, 1, NULL, NULL,
                             GetModuleHandleA(NULL), NULL);
    IDirect3D9* d3d = Direct3DCreate9(D3D_SDK_VERSION);
    D3DPRESENT_PARAMETERS pp = {};
    pp.Windowed = TRUE;
    pp.SwapEffect = D3DSWAPEFFECT_DISCARD;
    pp.BackBufferFormat = D3DFMT_UNKNOWN;
    pp.hDeviceWindow = tmp;
    IDirect3DDevice9* dev = nullptr;
    d3d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, tmp,
        D3DCREATE_SOFTWARE_VERTEXPROCESSING, &pp, &dev);
    void** vtbl = *(void***)dev;
    void* es = vtbl[42];   // EndScene is index 42 on D3D9
    dev->Release();
    d3d->Release();
    DestroyWindow(tmp);
    return es;
}

void install_render_hook() {
    void* es = get_endscene_addr();
    MH_Initialize();
    MH_CreateHook(es, &hkEndScene, (void**)&oEndScene);
    MH_EnableHook(es);
}

// ---- DllMain — entry point ----
BOOL WINAPI DllMain(HINSTANCE hInst, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) {
        DisableThreadLibraryCalls(hInst);
        // Spawn the cheat thread (per-frame cheat application).
        _beginthreadex(nullptr, 0, cheat_thread, nullptr, 0, nullptr);
        // Install the EndScene hook for menu + ESP rendering.
        install_render_hook();
    }
    if (reason == DLL_PROCESS_DETACH) {
        MH_DisableHook(MH_ALL_HOOKS);
        MH_Uninitialize();
    }
    return TRUE;
}

// =============================================================
//  END
//
//  Build steps (Visual Studio 2017+):
//    1. New Project → Empty Project (C++).
//    2. Project Properties → Configuration Type → Dynamic Library.
//    3. Configuration → Win32 (NOT x64 — AC is 32-bit).
//    4. C/C++ → Code Generation → Runtime Library → /MT.
//    5. Linker → Input → Additional Dependencies:
//         d3d9.lib; d3dx9.lib; MinHook.lib
//    6. Add ImGui source files + minhook source/lib to project.
//    7. Drop this file in Source Files.
//    8. Build. Output: AC_Trainer.dll.
//    9. Inject (any standard injector), or rename to SDL.dll +
//       drop in AC's folder for auto-load (M25 lesson).
//   10. In-game: press DELETE to toggle the menu.
// =============================================================
`;
}
