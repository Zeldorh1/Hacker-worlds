// Mission 34 — SERVER VALIDATION
//
// The server gets smarter. Damage packets used to be applied
// at face value (M31's craft-to-999 worked). Now the server
// re-validates: if pkt.amount > weapon.damage * 2, it gets
// clamped to that ceiling. Crafting alone fails — your "999"
// becomes "50" (if weapon.damage is still 25).
//
// Workaround: stack with M11. Boost weapon.damage FIRST (e.g., to
// 200). Now the cap is 400, and a crafted 999 gets clamped to 400
// — still 1-shot territory. The lesson: server validation forces
// you to make multiple cells consistent, not just one.
//
// Real-world equivalent: any commercial game with server-side
// hit-validation. Modified packets with raw super-damage values
// fail; cheats that ALSO modify the local weapon stats first can
// pass validation if the server reads the same struct.
//
// (In practice that's why competitive games keep weapon stats on
// the server, not client-readable. AssaultCube does keep them
// client-side — the lesson is real for AC, defensive against the
// modern model.)

import { memory } from "../sim-memory.js";

const TEMPLATE = `// M34 — SERVER VALIDATION
//
// Server now caps damage to weapon.damage * 2. M31's craft-to-999
// gets clamped down to weapon.damage * 2 — too low to one-shot
// at default damage=25.
//
// Two combined cheats below: bump weapon.damage to 200 (M11
// territory) AND craft packets to 999. Cap = 200 * 2 = 400.
// Crafted 999 gets clamped to 400. Still one-shot.

void onInject() {
  log("damage stacker DLL loaded — boost local stat + craft packets");

  // Cheat 1: write weapon.damage = 200 every tick. The server
  // reads the same cell when computing its cap.
  register_cheat("Damage Boost", function() {
    write_label("weapon.damage", 200);
  });

  // Cheat 2: send-hook crafts the actual damage packet to 999.
  // Server clamps to 200 * 2 = 400. Still kills in one shot.
  register_packet_hook("send", function(pkt) {
    if (pkt.type === "damage") {
      pkt.amount = 999;   // Will be clamped, but the boost makes the cap high.
    }
    return pkt;
  });
}

void onTick() { }
`;

export const mission34 = {
  id: "m34",
  title: "SERVER VALIDATION",
  brief: "Server clamps damage to weapon.damage × 2. Stack damage hike with packet craft.",
  prerequisites: ["m33"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  cheatMenu: true,
  network: true,

  hints: [
    {
      id: "compile-inject",
      min: 6,
      when: ({ dllState }) => !dllState.running,
      say: "Template combines two layers: a damage-boost cheat that writes weapon.damage=200, and a send-hook that crafts each shot to 999. Server caps at weapon.damage*2 = 400. Compile + Inject.",
    },
    {
      id: "enable-boost",
      when: ({ dllState, target }) =>
        dllState.running && target.weapon.damage <= 25,
      say: "Open ≡ CHEATS, enable Damage Boost. Once weapon.damage = 200, the server's cap rises to 400. Now your crafted 999 packets get clamped to 400 instead of 50.",
    },
    {
      id: "drop-them",
      when: ({ dllState, target }) =>
        dllState.running && target.weapon.damage > 25 && target.killCount < 4,
      say: "Boost is on. Fire 4 times — each shot hits for 400 (after server clamp). One-shot kills. Drop all 4 contacts.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableESP();
    target.enableNetwork();
    target.enableServerValidation();
    target.player.ammo = 50;

    dialog.script("VEX", [
      "Server upgrade. M31's craft-to-999 trick: dead. The server now validates incoming damage packets against weapon.damage and clamps anything over 2x.",
      "If weapon.damage = 25 (default), the cap is 50. Your crafted 999 becomes 50. Two shots per kill instead of one — better than nothing, but not what you wanted.",
      "Workaround: boost weapon.damage FIRST, so the server's CAP rises with it. Cheat 1 sets weapon.damage = 200 (cap becomes 400). Cheat 2 crafts each shot to 999 (clamped to 400). Combined effect: one-shot kills.",
      "Tick BOTH cheats in ≡ CHEATS. Drop 4 contacts. Lesson: server validation forces you to keep multiple cells consistent — naive packet craft alone doesn't survive.",
    ]);

    let done = false;
    const dllRuntime = window.__hw && window.__hw.dll;

    const interval = setInterval(() => {
      if (done) return;
      if (!dllRuntime) return;
      if (dllRuntime.running && target.killCount >= 4) {
        done = true;
        complete("4 kills past the validator. Stacking craft with damage hike clears server-side checks that any single trick wouldn't.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
