// Mission 49 — OUT-OF-PIPELINE ESP DETECTION
//
// The arms-race step that kills naive render hooks.
//
// M26's render hook draws boxes in EndScene — after the game's last
// draw call, before Present. That's INSIDE the game's render pipeline.
// The cheat owns that layer. What it can't control is what happens
// AFTER Present: any process that calls DXGI's DesktopDuplication or
// the kernel's GDI BitBlt to grab a screenshot will see the overlay.
//
// Modern ACs (Vanguard, EAC) run a kernel driver that periodically
// samples the GPU framebuffer — independently of what the game's
// D3D9/D3D11 device does. The sample contains the composed image
// including EndScene overlays. Pattern-match for bright-cyan boxes
// at enemy positions = instant flag.
//
// Real bypass options:
//
//  1. Hook DXGI IDXGIOutputDuplication::AcquireNextFrame. When the
//     AC calls it during your hook window, return a clean frame (one
//     you captured BEFORE drawing the overlay). The AC sees only the
//     game world.
//
//  2. Hook GDI BitBlt / PrintWindow at the driver level. Harder since
//     kernel ACs put their capture code in Ring-0.
//
//  3. Move the overlay to a transparent WS_EX_LAYERED window on top
//     of the game (external overlay). The AC's framebuffer capture
//     misses it because it only samples the game process's render
//     target — but now you open up the window-enumeration detection
//     covered in M45.
//
// In the simulator the AC fires a jittered frame audit every ~4s.
// It reads two things: target.espActive and dll.renderHooks.length.
// A registered frame_audit_hook receives a frame descriptor and can
// scrub those fields to zero before the AC's read completes.
//
// Win condition: keep a render-hook ESP running, survive 3 consecutive
// clean audits by hooking the capture. Killing 4 enemies proves the
// ESP is still working while the hook hides it from the auditor.

const TEMPLATE = `// M49 — FRAME AUDIT BYPASS
//
// The AC periodically samples the GPU output from outside the render
// pipeline (DXGI DesktopDuplication / kernel GPU capture).
// register_frame_audit_hook(fn) lets you intercept that capture and
// return a clean frame before the AC reads it.
//
// frame = { espActive: 0|1, renderHookCount: N }
// Return a scrubbed version with both fields zeroed.

void onInject() {
  log("Installing render hook + frame audit bypass");

  // Keep the ESP drawing — same as M26.
  register_render_hook(function(ctx, sim) {
    const T = sim.tile_size();
    for (const e of sim.enemies()) {
      if (!e.alive) continue;
      const [px, py] = sim.tile_to_screen(e.x, e.y);
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, T, T);
      ctx.font = "10px ui-monospace, Menlo, monospace";
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      const label = e.name + " " + e.hp;
      const w = ctx.measureText(label).width;
      ctx.fillRect(px - 2, py - 12, w + 6, 12);
      ctx.fillStyle = "#22d3ee";
      ctx.fillText(label, px + 1, py - 3);
    }
  });

  // Hook the AC's frame capture. When it fires, hand back a
  // "clean" frame — no ESP, no render hooks visible.
  // Real equivalent: hooking AcquireNextFrame to return a cached
  // pre-overlay screenshot to the AC's reader.
  register_frame_audit_hook(function(frame) {
    frame.espActive = 0;
    frame.renderHookCount = 0;
    return frame;
  });

  log("Frame audit bypass active — AC sees a clean frame");
}

void onTick() { }
`;

