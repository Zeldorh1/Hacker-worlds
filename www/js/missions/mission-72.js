// Mission 72 — MINI TRAINER 3: Multi-feature menu
//
// Stage 3 of the trainer track. M71 had one toggle. M72 stacks four:
//
//   [x] HP Freeze       — write_label("player.hp", 9999)
//   [x] Infinite Ammo   — write_label("player.ammo", 999)
//   [x] No Recoil       — write_label("weapon.recoilPerShot", 0)
//   [x] ESP             — write_label("render.espVisible", 1)
//
// Each is one register_cheat call. The pattern doesn't change as you
// add more — N features = N register_cheat lines + N tick functions.
// This is the architecture of every "100+ feature" cheat menu you've
// ever seen — they're literally just N entries registered the same way.
//
// Real C++ equivalent (ImGui style):
//
//   bool g_HpFreeze = false, g_InfiniteAmmo = false,
//        g_NoRecoil = false, g_ESP = false;
//
//   void RenderMenu() {
//       ImGui::Checkbox("HP Freeze",       &g_HpFreeze);
//       ImGui::Checkbox("Infinite Ammo",   &g_InfiniteAmmo);
//       ImGui::Checkbox("No Recoil",       &g_NoRecoil);
//       ImGui::Checkbox("ESP",             &g_ESP);
//   }
//
//   void TickAll() {
//       if (g_HpFreeze)     WriteProcessMemory(..., hp,    &target_hp);
//       if (g_InfiniteAmmo) WriteProcessMemory(..., ammo,  &full_ammo);
//       if (g_NoRecoil)     WriteProcessMemory(..., recoil, &zero);
//       if (g_ESP)          WriteProcessMemory(..., esp,    &one);
//   }
//
// Mission win: enable all four toggles, prove each one works.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// MINI TRAINER 3 — Multi-feature menu.
//
// Four register_cheat calls. Same pattern as M71 × 4. Open the cheat
// menu (DELETE key) and tick each box. Each tick fires its handler
// every frame the box stays checked.

void onInject() {
  log("MINI TRAINER 3 online — 4 features available in cheat menu");

  register_cheat("HP Freeze", function() {
    write_label("player.hp", 9999);
  });

  register_cheat("Infinite Ammo", function() {
    write_label("player.ammo", 999);
  });

  register_cheat("No Recoil", function() {
    write_label("weapon.recoilPerShot", 0);
  });

  register_cheat("ESP", function() {
    write_label("render.espVisible", 1);
  });
}

void onTick() { }
`;

export const mission72 = {
  id: "m72",
  title: "MINI TRAINER 3: MULTI-FEATURE MENU",
  brief: "Four toggles, one menu. The architecture of every '100+ feature' cheat.",
  prerequisites: ["m71"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "🛠",
    title: "STAGE 3 — MULTI-FEATURE MENU",
    body: `M71 had one toggle. M72 stacks four:

  [x] HP Freeze
  [x] Infinite Ammo
  [x] No Recoil
  [x] ESP

Each is one register_cheat call. The pattern doesn't
change as you add more.

Real C++ equivalent (ImGui):
  ImGui::Checkbox("HP Freeze",     &g_HpFreeze);
  ImGui::Checkbox("Infinite Ammo", &g_InfiniteAmmo);
  ImGui::Checkbox("No Recoil",     &g_NoRecoil);
  ImGui::Checkbox("ESP",           &g_ESP);

  if (g_HpFreeze)     WPM(...);
  if (g_InfiniteAmmo) WPM(...);
  ...

The "100+ feature" cheat menus you've seen on Reddit
are literally just N entries registered this way.

Win: enable all four toggles. Each handler fires
every frame; combined effect is invincible + endless
ammo + perfect aim + see-through-walls.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template registers 4 cheats: HP Freeze, Infinite Ammo, No Recoil, ESP. Compile + Inject.",
    },
    {
      id: "tick-all",
      when: ({ dllState }) => {
        if (!dllState.running) return false;
        const dll = window.__hw && window.__hw.dll;
        if (!dll) return false;
        const expected = ["HP Freeze", "Infinite Ammo", "No Recoil", "ESP"];
        return expected.some(label => {
          const c = dll.cheats.find(c => c.label === label);
          return !c || !c.enabled;
        });
      },
      say: "Open the cheat menu. Tick all four boxes. The menu hosts as many register_cheat entries as you give it — same architecture every commercial cheat ships.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableHazards();
    target.enableEnemies();
    target.enableWeapon();
    target.enableRecoil(8);          // M72 cheat must overcome this
    target.enableCamouflage();       // ESP cheat must overcome this

    dialog.script("VEX", [
      "Stage 3: stack features. M71 had one toggle. Real trainers have dozens. The pattern doesn't change — each feature is one register_cheat call + one tick handler.",
      "Template gives you 4: HP Freeze, Infinite Ammo, No Recoil, ESP. Each handler is one line — write_label to a known cell.",
      "Compile + inject. Open the cheat menu (DELETE key). Tick all four. HP pinned, ammo never depletes, recoil zero, enemies visible through camouflage.",
      "Win: all 4 toggles enabled simultaneously for 4 seconds. M73 builds the menu UI from scratch with render hooks, ditching the simulator's built-in menu.",
    ]);

    let done = false;
    target._m72AllOnSince = 0;

    const interval = setInterval(() => {
      if (done) return;
      const dll = window.__hw && window.__hw.dll;
      if (!dll) return;
      const labels = ["HP Freeze", "Infinite Ammo", "No Recoil", "ESP"];
      const allOn = labels.every(label => {
        const c = dll.cheats.find(c => c.label === label);
        return c && c.enabled;
      });
      if (allOn) {
        if (target._m72AllOnSince === 0) target._m72AllOnSince = performance.now();
        if (performance.now() - target._m72AllOnSince >= 4000) {
          done = true;
          complete("4 features running simultaneously. Same architecture as every multi-feature cheat menu. M73 next: build the menu UI from scratch with render hooks instead of the built-in.");
          clearInterval(interval);
        }
      } else {
        target._m72AllOnSince = 0;
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
