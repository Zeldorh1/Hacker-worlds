// Mission 40 — SPECTATOR AWARENESS
//
// OPSEC mission. Server periodically broadcasts spectator events
// via the recv channel: 'spectator_joined' (admin started watching
// you), then 'spectator_left' some seconds later. While the
// spectator's watching, your visual cheats (render hooks, ESP
// boxes) should auto-disable so they don't see anything weird.
//
// Real-world equivalent: every commercial cheat ships this. When
// an admin spectates, the cheat goes invisible to render — no ESP
// drawn, no menu, no aim-snap visible to the spectator's POV.
// Your gameplay still benefits from data cheats (HP / ammo locks
// in memory) but anything DRAWN is hidden.
//
// Mission flow:
//   1. Sim periodically toggles 'watching' state every 8s.
//   2. Player's DLL recv-hook detects spectator_joined / left.
//   3. While watching, render hook does nothing (return early).
//   4. Survive a full spectate cycle (8s+ watching) without
//      any frames drawn during the watch window.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M40 — SPECTATOR AWARENESS
//
// Detect spectator_joined / spectator_left packets. While watched,
// skip the render hook so no ESP draws to the spectator's view.

let beingWatched = false;

void onInject() {
  log("spectator-aware DLL loaded — visual cheats auto-hide when watched");

  register_packet_hook("recv", function(pkt) {
    if (pkt.type === "spectator_joined") {
      beingWatched = true;
      log("[OPSEC] spectator joined — disabling visuals");
    } else if (pkt.type === "spectator_left") {
      beingWatched = false;
      log("[OPSEC] spectator left — visuals re-enabled");
    }
    return pkt;
  });

  register_render_hook(function(ctx, sim) {
    if (beingWatched) return;   // OPSEC: don't draw while watched

    // Otherwise, draw ESP as normal.
    const T = sim.tile_size();
    for (const e of sim.enemies()) {
      if (!e.alive) continue;
      const [px, py] = sim.tile_to_screen(e.x, e.y);
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, T, T);
    }
  });
}

void onTick() { }
`;

export const mission40 = {
  id: "m40",
  title: "SPECTATOR AWARENESS",
  brief: "Detect spectators. Auto-hide visual cheats while they're watching.",
  prerequisites: ["m39"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  network: true,

  hints: [
    {
      id: "compile-and-wait",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Compile + Inject. The spectator system toggles every 8s. Watch the DLL console — '[OPSEC]' messages fire on each transition. Render hook draws ONLY when not watched.",
    },
    {
      id: "watch-cycles",
      min: 12,
      when: ({ target }) =>
        target.network.spectator.watching === false &&
        target.network.spectator.nextToggleAt - performance.now() > 4000,
      say: "Spectator's idle right now. Wait for the next 'spectator_joined' — render hook will go silent. Then 'spectator_left' brings it back.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableESP();
    target.enableNetwork();
    target.enableSpectator();

    dialog.script("VEX", [
      "OPSEC mission. Admins/spectators on competitive servers can join your view to watch for cheats. If your ESP boxes are drawn while they're watching, you're caught.",
      "Real cheats auto-detect spectator events and disable visual rendering for the duration. Memory cheats stay on (they can't see those); only DRAWN stuff hides.",
      "Template hooks recv for 'spectator_joined' / 'spectator_left' packets, flips a flag. Render hook checks the flag, returns early when watched.",
      "Sim toggles spectator state every 8s. Survive a full cycle: watched (no draws) → unwatched (draws resume). Win = at least one full toggle observed AND visuals stayed clean during the watch window.",
    ]);

    let done = false;
    let watchedCycles = 0;
    let inWatchCycle = false;

    const interval = setInterval(() => {
      if (done) return;
      const watching = target.network.spectator.watching;
      if (watching && !inWatchCycle) {
        inWatchCycle = true;   // entered a watch window
      }
      if (!watching && inWatchCycle) {
        watchedCycles++;
        inWatchCycle = false;
      }
      if (watchedCycles >= 1) {
        done = true;
        complete("Survived a full spectator cycle with visuals auto-disabled. OPSEC pattern shipping in every competitive cheat.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
