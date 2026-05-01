// Mission 74 — MINI TRAINER 5: PERSIST CONFIG
//
// Stage 5 of the trainer track. M73 has a working DIY menu — but
// every time you re-inject the DLL, all checkboxes reset to off.
// Real trainers persist their settings across runs.
//
// In real C++ this is a config file in %APPDATA% or near the
// trainer's exe:
//
//   // Save:
//   std::ofstream f("trainer.ini");
//   f << "HpFreeze=" << (g_HpFreeze ? 1 : 0) << "\n";
//   f << "InfiniteAmmo=" << (g_InfiniteAmmo ? 1 : 0) << "\n";
//   ...
//
//   // Load (on DllMain attach):
//   std::ifstream f("trainer.ini");
//   std::string line;
//   while (std::getline(f, line)) {
//       if (line.starts_with("HpFreeze=")) g_HpFreeze = ...;
//       ...
//   }
//
// In our simulator the equivalent is localStorage:
//
//   localStorage.setItem("trainer.config", JSON.stringify(features));
//   const saved = JSON.parse(localStorage.getItem("trainer.config"));
//
// Mission flow:
//   1. Player toggles features in their DIY menu (M73-style).
//   2. Features auto-save to localStorage on each toggle.
//   3. Player re-injects the DLL.
//   4. Features load from localStorage on onInject — checkboxes
//      come back in the exact state they were before.
//   5. Win: confirm settings persist across a re-inject.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// MINI TRAINER 5 — Persist config across re-injects.
//
// localStorage is the simulator's stand-in for trainer.ini /
// %APPDATA%/MyTrainer/config.json. Same workflow:
//   • onInject:  load saved state
//   • on toggle: save new state
//   • next time: state is still there

const MENU_X = 20;
const MENU_Y = 20;
const ROW_H  = 22;
const BOX_SZ = 14;
const STORAGE_KEY = "m74.trainer.config";

const features = [
  { label: "HP Freeze",     on: false, tick: () => write_label("player.hp", 9999) },
  { label: "Infinite Ammo", on: false, tick: () => write_label("player.ammo", 999) },
  { label: "No Recoil",     on: false, tick: () => write_label("weapon.recoilPerShot", 0) },
  { label: "ESP",           on: false, tick: () => write_label("render.espVisible", 1) },
];

function rectFor(i) {
  return { x: MENU_X + 8, y: MENU_Y + 30 + i * ROW_H, w: BOX_SZ, h: BOX_SZ };
}

// LOAD on inject — restore previous toggle state.
function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    for (let i = 0; i < features.length && i < saved.length; i++) {
      features[i].on = !!saved[i];
    }
    log("Config loaded: " + features.filter(f => f.on).map(f => f.label).join(", "));
  } catch (e) {
    log("loadConfig error: " + e.message);
  }
}

// SAVE on every toggle — write current state.
function saveConfig() {
  try {
    const state = features.map(f => f.on ? 1 : 0);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    log("saveConfig error: " + e.message);
  }
}

void onInject() {
  log("MINI TRAINER 5 — loading saved config");
  loadConfig();

  register_render_hook(function(ctx, sim) {
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(MENU_X, MENU_Y, 180, 30 + features.length * ROW_H + 8);
    ctx.strokeStyle = "#22d3ee";
    ctx.strokeRect(MENU_X + 0.5, MENU_Y + 0.5, 179, 29 + features.length * ROW_H + 7);
    ctx.font = "12px ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#22d3ee";
    ctx.fillText("DIY TRAINER (saved)", MENU_X + 8, MENU_Y + 18);

    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const r = rectFor(i);
      ctx.strokeStyle = "#22d3ee";
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      if (f.on) {
        ctx.fillStyle = "#22d3ee";
        ctx.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
      }
      ctx.fillStyle = f.on ? "#22d3ee" : "#9ca3af";
      ctx.fillText(f.label, r.x + r.w + 8, r.y + r.h - 3);
    }
  });

  register_input_hook(function(evt) {
    if (evt.type !== "click") return false;
    for (let i = 0; i < features.length; i++) {
      const r = rectFor(i);
      if (evt.x >= r.x && evt.x <= r.x + r.w &&
          evt.y >= r.y && evt.y <= r.y + r.h) {
        features[i].on = !features[i].on;
        log("Toggled " + features[i].label + " -> " + (features[i].on ? "ON" : "OFF") + " (saved)");
        saveConfig();   // persist the change
        return true;
      }
    }
    return false;
  });
}

