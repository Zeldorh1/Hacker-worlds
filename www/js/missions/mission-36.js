// Mission 36 — CUSTOM MENU
//
// Build the menu yourself. M23's cheat menu was given to you. M29's
// export uses ImGui::Begin / ImGui::Checkbox — high-level magic. By
// the end of this mission you'll know what each line is doing
// underneath.
//
// What a menu actually IS:
//   1. STATE — bool variables for each cheat ("is Infinite HP on?").
//   2. DRAWING — rectangles, text, fills. Every menu is just colored
//      boxes positioned on screen.
//   3. HIT-TESTING — when the player taps, check if the tap is
//      inside any drawn rectangle.
//   4. STATE TOGGLE — if a tap landed on a checkbox rect, flip the
//      bool.
//   5. APPLY — somewhere else, read the bool and do the cheat
//      thing if it's true.
//
// That's everything. ImGui automates this with ImGui::Checkbox(label,
// &state) — but the C++ underneath is doing the same five things.
//
// Mission flow:
//   1. Template ships with a working menu drawn in cyan-on-black.
//   2. Player can edit colors, position, fonts, layout to make it
//      theirs.
//   3. Player taps a checkbox → bool flips → cheat activates.
//   4. Win = at least one cheat enabled via the custom menu AND
//      target.killCount >= 4.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M36 — CUSTOM MENU
// Build the menu yourself. Edit colors, positions, layout, fonts.
// Watch how each piece works.
//
// API used:
//   register_render_hook(fn(ctx, sim))  — draw, every frame
//   register_input_hook(fn(event))      — on canvas tap
//   register_cheat(label, tickFn)       — applied each frame when on
//
// Tip: change the COLORS below to make it yours.

// ---- 1. STATE — one bool per cheat. ImGui passes &these as args. ----
const state = {
  inf_hp: false,
  inf_ammo: false,
  super_dmg: false,
};

// ---- 2. STYLE — edit these to change appearance. ----
const STYLE = {
  x: 12,                          // menu position (top-left)
  y: 60,
  w: 220,                         // menu size
  rowH: 28,
  bgColor: "rgba(6, 8, 10, 0.9)",      // background fill
  borderColor: "#22d3ee",              // border + active text
  textColor: "#d6e6d6",                // inactive text
  checkOnColor: "#4ade80",             // checkbox fill when on
  checkOffColor: "#1f2a33",            // checkbox fill when off
  font: "12px ui-monospace, Menlo, monospace",
};

// ---- 3. LAYOUT — compute checkbox rects so we can draw + hit-test. ----
function checkboxRects() {
  const rows = [
    { key: "inf_hp",    label: "Infinite HP" },
    { key: "inf_ammo",  label: "Infinite Ammo" },
    { key: "super_dmg", label: "Super Damage" },
  ];
  return rows.map((row, i) => ({
    ...row,
    x: STYLE.x + 10,
    y: STYLE.y + 30 + i * STYLE.rowH,    // 30 = title-bar height
    boxSize: 16,
  }));
}

// ---- 4. DRAW — render the menu every frame. ----
register_render_hook(function(ctx, sim) {
  // Background panel.
  ctx.fillStyle = STYLE.bgColor;
  ctx.fillRect(STYLE.x, STYLE.y, STYLE.w, STYLE.rowH * 3 + 40);
  ctx.strokeStyle = STYLE.borderColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(STYLE.x + 0.5, STYLE.y + 0.5, STYLE.w - 1, STYLE.rowH * 3 + 39);

  // Title bar.
  ctx.fillStyle = STYLE.borderColor;
  ctx.font = STYLE.font;
  ctx.fillText("CUSTOM MENU", STYLE.x + 10, STYLE.y + 20);

  // Each checkbox row: small filled rect + label.
  for (const r of checkboxRects()) {
    // The box itself.
    ctx.fillStyle = state[r.key] ? STYLE.checkOnColor : STYLE.checkOffColor;
    ctx.fillRect(r.x, r.y, r.boxSize, r.boxSize);
    ctx.strokeStyle = STYLE.borderColor;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.boxSize - 1, r.boxSize - 1);
    // Checkmark when on (just an X drawn over the fill).
    if (state[r.key]) {
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r.x + 3, r.y + 3);
      ctx.lineTo(r.x + r.boxSize - 3, r.y + r.boxSize - 3);
      ctx.moveTo(r.x + r.boxSize - 3, r.y + 3);
      ctx.lineTo(r.x + 3, r.y + r.boxSize - 3);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    // Label to the right of the box.
    ctx.fillStyle = state[r.key] ? STYLE.borderColor : STYLE.textColor;
    ctx.font = STYLE.font;
    ctx.fillText(r.label, r.x + r.boxSize + 8, r.y + r.boxSize - 3);
  }
});

