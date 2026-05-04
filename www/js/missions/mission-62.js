// Mission 62 — SMOOTH AIMBOT (lerp + humanize)
//
// M61 went straight to the head. Snap aimbots are FAST but they
// trip behavioral detectors (M33) — humans don't snap-rotate at
// 0ms reaction time. The cheat that wins long-term is the SMOOTH
// aimbot: same target selection, but the aim moves toward the
// target over multiple frames at a configurable lerp factor.
//
// Real cheat config:
//
//   smoothness: 0.0   // 0.0 = instant snap (sus)
//                     // 0.5 = moderate, looks player-like
//                     // 0.9 = very slow, suspicious in different way
//
//   per_frame_aim = lerp(current_aim, target_aim, 1.0 - smoothness)
//
// Tradeoffs:
//   - Lower smoothness (0.0-0.2): kills faster, easier to detect
//   - Higher smoothness (0.5-0.7): kills slower, defeats behavioral
//     analysis, looks like a player with good but not perfect aim
//   - Too high (0.9+): kills too slow to be useful, ALSO suspicious
//     because real players don't move that smoothly
//
// In our simulator: M33 behavioral detector tracks crosshair-target
// switches. Snap aimbots that retarget instantly trip violations.
// Smooth aimbots that take N frames to retarget look like player
// reaction time and pass the check.
//
// Mission flow:
//   1. M33 behavioral detector active. M61-style instant aimbot
//      would trip it (5+ target switches in 1.5s window).
//   2. Player configures smooth aimbot with lerp factor that takes
//      ~3-4 frames to fully retarget = about 50ms = plausibly human.
//   3. Targets get acquired, killed, but slowly enough that the
//      behavioral analyzer sees realistic reaction times.
//   4. Win: 4 kills, behavioral.violations === 0.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M62 — Smooth aimbot (lerp + humanize).
//
// Engine call sets the smoothness factor. Higher = slower retarget
// = more human-looking = bypasses behavioral detector.

const SMOOTHNESS = 0.65;   // 0.0 = snap, 1.0 = never reaches target

void onInject() {
  log("Smooth aimbot engaged with smoothness=" + SMOOTHNESS);

  call_engine_function("set_aim_smoothness", SMOOTHNESS);

  // Auto-fire continuously. The smooth aimbot retargets gradually,
  // so each kill takes ~50-80ms instead of 0ms. Looks like a
  // skilled human.
  register_cheat("Smooth Auto-Aim", function() {
    write_label("weapon.cooldownMs", 100);
  });
}

void onTick() {
  call_engine_function("smooth_fire");
}
`;

export const mission62 = {
  id: "m62",
  title: "SMOOTH AIMBOT",
  brief: "Snap aimbots trip the behavioral detector. Lerp-to-target = human-looking = no violations.",
  prerequisites: ["m61", "m33"],
  timeLimit: 240,
  dll: true,
  cheatMenu: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "📈",
    title: "SMOOTH BEATS SNAP",
    body: `M61 snap-aimbots get hits but trip M33 behavioral
detection. Humans don't retarget at 0ms — they
average ~200ms reaction time with variance.

The fix: lerp toward target instead of snap.

  per_frame_aim = lerp(current, target, 1 - smoothness)

  smoothness 0.0  → instant snap (M33 trips)
  smoothness 0.5  → ~30ms retarget (passes)
  smoothness 0.7  → ~70ms retarget (looks human)
  smoothness 0.9  → 200ms+ retarget (too slow)

Sweet spot: 0.5-0.7. Fast enough to dominate; slow
enough to look plausible.

Same primitive every modern competitive cheat ships
as anti-detection. M33 + M62 is exactly the cat-and-
mouse of modern aim-detection.

Mission: smooth aimbot kills 4 enemies with M33
violation count locked at 0.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template configures smoothness=0.65 — sweet spot between speed and stealth. Compile + Inject.",
    },
    {
      id: "wait-for-kills",
      when: ({ target, dllState }) =>
        dllState.running && target.killCount < 4 && target.behavioral.violations === 0,
      say: "Smooth aimbot is firing. Each kill takes ~80ms — slower than snap but still way faster than human aim. Watch the behavioral detector — violations should stay at 0.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableBehavioralDetector();   // M33 watching
    target.player.ammo = 200;
    target._m62StartKills = target.killCount;

    // Engine API: set_aim_smoothness + smooth_fire
    target.engine.set_aim_smoothness = (s) => {
      target.weapon.aimSmoothness = Math.max(0, Math.min(0.99, s));
      target.weapon.smoothFireBuffer = 0;
      return { ok: true };
    };
    target.engine.smooth_fire = () => {
      const e = target.enemyManager.enemies.find(x => x.alive);
      if (!e) return { ok: false };
      // Smooth retarget: each call advances buffer toward 1.0 by (1-smoothness).
      // When buffer >= 1, fire and reset.
      const advance = 1.0 - (target.weapon.aimSmoothness || 0);
      target.weapon.smoothFireBuffer = (target.weapon.smoothFireBuffer || 0) + advance;
      // Note: don't update crosshairTargetId every tick — that would still
      // trigger M33's switch counter. Update only when actually firing.
      if (target.weapon.smoothFireBuffer < 1) return { ok: false, reason: "still aiming" };
      target.weapon.smoothFireBuffer = 0;
      // Now fire
      const oldCrosshair = target.crosshairTargetId;
      target.crosshairTargetId = e.id;   // single switch, then fire
      const dmg = (target.weapon.damage * 4) | 0;   // head zone for headshot kills
      e.hp = Math.max(0, e.hp - dmg);
      target.shotsFired++;
      if (e.hp <= 0) {
        e.alive = 0;
        target.killCount++;
      }
      return { ok: true };
    };

    dialog.script("VEX", [
      "Behavioral detector is hot (M33). It watches crosshair-target switches over time. Snap aimbots retarget instantly = many switches per second = trips violations.",
      "Smooth aimbot: lerp toward target. Each retarget takes multiple frames. The detector sees switches at human-plausible intervals (50-200ms) — no violations.",
      "Template sets smoothness=0.65. ~80ms retarget, looks like a player with good but not impossible aim. Auto-fire keeps the cycle going.",
      "Win: 4 kills with behavioral.violations === 0. Real-world this is the tuning every modern competitive cheat exposes — players slide the smoothness knob until they look 'good but not aimbot' on demos.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      const kills = target.killCount - target._m62StartKills;
      if (kills >= 4 && target.behavioral.violations === 0) {
        done = true;
        complete("4 kills, M33 violations locked at 0. Smooth aimbot defeated the behavioral analyzer by retargeting at human-plausible intervals. Same primitive every modern competitive cheat ships as anti-detection.");
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  },
};
