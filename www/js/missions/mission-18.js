// Mission 18 — SERVER AUTHORITY
//
// The bridge into multiplayer thinking. M15 GODMODE worked because
// it was single-player — your local memory IS the truth. In a
// multiplayer game the SERVER keeps its own copy of your HP and
// reconciles it on a tick. Freezing the local cell becomes purely
// cosmetic; the server still ticks down its number every ~1.5s,
// hits zero, and 'kills' you regardless of your local freeze.
//
// The fix: find the cell that holds the SERVER's authoritative HP
// (in real games, this would be in a network packet buffer or
// state-replication struct) and freeze THAT.
//
// Workflow taught:
//   1. Player tries M2 strategy: scan HP, freeze player.hp at 100.
//   2. Bleed continues, server tick still runs, player dies anyway.
//      (HUD shows HP=100 frozen, but SRV·HP is dropping.)
//   3. Player notices the SRV·HP line. New cell to find.
//   4. Scan for the server HP value (visible on HUD), narrow with
//      'decreased' over a few server ticks. Watch + freeze.
//   5. Survive 30s with the server cell frozen.

import { memory } from "../sim-memory.js";

export const mission18 = {
  id: "m18",
  title: "SERVER AUTHORITY",
  brief: "Local HP freeze is cosmetic now. Find the cell the server actually checks.",
  prerequisites: ["m17"],
  timeLimit: 240,

  hints: [
    {
      id: "see-the-srv-line",
      min: 8,
      when: ({ target }) => target.deaths === 0 &&
                             !memory.isFrozen(memory.addressOfLabel("server.canonicalHp")),
      say: "Check your HUD: there's a new SRV·HP line. That's the server's copy of your health. Even with player.hp frozen at 100, the SRV·HP number is what the game actually checks before respawning you.",
    },
    {
      id: "scan-server-hp",
      min: 4,
      when: ({ scannerState, target }) =>
        scannerState.lastResults === null &&
        !memory.isFrozen(memory.addressOfLabel("server.canonicalHp")),
      say: "Scan its current value (read it off the SRV·HP line). Wait ~2 seconds — it'll tick down by a few. Filter 'decreased' and Next Scan. Repeat once or twice.",
    },
    {
      id: "freeze-server-hp",
      min: 3,
      when: ({ watchSize, target }) =>
        watchSize > 0 &&
        !memory.isFrozen(memory.addressOfLabel("server.canonicalHp")),
      say: "Got candidates? '+ watch' the most recently-decreased one. Freeze it. The SRV·HP value should lock — that's the authoritative cell.",
    },
    {
      id: "survive",
      when: ({ target }) =>
        memory.isFrozen(memory.addressOfLabel("server.canonicalHp")) &&
        target.deaths === 0,
      say: "Server cell locked. Hold position 30 seconds — bleed and hazards can fire all they want, server says you're fine.",
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
    const enteredAt = performance.now();
    let frozenAt = 0;

    dialog.script("VEX", [
      "Different rules. We're 'online' for this one — there's a server keeping its own copy of your HP.",
      "Freeze your local player.hp like in M2 — go ahead, try it. It'll show 100 forever. You'll still die.",
      "Why: every 1.5s the server reconciles damage events and ticks down its own HP. When server's number hits 0, it 'kills' you — respawn, deaths++, regardless of your local freeze. Watch the SRV·HP line in the HUD.",
      "Find the server cell. Scan its current value, narrow with 'decreased' over a couple of server ticks, watch and freeze. That's the one that matters.",
      "Survive 30 seconds with the server cell frozen. The hazards can do whatever they want.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      const isFrozen = memory.isFrozen(memory.addressOfLabel("server.canonicalHp"));
      if (isFrozen && frozenAt === 0) frozenAt = performance.now();
      if (!isFrozen) frozenAt = 0;
      // Three-strike fail — too many deaths means they didn't get
      // the lesson; let the contract burn.
      if (target.deaths - startDeaths >= 4) {
        done = true;
        clearInterval(interval);
        fail("respawned by server too many times · find server.canonicalHp");
        return;
      }
      if (frozenAt > 0 && performance.now() - frozenAt >= 30000) {
        done = true;
        complete("Server cell locked, respawn timer never fires. That's how you survive multiplayer.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
