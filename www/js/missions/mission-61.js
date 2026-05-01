// Mission 61 — BONE AIMBOT (hit-zone selection)
//
// M07 froze the crosshair on closest enemy. M54 redirected damage
// packets to a different target. M61 adds the next layer of real-
// world aimbot sophistication: HIT-ZONE SELECTION.
//
// Real C++ aimbot reference:
//
//   // Look up enemy bone position by name/index
//   auto headBone = enemy->GetBoneMatrix(BONE_HEAD);
//   auto chestBone = enemy->GetBoneMatrix(BONE_CHEST);
//
//   // Aim at the configured zone
//   Vector3 target;
//   switch (config.bone) {
//       case BONE_HEAD:  target = headBone.translation; break;
//       case BONE_CHEST: target = chestBone.translation; break;
//       case BONE_NECK:  target = (headBone.t + chestBone.t) / 2; break;
//   }
//
//   // Aim + fire
//   SetAimAt(target);
//   Fire();
//
// Tradeoffs:
//   - HEAD: 100 dmg per shot (instant kills) but small hitbox =
//     more likely to miss with low-quality predictor
//   - CHEST: 25 dmg per shot, big hitbox, easy hits
//   - NECK: ~50 dmg, medium hitbox, balanced
//
// The cheat lets you tune which zone via config. Higher-tier
// players run HEAD (1-shot kills), lower-tier run CHEST (reliable).
//
// In our 2D simulator: each enemy has an effective hit-zone target
// at sub-tile granularity. The cheat passes a zone selector when
// firing. Damage scales with zone: head=100, chest=25, neck=50.
//
// Mission flow:
//   1. Enemies have full 100 HP. Without bone aimbot, normal
//      fire deals weapon.damage (25) per hit. 4 hits per kill.
//   2. With M61 head-zone aimbot: 1 hit = 100 dmg = instant kill.
//   3. Win: 4 kills, all 1-shot (target.headshotKills counter).

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M61 — Hit-zone selection (bone-targeted aimbot).
//
// Engine call sets the aimbot's hit-zone preference. The fire()
// function reads the zone from target.weapon.aimZone and applies
// damage based on zone weight. HEAD = 4x damage (1-shot kill).

const ZONE_HEAD = 1;
const ZONE_CHEST = 2;
const ZONE_NECK = 3;

void onInject() {
  log("Configuring bone aimbot for HEAD zone (1-shot kills)");

  // Tell the simulator's aimbot to target the head zone.
  call_engine_function("set_aim_zone", ZONE_HEAD);

  // Auto-fire every tick at the closest enemy. With head-zone
  // selected each shot is a 1-shot kill.
  register_cheat("Auto-Headshot", function() {
    // The crosshair already auto-locks on closest enemy.
    // We just need to pull the trigger faster than the cooldown
    // would normally allow.
    write_label("weapon.cooldownMs", 50);
  });
}

void onTick() {
  // Keep cooldown low and auto-fire continuously
  write_label("weapon.cooldownMs", 50);
  call_engine_function("auto_fire");
}
`;

export const mission61 = {
  id: "m61",
  title: "BONE AIMBOT (HIT-ZONE)",
  brief: "Pick which hitbox to target. HEAD = 1-shot. CHEST = reliable. NECK = balanced.",
  prerequisites: ["m07"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  alert: {
    icon: "🎯",
    title: "HIT-ZONE SELECTION",
    body: `M07 froze your crosshair on a target. M61 adds
the layer above: WHICH PART of the target.

Real cheat C++:
  switch (config.bone) {
    case BONE_HEAD:  target = headBone.t; break;
    case BONE_CHEST: target = chestBone.t; break;
    case BONE_NECK:  target = midpoint; break;
  }

Tradeoffs:
  HEAD  → 100 dmg, small hitbox, 1-shot kills but
          missable without good predictor
  CHEST → 25 dmg, big hitbox, easy hits, slow kills
  NECK  → 50 dmg, medium hitbox, balanced

Pro tier runs HEAD. Casual tier runs CHEST. Smart
config switches based on enemy distance: HEAD up
close, CHEST at long range where predictor accuracy
drops.

Mission: configure HEAD zone, drop 4 enemies in
1-shot kills (kills_count - shots_fired == 0 means
every shot landed a kill).`,
  },

  hints: [
    {
      id: "compile",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Open DLL tab. Template configures aim_zone=HEAD via call_engine_function. Each shot becomes a 1-shot kill. Compile + Inject.",
    },
    {
      id: "verify-headshot",
      when: ({ target, dllState }) =>
        dllState.running && (target.headshotKills | 0) < 4,
      say: "DLL is running. Auto-fire keeps pulling the trigger. Verify headshotKills counter is climbing — should hit 4 within 2-3s with cooldown set to 50ms.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.player.ammo = 200;
    target._m61StartHeadshots = target.headshotKills | 0;

    // Expose set_aim_zone + auto_fire engine calls for the mission.
    target.engine.set_aim_zone = (zone) => {
      target.weapon.aimZone = zone | 0;
      return { ok: true };
    };
    target.engine.auto_fire = () => {
      // Force-fire at closest enemy regardless of cooldown
      target.weapon.lastFireAt = 0;
      const e = target.enemyManager.enemies.find(x => x.id === target.crosshairTargetId && x.alive);
      if (!e) return { ok: false, reason: "no_target" };
      // Apply zone-based damage
      const zoneMult = target.weapon.aimZone === 1 ? 4   // head: 100 dmg
                     : target.weapon.aimZone === 3 ? 2   // neck: 50
                     : 1;                                // chest/default: 25
      const dmg = (target.weapon.damage * zoneMult) | 0;
      e.hp = Math.max(0, e.hp - dmg);
      target.shotsFired++;
      if (e.hp <= 0 && e.alive) {
        e.alive = 0;
        target.killCount++;
        if (target.weapon.aimZone === 1) {
          target.headshotKills = (target.headshotKills | 0) + 1;
        }
      }
      return { ok: true };
    };

    dialog.script("VEX", [
      "Hit-zone selection is the next aimbot tier above M07's crosshair freeze. Tell the aimbot WHICH part of the enemy to target — head, chest, neck — and damage scales accordingly.",
      "Real cheats expose this as a config option. HEAD = 4x damage (1-shot kill), CHEST = 1x (4-shot kill), NECK = 2x (2-shot kill).",
      "Template configures HEAD via call_engine_function('set_aim_zone', 1). Auto-fire fires at closest enemy with that zone. Each shot is a 1-shot kill.",
      "Win: 4 headshot kills. Real-world tradeoff: HEAD demands a better aim predictor; CHEST is more forgiving. Smart configs pick zone based on enemy distance.",
    ]);

    let done = false;
    const interval = setInterval(() => {
      if (done) return;
      const headshots = (target.headshotKills | 0) - target._m61StartHeadshots;
      if (headshots >= 4) {
        done = true;
        complete("4 headshot kills. Hit-zone selection works the same in every aimbot — config picks the bone, damage scales with zone size. Smart configs adapt zone to distance.");
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  },
};
