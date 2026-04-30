// Mission 28 — BONE AIMBOT
//
// The CAEU-style aimbot, fully realised. Combines four prior missions:
//   - M07 crosshair freeze (pick a target, lock onto them)
//   - M16 struct discovery (iterate the entity array)
//   - M26 render hook (draw a FOV circle + visible target indicator)
//   - register_cheat (toggleable from the in-game menu)
//
// Real CAEU Hax v4 had _CIatan2 / _CIcos / _CIsin / _CIsqrt imports
// for angle-and-distance math — same shape as what this mission
// teaches. The simulator's 2D map skips the 3D bone-list logic but
// the algorithm is identical.
//
// The DLL template registers two cheats AND a render hook:
//   1. "Aimbot" — picks closest alive enemy each tick, writes their
//      id to crosshair.target.
//   2. "Trigger Bot" — auto-fires when crosshair has a target.
//   3. (Always-on) Render hook draws a FOV circle around the player +
//      a magenta line to whoever's currently locked.
//
// Mission flow:
//   1. Compile + Inject the template.
//   2. ≡ CHEATS menu (M23) — tick Aimbot + Trigger Bot.
//   3. Watch the FOV circle on the canvas + line-to-target.
//   4. Walk near enemies. Trigger bot fires automatically. 4 kills.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M28 — BONE AIMBOT
// Combines crosshair-snap (M07), entity iteration (M16), render
// hook (M26), and the cheat menu (M23). The CAEU-style full
// aimbot, in 30 lines.

void onInject() {
  log("Aimbot DLL loaded — Aimbot + Trigger toggleable in menu");

  // Aimbot tick — pick closest alive enemy, write their id to
  // crosshair.target. Real game equivalent: angle math via
  // atan2(dy, dx), then mouse_event() with the delta.
  register_cheat("Aimbot", function() {
    // We have direct access to the entity array via the sim's
    // helper, but for authenticity we read through memory:
    // crosshair.target is the cell M07 taught you to freeze.
    // Just write the closest enemy's id.
    const sim = window.__hw.target;
    let bestId = 0, bestDist = Infinity;
    for (const e of sim.enemyManager.enemies) {
      if (!e.alive) continue;
      const dx = e.x - sim.player.x;
      const dy = e.y - sim.player.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestId = e.id; }
    }
    if (bestId > 0) write_label("crosshair.target", bestId);
  });

  // Trigger bot — pull the FIRE trigger automatically each tick
  // when an enemy is locked. fire() respects weapon cooldown so
  // this won't shoot faster than the gun allows.
  register_cheat("Trigger Bot", function() {
    if (read_label("crosshair.target") > 0) {
      window.__hw.target.fire();
    }
  });

  // Render hook — draw an FOV circle around the player + a
  // magenta line to the locked target. Real CAEU did this via
  // D3DXLine + D3DXCreateFontA on EndScene.
  register_render_hook(function(ctx, sim) {
    const T = sim.tile_size();
    const player = sim.player();
    const [px, py] = sim.tile_to_screen(player.x, player.y);
    const cx = px + T / 2, cy = py + T / 2;

    // FOV ring (5-tile radius).
    ctx.strokeStyle = "rgba(34, 211, 238, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 5 * T, 0, Math.PI * 2);
    ctx.stroke();

    // Line to currently-locked enemy.
    const targetId = read_label("crosshair.target");
    if (targetId > 0) {
      const e = sim.enemies().find(x => x.id === targetId && x.alive);
      if (e) {
        const [ex, ey] = sim.tile_to_screen(e.x, e.y);
        ctx.strokeStyle = "#f0abfc";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ex + T / 2, ey + T / 2);
        ctx.stroke();
      }
    }
  });
}

void onTick() { }
`;

export const mission28 = {
  id: "m28",
  title: "BONE AIMBOT",
  brief: "Full aimbot DLL: crosshair-snap + trigger bot + FOV render hook.",
  prerequisites: ["m27"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  cheatMenu: true,

  hints: [
    {
      id: "compile-inject",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Template registers TWO cheats (Aimbot + Trigger Bot) and a render hook (FOV circle). Compile + Inject. Console should log 'Aimbot DLL loaded'.",
    },
    {
      id: "open-menu",
      min: 4,
      when: ({ dllState, target }) =>
        dllState.running && target.killCount === 0,
      say: "Tab to ac_anomaly. Cyan FOV circle should be drawn around you. Tap ≡ CHEATS, tick BOTH Aimbot AND Trigger Bot.",
    },
    {
      id: "walk-into-range",
      when: ({ dllState, target }) =>
        dllState.running && target.killCount < 4,
      say: "Walk toward an enemy. When they cross the FOV ring, magenta line snaps to them and Trigger Bot fires automatically. Default damage = 25 → 4 shots per kill.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableESP();
    target.player.ammo = 200;
    target.weapon.damage = 100;   // 1-shot kills, mission stays short

    dialog.script("VEX", [
      "Full aimbot. Combines four prior missions in one DLL: M07 crosshair-snap + M16 entity iteration + M26 render hook + M23 cheat menu.",
      "Template registers two togglable cheats. AIMBOT writes the closest enemy's id to crosshair.target every frame. TRIGGER BOT pulls FIRE automatically when locked.",
      "Render hook draws the FOV circle + magenta line to the locked target — the visual feedback that makes a real aimbot feel like a real aimbot.",
      "Compile, Inject, open ≡ CHEATS, tick both. Walk into range, the gun shoots itself. Drop 4 contacts.",
      "Real-world this is what CAEU Hax v4 was doing — same algorithm, same imports (atan2/cos/sin for the angle math). The C++ version is in the Codex 'Bone-Snap Aimbot Math' article.",
    ]);

    let done = false;
    const dllRuntime = window.__hw && window.__hw.dll;

    const interval = setInterval(() => {
      if (done) return;
      if (!dllRuntime) return;
      const aimbotOn = dllRuntime.cheats.find(c => c.label === "Aimbot" && c.enabled);
      const triggerOn = dllRuntime.cheats.find(c => c.label === "Trigger Bot" && c.enabled);
      if (aimbotOn && triggerOn && target.killCount >= 4) {
        done = true;
        complete("Aimbot landed all 4. Same algorithm as every commercial bone-snap aimbot: closest enemy → freeze crosshair → auto-fire.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
