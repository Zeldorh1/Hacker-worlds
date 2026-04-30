// Mission 26 — RENDER HOOK
//
// The DLL-side ESP. M13 taught the data-flag flip (write 1 to
// render.espVisible). That works when the game trusts its own
// config; not when a watchdog forces the flag back to 0 every
// frame. Then you have to bypass the WHOLE render pipeline:
// install your own draw code that runs after the game finishes
// its frame, drawing whatever the player's renderer refused to.
//
// Real-world equivalent: hook IDirect3DDevice9::EndScene with
// MinHook. Your hook gets called every frame just before the
// device presents the back buffer. Inside it you can:
//
//   - Iterate the entity list, project each enemy's world position
//     to screen coords with D3DXVec3Project.
//   - Draw boxes / lines / text over the game's frame using
//     D3DXCreateFontA, ID3DXLine, custom vertex buffers, etc.
//
// In the simulator: register_render_hook(fn) installs a callback.
// fn(ctx, sim) runs after AssaultZone._draw(). ctx is the canvas
// 2D context (full pixel access). sim provides enemies(), player(),
// tile_size(), tile_to_screen(x, y) — abstracts the world-to-screen
// math the same way D3DXVec3Project does in C++.
//
// Mission setup:
//   - Camouflage on (M13 setup): enemies render near-invisible.
//   - render.espVisible cell frozen at 0 by simulated 'anti-cheat':
//     the M13 trick of writing 1 doesn't work — freeze re-applies
//     0 every tick.
//   - Player must install a render hook to draw boxes around
//     enemies, then drop all 4 contacts.
//
// The lesson: when data-side hacks get blocked, render-side hacks
// win because they don't touch the cell the watchdog watches.

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M26 — RENDER HOOK (the EndScene equivalent)
//
// register_render_hook(fn) installs a callback. fn(ctx, sim) runs
// every frame AFTER the game finishes drawing. ctx is the canvas
// 2D context. sim has:
//   sim.enemies()           -> array of {id, name, x, y, hp, alive}
//   sim.player()            -> {x, y, hp}
//   sim.tile_size()         -> pixel size of one map tile
//   sim.tile_to_screen(x,y) -> [px, py] (world → screen)

void onInject() {
  log("Render hook installed — drawing ESP outside the game pipeline");

  register_render_hook(function(ctx, sim) {
    const T = sim.tile_size();
    for (const e of sim.enemies()) {
      if (!e.alive) continue;
      const [px, py] = sim.tile_to_screen(e.x, e.y);

      // Box around the enemy — bright cyan, 2px stroke.
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, T, T);

      // Name + HP label above.
      ctx.font = "10px ui-monospace, Menlo, monospace";
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      const label = e.name + " " + e.hp;
      const w = ctx.measureText(label).width;
      ctx.fillRect(px - 2, py - 12, w + 6, 12);
      ctx.fillStyle = "#22d3ee";
      ctx.fillText(label, px + 1, py - 3);
    }
  });
}

void onTick() { }
`;

export const mission26 = {
  id: "m26",
  title: "RENDER HOOK",
  brief: "Anti-cheat froze the ESP flag at 0. Hook the renderer instead.",
  prerequisites: ["m25"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,

  hints: [
    {
      id: "see-the-block",
      min: 8,
      when: ({ target, dllState }) =>
        !dllState.running && target.killCount === 0,
      say: "M13 trick (write 1 to render.espVisible) won't work here — try it. The flag flips back to 0 instantly because the watchdog has it frozen. You can't use the data side. Open the DLL tab.",
    },
    {
      id: "compile-and-inject",
      min: 4,
      when: ({ dllState }) => !dllState.running,
      say: "Template registers a render hook that draws cyan boxes around alive enemies. Compile + Inject. Tab back to ac_anomaly — boxes appear over enemies even though they're camouflaged.",
    },
    {
      id: "use-the-esp",
      when: ({ dllState, target }) =>
        dllState.running && target.killCount < 4,
      say: "Render hook is live — boxes mark every enemy. Walk into range, FIRE button drops them. All four contacts to close.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableCamouflage();   // enemies near-invisible without ESP

    // Simulate anti-cheat: hold the ESP flag at 0. NOT just a freeze
    // (a freeze can be overridden by writing to the cell). A watchdog
    // re-stamps 0 every 100ms — faster than the player can type.
    // M13's data-side attack is permanently blocked; the only path
    // through is the render-hook approach.
    const espAddr = memory.addressOfLabel("render.espVisible");
    const espWatchdog = setInterval(() => {
      memory.write(espAddr, 0);
      memory.setFrozen(espAddr, true);
    }, 100);

    target.player.ammo = 200;

    dialog.script("VEX", [
      "Anti-cheat thread spotted M13's render-flag flip and locked it. The cell is frozen at 0 — try writing 1, watch it bounce back instantly.",
      "Data-side ESP is dead here. Code-side wins: install a render hook that draws boxes from OUTSIDE the game's render pipeline. The game's renderer can't tell.",
      "DLL template's pre-loaded with register_render_hook(). Compile + Inject. Cyan boxes appear over enemies even with camouflage on.",
      "Drop the four contacts. Real-world: this is a MinHook detour on IDirect3DDevice9::EndScene. Same hack tier as every commercial wallhack.",
    ]);

    let done = false;
    const dllRuntime = window.__hw && window.__hw.dll;

    const interval = setInterval(() => {
      if (done) return;
      if (!dllRuntime) return;
      // Win: render hook installed AND the espVisible cell still 0
      // (proving they didn't bypass the watchdog — they used the
      // render hook instead) AND 4 kills.
      if (dllRuntime.renderHooks.length > 0 &&
          memory.read(espAddr) === 0 &&
          target.killCount >= 4) {
        done = true;
        complete("Render hook drew the ESP, espVisible never stuck at 1. EndScene-class wallhack — works against any flag the engine pinned down.");
        clearInterval(interval);
        clearInterval(espWatchdog);
      }
    }, 250);

    return () => { clearInterval(interval); clearInterval(espWatchdog); };
  },
};