void onTick() {
  for (const f of features) {
    if (f.on) f.tick();
  }
}
`;

export const mission74 = {
  id: "m74",
  title: "MINI TRAINER 5: PERSIST CONFIG",
  brief: "Save toggle state to localStorage. Re-inject and the menu remembers.",
  prerequisites: ["m73"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "🛠",
    title: "STAGE 5 — PERSIST ACROSS RE-INJECTS",
    body: `M73 has a working DIY menu. Every re-inject
resets the checkboxes to off. Real trainers don't
work that way — your settings persist across runs.

C++ equivalent:
  // %APPDATA%/MyTrainer/config.ini
  std::ofstream f("trainer.ini");
  f << "HpFreeze=" << g_HpFreeze << "\\n";
  ...
  // On startup:
  std::ifstream f("trainer.ini");
  while (std::getline(f, line)) parse(line);

Sim equivalent: localStorage with a JSON-encoded
state array.

Workflow:
  • onInject  → loadConfig() pulls from storage
  • on toggle → saveConfig() writes new state
  • next inject → state is still there

Win: enable all 4 toggles, eject the DLL, re-inject.
Saved state restores. Trainer remembers between runs.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template wires loadConfig() into onInject and saveConfig() into the click handler. Compile + Inject.",
    },
    {
      id: "tick-all",
      when: ({ dllState, target }) =>
        dllState.running && !target._m74AllOnReached,
      say: "Click all 4 checkboxes ON. Each click writes to localStorage immediately — config is persisted on every change.",
    },
    {
      id: "reinject",
      when: ({ target }) =>
        target._m74AllOnReached && !target._m74PersistVerified,
      say: "All 4 ON. Now eject the DLL (DLL tab → Eject) and Inject again. The saved state should restore — checkboxes come back ON immediately on the new inject.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableHazards();
    target.enableEnemies();
    target.enableWeapon();
    target.enableRecoil(8);
    target.enableCamouflage();
    target._m74AllOnReached = false;
    target._m74PersistVerified = false;
    target._m74EjectsAfterAllOn = 0;

    // Clear any stale config from a prior run so the test is clean.
    try { localStorage.removeItem("m74.trainer.config"); } catch {}

    dialog.script("VEX", [
      "Stage 5: persist your settings. M73's menu was great until you ejected — every re-inject reset it. Real trainers remember your config.",
      "C++ writes to %APPDATA%/MyTrainer/config.ini. Our sim uses localStorage with a JSON state array. Same shape: write on change, read on init.",
      "Step 1: Compile + Inject. Click all 4 checkboxes ON. saveConfig fires per click.",
      "Step 2: Eject the DLL. Then Inject again. Watch — onInject calls loadConfig and the checkboxes restore to ON immediately. THAT is the win condition.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      const dll = window.__hw && window.__hw.dll;
      if (!dll) return;

      // Phase 1: detect all-on state during a running inject.
      const hpFrozen   = target.player.hp >= 9000;
      const ammoOk     = target.player.ammo > 100;
      const noRecoil   = target.weapon.recoilPerShot === 0;
      const espOn      = target.espActive;
      const allOn      = dll.running && hpFrozen && ammoOk && noRecoil && espOn;

      if (allOn && !target._m74AllOnReached) {
        target._m74AllOnReached = true;
        target._m74WasRunning = true;
      }

      // Phase 2: detect eject-then-reinject after all-on.
      if (target._m74AllOnReached && !target._m74PersistVerified) {
        // Track running -> not-running -> running transitions
        if (target._m74WasRunning && !dll.running) {
          // dll has been ejected
          target._m74WasRunning = false;
        } else if (!target._m74WasRunning && dll.running) {
          // dll re-injected — check if all-on state restored
          target._m74WasRunning = true;
          // Give one tick for the cheats to fire
          setTimeout(() => {
            const restored =
              target.player.hp >= 9000 &&
              target.player.ammo > 100 &&
              target.weapon.recoilPerShot === 0 &&
              target.espActive;
            if (restored) {
              target._m74PersistVerified = true;
            }
          }, 200);
        }
      }

      if (target._m74PersistVerified) {
        done = true;
        try { localStorage.removeItem("m74.trainer.config"); } catch {}
        complete("Settings persisted across an eject+reinject. localStorage stand-in for trainer.ini did exactly what %APPDATA% does in a real trainer. Same workflow.");
        clearInterval(interval);
      }
    }, 250);

    return () => {
      clearInterval(interval);
      try { localStorage.removeItem("m74.trainer.config"); } catch {}
    };
  },
};
