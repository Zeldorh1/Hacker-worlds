// Mission 23 — CHEAT MENU
//
// Trainer architecture. Real cheats don't make you re-write code each
// time you want a different effect — they ship a MENU. Each menu item
// is a feature you can toggle: Infinite HP, Infinite Ammo, Speed Hack,
// Aimbot, ESP. The menu pops up over the game on a hotkey (DELETE,
// INSERT, F11 are the classic bindings). Each item is just a function
// the menu's checkbox runs (or stops running) every frame.
//
// New API for the DLL:
//   register_cheat("Infinite HP", function() { write_label("player.hp", 100); });
//
// onTick still runs (for always-on logic), but registered cheats only
// fire when their checkbox is ticked in the menu. The menu pops up on
// DELETE / Insert / the ≡ CHEATS button.
//
// Mission flow:
//   1. Player opens DLL editor with a 3-cheat template
//      (HP lock, ammo lock, super damage).
//   2. Compile + Inject. Menu populates with 3 unchecked rows.
//   3. Player presses DELETE (or taps ≡ CHEATS), enables all three.
//   4. Drops 4 enemies — proves all three cheats are wired correctly.
//
// Real game equivalent: every commercial cheat ships an ImGui or
// DirectX-drawn overlay menu with this exact pattern. The Codex
// 'Real-World Bridge' article walks through the actual ImGui setup.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M23 — CHEAT MENU
// Each register_cheat() adds an entry to the in-game menu.
// Press DELETE (or tap ≡ CHEATS) to toggle them on/off.

void onInject() {
  log("Trainer DLL loaded — 3 cheats registered, menu live");

  register_cheat("Infinite HP", function() {
    write_label("player.hp", 100);
  });

  register_cheat("Infinite Ammo", function() {
    write_label("player.ammo", 99);
  });

  register_cheat("Super Damage", function() {
    write_label("weapon.damage", 200);
  });
}

// onTick still runs every frame for always-on logic.
// Leave it empty if all your features are toggleable cheats.
void onTick() { }
`;

export const mission23 = {
  id: "m23",
  title: "CHEAT MENU",
  brief: "Build a trainer menu. Toggle cheats on the fly with DELETE.",
  prerequisites: ["m22"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  cheatMenu: true,

  hints: [
    {
      id: "open-editor",
      min: 8,
      when: ({ activeTab, dllState }) => activeTab !== "dll" && !dllState.compiled,
      say: "DLL tab. Template's pre-loaded with three register_cheat() calls — HP lock, ammo lock, super damage. Read it, then Compile + Inject.",
    },
    {
      id: "open-menu",
      min: 4,
      when: ({ dllState, target }) =>
        dllState.running && target.killCount === 0,
      say: "DLL injected — three cheats registered but all OFF by default. Tap the ≡ CHEATS button (top-left of ac_anomaly) or hit DELETE to open the menu. Tick all three.",
    },
    {
      id: "drop-them",
      when: ({ target, dllState }) =>
        dllState.running &&
        target.weapon.damage > 25 &&
        target.killCount < 4,
      say: "Damage's pumped, HP and ammo locked. Drop all four contacts to confirm every cheat wired correctly.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableESP();
    target.player.ammo = 30;   // small starting ammo so the lock matters

    dialog.script("VEX", [
      "Trainer architecture. Every commercial cheat ships a menu — checkboxes for each feature. You toggle them mid-fight, no recompile needed.",
      "DLL tab. Template registers three cheats with register_cheat() — Infinite HP, Infinite Ammo, Super Damage. Each is a function the menu runs each frame when checked.",
      "Compile, Inject. Tap the ≡ CHEATS button (or hit DELETE on a keyboard). Menu pops up. Tick all three.",
      "Drop the four contacts in the room. With damage = 200 you'll one-shot them. Win condition.",
      "Real cheats use ImGui to draw the menu in DirectX. Same pattern — checkboxes wired to per-frame functions. Codex 'Real-World Bridge' walks through the actual C++ setup.",
    ]);

    let done = false;
    const dllRuntime = window.__hw && window.__hw.dll;

    const interval = setInterval(() => {
      if (done) return;
      if (!dllRuntime) return;
      // Need: DLL running + super damage cheat enabled + 4 kills.
      const damageEnabled = dllRuntime.cheats.find(c => c.label === "Super Damage" && c.enabled);
      if (dllRuntime.running && damageEnabled && target.killCount >= 4) {
        done = true;
        complete("3 cheats, 1 menu, 4 kills. You shipped a trainer.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
