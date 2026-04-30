// Mission 19 — RESPAWN LOOP
//
// Different angle on the M18 problem. The server still has authority
// over your HP — but the DEATH STATE is gated by a separate cell:
// player.alive (1 or 0). When the server kills you, it flips alive
// to 0 and starts a 3-second respawn timer. The client refuses to
// move/fire while alive == 0.
//
// The exploit: freeze player.alive at 1. The server can ZERO server
// HP all it wants — the kill code STILL runs each tick, but every
// time it sets alive=0, your freeze re-applies alive=1 on the next
// memory.tick. The death state never lasts more than a frame, the
// respawn timer never reaches zero, you never actually die.
//
// Real games: this trick (and the variants — freezing 'is_dead',
// freezing the respawn timer at 0, intercepting the death packet)
// is how 'godmode' continues to work in some multiplayer titles
// even when HP is server-authoritative. The check that decides
// 'should I show the death animation' is usually client-side.

import { memory } from "../sim-memory.js";

export const mission19 = {
  id: "m19",
  title: "RESPAWN LOOP",
  brief: "Server still owns HP — but the death state is yours. Lock the alive flag.",
  prerequisites: ["m18"],
  timeLimit: 240,

  hints: [
    {
      id: "feel-the-death",
      min: 8,
      when: ({ target }) => target.deaths === 0 && target.player.alive === 1,
      say: "Stand still. Hazards and bleed will hit. After 100 damage the server kills you, you respawn after 3 seconds. The DEAD overlay shows you're locked out — that's the alive flag flipping to 0.",
    },
    {
      id: "scan-alive",
      min: 6,
      when: ({ target, scannerState }) =>
        target.deaths >= 1 && scannerState.lastResults === null,
      say: "The alive cell is a 1 most of the time, briefly 0 during death. Scan for 1 (loads of cells). Wait for next death — alive flips to 0. Filter 'changed'. After respawn it's 1 again — filter 'changed' once more. A few cycles narrows it.",
    },
    {
      id: "freeze-alive",
      min: 4,
      when: ({ scannerState, target }) =>
        scannerState.lastResults && scannerState.lastResults.length <= 8 &&
        !memory.isFrozen(memory.addressOfLabel("player.alive")),
      say: "Few candidates. '+ watch' them, edit each to 1 if it's not already, and freeze. The right cell is the one where the DEAD overlay never appears even when server HP zeroes out.",
    },
    {
      id: "survive-locked",
      when: ({ target }) =>
        memory.isFrozen(memory.addressOfLabel("player.alive")) &&
        target.deaths >= 1,
      say: "Alive locked. Server can keep zeroing HP, but the death state never sticks. Hold 30s no new deaths and we're done.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableHazards();
    target.enableBleed(2, 1100);
    target.enableServerAuthority(100);
    target.enableESP();

    const startDeaths = target.deaths;
    let deathsAtFreeze = -1;
    let frozenSinceMs = 0;

    dialog.script("VEX", [
      "Same multiplayer setup. Server owns HP. But there's a layer above the kill code worth knowing.",
      "When the server says 'dead,' your client doesn't just blink off. It flips a flag — player.alive — to 0, plays a respawn timer, then resets you. THAT flag is client-side.",
      "Find it. Scan for 1, wait for a death (alive briefly = 0), filter 'changed'. Repeat across 2-3 deaths to narrow. Freeze the survivor at 1.",
      "With alive locked at 1, the server can zero your HP all day — the death state never lasts more than a frame. You stop dying.",
      "Hold 30 seconds with the freeze active and no new deaths. This is how godmode keeps working in some multiplayer games where HP is server-side.",
    ]);

    let done = false;
    const aliveAddr = memory.addressOfLabel("player.alive");

    const interval = setInterval(() => {
      if (done) return;
      const isFrozen = memory.isFrozen(aliveAddr);
      if (isFrozen && deathsAtFreeze < 0) {
        deathsAtFreeze = target.deaths;
        frozenSinceMs = performance.now();
      } else if (!isFrozen) {
        deathsAtFreeze = -1;
        frozenSinceMs = 0;
      }
      // If they die AFTER freezing the freeze didn't work — restart count.
      if (deathsAtFreeze >= 0 && target.deaths > deathsAtFreeze) {
        deathsAtFreeze = target.deaths;
        frozenSinceMs = performance.now();
      }
      if (frozenSinceMs > 0 && performance.now() - frozenSinceMs >= 30000) {
        done = true;
        complete("Alive flag locked, server kills bounce off. Death-state desync — works in real multiplayer too.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
