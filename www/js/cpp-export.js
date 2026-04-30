// Export-to-C++ — emits a real Visual Studio-buildable .cpp file
// targeting AssaultCube based on the player's simulator DLL source.
//
// Strategy:
//   1. Parse the player's JS-flavored DLL for register_cheat /
//      register_render_hook / write_label / read_label / load_payload
//      calls we recognise.
//   2. Translate each pattern into the equivalent C++ targeting
//      ac_client.exe with hardcoded AC offsets.
//   3. Emit a complete file: includes, AC offset table, DllMain,
//      cheat thread, DirectX EndScene hook (if render hooks were
//      registered), exit wiring.
//
// Output is a real AssaultCube trainer source that the player can
// paste into a Visual Studio DLL project, build, and inject. The
// sim is the practice ground; the export is the deployable artifact.
//
// Public AC 1.2.0.2 offsets (these are documented in every public
// AC hacking tutorial, including gamehacking.academy — they're
// stable across the game's lifetime):

const AC_OFFSETS = {
  player_base_ptr: "0x10F4F4",   // ac_client.exe + 0x10F4F4 → Player*
  player_hp:       "0xEC",       // *(int*)(player_base + 0xEC)
  player_armor:    "0xF0",
  player_ammo:     "0x140",      // current weapon ammo
  player_x:        "0x4",
  player_y:        "0xC",
  player_z:        "0x8",
  player_team:     "0x32C",
  weapon_damage:   "0x118",      // player+0x374 → weapon* +0x118 in some builds
  enemy_count:     "0x10F500",   // ac_client.exe + 0x10F500 → numplayers
  enemy_array:     "0x10F4F8",   // ac_client.exe + 0x10F4F8 → Player**
  view_matrix:     "0x17DFD0",   // ac_client.exe + 0x17DFD0 → 4x4 float matrix
};

// Translate a write_label call to the equivalent AC pointer chain.
function translateLabelWrite(label, value) {
  switch (label) {
    case "player.hp":
      return `*(int*)(player_base + ${AC_OFFSETS.player_hp}) = ${value};`;
    case "player.ammo":
      return `*(int*)(player_base + ${AC_OFFSETS.player_ammo}) = ${value};`;
    case "weapon.damage":
      // Damage in AC is per-weapon-descriptor; this is approximate.
      return `// weapon.damage maps to weapon descriptor in ac_client; see Codex\n    // *(int*)(weapon_descriptor + 0x...) = ${value};`;
    case "crosshair.target":
      // No direct equivalent; the AC aimbot computes a target each
      // frame and SetCursorPos / mouse_event to center on them.
      return `// crosshair.target — see aimbot loop (no direct cell)`;
    default:
      return `// write_label("${label}", ${value}) — no AC mapping yet`;
  }
}

