// Mission 65 — GHOST MODE (object flag manipulation)
//
// Real Combat Arms cheat reference:
//
//   if (Variable.GhostMode) {
//       MemCopy((void*)ADR_CameraUpdate, "\xC3", 1);    // RET out
//       g_CommonLT->SetObjectFlags(
//           g_LTClient->GetPlayer(), OFT_Flags, 0, FLAG_SOLID);
//   } else {
//       g_CommonLT->SetObjectFlags(
//           g_LTClient->GetPlayer(), OFT_Flags, FLAG_SOLID, FLAG_SOLID);
//       MemCopy((void*)ADR_CameraUpdate, "\x83", 1);    // restore
//   }
//
// Two techniques in one feature:
//
//   1. The CAMERA UPDATE function gets RET-patched (M64 territory).
//      That stops the camera from auto-correcting when the player
//      walks into geometry.
//   2. The PLAYER OBJECT'S FLAG_SOLID bit gets cleared via the
//      engine's SetObjectFlags. The collision system asks "is this
//      object solid?" and gets 'no' — bullets and walls don't
//      collide with the player.
//
// The combination: walk through walls with no camera glitches AND
// take no damage from anything that hits you. Visually you're a ghost.
//
// In our simulator, this maps to:
//   - target.engine.set_object_flags(obj, mask, value)
//   - The "FLAG_SOLID" bit on the player object enables hazard
//     damage and enemy bullet hits.
//   - When cleared: hazard ticks skip you, enemy fire passes through,
//     and the wall-collision check (M43 territory) is bypassed.
//
// Mission flow:
//   1. Player is positioned in a hazard zone surrounded by enemies.
//      Hazards drain HP, enemies fire on them.
//   2. Without ghost mode: player dies in seconds.
//   3. Player calls set_object_flags(GetPlayer(), FLAG_SOLID, 0).
//   4. Hazards stop dealing damage. Enemy fire misses. Walls don't
//      block movement.
//   5. Win: survive 12 seconds in the hazard zone with HP intact.
//
// Why this is its own mission instead of folding into M43 noclip:
// M43 used a cheat-introduced cell (player.noClip). M65 uses the
// engine's OWN object-flag system — a built-in feature you're
// abusing rather than a shim you bolted on. Different attack
// surface, same effect.

import { memory } from "../sim-memory.js";
import { codeSegment } from "../code-segment.js";

// Register an extra code-segment instruction for the camera-update
// collision check. It does nothing on its own — the lesson is that
// the player NOPs/RETs it as part of the ghost-mode workflow.
if (!codeSegment.get("camera_collision_update")) {
  codeSegment.define("camera_collision_update", {
    name: "CAMERA_COLLISION_UPDATE",
    writesTo: [],
    exec: () => {},
  });
}

const TEMPLATE = `// M65 — GHOST MODE
//
// Two-step technique:
//   1. RET-patch the camera-update instruction (so movement through
//      geometry doesn't visually glitch).
//   2. Clear FLAG_SOLID on the player object (so collision/damage
//      check skips you).
//
// Real C++:
//   MemCopy((void*)ADR_CameraUpdate, "\\xC3", 1);
//   g_CommonLT->SetObjectFlags(g_LTClient->GetPlayer(), 0, FLAG_SOLID);

const FLAG_SOLID = 1;

void onInject() {
  log("=== Engaging ghost mode ===");

  // Step 1: silence camera-update collision check (M64 byte patch).
  patch_code("camera_collision_update", "ret");

  // Step 2: clear FLAG_SOLID on local player object.
  call_engine_function("set_object_flags", "player", 0, FLAG_SOLID);

  log("Player no longer solid — bullets, walls, hazards pass through");
}

void onTick() { }
`;

export const mission65 = {
  id: "m65",
  title: "GHOST MODE",
  brief: "Clear FLAG_SOLID on your player object. Engine's collision check skips you.",
  prerequisites: ["m64"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "👻",
    title: "GHOST MODE — OBJECT FLAG ABUSE",
    body: `M43 noclip used a cheat-introduced flag. M65 uses
the engine's own object-flag system — a built-in
feature being abused.

Real C++:
  g_CommonLT->SetObjectFlags(
      g_LTClient->GetPlayer(),
      OFT_Flags, 0, FLAG_SOLID);

The engine's collision system loops every frame asking
'is this object solid? if not, skip damage / collision /
hit checks.' Clear the bit, become a ghost.

Combined with a RET-patch on the camera-update function
(M64 territory), you walk through walls with no visual
glitch.

Lesson: cheats don't only inject new code — they ABUSE
existing engine features. SetObjectFlags is a legitimate
API used by the game itself for invisible spectators
and triggers. The cheat just calls it on the wrong object.`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template clears FLAG_SOLID via call_engine_function('set_object_flags', 'player', 0, 1) and RET-patches the camera-update instruction. Compile + Inject.",
    },
    {
      id: "stand-still",
      when: ({ target }) => target.session.solidFlag === false && target._m65StartedAt && performance.now() - target._m65StartedAt < 12000,
      say: "FLAG_SOLID cleared. Hazards now skip you. Stand in the zone for 12 seconds, mission completes.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableHazards();
    target.enableEnemies();

    // Set up a code-segment instruction for the camera collision
    // (gives the byte-patch step something to target).
    target._m65StartedAt = performance.now();

    // Register set_object_flags as an engine call. mask=0 + bits=
    // FLAG_SOLID(1) means clear the bit; mask=FLAG_SOLID + bits=
    // FLAG_SOLID means re-set it. Mirrors LithTech's SetObjectFlags
    // semantics (mask, bits-to-set).
    target.session.solidFlag = true;
    target.engine.set_object_flags = (objName, mask, bits) => {
      if (objName !== "player") return { ok: false, reason: "wrong_object" };
      // Set: mask & bits is what's being applied.
      // Clear: mask=0 + bits!=0 means clear those bits.
      if (mask === 0 && bits !== 0) {
        target.session.solidFlag = false;
      } else if (mask !== 0 && (mask & bits) !== 0) {
        target.session.solidFlag = true;
      }
      return { ok: true, solidNow: target.session.solidFlag };
    };

    dialog.script("VEX", [
      "Hazard zone is hot, enemies are firing, your HP is dropping. Normal route: dodge, return fire, hope. Cheat route: tell the engine you're not solid anymore.",
      "LithTech's SetObjectFlags is a legitimate engine API for spawning triggers, invisible spectators, etc. Cheat dev calls it on the LOCAL PLAYER with FLAG_SOLID cleared — engine's collision system now skips you for damage and movement checks.",
      "Step 2: RET-patch the camera-update instruction so movement through walls doesn't visually glitch (M64 byte-patching applied). Combined: walk through everything, take damage from nothing.",
      "Stand in the hazard zone for 12 seconds with HP intact. Real-world: this is the actual ghost-mode code from leaked Combat Arms cheats — two engine-feature abuses combined.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      const elapsed = performance.now() - target._m65StartedAt;
      // Block hazard damage while solidFlag is false (the engine
      // collision system is skipping the player).
      if (!target.session.solidFlag) {
        target.player.hp = Math.max(target.player.hp, 90);
      }
      if (!target.session.solidFlag &&
          elapsed >= 12000 &&
          target.player.hp >= 90) {
        done = true;
        complete("12 seconds in the hot zone with FLAG_SOLID cleared. Engine's own collision API used against the player it's supposed to protect.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
