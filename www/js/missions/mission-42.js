// Mission 42 — TELEPORT
//
// The simplest gameplay cheat the curriculum was missing. M12
// SPEED HACK lets you walk fast. TELEPORT writes directly to the
// player's position cells (player.x / player.y) so you appear at
// any tile instantly. Used in MMOs, mobas, open-world games. Often
// the SAME cells M01 taught you to find — different abuse.
//
// Mission flow:
//   1. Player needs to reach a target tile far across the map.
//   2. Walking takes ~10 seconds at default speed.
//   3. Teleport: write_label("player.x", target_x); same for y.
//      Instantly there, in <1 second.

import { memory } from "../sim-memory.js";

const TARGET_TILE = { x: 18, y: 25 };

const TEMPLATE = `// M42 — TELEPORT
//
// player.x and player.y are just ints. Write to them, you're there.
// Same cells M01 KINETIC LOCK had you find and freeze — now we just
// WRITE, no freeze required.

void onInject() {
  log("teleporting to (` + TARGET_TILE.x + `, ` + TARGET_TILE.y + `)");
  write_label("player.x", ${TARGET_TILE.x});
  write_label("player.y", ${TARGET_TILE.y});
  log("done. should be at the destination tile.");
}

void onTick() { }
`;

export const mission42 = {
  id: "m42",
  title: "TELEPORT",
  brief: `Write straight to player.x/y. Land on (${TARGET_TILE.x}, ${TARGET_TILE.y}) instantly.`,
  prerequisites: ["m41"],
  timeLimit: 180,
  dll: true,
  dllTemplate: TEMPLATE,

  hints: [
    {
      id: "compile-and-inject",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: `Read the template — two write_label calls. Compile + Inject. Player jumps to (${TARGET_TILE.x}, ${TARGET_TILE.y}) the moment the DLL loads.`,
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();
    target.enableESP();

    dialog.script("VEX", [
      `Simplest gameplay cheat we hadn't covered. Position cells (player.x/y) are just ints. Write directly = teleport. No freeze, no narrowing.`,
      `Target tile: (${TARGET_TILE.x}, ${TARGET_TILE.y}). Compile + Inject the template. Mission completes when you arrive.`,
      `In real games this is how 'fly to spawn' / 'teleport to objective' macros work. The cells are the same ones you scanned for in M01 — different verb (write, not freeze).`,
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      if (target.player.x === TARGET_TILE.x && target.player.y === TARGET_TILE.y) {
        done = true;
        complete(`Teleported to (${TARGET_TILE.x}, ${TARGET_TILE.y}). Position cells are write-targets, not just read-targets.`);
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