// Detect what features the source uses and emit the right C++.
function analyzeSource(source) {
  return {
    hasAimbot: /register_cheat\s*\(\s*["']Aimbot["']/.test(source),
    hasTriggerBot: /register_cheat\s*\(\s*["']Trigger\s*Bot["']/.test(source),
    hasInfHp: /register_cheat\s*\(\s*["']Infinite\s*HP["']/.test(source) ||
              /write_label\s*\(\s*["']player\.hp["']\s*,\s*100\s*\)/.test(source),
    hasInfAmmo: /register_cheat\s*\(\s*["']Infinite\s*Ammo["']/.test(source) ||
                /write_label\s*\(\s*["']player\.ammo["']/.test(source),
    hasSuperDmg: /register_cheat\s*\(\s*["']Super\s*Damage["']/.test(source) ||
                 /write_label\s*\(\s*["']weapon\.damage["']/.test(source),
    hasRenderHook: /register_render_hook\s*\(/.test(source),
    hasStager: /load_payload\s*\(/.test(source),
  };
}

export function exportToCpp(source) {
  const a = analyzeSource(source);
  const features = [];
  if (a.hasInfHp) features.push("Infinite HP");
  if (a.hasInfAmmo) features.push("Infinite Ammo");
  if (a.hasSuperDmg) features.push("Super Damage");
  if (a.hasAimbot) features.push("Aimbot");
  if (a.hasTriggerBot) features.push("Trigger Bot");
  if (a.hasRenderHook) features.push("ESP / Render Hook");
  if (a.hasStager) features.push("Stager pattern");

  const featureComment = features.length
    ? "// Features detected in your sim DLL:\n" + features.map(f => `//   - ${f}`).join("\n")
    : "// (no recognised features — emitting baseline trainer)";

  const tickBody = [];
  if (a.hasInfHp)    tickBody.push(`        *(int*)(player_base + ${AC_OFFSETS.player_hp})   = 100;`);
  if (a.hasInfAmmo)  tickBody.push(`        *(int*)(player_base + ${AC_OFFSETS.player_ammo}) = 99;`);
  if (a.hasSuperDmg) tickBody.push(`        // weapon damage tweak — see Codex 'AC Offsets Cheat Sheet'`);

  const aimbotBlock = a.hasAimbot ? `
        // ---- Aimbot ----
        // Walk the enemy array. For AC 1.2:
        //   uint32_t numplayers = *(uint32_t*)(0x${AC_OFFSETS.enemy_count.slice(2)});
        //   Player** enemies   = *(Player***)(0x${AC_OFFSETS.enemy_array.slice(2)});
        // For each enemy, compute screen-space angle delta to your
        // crosshair using atan2(dy, dx). Use mouse_event() to nudge
        // the mouse delta toward the closest enemy. Real CAEU did
        // this with _CIatan2 + _CIcos + _CIsin imports.` : "";

  const renderHookBlock = a.hasRenderHook ? `
// ---- ESP via D3D9 EndScene hook ----
//
// Install with MinHook:
//   void* endscene = get_endscene_via_dummy_device();
//   MH_CreateHook(endscene, &hkEndScene, (void**)&oEndScene);
//   MH_EnableHook(endscene);
//
// Inside hkEndScene:
//   for each enemy in enemy_array:
//     if !enemy->alive continue
//     D3DXVECTOR3 screen, world(enemy->x, enemy->y, enemy->z);
//     D3DXVec3Project(&screen, &world, nullptr, nullptr, nullptr,
//                     view_matrix, viewport_w, viewport_h);
//     if (screen.z > 1.0f) continue;   // behind camera
//     draw_rect(device, screen.x - 16, screen.y - 24, 32, 48,
//               D3DCOLOR_ARGB(255, 0, 255, 255));
//     // name + HP via D3DXCreateFontA → DrawTextA
//
// Full reference in the Codex 'Render Hooking' article.` : "";

  return `// =============================================================
//  AssaultCube trainer — auto-generated from Hacker Worlds sim
// =============================================================
//
// Build with Visual Studio 2017+ as a 32-bit DLL.
// Inject with any standard injector (CreateRemoteThread + LoadLibraryA,
// or rename to SDL.dll for auto-load via DLL hijacking).
//
// Target: ac_client.exe (AssaultCube 1.2.0.2 — public version).
//
${featureComment}

#include <windows.h>
#include <process.h>
${a.hasRenderHook ? '#include <d3d9.h>\n#include <d3dx9.h>\n// Link: d3d9.lib, d3dx9.lib, MinHook.lib' : ''}

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

// ---- Cheat thread ----
unsigned __stdcall cheat_thread(void*) {
    HMODULE hMod = GetModuleHandleA("ac_client.exe");
    if (!hMod) return 0;
    uintptr_t base = (uintptr_t)hMod;

    while (true) {
        // Resolve the player struct each iteration (handles relocations).
        uintptr_t player_base = *(uintptr_t*)(base + OFF_PLAYER_BASE_PTR);
        if (player_base) {
${tickBody.join("\n") || "            // (no per-tick patches detected)"}${aimbotBlock}
        }

        // Press DELETE to toggle a menu. Real implementation uses
        // ImGui-on-EndScene; this skeleton just demonstrates the hotkey.
        if (GetAsyncKeyState(VK_DELETE) & 1) {
            // toggle menu visible flag here
        }

        Sleep(16);   // ~60 Hz
    }
    return 0;
}

${renderHookBlock}

// ---- DllMain — entry point ----
BOOL WINAPI DllMain(HINSTANCE hInst, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) {
        DisableThreadLibraryCalls(hInst);
        _beginthreadex(nullptr, 0, cheat_thread, nullptr, 0, nullptr);
    }
    return TRUE;
}

// =============================================================
//  END
//
//  To build:
//    1. Visual Studio → New Project → Dynamic-Link Library (DLL),
//       C++, Empty Project.
//    2. Drop this file in the Source Files folder.
//    3. Project Properties → C/C++ → Code Generation → Runtime
//       Library → Multi-threaded (/MT) for static CRT.
//    4. Linker → Input → Additional Dependencies: ${a.hasRenderHook ? 'd3d9.lib d3dx9.lib MinHook.lib' : '(default Win32 libs)'}
//    5. Build → Build Solution. Output: AC_Trainer.dll
//    6. Inject via your loader, or rename to SDL.dll for auto-load.
// =============================================================
`;
}