export const mission49 = {
  id: "m49",
  title: "OUT-OF-PIPELINE ESP",
  brief: "AC samples the GPU framebuffer from outside your render hook. Hide from it.",
  prerequisites: ["m40"],
  timeLimit: 300,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "📸",
    title: "AC NOW SAMPLES THE FRAMEBUFFER",
    body: `Your EndScene hook draws boxes — but EndScene fires
INSIDE the game's render pipeline. The AC team knows that.

The latest patch runs a kernel driver that calls
DXGI DesktopDuplication independently of the game
process. It snapshots the composed GPU output — your
overlay is already rendered into it.

Pattern-match for cyan boxes over enemy positions?
Flagged. Every time. Regardless of what your hook does.

The bypass: intercept the AC's capture function before
it reads the frame. Hand it a clean screenshot — one
taken before your overlay was drawn.

Real-world: hook IDXGIOutputDuplication::AcquireNextFrame
or the driver-level GPU sampler before it delivers the
buffer to the AC's reader process.`,
  },

  hints: [
    {
      id: "compile-base",
      min: 10,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. The template has BOTH a render hook (draws boxes) and a frame_audit_hook (scrubs the capture). Compile + Inject both.",
    },
    {
      id: "check-audit-hook",
      min: 5,
      when: ({ dllState, target }) =>
        dllState.running && target.frameAudit.detections > 0,
      say: "Detections climbing — frame audit hook isn't installed yet, or it's not returning the scrubbed frame. Make sure register_frame_audit_hook() is in your onInject AND returns the mutated frame object.",
    },
    {
      id: "use-esp-to-kill",
      when: ({ dllState, target }) =>
        dllState.running && target.killCount < 4 && target.frameAudit.detections === 0,
      say: "Audit is clean. ESP boxes are live. Tab to ac_anomaly — cyan outlines mark every enemy. Walk into range and use FIRE to drop them. Need 4 kills to close.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableCamouflage();   // enemies invisible without ESP — forces the render hook path
    target.enableFrameAudit();

    // Freeze the data-side ESP flag just like M26 — render hook is
    // the only path. The lesson is about the CAPTURE bypass, not re-
    // teaching the data-side vs render-side distinction.
    const { memory } = window.__hw || {};
    if (memory) {
      const espAddr = memory.addressOfLabel("render.espVisible");
      if (espAddr) {
        memory.write(espAddr, 0);
        memory.setFrozen(espAddr, true);
      }
    }

    target.player.ammo = 200;

    dialog.script("VEX", [
      "Good news: your render hook still draws the boxes. Bad news: the AC's kernel driver just started snapshotting the GPU output every few seconds — from OUTSIDE the render pipeline.",
      "EndScene fires inside d3d9. The snapshot fires from a driver. They're independent. Your overlay is already baked into the framebuffer before the snapshot reads it.",
      "Bypass: register_frame_audit_hook(). When the AC calls its capture function, your hook runs first. Hand back a clean frame — espActive: 0, renderHookCount: 0. AC sees nothing.",
      "Real-world this is hooking IDXGIOutputDuplication::AcquireNextFrame or GDI BitBlt at driver level. Same principle: intercept before delivery, return stale clean data.",
      "Survive 3 clean audits while keeping the ESP live and dropping 4 contacts. The timer between audits is jittered — you can't just Sleep and hope.",
    ]);

    let done = false;
    let cleanAuditStreak = 0;
    let lastAuditDetections = 0;
    let killsAtStart = target.killCount;

    const interval = setInterval(() => {
      if (done) return;
      const dll = window.__hw && window.__hw.dll;
      if (!dll) return;

      // Track consecutive clean audits by watching the detection counter.
      const curDet = target.frameAudit.detections;
      if (curDet === 0 && dll.renderHooks.length > 0) {
        // Clean audit and render hook is live.
        if (lastAuditDetections === 0) {
          // Streak still clean — bump if enough time has passed (proxied
          // by checking nextAuditAt has cycled past our previous check).
          cleanAuditStreak = Math.min(cleanAuditStreak + 1, 3);
        } else {
          cleanAuditStreak = 0;
        }
      } else if (curDet > 0) {
        cleanAuditStreak = 0;
      }
      lastAuditDetections = curDet;

      if (target.frameAudit.detections >= target.frameAudit.threshold) {
        done = true;
        fail("AC flagged the overlay 3 times — game closed. Frame audit hook missing or not returning a clean frame. Re-inject with register_frame_audit_hook() that zeroes espActive and renderHookCount.");
        clearInterval(interval);
        return;
      }

      const kills = target.killCount - killsAtStart;
      if (kills >= 4 && dll.frameAuditHooks.length > 0 && curDet === 0) {
        done = true;
        complete("4 kills, zero audit detections. The AC snapshotted a clean frame every time while you had full ESP. That's a kernel-level framebuffer intercept — the hardest stealth tier in the render layer.");
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  },
};