// ---- 5. INPUT — taps that land on a checkbox toggle the state. ----
function pointInRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

register_input_hook(function(ev) {
  if (ev.type !== "click") return false;
  for (const r of checkboxRects()) {
    if (pointInRect(ev.x, ev.y, r.x, r.y, r.boxSize, r.boxSize)) {
      state[r.key] = !state[r.key];
      log("toggled " + r.label + " → " + state[r.key]);
      return true;   // event handled — don't pass to game
    }
    // Clicking the LABEL also toggles (bigger hit area).
    if (pointInRect(ev.x, ev.y, r.x, r.y, 200, r.boxSize)) {
      state[r.key] = !state[r.key];
      log("toggled " + r.label + " → " + state[r.key]);
      return true;
    }
  }
  return false;
});

// ---- 6. APPLY — onTick reads state and runs the cheats that are on. ----
void onTick() {
  if (state.inf_hp)    write_label("player.hp",     100);
  if (state.inf_ammo)  write_label("player.ammo",   99);
  if (state.super_dmg) write_label("weapon.damage", 200);
}

void onInject() {
  log("custom menu loaded — tap the boxes (or labels) to toggle");
}
`;

export const mission36 = {
  id: "m36",
  title: "CUSTOM MENU",
  brief: "Write your own menu. Rects, text, hit-testing, state. Know what's underneath.",
  prerequisites: ["m35"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,

  hints: [
    {
      id: "compile-and-inject",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Read through the template — five sections: STATE / STYLE / LAYOUT / DRAW / INPUT / APPLY. Compile + Inject. The menu appears top-left of ac_anomaly.",
    },
    {
      id: "tap-the-boxes",
      min: 4,
      when: ({ dllState, target }) =>
        dllState.running && target.killCount === 0,
      say: "Tap (or click) the checkboxes. The X appears, label color changes. The state object's bool flipped — onTick reads it and applies the cheat.",
    },
    {
      id: "make-it-yours",
      min: 4,
      when: ({ dllState, target }) =>
        dllState.running && target.killCount === 0,
      say: "Edit STYLE.bgColor, STYLE.borderColor, STYLE.x/y to move and color the menu. Re-Compile + Re-Inject to see changes. This is where 'making it yours' lives.",
    },
    {
      id: "drop-them",
      when: ({ dllState, target }) =>
        dllState.running && target.killCount < 4,
      say: "Tick Super Damage + Infinite Ammo. Walk into range, fire. Drop 4 contacts to win.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableESP();
    target.player.ammo = 50;

    dialog.script("VEX", [
      "Make the menu yourself. M23's was given. M29's used ImGui's high-level magic. This time you write every line: state, drawing, hit-testing, toggle.",
      "Template's five sections walk it through: STATE (bools), STYLE (colors/positions you can edit), LAYOUT (where each row sits), DRAW (rects + text every frame), INPUT (hit-test taps + flip bools), APPLY (onTick reads bools).",
      "Compile + Inject. Custom menu appears top-left of ac_anomaly. Tap the boxes — checkboxes toggle. Tick Super Damage, drop 4 contacts.",
      "Edit STYLE.* to change colors / position / size — re-inject to see your version. By the end you'll understand exactly what every ImGui::Begin / ImGui::Checkbox call is doing under the hood.",
    ]);

    let done = false;
    const dllRuntime = window.__hw && window.__hw.dll;

    const interval = setInterval(() => {
      if (done) return;
      if (!dllRuntime) return;
      // Win: render hook installed + input hook installed + 4 kills.
      const hasRender = dllRuntime.renderHooks.length > 0;
      const hasInput  = dllRuntime.inputHooks.length > 0;
      if (dllRuntime.running && hasRender && hasInput && target.killCount >= 4) {
        done = true;
        complete("Custom menu drew, custom input toggled, custom state applied. You wrote every line of an ImGui menu by hand.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
