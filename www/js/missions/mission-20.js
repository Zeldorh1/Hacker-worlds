// Mission 20 — NO TELEPORT
//
// Different angle on the M19 trick. Server-authoritative HP is in
// play (M18) and the alive flag IS allowed to flip — let the death
// register on the kill feed if it wants. The pain in real shooters
// isn't the death itself; it's getting teleported back to spawn.
// You lose your map position, your line of sight, your ground.
//
// The exploit: the engine reads two cells (respawn.x, respawn.y) to
// decide WHERE to teleport you on respawn. Default is SPAWN. Edit
// those cells to your CURRENT position before you die. When the
// respawn fires, the teleport sends you to where you already are.
// Net result: brief death animation, then you're standing on the
// same tile holding the same angle. Server thinks you respawned at
// base, you're still mid-firefight.
//
// Real games: works on any title where the spawn position is read
// from a writable struct cell. Defeated by server-side spawn
// validation ('did the client really teleport to a known spawn
// point?'), but lots of games skip that check.

import { memory } from "../sim-memory.js";

export const mission20 = {
  id: "m20",
  title: "NO TELEPORT",
  brief: "Let the death register. Just don't get sent back to base.",
  prerequisites: ["m19"],
  timeLimit: 240,

  hints: [
    {
      id: "die-once",
      min: 6,
      when: ({ target }) => target.deaths === 0,
      say: "Walk into the map a bit. Stand on a hazard or wait for bleed. After server kills you, you'll respawn back at the start tile (5, 5). That's the teleport we're going to defeat.",
    },
    {
      id: "find-respawn-cells",
      min: 6,
      when: ({ target, scannerState }) =>
        target.deaths >= 1 && scannerState.lastResults === null,
      say: "Two cells matter: respawn.x and respawn.y. Both currently 5 (the spawn tile). Scan for 5 — there'll be many matches. Walk away from spawn so your POS becomes something not-5, then filter 'unchanged'. Repeat. The respawn cells stay at 5 the whole time.",
    },
    {
      id: "edit-respawn",
      min: 4,
      when: ({ scannerState, watchSize, target }) =>
        scannerState.lastResults && scannerState.lastResults.length <= 8 &&
        target.respawnPoint.x === 5,
      say: "Few candidates. '+ watch' two of them. Edit each to a number that matches your current POS. Only the right pair changes the SPAWN coords (look at where you respawn — if you stay put, you found them).",
    },
    {
      id: "lock-and-die",
      when: ({ target }) =>
        (target.respawnPoint.x !== 5 || target.respawnPoint.y !== 5),
      say: "Respawn cells edited. Freeze them so they don't reset. Now walk back into the hazard — you should respawn IN PLACE instead of teleporting to the start tile.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableHazards();
    target.enableBleed(2, 1100);
    target.enableServerAuthority(100);
    target.enableESP();

    dialog.script("VEX", [
      "M19 stopped you dying. M20 is for when you let the death happen anyway — you just don't want the respawn punishment.",
      "Real shooters: you die, kill feed updates, but they teleport you to spawn. Loses your position, your angle, your loot.",
      "There are TWO cells the engine reads to pick the respawn destination: respawn.x and respawn.y. Default 5 / 5 (this map's spawn tile).",
      "Walk away from spawn. Trigger a death (hazard or bleed). You'll respawn back at 5,5. THAT teleport is what we kill.",
      "Find the respawn cells. Edit them to your current POS values. Freeze. Next death: you respawn exactly where you stood.",
    ]);

    let done = false;
    let respawnsAtCurrentPos = 0;
    let lastDeaths = target.deaths;

    const interval = setInterval(() => {
      if (done) return;
      // Track deaths. After each new death, check if respawn position
      // matches the player's pre-death position (i.e., not SPAWN).
      if (target.deaths > lastDeaths) {
        lastDeaths = target.deaths;
        // After respawn, player.x/y are set from respawnPoint cells.
        // If those are non-default, the exploit landed.
        if (target.respawnPoint.x !== 5 || target.respawnPoint.y !== 5) {
          respawnsAtCurrentPos++;
        }
      }
      // Win after 2 'no-teleport' respawns — proves the freeze stuck.
      if (respawnsAtCurrentPos >= 2) {
        done = true;
        complete("Two deaths, two no-teleport respawns. You traded the death animation for keeping your ground.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
