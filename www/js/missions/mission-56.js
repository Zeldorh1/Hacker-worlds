// Mission 56 — WIREFRAME WALLS (D3D render-state manipulation)
//
// A different attack surface from EndScene render hooks. Render
// hooks DRAW EXTRA things; render-state changes alter HOW the
// game's existing draws are rasterized.
//
// Real D3D9:
//
//   pDevice->SetRenderState(D3DRS_FILLMODE, D3DFILL_WIREFRAME);
//
// One call. Every subsequent triangle is rasterized as line edges
// only — no fills. Walls become transparent visually because only
// their outlines are drawn. You see enemies behind them.
//
// Other classic render-state abuses on the same hook point:
//
//   D3DRS_ZENABLE      = FALSE   →  no depth test (chams through walls)
//   D3DRS_LIGHTING     = FALSE   →  flat shading (no shadows)
//   D3DRS_FILLMODE     = WIREFRAME →  wireframe walls (this mission)
//   D3DRS_ALPHABLENDENABLE = TRUE → translucent walls
//
// Cheat workflow: hook IDirect3DDevice9::DrawIndexedPrimitive. In
// the hook, before calling original DrawIndexedPrimitive, set the
// render state. After: restore.
//
// In our simulator, render state lives on the target as flags. The
// engine call set_render_state("wall_fill", false) flips
// target.wallFillEnabled, and the wall renderer skips its fill on
// the next frame. Outlines remain — same visual as D3D wireframe.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M56 — WIREFRAME WALLS via render-state
//
// Real D3D9:
//   pDevice->SetRenderState(D3DRS_FILLMODE, D3DFILL_WIREFRAME);
// One state flip and every subsequent wall triangle rasterizes as
// edges only. The simulator exposes set_render_state on the engine.

void onInject() {
  log("Flipping wall_fill render state to wireframe");

  const result = call_engine_function("set_render_state", "wall_fill", false);
  if (result && result.ok) {
    log("Wall fill disabled — only outlines render. See enemies through them.");
  }
}

void onTick() { }
`;

export const mission56 = {
  id: "m56",
  title: "WIREFRAME WALLS",
  brief: "One render-state flip and walls become outline-only. See enemies through them.",
  prerequisites: ["m55"],
  timeLimit: 180,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "▱",
    title: "RENDER-STATE MANIPULATION",
    body: `M55 drew NEW pixels through a render hook. M56
changes HOW the existing pixels are rasterized.

  pDevice->SetRenderState(
      D3DRS_FILLMODE, D3DFILL_WIREFRAME);

One call. Every triangle that draws after this fires
as line edges only — no fills. Walls visually
become outlines. You see enemies through them.

Other classics on the same hook:
  D3DRS_ZENABLE = FALSE  →  chams through walls
  D3DRS_LIGHTING = FALSE →  flat shading

The technique: hook DrawIndexedPrimitive (or any
state-using draw call). In the hook, flip the state
flag before the original runs. Restore after.

Different attack surface from EndScene render hooks.
Different detection vector too — render-state writes
are visible to GPU debug interception, but cheap.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template calls set_render_state('wall_fill', false). Compile + Inject — walls go wireframe instantly.",
    },
    {
      id: "kills",
      when: ({ target, dllState }) =>
        dllState.running && target.killCount < 3,
      say: "Wall fills disabled. Walk around the map — enemies behind walls are now visible at their actual locations. 3 kills to close.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.player.ammo = 200;
    target._m56StartKills = target.killCount;

    dialog.script("VEX", [
      "M55 drew new pixels through a render hook. M56 changes HOW EXISTING pixels are rasterized.",
      "set_render_state('wall_fill', false) flips one flag. Wall fills are skipped, only outlines remain. Visually you see through them.",
      "Real D3D9 equivalent: pDevice->SetRenderState(D3DRS_FILLMODE, D3DFILL_WIREFRAME). Cheats hook DrawIndexedPrimitive, flip the state, let the original draw run, restore. Different attack surface from M26 EndScene drawing — the hook point is on STATE not GEOMETRY.",
      "3 kills to close — enemies positioned where wall-fill made them invisible become trivial to spot.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      const kills = target.killCount - target._m56StartKills;
      if (kills >= 3 && target.wallFillEnabled === false) {
        done = true;
        complete("3 kills with walls in wireframe. One render-state write disabled wall opacity for the entire frame. Same trick that powers transparent-walls cheats in every D3D9 game.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
