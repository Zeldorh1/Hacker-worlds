// Mission 33 — BEHAVIORAL DETECTION (humanizing the aimbot)
//
// Conceptual modern-AC mission #2. The simulator now has a
// behavioral detector that watches crosshair-target switches.
// Bots flip targets every frame (no reaction delay). Humans
// take ~200ms minimum to react and switch. The detector counts
// switches in a 1.5s sliding window; >5 = inhuman, violation++.
//
// Your M28 aimbot writes crosshair.target every frame, so as the
// closest enemy changes (you're moving, they're moving), it flips
// constantly. That's exactly the pattern the detector catches.
//
// Solution: humanization. Don't update crosshair.target every
// frame. Update on a reaction-delay timer (random 180-260ms),
// and add small jitter to which enemy you pick (don't always
// pick #1 closest — sometimes pick #2). The aimbot still works,
// it just looks human.
//
// Mission flow:
//   1. M28-style aimbot template — instant snap, every frame.
//   2. Inject — behavioral violations climb fast.
//   3. Player rewrites the aimbot to add reaction delay + jitter.
//   4. Re-inject. Violations stay below threshold while still
//      dropping 4 enemies.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M33 — BEHAVIORAL DETECTION
//
// The 'kernel scanner' from M32 just got smarter. It now watches
// HOW your crosshair moves, not just what your DLL says.
//
// This baseline aimbot snaps the crosshair to the closest enemy
// EVERY FRAME — that's bot-like. The detector will trip in seconds.
//
// Your job: humanize it. Two techniques:
//   1. Reaction delay: only update target every 180-260ms (random).
//   2. Jitter: occasionally pick the SECOND-closest enemy, not
//      always the closest.
//
// Both are exactly what real cheats ship to evade behavioral
// detection. Variability is what makes input look human.

let lastSwitchAt = 0;

void onInject() {
  log("aimbot loaded — humanize it or behavioral detector trips");

  register_cheat("Aim Helper", function() {
    const now = performance.now();

    // BASELINE (bot-like) — uncomment to fail on purpose:
    // const sim = window.__hw.target;
    // let bestId = 0, bestDist = Infinity;
    // for (const e of sim.enemyManager.enemies) {
    //   if (!e.alive) continue;
    //   const dx = e.x - sim.player.x, dy = e.y - sim.player.y;
    //   const d = dx*dx + dy*dy;
    //   if (d < bestDist) { bestDist = d; bestId = e.id; }
    // }
    // if (bestId > 0) write_label("crosshair.target", bestId);

    // HUMAN-LIKE — reaction delay + jitter:
    const reactionMs = 180 + Math.random() * 80;   // 180-260ms
    if (now - lastSwitchAt < reactionMs) return;
    lastSwitchAt = now;

    const sim = window.__hw.target;
    const alive = sim.enemyManager.enemies.filter(e => e.alive);
    if (alive.length === 0) return;
    // Sort by distance.
    alive.sort((a, b) => {
      const da = (a.x - sim.player.x) ** 2 + (a.y - sim.player.y) ** 2;
      const db = (b.x - sim.player.x) ** 2 + (b.y - sim.player.y) ** 2;
      return da - db;
    });
    // 70% pick closest, 30% pick second-closest. Adds jitter.
    const pick = (alive.length > 1 && Math.random() < 0.3) ? alive[1] : alive[0];
    write_label("crosshair.target", pick.id);
  });
}

void onTick() { }
`;

export const mission33 = {
  id: "m33",
  title: "BEHAVIORAL DETECTION",
  alert: {
    icon: "🎯",
    title: "AC NOW WATCHES YOUR INPUTS",
    body: `Patch 2.1:
> Anti-cheat now analyzes input PATTERNS instead of just
> bytes. Crosshair switches in <50ms = inhuman. Tracking
> through occlusion = inhuman. Perfect hit-rate over
> hours = statistically suspicious.

Your M28 aimbot snaps to a new target EVERY frame — that's
exactly what behavioral AC catches. Doesn't matter that
your DLL strings are obfuscated; the BEHAVIOR gives it away.

Fix: humanize. Reaction delay (180-260ms randomized).
Jitter (sometimes pick the second-closest enemy). Same
aim function, very different signal. AC sees normal-ish
input distributions instead of bot perfection.`,
  },
  brief: "Aimbot's too perfect. Add reaction delay + jitter to look human.",
  prerequisites: ["m32"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  cheatMenu: true,

  hints: [
    {
      id: "compile-as-is",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Read the template — it has both the BOT-LIKE comment and the HUMANIZED version. Compile + Inject as-is. Watch the violations counter (in target.behavioral.violations) — humanized version stays low.",
    },
    {
      id: "tick-cheat",
      when: ({ dllState, target }) =>
        dllState.running && target.killCount < 4,
      say: "Open ≡ CHEATS, tick 'Aim Helper'. Walk into range, fire. Aim Helper flips targets on a reaction delay (~200ms) instead of every frame. Detector stays calm.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableESP();
    target.enableBehavioralDetector();
    target.player.ammo = 200;

    dialog.script("VEX", [
      "Modern-AC concept #2. The kernel scanner now watches your INPUTS, not just your DLL strings. M28's aimbot snaps to a new target every frame — that's a perfect signal of bot input.",
      "The behavioral detector tracks crosshair switches in a sliding 1.5s window. >5 switches = inhuman. Each excess switch adds a violation. Cross 30 violations and the contract burns.",
      "Template ships with a HUMANIZED version: reaction delay (180-260ms randomized) + jitter (sometimes pick the second-closest enemy, not the closest). Same feature, very different signature.",
      "Compile + Inject. Tick Aim Helper in ≡ CHEATS. Drop 4 contacts while keeping behavioral.violations < 30. This is exactly what pro cheats ship to evade behavioral AC.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.behavioral.violations >= 30) {
        done = true;
        clearInterval(interval);
        fail("behavioral detector tripped · humanize the aimbot");
        return;
      }
      if (target.killCount >= 4 && target.behavioral.violations < 30) {
        done = true;
        complete("4 kills, behavioral stays calm. Reaction delay + jitter is the standard playbook for evading behavioral AC.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
