// Mission 32 — SIGNATURE SCAN
//
// Conceptual modern-AC mission. The simulator now has a fake
// 'kernel scanner' that periodically reads your DLL source and
// cheat labels, looking for known suspicious strings. If the count
// of hits crosses a threshold, the contract burns.
//
// Important framing: the strings used here are intentionally
// generic ("MAGIC_FEATURE_A" etc.) — they don't map to any real
// anti-cheat product's signatures. The lesson is the SHAPE of the
// arms race, not how to defeat any specific system.
//
// Mission flow:
//   1. Template's pre-loaded with cheats labelled "Aimbot",
//      "Wallhack ESP" — exactly the kind of plaintext naming the
//      scanner catches. Inject and watchhh violations climb.
//   2. Player has to rewrite the labels (and any source comments)
//      to non-suspicious placeholders: "Feature_A" / "Render_B".
//   3. The cheats still work — they just don't TELL the scanner
//      what they are. Violations stay below the threshold for 25s
//      while the player drops 4 contacts.

import { memory } from "../sim-memory.js";

// What our fake AC's signature scanner trips on. These are generic
// gaming/cheat words; they don't correspond to any real product's
// signature database.
const SUSPICIOUS_SIGS = ["aimbot", "wallhack", "esp ", "speedhack", "godmode"];

const TEMPLATE = `// M32 — SIGNATURE SCAN (conceptual modern AC)
//
// The simulated 'kernel watchdog' periodically scans this source
// + your cheat labels for suspicious strings. Each match adds a
// violation. 8 violations = mission fails.
//
// Currently registered with OBVIOUS names — those will trip the
// scanner instantly. Your job: rename the cheat labels (and remove
// any suspicious words from comments) so they LOOK INNOCUOUS but
// still WORK. The functions themselves don't matter to the scanner;
// only the strings the scanner can see do.
//
// Suspicious words (the ones this fake scanner watches):
//   aimbot, wallhack, esp, speedhack, godmode
//
// Rename them to placeholders ("Feature_A", "Visual_X", "Speed_Mod"),
// or arbitrary cover strings. Cheats keep working — names are
// metadata, not behavior.

void onInject() {
  log("trainer DLL loaded");

  // Suspicious labels — rename these to survive the scan!
  register_cheat("Aimbot", function() {
    const sim = window.__hw.target;
    let bestId = 0, bestDist = Infinity;
    for (const e of sim.enemyManager.enemies) {
      if (!e.alive) continue;
      const dx = e.x - sim.player.x;
      const dy = e.y - sim.player.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestId = e.id; }
    }
    if (bestId > 0) write_label("crosshair.target", bestId);
  });

  register_cheat("Wallhack ESP", function() {
    write_label("weapon.damage", 200);
  });
}

void onTick() { }
`;

export const mission32 = {
  id: "m32",
  title: "SIGNATURE SCAN",
  alert: {
    icon: "🔍",
    title: "KERNEL ANTI-CHEAT DEPLOYED",
    body: `Major patch — 2.0:
> New 'kernel-mode protection layer' periodically scans
> loaded DLL bytes for known cheat signatures (suspicious
> strings: 'Aimbot', 'ESP', 'Wallhack', etc).
> 8 violations = automatic ban.

Your DLLs have been shipping with plaintext labels like
'Aimbot' and 'Wallhack ESP' — instant fail under the new
scan. Time to rename. Functions stay, names get mangled
into harmless placeholders ('Feature_A', 'Visual_X').

This is exactly why pro cheats ship with XOR-encrypted
strings — the same code under a name AC has no signature
for.`,
  },
  brief: "Anti-cheat sees obvious labels. Rename them. Keep the cheats working.",
  prerequisites: ["m31"],
  timeLimit: 240,
  dll: true,
  dllTemplate: TEMPLATE,
  cheatMenu: true,

  hints: [
    {
      id: "watch-violations",
      min: 6,
      when: ({ target }) => target.acScanner && target.acScanner.violations < 5,
      say: "Compile + Inject as-is. Watch the DLL console — within 2s the scanner trips on 'Aimbot' and 'Wallhack ESP'. Eject, rename the labels, re-inject.",
    },
    {
      id: "rename",
      when: ({ target }) => target.acScanner && target.acScanner.violations >= 1,
      say: "Eject the DLL. Edit register_cheat('Aimbot', ...) → register_cheat('Feature_A', ...). Same for Wallhack ESP — call it 'Visual_B' or whatever. Re-Compile + Inject. Violations should stay at 0 from then on.",
    },
    {
      id: "drop-them",
      when: ({ target }) =>
        target.acScanner && target.acScanner.violations < 8 &&
        target.killCount < 4,
      say: "Cheats still work — names are metadata. Open ≡ CHEATS, tick both renamed cheats, drop all 4 contacts.",
    },
  ],

  start({ dialog, target, complete, fail }) {
    target.reset();
    target.enableEnemies();
    target.enableWeapon();
    target.enableESP();
    target.enableAcScanner(SUSPICIOUS_SIGS);
    target.player.ammo = 200;

    dialog.script("VEX", [
      "Conceptual modern AC. A fake kernel watchdog scans your DLL every 2 seconds. If it finds suspicious strings ('aimbot', 'wallhack', 'esp', 'speedhack', 'godmode'), violations climb. Cross 8 and the contract burns.",
      "Important caveat: the strings here are made-up placeholders — they don't map to any real anti-cheat product. The lesson is the SHAPE of the arms race: AC reads what your DLL exposes, you obfuscate what it exposes.",
      "Template ships with labels 'Aimbot' and 'Wallhack ESP' — instant fail. Eject, rewrite them as 'Feature_A' / 'Visual_B' (or whatever), re-inject. The functions still aim and ESP — just under cover names.",
      "Drop all 4 contacts with the renamed cheats while keeping violations below 8. Real-world this same pattern is why pro cheats ship with mangled symbol names + XOR-encrypted strings.",
    ]);

    let done = false;
    const dllRuntime = window.__hw && window.__hw.dll;

    const interval = setInterval(() => {
      if (done) return;
      if (!dllRuntime) return;
      if (target.acScanner.violations >= 8) {
        done = true;
        clearInterval(interval);
        fail("scanner tripped · obfuscate your labels and try again");
        return;
      }
      if (target.killCount >= 4 && target.acScanner.violations < 8) {
        done = true;
        complete("4 kills, scanner stayed quiet. Modern AC arms race in miniature: features can stay functional even if their NAMES don't survive scanning.");
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  },
};
