// Mission 17 — RECOIL CONTROL
//
// First mission with a 2-level pointer chain. The recoil stat lives in
// a separate weapon-descriptor struct, NOT in the player struct that
// M16 taught the player to walk. To find it, the player has to:
//
//   1. Browse the player struct (M16 muscle memory).
//   2. Recognise that one of the cells (at +0x14) holds a giant
//      number that LOOKS like a memory address — that's the
//      pointer to the active weapon.
//   3. Browse THAT address. Discover three values clustered there:
//      damage (25, known from M11), cooldownMs (320, known from
//      M14), and a third int they haven't seen — that's
//      recoilPerShot.
//   4. Watch + freeze it at 0. Recoil stops building, sustained
//      fire keeps landing.
//
// In real games this is exactly the shape of a stat hunt: player
// struct holds pointers to sub-structs (weapon, inventory, current
// effects, animation state). Each sub-struct holds its own fields.
// 2-3 level chains are normal; 4-5 level chains aren't unusual.

import { memory } from "../sim-memory.js";

export const mission17 = {
  id: "m17",
  title: "RECOIL CONTROL",
  brief: "Recoil's tilting your shots wide. Find the stat — it's behind a pointer.",
  prerequisites: ["m16"],
  timeLimit: 240,

  hints: [
    {
      id: "feel-the-miss",
      min: 8,
      when: ({ target }) => (target.weapon.missesFromRecoil | 0) < 2,
      say: "FIRE a few times in a row at one enemy. Watch the RCL line in the HUD climb. After 4-5 shots it'll tip past 25 and your hits stop landing — that's the recoil mechanic.",
    },
    {
      id: "browse-player-first",
      min: 4,
      when: ({ target, scannerState, watchSize }) =>
        (target.weapon.missesFromRecoil | 0) >= 2 && watchSize === 0 && !scannerState.browseBase,
      say: "Recoil isn't in the player struct — but the pointer to the WEAPON struct is. Find your HP (M2 / M16 style), then BROWSE MEMORY on it. Look at +0x14: a huge number (8+ digits in decimal). It's not a stat — it's an ADDRESS. The browse view shows its hex form next to the decimal, plus a → follow button.",
    },
    {
      id: "follow-the-pointer",
      min: 4,
      when: ({ target, scannerState }) =>
        (target.weapon.missesFromRecoil | 0) >= 2 &&
        scannerState.browseBase &&
        !memory.isFrozen(memory.addressOfLabel("weapon.recoilPerShot")),
      say: "Tap the → follow button on the +0x14 row. Browse jumps to the weapon struct. You'll see three small ints clustered: 25 = damage (M11), 320 = cooldown (M14), and a third number — that's recoilPerShot. + watch it.",
    },
    {
      id: "freeze-zero",
      when: ({ target }) =>
        target.weapon.recoilPerShot !== 0 &&
        !memory.isFrozen(memory.addressOfLabel("weapon.recoilPerShot")),
      say: "Got it watched? Edit its value to 0 FIRST (tap the value field, type 0, hit Enter). THEN tick freeze. Order matters — freeze locks whatever value is in the cell at that moment.",
    },
    {
      id: "finish-the-room",
      when: ({ target }) =>
        memory.isFrozen(memory.addressOfLabel("weapon.recoilPerShot")) &&
        target.weapon.recoilPerShot === 0 &&
        target.killCount < 4,
      say: "Recoil locked at 0. Spray-clear the room — all four contacts. Win check needs killCount >= 4.",
    },
    {
      id: "still-not-winning",
      when: ({ target }) => target.killCount >= 4,
      say: () => {
        const addr = memory.addressOfLabel("weapon.recoilPerShot");
        const frozen = memory.isFrozen(addr);
        const val = memory.read(addr);
        if (!frozen) return `4 kills landed but recoil cell isn't frozen. Check your watchlist — make sure the entry at the weapon struct's +0x08 (the cell with value ${val}) has its freeze checkbox ticked.`;
        if (val !== 0) return `4 kills + freeze ticked, but recoil is frozen at ${val}, not 0. Untick freeze, edit value to 0, re-tick freeze. Win check needs val === 0 specifically.`;
        return "4 kills + recoil frozen at 0 — win should be firing any moment.";
      },
    },
  ],

  start({ dialog, target, complete }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableRecoil(6);    // 6 per shot, miss threshold 25
    target.player.ammo = 200;  // generous so the lesson isn't ammo

    dialog.script("VEX", [
      "New gun, real recoil this time. Spray for more than four shots and the kick tilts you off-target — bullets go wide.",
      "The recoil stat isn't in the player struct. Real games keep weapon-specific stuff in a SEPARATE struct, and the player struct holds a pointer to it. That's a 2-level chain.",
      "Workflow: M16 first — find HP, BROWSE MEMORY around it. Look at +0x14 from your HP. That'll be a giant number — too big to be HP or ammo. That number IS the address of the weapon struct.",
      "Type that address into BROWSE MEMORY. Browse it. You'll see three ints clustered: 25 (damage you know), 320 (fire cooldown you know), and a third one. That's recoil.",
      "Watch it, freeze at 0, drop all four contacts. Multi-level chains live in every commercial game — this is the entry-level version.",
    ]);

    let done = false;
    const recoilAddr = memory.addressOfLabel("weapon.recoilPerShot");
    const interval = setInterval(() => {
      if (done) return;
      // Win when recoil is frozen at 0 AND all 4 contacts down.
      if (memory.isFrozen(recoilAddr) &&
          target.weapon.recoilPerShot === 0 &&
          target.killCount >= 4) {
        done = true;
        complete("Recoil tamed via 2-level chain. Player → weapon ptr → recoil cell. The shape of every commercial trainer.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
