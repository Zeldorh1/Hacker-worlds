// Mission 71 — MINI TRAINER 2: Add a toggle (cheat menu entry)
//
// Stage 2 of the trainer track. M70 freezes HP unconditionally. M71
// adds a toggle so the user can turn the cheat on and off via the
// in-game cheat menu (the one M23 introduced).
//
// register_cheat(label, tickFn) installs an entry in the menu. When
// the user ticks the checkbox, tickFn fires every frame. When they
// uncheck, the loop stops.
//
// Real C++ equivalent: an ImGui menu with a checkbox bound to a
// boolean. Inside your hook loop, only apply the freeze when the
// boolean is true:
//
//   bool g_HpFreeze = false;
//   ImGui::Checkbox("HP Freeze", &g_HpFreeze);
//   if (g_HpFreeze) WriteProcessMemory(...);
//
// Same pattern, just with the simulator's register_cheat as the menu
// host instead of ImGui.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// MINI TRAINER 2 — HP freeze with on/off toggle.
//
// register_cheat(label, tickFn) adds a menu entry. tickFn fires every
// frame the cheat is enabled.

void onInject() {
  log("MINI TRAINER 2 online — open cheat menu (DELETE key) and tick HP Freeze");

  // Single-feature menu entry. tickFn body is the same write_label
  // from M70 — but only fires while the user has the box checked.
  register_cheat("HP Freeze", function() {
    write_label("player.hp", 9999);
  });
}

void onTick() { }
`;

export const mission71 = {
  id: "m71",
  title: "MINI TRAINER 2: ADD A TOGGLE",
  brief: "Wrap the freeze in a menu entry. User ticks the box to enable. Real-world ImGui pattern.",
  prerequisites: ["m70"],
  timeLimit: 180,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "🛠",
    title: "STAGE 2 — TOGGLE INTERFACE",
    body: `M70 froze HP unconditionally. Real trainers let
the user TURN CHEATS ON AND OFF.

register_cheat(label, tickFn) installs a menu entry.
The cheat menu (M23) renders a checkbox per entry.
When ticked, tickFn fires every frame. When
unticked, nothing.

Real C++ equivalent (ImGui):
  bool g_HpFreeze = false;
  ImGui::Checkbox("HP Freeze", &g_HpFreeze);
  if (g_HpFreeze) WriteProcessMemory(...);

Same pattern. The simulator hosts the menu UI; you
register a labeled tick handler.

This is the architecture of every commercial cheat
menu — every feature is a checkbox + a per-frame
function. Multi-feature trainers (M72) just register
more entries.`,
  },

  hints: [
    {
      id: "compile",
      min: 5,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template uses register_cheat('HP Freeze', tickFn) instead of writing in onTick. Compile + Inject.",
    },
    {
      id: "open-menu",
      when: ({ dllState, target }) =>
        dllState.running && !window.__hw?.dll?.cheats?.find(c => c.label === "HP Freeze")?.enabled,
      say: "DLL injected and cheat registered, but you haven't ticked the box yet. Tab to ac_anomaly. Open the cheat menu (DELETE key or menu button). Tick 'HP Freeze'.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableHazards();

    dialog.script("VEX", [
      "Stage 2: add user control. M70's freeze was always-on. Real trainers let the user choose when each cheat runs.",
      "register_cheat(label, fn) installs a menu entry. The simulator's cheat menu (M23) renders a checkbox per entry. Box checked → fn runs every frame. Box unchecked → fn doesn't fire.",
      "Compile + inject. Open the cheat menu. Tick 'HP Freeze'. Walk into the hazard zone — HP pinned. Untick the box — HP starts dropping again.",
      "Win: HP pinned for 6 seconds with the box ticked. Untick to test off-state.",
    ]);

    let done = false;
    target._m71PinnedSince = 0;

    const interval = setInterval(() => {
      if (done) return;
      const dll = window.__hw && window.__hw.dll;
      if (!dll) return;
      const hpFreeze = dll.cheats.find(c => c.label === "HP Freeze");
      const enabled = hpFreeze && hpFreeze.enabled;
      if (enabled && target.player.hp >= 9000) {
        if (target._m71PinnedSince === 0) target._m71PinnedSince = performance.now();
        if (performance.now() - target._m71PinnedSince >= 6000) {
          done = true;
          complete("Cheat-menu toggle wired. Same architecture as every commercial trainer's ImGui Checkbox+if-bool pattern. M72 stacks multiple features.");
          clearInterval(interval);
        }
      } else {
        target._m71PinnedSince = 0;
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
