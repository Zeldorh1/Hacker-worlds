// Mission 55 — CHAMS + SKELETON ESP
//
// M26 taught the foundational render hook (cyan box around enemies).
// M55 introduces two ESP variants every commercial cheat ships:
//
//   - Chams: "color override" — draw the enemy as a flat bright
//     primitive, ignoring the enemy's actual material/texture. In
//     real D3D9 this is done by hooking IDirect3DDevice9::
//     DrawIndexedPrimitive, replacing the bound texture with a
//     1x1 magenta texture, AND disabling depth test so the chams
//     overlay shows through walls.
//   - Skeleton: line segments connecting bone joints. Used both
//     visually (HUD shape recognition) and as input to bone-aimbot
//     missions (M61, coming).
//
// In our top-down 2D simulator both reduce to canvas drawing
// inside the render hook:
//
//   ctx.fillStyle = "magenta";
//   ctx.fillRect(px, py, T, T);            // chams
//   ctx.strokeStyle = "#ff00ff";
//   ctx.beginPath();
//   ctx.moveTo(cx, py);
//   ctx.lineTo(cx, py + T);                // vertical bone
//   ctx.moveTo(px, cy);
//   ctx.lineTo(px + T, cy);                // horizontal bone
//   ctx.stroke();
//
// Why this is its own mission instead of a variant of M26:
// chams specifically teaches "replace the enemy's pixels" rather
// than "annotate around them". Skeleton teaches "the enemy has
// internal structure your render code can read." Both prepare
// for M61 BONE AIMBOT (head/chest/neck targeting) where you'll
// pick which "joint" to fire at.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M55 — CHAMS + SKELETON ESP
//
// Real D3D9 chams: hook DrawIndexedPrimitive, swap the bound
// texture for a magenta 1x1, set D3DRS_ZENABLE off so it shows
// through walls. Real skeleton ESP: walk the player's bone matrix
// array, project each joint to screen with D3DXVec3Project, draw
// lines between them.
//
// Sim equivalent: render hook draws magenta filled squares (chams)
// and crosshair-style joint markers (skeleton).

void onInject() {
  log("Installing chams + skeleton render hook");

  register_render_hook(function(ctx, sim) {
    const T = sim.tile_size();
    for (const e of sim.enemies()) {
      if (!e.alive) continue;
      const [px, py] = sim.tile_to_screen(e.x, e.y);
      const cx = px + T / 2, cy = py + T / 2;

      // CHAMS — flat magenta fill replaces the enemy's pixels.
      // Real D3D: 1x1 magenta texture + ZENABLE off.
      ctx.fillStyle = "magenta";
      ctx.fillRect(px, py, T, T);

      // SKELETON — single-bone marker. In a 3D engine you'd draw
      // head-neck-spine-pelvis lines. In 2D each enemy has effectively
      // one "joint" so we mark center + extremities with a cross.
      ctx.strokeStyle = "#ffff00";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, py);     ctx.lineTo(cx, py + T);
      ctx.moveTo(px, cy);     ctx.lineTo(px + T, cy);
      ctx.stroke();
    }
  });
}

void onTick() { }
`;

export const mission55 = {
  id: "m55",
  title: "CHAMS + SKELETON ESP",
  brief: "Replace enemy pixels with flat color (chams), overlay joint markers (skeleton).",
  prerequisites: ["m26"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "🟪",
    title: "CHAMS + SKELETON RENDER VARIANTS",
    body: `M26 drew cyan boxes AROUND enemies. M55 teaches
two variants you'll see in every commercial cheat:

  • CHAMS — flat color REPLACES the enemy's pixels.
    Real D3D9: hook DrawIndexedPrimitive, swap the
    bound texture for a 1x1 magenta texture, disable
    depth test so it draws through walls.

  • SKELETON — line segments at the enemy's bone
    joints. Real engines: walk the bone matrix array,
    D3DXVec3Project each joint to screen, draw the
    connecting lines.

Same hook point as M26, different drawing primitives.
Skeleton sets up M61 BONE AIMBOT — once you can SEE
each joint, you can pick which one to FIRE at.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template draws magenta filled squares (chams) + yellow cross markers (skeleton) on every alive enemy. Compile + Inject.",
    },
    {
      id: "kills",
      when: ({ target, dllState }) =>
        dllState.running && target.killCount < 4,
      say: "Hook is live — enemies are bright magenta. Walk into range, FIRE drops them. 4 kills closes.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableCamouflage();
    target.player.ammo = 200;
    target._m55StartKills = target.killCount;

    dialog.script("VEX", [
      "Camouflage on. Enemies are nearly invisible without ESP. M26's box ESP would work — M55 teaches the variants.",
      "Chams: REPLACE the enemy's pixels with flat magenta. In real D3D9 you hook DrawIndexedPrimitive and swap the bound texture. Skeleton: draw a cross at the joint locations. Real games walk the bone matrix; in our 2D sim each enemy has one center joint.",
      "Same hook point as M26. Different drawing primitives. The skeleton render is what M61 BONE AIMBOT will key off of — once you can SEE each joint, you can target one.",
      "4 kills with chams active to close.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      const dll = window.__hw && window.__hw.dll;
      if (!dll) return;
      const kills = target.killCount - target._m55StartKills;
      if (kills >= 4 && dll.renderHooks.length > 0) {
        done = true;
        complete("4 kills with chams + skeleton render. Same primitives every commercial cheat ships, mounted on the same hook point as M26.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
